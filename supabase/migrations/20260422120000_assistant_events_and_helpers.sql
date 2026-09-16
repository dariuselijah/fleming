-- Assistant audit, prefs, role helper, cash variance index, today's billing appointments view.

-- ---------------------------------------------------------------------------
-- 1. Assistant events (per-practice AI audit trail)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.practice_assistant_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  practice_id uuid NOT NULL REFERENCES public.practices (id) ON DELETE CASCADE,
  actor_user_id uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  thread_id uuid NOT NULL,
  role_at_event text NOT NULL
    CHECK (role_at_event IN ('owner','physician','nurse','admin','reception')),

  kind text NOT NULL
    CHECK (kind IN ('user_message','assistant_message','tool_call','tool_result','error')),

  tool_name text,
  tool_args jsonb,
  tool_result jsonb,
  tool_status text CHECK (tool_status IS NULL OR tool_status IN ('succeeded','failed','skipped','awaiting_confirmation','confirmed')),

  content text,
  mentions jsonb NOT NULL DEFAULT '[]'::jsonb,
  model text,
  prompt_tokens int,
  completion_tokens int,

  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS practice_assistant_events_practice_created_idx
  ON public.practice_assistant_events (practice_id, created_at DESC);
CREATE INDEX IF NOT EXISTS practice_assistant_events_thread_idx
  ON public.practice_assistant_events (thread_id, created_at);
CREATE INDEX IF NOT EXISTS practice_assistant_events_tool_idx
  ON public.practice_assistant_events (practice_id, tool_name, created_at DESC)
  WHERE tool_name IS NOT NULL;

ALTER TABLE public.practice_assistant_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY practice_assistant_events_member ON public.practice_assistant_events FOR ALL
  USING (public.is_practice_member(practice_id))
  WITH CHECK (public.is_practice_member(practice_id));

CREATE POLICY practice_assistant_events_service ON public.practice_assistant_events FOR ALL
  TO service_role USING (true) WITH CHECK (true);

-- ---------------------------------------------------------------------------
-- 2. Per-user assistant preferences
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.practice_assistant_prefs (
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  practice_id uuid NOT NULL REFERENCES public.practices (id) ON DELETE CASCADE,
  last_thread_id uuid,
  disabled_tools text[] NOT NULL DEFAULT '{}',
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, practice_id)
);

ALTER TABLE public.practice_assistant_prefs ENABLE ROW LEVEL SECURITY;

CREATE POLICY practice_assistant_prefs_self ON public.practice_assistant_prefs FOR ALL
  USING (user_id = auth.uid() AND public.is_practice_member(practice_id))
  WITH CHECK (user_id = auth.uid() AND public.is_practice_member(practice_id));

CREATE POLICY practice_assistant_prefs_service ON public.practice_assistant_prefs FOR ALL
  TO service_role USING (true) WITH CHECK (true);

-- ---------------------------------------------------------------------------
-- 3. Role helper (RLS-safe when SECURITY DEFINER — caller still authenticated)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.practice_role_for(p_practice_id uuid)
RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT role FROM public.practice_members
   WHERE practice_id = p_practice_id AND user_id = auth.uid()
   LIMIT 1;
$$;
GRANT EXECUTE ON FUNCTION public.practice_role_for(uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- 4. Variance flag on cash drawer sessions (>= R100 variance for amber rail dot)
--    Only if billing migration has created cash_drawer_sessions.
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  IF to_regclass('public.cash_drawer_sessions') IS NOT NULL THEN
    EXECUTE $ddl$
      ALTER TABLE public.cash_drawer_sessions
        ADD COLUMN IF NOT EXISTS variance_flagged boolean
        GENERATED ALWAYS AS (
          variance_cents IS NOT NULL AND abs(variance_cents) > 10000
        ) STORED
    $ddl$;
    EXECUTE $idx$
      CREATE INDEX IF NOT EXISTS cash_drawer_sessions_variance_idx
        ON public.cash_drawer_sessions (practice_id, closed_at DESC)
        WHERE variance_flagged
    $idx$;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 5. Today's appointments with latest invoice (for billing strip / reporting)
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  IF to_regclass('public.practice_appointments') IS NOT NULL
     AND to_regclass('public.practice_invoices') IS NOT NULL THEN
    EXECUTE $view$
      CREATE OR REPLACE VIEW public.v_billing_today_appointments AS
      SELECT
        a.id            AS appointment_id,
        a.practice_id,
        a.patient_id,
        a.appt_date,
        a.start_time,
        a.end_time,
        a.status        AS appointment_status,
        a.service       AS service_name,
        a.provider_staff_id,
        i.id            AS invoice_id,
        i.invoice_number,
        i.status        AS invoice_status,
        i.total_cents,
        i.amount_paid_cents,
        i.amount_due_cents
      FROM public.practice_appointments a
      LEFT JOIN LATERAL (
        SELECT pi.*
        FROM public.practice_invoices pi
        WHERE pi.appointment_id = a.id
        ORDER BY pi.updated_at DESC
        LIMIT 1
      ) i ON true
      WHERE a.appt_date = (now() AT TIME ZONE 'UTC')::date
    $view$;
    EXECUTE 'GRANT SELECT ON public.v_billing_today_appointments TO authenticated';
  END IF;
END $$;

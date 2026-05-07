-- Short-lived QR pairing sessions for mobile patient document capture.

CREATE TABLE IF NOT EXISTS public.patient_scan_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  practice_id uuid NOT NULL REFERENCES public.practices (id) ON DELETE CASCADE,
  created_by uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  token_hash text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'created'
    CHECK (status IN ('created', 'opened', 'processing', 'submitted', 'cancelled', 'expired', 'error')),
  documents jsonb NOT NULL DEFAULT '[]'::jsonb,
  extracted_fields jsonb NOT NULL DEFAULT '{}'::jsonb,
  prefill jsonb NOT NULL DEFAULT '{}'::jsonb,
  missing_fields text[] NOT NULL DEFAULT ARRAY[]::text[],
  error text,
  connected_at timestamptz,
  submitted_at timestamptz,
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '15 minutes'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS patient_scan_sessions_practice_idx
  ON public.patient_scan_sessions (practice_id, created_at DESC);

CREATE INDEX IF NOT EXISTS patient_scan_sessions_token_hash_idx
  ON public.patient_scan_sessions (token_hash);

CREATE OR REPLACE FUNCTION public.set_patient_scan_sessions_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS patient_scan_sessions_updated_at ON public.patient_scan_sessions;
CREATE TRIGGER patient_scan_sessions_updated_at
  BEFORE UPDATE ON public.patient_scan_sessions
  FOR EACH ROW
  EXECUTE FUNCTION public.set_patient_scan_sessions_updated_at();

ALTER TABLE public.patient_scan_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS patient_scan_sessions_member_select ON public.patient_scan_sessions;
CREATE POLICY patient_scan_sessions_member_select ON public.patient_scan_sessions
  FOR SELECT
  USING (public.is_practice_member(practice_id));

DROP POLICY IF EXISTS patient_scan_sessions_member_insert ON public.patient_scan_sessions;
CREATE POLICY patient_scan_sessions_member_insert ON public.patient_scan_sessions
  FOR INSERT
  WITH CHECK (public.is_practice_member(practice_id));

DROP POLICY IF EXISTS patient_scan_sessions_member_update ON public.patient_scan_sessions;
CREATE POLICY patient_scan_sessions_member_update ON public.patient_scan_sessions
  FOR UPDATE
  USING (public.is_practice_member(practice_id))
  WITH CHECK (public.is_practice_member(practice_id));

DROP POLICY IF EXISTS patient_scan_sessions_service ON public.patient_scan_sessions;
CREATE POLICY patient_scan_sessions_service ON public.patient_scan_sessions
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.patient_scan_sessions;
EXCEPTION
  WHEN duplicate_object THEN NULL;
  WHEN undefined_object THEN NULL;
END;
$$;

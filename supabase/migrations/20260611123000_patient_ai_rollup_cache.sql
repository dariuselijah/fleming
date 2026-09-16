-- Persist patient AI rollups so reopening a chart does not re-run the LLM for
-- the same latest signed-summary snapshot.

CREATE TABLE IF NOT EXISTS public.patient_ai_rollups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  practice_id uuid NOT NULL REFERENCES public.practices (id) ON DELETE CASCADE,
  patient_id uuid NOT NULL REFERENCES public.practice_patients (id) ON DELETE CASCADE,
  latest_summary_at timestamptz NOT NULL,
  model_id text NOT NULL,
  rollup text NOT NULL,
  based_on_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (practice_id, patient_id, latest_summary_at, model_id)
);

CREATE INDEX IF NOT EXISTS patient_ai_rollups_patient_idx
  ON public.patient_ai_rollups (practice_id, patient_id, latest_summary_at DESC);

ALTER TABLE public.patient_ai_rollups ENABLE ROW LEVEL SECURITY;

CREATE POLICY patient_ai_rollups_member ON public.patient_ai_rollups FOR ALL
  USING (public.is_practice_member(practice_id))
  WITH CHECK (public.is_practice_member(practice_id));

CREATE POLICY patient_ai_rollups_service ON public.patient_ai_rollups FOR ALL
  TO service_role USING (true) WITH CHECK (true);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime'
  ) THEN
    IF to_regclass('public.patient_ai_rollups') IS NOT NULL THEN
      BEGIN
        EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.patient_ai_rollups';
      EXCEPTION WHEN duplicate_object THEN NULL;
      END;
    END IF;
  END IF;
END$$;

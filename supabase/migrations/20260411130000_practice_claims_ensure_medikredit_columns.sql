-- Repair drift when practice_claims was first created by clinical_workspace (20260406120000)
-- and later medikredit_integration's CREATE TABLE IF NOT EXISTS was skipped.
-- Without these columns, PostgREST returns: could not find 'clinical_encounter_id' in schema cache.

ALTER TABLE public.practice_claims
  ADD COLUMN IF NOT EXISTS lines jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE public.practice_claims
  ADD COLUMN IF NOT EXISTS medikredit_response jsonb;

ALTER TABLE public.practice_claims
  ADD COLUMN IF NOT EXISTS submission_fingerprint text;

ALTER TABLE public.practice_claims
  ADD COLUMN IF NOT EXISTS tx_nbr text;

ALTER TABLE public.practice_claims
  ADD COLUMN IF NOT EXISTS orig_code text;

ALTER TABLE public.practice_claims
  ADD COLUMN IF NOT EXISTS raw_last_response_xml text;

ALTER TABLE public.practice_claims
  ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES auth.users (id) ON DELETE SET NULL;

ALTER TABLE public.practice_claims
  ADD COLUMN IF NOT EXISTS clinical_encounter_id uuid REFERENCES public.clinical_encounters (id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS practice_claims_clinical_encounter_idx
  ON public.practice_claims (clinical_encounter_id)
  WHERE clinical_encounter_id IS NOT NULL;

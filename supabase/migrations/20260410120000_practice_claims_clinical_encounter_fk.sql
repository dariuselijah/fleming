-- Link submitted claims to the clinical encounter they were generated from (audit + patient history).

ALTER TABLE public.practice_claims
  ADD COLUMN IF NOT EXISTS clinical_encounter_id uuid REFERENCES public.clinical_encounters (id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS practice_claims_clinical_encounter_idx
  ON public.practice_claims (clinical_encounter_id)
  WHERE clinical_encounter_id IS NOT NULL;

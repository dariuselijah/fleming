-- Additive foundations for signed encounter provenance and amendments.
ALTER TABLE public.clinical_encounters
  ADD COLUMN IF NOT EXISTS encounter_version integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS amendment_of_encounter_id uuid
    REFERENCES public.clinical_encounters (id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS amendment_reason text,
  ADD COLUMN IF NOT EXISTS signed_by_user_id uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS signed_at timestamptz,
  ADD COLUMN IF NOT EXISTS signature_version integer;

CREATE INDEX IF NOT EXISTS clinical_encounters_amendment_of_idx
  ON public.clinical_encounters (amendment_of_encounter_id)
  WHERE amendment_of_encounter_id IS NOT NULL;

ALTER TABLE public.clinical_encounters
  DROP CONSTRAINT IF EXISTS clinical_encounters_encounter_version_check;

ALTER TABLE public.clinical_encounters
  ADD CONSTRAINT clinical_encounters_encounter_version_check
  CHECK (encounter_version >= 1);

CREATE OR REPLACE FUNCTION public.enforce_clinical_encounter_seal()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.amendment_of_encounter_id IS NOT NULL THEN
    IF NEW.encounter_version <= 1 OR NULLIF(btrim(NEW.amendment_reason), '') IS NULL THEN
      RAISE EXCEPTION 'Clinical amendments require a version and reason';
    END IF;
  END IF;

  IF OLD.status IS DISTINCT FROM 'signed' AND NEW.status = 'signed' THEN
    IF NEW.signed_by_user_id IS NULL
      OR NEW.signed_at IS NULL
      OR NEW.signature_version IS NULL
    THEN
      RAISE EXCEPTION 'Signed encounters require clinician attestation';
    END IF;
  END IF;

  -- Signed clinical content is immutable. Operational indexing may still
  -- update last_indexed_at/updated_at without changing the sealed record.
  IF OLD.status = 'signed' AND (
    NEW.practice_id IS DISTINCT FROM OLD.practice_id
    OR NEW.patient_id IS DISTINCT FROM OLD.patient_id
    OR NEW.provider_user_id IS DISTINCT FROM OLD.provider_user_id
    OR NEW.status IS DISTINCT FROM OLD.status
    OR NEW.started_at IS DISTINCT FROM OLD.started_at
    OR NEW.ended_at IS DISTINCT FROM OLD.ended_at
    OR NEW.chat_id IS DISTINCT FROM OLD.chat_id
    OR NEW.state_ciphertext IS DISTINCT FROM OLD.state_ciphertext
    OR NEW.state_iv IS DISTINCT FROM OLD.state_iv
    OR NEW.state_version IS DISTINCT FROM OLD.state_version
    OR NEW.appointment_id IS DISTINCT FROM OLD.appointment_id
    OR NEW.encounter_version IS DISTINCT FROM OLD.encounter_version
    OR NEW.amendment_of_encounter_id IS DISTINCT FROM OLD.amendment_of_encounter_id
    OR NEW.amendment_reason IS DISTINCT FROM OLD.amendment_reason
    OR NEW.signed_by_user_id IS DISTINCT FROM OLD.signed_by_user_id
    OR NEW.signed_at IS DISTINCT FROM OLD.signed_at
    OR NEW.signature_version IS DISTINCT FROM OLD.signature_version
  ) THEN
    RAISE EXCEPTION 'Signed clinical encounters are immutable; create an amendment';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS clinical_encounters_seal_guard
  ON public.clinical_encounters;

CREATE TRIGGER clinical_encounters_seal_guard
BEFORE UPDATE ON public.clinical_encounters
FOR EACH ROW
EXECUTE FUNCTION public.enforce_clinical_encounter_seal();

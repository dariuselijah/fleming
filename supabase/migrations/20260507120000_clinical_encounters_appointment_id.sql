-- Ensure clinical_encounters.appointment_id exists (idempotent).
-- Fixes "Could not find the 'appointment_id' column of 'clinical_encounters' in the schema cache"
-- when older migration history was skipped or the column was never applied.

ALTER TABLE public.clinical_encounters
  ADD COLUMN IF NOT EXISTS appointment_id uuid REFERENCES public.practice_appointments (id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS clinical_encounters_appointment_idx
  ON public.clinical_encounters (practice_id, appointment_id)
  WHERE appointment_id IS NOT NULL;

NOTIFY pgrst, 'reload schema';

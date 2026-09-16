-- Idempotent: ensures practice_encounter_summaries.appointment_id exists.
-- Fixes PostgREST errors: "Could not find the 'appointment_id' column ...
-- in the schema cache" when migrations were skipped or not yet applied remotely.

ALTER TABLE public.practice_encounter_summaries
  ADD COLUMN IF NOT EXISTS appointment_id uuid REFERENCES public.practice_appointments (id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS practice_encounter_summaries_appt_idx
  ON public.practice_encounter_summaries (practice_id, appointment_id)
  WHERE appointment_id IS NOT NULL;

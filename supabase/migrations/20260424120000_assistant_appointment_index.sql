-- Fast patient-scoped appointment lookups for the admin assistant.
-- The existing (practice_id, appt_date) index doesn't help "find all appointments
-- for patient X" queries — those are common for the chat agent and booking flows.

CREATE INDEX IF NOT EXISTS practice_appointments_practice_patient_date_idx
  ON public.practice_appointments (practice_id, patient_id, appt_date DESC)
  WHERE patient_id IS NOT NULL;

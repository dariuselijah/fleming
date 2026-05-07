-- Voice + WhatsApp: patient phone, profile completion, appointment comms metadata

ALTER TABLE public.practice_patients
  ADD COLUMN IF NOT EXISTS phone_e164 text,
  ADD COLUMN IF NOT EXISTS profile_status text NOT NULL DEFAULT 'complete'
    CHECK (profile_status IN ('incomplete', 'complete'));

COMMENT ON COLUMN public.practice_patients.phone_e164 IS 'Primary phone E.164 for comms matching (voice/WhatsApp)';
COMMENT ON COLUMN public.practice_patients.profile_status IS 'incomplete = stub from voice, awaiting WhatsApp onboarding';

CREATE UNIQUE INDEX IF NOT EXISTS practice_patients_practice_phone_e164_key
  ON public.practice_patients (practice_id, phone_e164)
  WHERE phone_e164 IS NOT NULL;

CREATE INDEX IF NOT EXISTS practice_patients_practice_phone_e164_idx
  ON public.practice_patients (practice_id, phone_e164)
  WHERE phone_e164 IS NOT NULL;

-- Reminder/cron code expects JSON metadata on appointments
ALTER TABLE public.practice_appointments
  ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.practice_appointments.metadata IS 'Reminders, voice check-in/follow-up flags, idempotency';

CREATE INDEX IF NOT EXISTS practice_appointments_metadata_idx
  ON public.practice_appointments USING gin (metadata);

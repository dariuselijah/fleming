-- Add patient_lookup flow type and improve comms robustness
-- Requires: 20260407120000_comms_platform.sql

-- Widen the flow enum to include patient_lookup
ALTER TABLE public.conversation_threads
  DROP CONSTRAINT IF EXISTS conversation_threads_current_flow_check;

ALTER TABLE public.conversation_threads
  ADD CONSTRAINT conversation_threads_current_flow_check
  CHECK (current_flow IN ('none', 'booking', 'onboarding', 'triage', 'faq', 'patient_lookup'));

-- Index for cron: find appointments needing reminders efficiently
CREATE INDEX IF NOT EXISTS practice_appointments_reminder_idx
  ON public.practice_appointments (appt_date, status)
  WHERE status IN ('booked', 'confirmed');

-- Index for cron: webhook retry queue
CREATE INDEX IF NOT EXISTS webhook_events_status_retry_idx
  ON public.webhook_events (status, next_retry_at)
  WHERE status IN ('pending', 'processing');

-- Index for session cleanup: expired sessions
CREATE INDEX IF NOT EXISTS conversation_threads_session_expiry_idx
  ON public.conversation_threads (session_expires_at)
  WHERE session_expires_at IS NOT NULL AND current_flow != 'none';

-- Index for patient lookup by phone: threads with patient link
CREATE INDEX IF NOT EXISTS conversation_threads_patient_channel_idx
  ON public.conversation_threads (practice_id, patient_id, channel)
  WHERE patient_id IS NOT NULL;

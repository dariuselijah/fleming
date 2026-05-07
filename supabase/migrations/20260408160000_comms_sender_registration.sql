-- Widen practice_channels.status to include 'registering_sender'
-- and add sender tracking columns for the Twilio Senders API.

-- 1. Drop old check and add widened one
ALTER TABLE public.practice_channels
  DROP CONSTRAINT IF EXISTS practice_channels_status_check;

ALTER TABLE public.practice_channels
  ADD CONSTRAINT practice_channels_status_check
  CHECK (status IN ('provisioning', 'pending_wa_approval', 'registering_sender', 'active', 'suspended'));

-- 2. New columns for sender lifecycle tracking
ALTER TABLE public.practice_channels
  ADD COLUMN IF NOT EXISTS sender_display_name text,
  ADD COLUMN IF NOT EXISTS sender_registered_at timestamptz;

-- 3. Index for the cron that polls registering senders
CREATE INDEX IF NOT EXISTS practice_channels_registering_sender_idx
  ON public.practice_channels (status)
  WHERE status = 'registering_sender';

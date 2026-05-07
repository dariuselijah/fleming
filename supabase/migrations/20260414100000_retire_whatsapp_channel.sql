-- Retire WhatsApp as a channel value; all patient messaging is SMS/RCS-capable Twilio Messaging.
--
-- IMPORTANT: You cannot UPDATE whatsapp -> rcs while the old CHECK only allows ('whatsapp','voice').
-- Widen constraints first, migrate rows, then apply the final CHECKs.

-- ---------------------------------------------------------------------------
-- practice_channels (original: whatsapp | voice only)
-- ---------------------------------------------------------------------------

ALTER TABLE public.practice_channels DROP CONSTRAINT IF EXISTS practice_channels_channel_type_check;
ALTER TABLE public.practice_channels ADD CONSTRAINT practice_channels_channel_type_check
  CHECK (channel_type IN ('whatsapp', 'voice', 'sms', 'rcs'));

UPDATE public.practice_channels SET channel_type = 'rcs' WHERE channel_type = 'whatsapp';

ALTER TABLE public.practice_channels DROP CONSTRAINT IF EXISTS practice_channels_channel_type_check;
ALTER TABLE public.practice_channels ADD CONSTRAINT practice_channels_channel_type_check
  CHECK (channel_type IN ('voice', 'sms', 'rcs'));

-- ---------------------------------------------------------------------------
-- conversation_threads (original: whatsapp | voice | sms)
-- ---------------------------------------------------------------------------

ALTER TABLE public.conversation_threads DROP CONSTRAINT IF EXISTS conversation_threads_channel_check;
ALTER TABLE public.conversation_threads ADD CONSTRAINT conversation_threads_channel_check
  CHECK (channel IN ('whatsapp', 'voice', 'sms', 'rcs', 'portal'));

UPDATE public.conversation_threads SET channel = 'rcs' WHERE channel = 'whatsapp';

ALTER TABLE public.conversation_threads DROP CONSTRAINT IF EXISTS conversation_threads_channel_check;
ALTER TABLE public.conversation_threads ADD CONSTRAINT conversation_threads_channel_check
  CHECK (channel IN ('voice', 'sms', 'rcs', 'portal'));

-- ---------------------------------------------------------------------------
-- scheduled_campaigns (original: whatsapp | voice)
-- ---------------------------------------------------------------------------

ALTER TABLE public.scheduled_campaigns DROP CONSTRAINT IF EXISTS scheduled_campaigns_channel_check;
ALTER TABLE public.scheduled_campaigns ADD CONSTRAINT scheduled_campaigns_channel_check
  CHECK (channel IN ('whatsapp', 'voice', 'sms', 'rcs', 'portal'));

UPDATE public.scheduled_campaigns SET channel = 'rcs' WHERE channel = 'whatsapp';

ALTER TABLE public.scheduled_campaigns DROP CONSTRAINT IF EXISTS scheduled_campaigns_channel_check;
ALTER TABLE public.scheduled_campaigns ADD CONSTRAINT scheduled_campaigns_channel_check
  CHECK (channel IN ('voice', 'sms', 'rcs', 'portal'));

-- ---------------------------------------------------------------------------
-- communication_interactions (only if table exists — added in voice_rcs_portal migration)
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  IF to_regclass('public.communication_interactions') IS NOT NULL THEN
    ALTER TABLE public.communication_interactions DROP CONSTRAINT IF EXISTS communication_interactions_channel_check;
    ALTER TABLE public.communication_interactions ADD CONSTRAINT communication_interactions_channel_check
      CHECK (channel IN ('whatsapp', 'voice', 'sms', 'rcs', 'portal'));

    UPDATE public.communication_interactions SET channel = 'rcs' WHERE channel = 'whatsapp';

    ALTER TABLE public.communication_interactions DROP CONSTRAINT IF EXISTS communication_interactions_channel_check;
    ALTER TABLE public.communication_interactions ADD CONSTRAINT communication_interactions_channel_check
      CHECK (channel IN ('voice', 'sms', 'rcs', 'portal'));
  END IF;
END $$;

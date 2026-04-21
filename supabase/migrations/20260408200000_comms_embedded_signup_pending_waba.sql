-- Embedded Signup (Twilio Tech Provider): number can exist before WABA is linked.
ALTER TABLE public.practice_channels
  DROP CONSTRAINT IF EXISTS practice_channels_status_check;

ALTER TABLE public.practice_channels
  ADD CONSTRAINT practice_channels_status_check
  CHECK (
    status IN (
      'provisioning',
      'pending_waba',
      'pending_wa_approval',
      'registering_sender',
      'active',
      'suspended'
    )
  );

ALTER TABLE public.practice_channels
  ADD COLUMN IF NOT EXISTS whatsapp_waba_id text;

COMMENT ON COLUMN public.practice_channels.whatsapp_waba_id IS 'WhatsApp Business Account ID from Meta Embedded Signup (Twilio Senders configuration.waba_id).';

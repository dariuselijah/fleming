-- Front Desk automation: Rx verification tokens, inbox metadata, email threads

CREATE TABLE IF NOT EXISTS public.practice_prescription_verifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  practice_id uuid NOT NULL REFERENCES public.practices (id) ON DELETE CASCADE,
  patient_id uuid REFERENCES public.practice_patients (id) ON DELETE SET NULL,
  token_hash text NOT NULL,
  prescriber_name text,
  issued_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'revoked', 'dispensed')),
  payload_hash text,
  handoff_message_id uuid REFERENCES public.practice_inbox_messages (id) ON DELETE SET NULL,
  session_document_id text,
  clinical_encounter_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (token_hash)
);

CREATE INDEX IF NOT EXISTS practice_rx_verify_practice_idx
  ON public.practice_prescription_verifications (practice_id, issued_at DESC);

ALTER TABLE public.practice_prescription_verifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS practice_rx_verify_select ON public.practice_prescription_verifications;
CREATE POLICY practice_rx_verify_select ON public.practice_prescription_verifications FOR SELECT
  USING (public.is_practice_member(practice_id));

ALTER TABLE public.practice_inbox_messages
  ADD COLUMN IF NOT EXISTS metadata_json jsonb DEFAULT '{}';

-- Allow email as a conversation channel
ALTER TABLE public.conversation_threads DROP CONSTRAINT IF EXISTS conversation_threads_channel_check;
ALTER TABLE public.conversation_threads ADD CONSTRAINT conversation_threads_channel_check
  CHECK (channel IN ('voice', 'sms', 'rcs', 'portal', 'email'));

-- Per-practice inbound email routing (Resend forwarding MVP)
CREATE TABLE IF NOT EXISTS public.practice_email_settings (
  practice_id uuid PRIMARY KEY REFERENCES public.practices (id) ON DELETE CASCADE,
  inbound_slug text NOT NULL,
  reply_from_email text,
  enabled boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (inbound_slug)
);

ALTER TABLE public.practice_email_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS practice_email_settings_select ON public.practice_email_settings;
CREATE POLICY practice_email_settings_select ON public.practice_email_settings FOR SELECT
  USING (public.is_practice_member(practice_id));

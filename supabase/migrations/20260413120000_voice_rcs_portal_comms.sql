-- Voice + RCS + Portal: extend comms schema (additive; keeps legacy whatsapp rows until retired).

-- ---------------------------------------------------------------------------
-- Widen channel enums (keep whatsapp for migration period)
-- ---------------------------------------------------------------------------

ALTER TABLE public.practice_channels DROP CONSTRAINT IF EXISTS practice_channels_channel_type_check;
ALTER TABLE public.practice_channels ADD CONSTRAINT practice_channels_channel_type_check
  CHECK (channel_type IN ('whatsapp', 'voice', 'sms', 'rcs'));

ALTER TABLE public.practice_channels DROP CONSTRAINT IF EXISTS practice_channels_provider_check;
ALTER TABLE public.practice_channels ADD CONSTRAINT practice_channels_provider_check
  CHECK (provider IN ('twilio', 'vapi', 'google_rbm', 'internal'));

ALTER TABLE public.conversation_threads DROP CONSTRAINT IF EXISTS conversation_threads_channel_check;
ALTER TABLE public.conversation_threads ADD CONSTRAINT conversation_threads_channel_check
  CHECK (channel IN ('whatsapp', 'voice', 'sms', 'rcs', 'portal'));

ALTER TABLE public.scheduled_campaigns DROP CONSTRAINT IF EXISTS scheduled_campaigns_channel_check;
ALTER TABLE public.scheduled_campaigns ADD CONSTRAINT scheduled_campaigns_channel_check
  CHECK (channel IN ('whatsapp', 'voice', 'sms', 'rcs', 'portal'));

-- ---------------------------------------------------------------------------
-- Voice calls: structured outcome from Vapi end-of-call
-- ---------------------------------------------------------------------------

ALTER TABLE public.voice_calls
  ADD COLUMN IF NOT EXISTS intent text,
  ADD COLUMN IF NOT EXISTS structured_outcome jsonb;

COMMENT ON COLUMN public.voice_calls.intent IS 'High-level intent label extracted post-call (e.g. book_appointment, registration).';
COMMENT ON COLUMN public.voice_calls.structured_outcome IS 'JSON: VoiceCallOutcome (recommendedNextAction, portalPurpose, etc.).';

-- ---------------------------------------------------------------------------
-- Append-only interaction log (audit)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.communication_interactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  practice_id uuid NOT NULL REFERENCES public.practices (id) ON DELETE CASCADE,
  patient_id uuid REFERENCES public.practice_patients (id) ON DELETE SET NULL,
  appointment_id uuid REFERENCES public.practice_appointments (id) ON DELETE SET NULL,
  thread_id uuid REFERENCES public.conversation_threads (id) ON DELETE SET NULL,
  voice_call_id uuid REFERENCES public.voice_calls (id) ON DELETE SET NULL,
  portal_session_id uuid,
  channel text NOT NULL CHECK (channel IN ('whatsapp', 'voice', 'sms', 'rcs', 'portal')),
  event_type text NOT NULL,
  provider text,
  provider_event_id text,
  payload jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS communication_interactions_practice_created_idx
  ON public.communication_interactions (practice_id, created_at DESC);
CREATE INDEX IF NOT EXISTS communication_interactions_patient_idx
  ON public.communication_interactions (patient_id) WHERE patient_id IS NOT NULL;

COMMENT ON TABLE public.communication_interactions IS 'Audit log for voice, RCS, SMS, portal, and legacy WhatsApp events.';

-- FK to portal_sessions after table exists
ALTER TABLE public.communication_interactions
  DROP CONSTRAINT IF EXISTS communication_interactions_portal_session_fk;
-- added below after portal_sessions

-- ---------------------------------------------------------------------------
-- Channel-agnostic message templates (RCS / SMS / email)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.message_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  practice_id uuid NOT NULL REFERENCES public.practices (id) ON DELETE CASCADE,
  template_key text NOT NULL,
  channel text NOT NULL CHECK (channel IN ('rcs', 'sms', 'email')),
  provider text NOT NULL DEFAULT 'twilio' CHECK (provider IN ('twilio', 'google_rbm', 'resend', 'internal')),
  provider_template_id text,
  body_template text NOT NULL,
  rich_card_payload jsonb,
  variables jsonb DEFAULT '[]',
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (practice_id, template_key, channel)
);

CREATE INDEX IF NOT EXISTS message_templates_practice_key_idx
  ON public.message_templates (practice_id, template_key);

-- ---------------------------------------------------------------------------
-- Patient portal access tokens (magic links; hash stored only)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.patient_access_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  practice_id uuid NOT NULL REFERENCES public.practices (id) ON DELETE CASCADE,
  patient_id uuid NOT NULL REFERENCES public.practice_patients (id) ON DELETE CASCADE,
  token_hash text NOT NULL,
  purpose text NOT NULL
    CHECK (purpose IN ('check_in', 'intake', 'billing', 'lab_results', 'general', 'appointment')),
  appointment_id uuid REFERENCES public.practice_appointments (id) ON DELETE SET NULL,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  elevated_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (token_hash)
);

CREATE INDEX IF NOT EXISTS patient_access_tokens_patient_idx
  ON public.patient_access_tokens (practice_id, patient_id);

-- ---------------------------------------------------------------------------
-- Portal sessions
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.portal_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  practice_id uuid NOT NULL REFERENCES public.practices (id) ON DELETE CASCADE,
  patient_id uuid NOT NULL REFERENCES public.practice_patients (id) ON DELETE CASCADE,
  access_token_id uuid NOT NULL REFERENCES public.patient_access_tokens (id) ON DELETE CASCADE,
  purpose text NOT NULL,
  started_at timestamptz NOT NULL DEFAULT now(),
  last_activity_at timestamptz NOT NULL DEFAULT now(),
  elevated boolean NOT NULL DEFAULT false,
  ip_address text,
  user_agent text,
  ended_at timestamptz
);

CREATE INDEX IF NOT EXISTS portal_sessions_token_idx
  ON public.portal_sessions (access_token_id);

ALTER TABLE public.communication_interactions
  ADD CONSTRAINT communication_interactions_portal_session_fk
  FOREIGN KEY (portal_session_id) REFERENCES public.portal_sessions (id) ON DELETE SET NULL;

-- ---------------------------------------------------------------------------
-- RCS / Business Messaging agent metadata per practice (optional row)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.rcs_agents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  practice_id uuid NOT NULL REFERENCES public.practices (id) ON DELETE CASCADE,
  provider text NOT NULL DEFAULT 'twilio' CHECK (provider IN ('twilio', 'google_rbm')),
  agent_id text,
  brand_name text,
  verification_status text,
  metadata jsonb DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (practice_id, provider)
);

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

ALTER TABLE public.communication_interactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.message_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.patient_access_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.portal_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rcs_agents ENABLE ROW LEVEL SECURITY;

CREATE POLICY communication_interactions_all ON public.communication_interactions FOR ALL
  USING (public.is_practice_member(practice_id))
  WITH CHECK (public.is_practice_member(practice_id));

CREATE POLICY message_templates_all ON public.message_templates FOR ALL
  USING (public.is_practice_member(practice_id))
  WITH CHECK (public.is_practice_member(practice_id));

CREATE POLICY patient_access_tokens_all ON public.patient_access_tokens FOR ALL
  USING (public.is_practice_member(practice_id))
  WITH CHECK (public.is_practice_member(practice_id));

CREATE POLICY portal_sessions_all ON public.portal_sessions FOR ALL
  USING (public.is_practice_member(practice_id))
  WITH CHECK (public.is_practice_member(practice_id));

CREATE POLICY rcs_agents_all ON public.rcs_agents FOR ALL
  USING (public.is_practice_member(practice_id))
  WITH CHECK (public.is_practice_member(practice_id));

CREATE POLICY communication_interactions_service ON public.communication_interactions FOR ALL
  TO service_role USING (true) WITH CHECK (true);

CREATE POLICY message_templates_service ON public.message_templates FOR ALL
  TO service_role USING (true) WITH CHECK (true);

CREATE POLICY patient_access_tokens_service ON public.patient_access_tokens FOR ALL
  TO service_role USING (true) WITH CHECK (true);

CREATE POLICY portal_sessions_service ON public.portal_sessions FOR ALL
  TO service_role USING (true) WITH CHECK (true);

CREATE POLICY rcs_agents_service ON public.rcs_agents FOR ALL
  TO service_role USING (true) WITH CHECK (true);

-- ---------------------------------------------------------------------------
-- Data migration: WhatsApp rows/channels -> RCS (same Twilio number)
-- ---------------------------------------------------------------------------

UPDATE public.conversation_threads SET channel = 'rcs' WHERE channel = 'whatsapp';

UPDATE public.practice_channels
SET channel_type = 'rcs'
WHERE channel_type = 'whatsapp';

UPDATE public.scheduled_campaigns SET channel = 'rcs' WHERE channel = 'whatsapp';

ALTER TABLE public.practice_channels DROP CONSTRAINT IF EXISTS practice_channels_channel_type_check;
ALTER TABLE public.practice_channels ADD CONSTRAINT practice_channels_channel_type_check
  CHECK (channel_type IN ('voice', 'sms', 'rcs'));

ALTER TABLE public.conversation_threads DROP CONSTRAINT IF EXISTS conversation_threads_channel_check;
ALTER TABLE public.conversation_threads ADD CONSTRAINT conversation_threads_channel_check
  CHECK (channel IN ('voice', 'sms', 'rcs', 'portal'));

ALTER TABLE public.scheduled_campaigns DROP CONSTRAINT IF EXISTS scheduled_campaigns_channel_check;
ALTER TABLE public.scheduled_campaigns ADD CONSTRAINT scheduled_campaigns_channel_check
  CHECK (channel IN ('voice', 'sms', 'rcs', 'portal'));

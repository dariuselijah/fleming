-- Communications platform: WhatsApp + Voice channels, conversation threads,
-- agent flows (booking, onboarding, triage), consent, campaigns.
-- Requires: public.practices, public.practice_patients, public.practice_staff,
--           public.practice_appointments, public.is_practice_member (existing).

-- ---------------------------------------------------------------------------
-- Practice channels (Twilio numbers, Vapi assistants)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.practice_channels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  practice_id uuid NOT NULL REFERENCES public.practices (id) ON DELETE CASCADE,
  channel_type text NOT NULL CHECK (channel_type IN ('whatsapp', 'voice')),
  provider text NOT NULL CHECK (provider IN ('twilio', 'vapi')),
  phone_number text NOT NULL,
  phone_number_sid text,
  whatsapp_sender_sid text,
  vapi_assistant_id text,
  vapi_phone_number_id text,
  provider_config_encrypted text,
  config_iv text,
  status text NOT NULL DEFAULT 'provisioning'
    CHECK (status IN ('provisioning', 'pending_wa_approval', 'active', 'suspended')),
  webhook_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (practice_id, channel_type)
);

CREATE INDEX IF NOT EXISTS practice_channels_phone_idx
  ON public.practice_channels (phone_number);

-- ---------------------------------------------------------------------------
-- Conversation threads (unified across WhatsApp / Voice / SMS)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.conversation_threads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  practice_id uuid NOT NULL REFERENCES public.practices (id) ON DELETE CASCADE,
  channel text NOT NULL CHECK (channel IN ('whatsapp', 'voice', 'sms')),
  external_party text NOT NULL,
  patient_id uuid REFERENCES public.practice_patients (id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'awaiting_input', 'handoff', 'closed')),
  priority text NOT NULL DEFAULT 'normal'
    CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
  current_flow text NOT NULL DEFAULT 'none'
    CHECK (current_flow IN ('none', 'booking', 'onboarding', 'triage', 'faq')),
  flow_state jsonb DEFAULT '{}',
  last_message_at timestamptz NOT NULL DEFAULT now(),
  session_expires_at timestamptz,
  unread_count int NOT NULL DEFAULT 0,
  assigned_staff_id uuid REFERENCES public.practice_staff (id) ON DELETE SET NULL,
  metadata jsonb DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (practice_id, channel, external_party)
);

CREATE INDEX IF NOT EXISTS conversation_threads_practice_last_msg_idx
  ON public.conversation_threads (practice_id, last_message_at DESC);

CREATE INDEX IF NOT EXISTS conversation_threads_patient_idx
  ON public.conversation_threads (patient_id) WHERE patient_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- Thread messages
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.thread_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id uuid NOT NULL REFERENCES public.conversation_threads (id) ON DELETE CASCADE,
  practice_id uuid NOT NULL REFERENCES public.practices (id) ON DELETE CASCADE,
  direction text NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  sender_type text NOT NULL CHECK (sender_type IN ('patient', 'agent', 'staff', 'system')),
  content_type text NOT NULL DEFAULT 'text'
    CHECK (content_type IN ('text', 'audio', 'image', 'document', 'template', 'interactive', 'location')),
  body text,
  media_url text,
  media_mime_type text,
  media_storage_path text,
  template_name text,
  interactive_payload jsonb,
  provider_message_id text UNIQUE,
  delivery_status text NOT NULL DEFAULT 'queued'
    CHECK (delivery_status IN ('queued', 'sent', 'delivered', 'read', 'failed', 'undelivered')),
  failure_reason text,
  agent_tool_calls jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS thread_messages_thread_created_idx
  ON public.thread_messages (thread_id, created_at);

CREATE INDEX IF NOT EXISTS thread_messages_provider_id_idx
  ON public.thread_messages (provider_message_id) WHERE provider_message_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- Voice calls (per-call metadata, recordings, transcripts)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.voice_calls (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id uuid NOT NULL REFERENCES public.conversation_threads (id) ON DELETE CASCADE,
  practice_id uuid NOT NULL REFERENCES public.practices (id) ON DELETE CASCADE,
  direction text NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  vapi_call_id text UNIQUE,
  twilio_call_sid text,
  duration_seconds int,
  recording_url text,
  recording_storage_path text,
  transcript text,
  summary text,
  tool_calls_log jsonb,
  ended_reason text,
  cost_cents int,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS voice_calls_thread_idx ON public.voice_calls (thread_id);

-- ---------------------------------------------------------------------------
-- Practice hours
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.practice_hours (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  practice_id uuid NOT NULL REFERENCES public.practices (id) ON DELETE CASCADE,
  day_of_week int NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  open_time time NOT NULL DEFAULT '08:00',
  close_time time NOT NULL DEFAULT '17:00',
  is_closed boolean NOT NULL DEFAULT false,
  label text,
  UNIQUE (practice_id, day_of_week)
);

-- ---------------------------------------------------------------------------
-- Practice FAQs (agent knowledge base)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.practice_faqs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  practice_id uuid NOT NULL REFERENCES public.practices (id) ON DELETE CASCADE,
  category text NOT NULL DEFAULT 'general'
    CHECK (category IN ('hours', 'services', 'fees', 'insurance', 'directions', 'parking', 'preparation', 'general')),
  question text NOT NULL,
  answer text NOT NULL,
  keywords text[] DEFAULT '{}',
  sort_order int NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS practice_faqs_practice_idx ON public.practice_faqs (practice_id);

-- ---------------------------------------------------------------------------
-- Bookable services
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.practice_services (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  practice_id uuid NOT NULL REFERENCES public.practices (id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  duration_minutes int NOT NULL DEFAULT 30,
  fee numeric,
  category text,
  requires_referral boolean NOT NULL DEFAULT false,
  preparation_instructions text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS practice_services_practice_idx ON public.practice_services (practice_id);

-- ---------------------------------------------------------------------------
-- WhatsApp templates
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.whatsapp_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  practice_id uuid NOT NULL REFERENCES public.practices (id) ON DELETE CASCADE,
  template_name text NOT NULL,
  template_sid text,
  language text NOT NULL DEFAULT 'en',
  category text NOT NULL DEFAULT 'utility'
    CHECK (category IN ('marketing', 'utility', 'authentication')),
  body_template text NOT NULL,
  variables jsonb DEFAULT '[]',
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS whatsapp_templates_practice_idx ON public.whatsapp_templates (practice_id);

-- ---------------------------------------------------------------------------
-- POPIA consent tracking
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.patient_consent (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  practice_id uuid NOT NULL REFERENCES public.practices (id) ON DELETE CASCADE,
  patient_id uuid REFERENCES public.practice_patients (id) ON DELETE SET NULL,
  external_party text NOT NULL,
  channel text NOT NULL,
  consent_type text NOT NULL
    CHECK (consent_type IN ('ai_communication', 'data_processing', 'marketing')),
  granted boolean NOT NULL DEFAULT false,
  granted_at timestamptz,
  revoked_at timestamptz,
  evidence_message_id uuid,
  UNIQUE (practice_id, external_party, consent_type)
);

CREATE INDEX IF NOT EXISTS patient_consent_practice_party_idx
  ON public.patient_consent (practice_id, external_party);

-- ---------------------------------------------------------------------------
-- Scheduled campaigns
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.scheduled_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  practice_id uuid NOT NULL REFERENCES public.practices (id) ON DELETE CASCADE,
  campaign_type text NOT NULL
    CHECK (campaign_type IN ('appointment_reminder', 'payment_reminder', 'onboarding', 'follow_up', 'custom')),
  channel text NOT NULL CHECK (channel IN ('whatsapp', 'voice')),
  template_id uuid REFERENCES public.whatsapp_templates (id) ON DELETE SET NULL,
  target_query jsonb DEFAULT '{}',
  scheduled_for timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'scheduled', 'running', 'completed', 'cancelled')),
  stats jsonb DEFAULT '{"sent": 0, "delivered": 0, "failed": 0}',
  created_by uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS scheduled_campaigns_practice_idx
  ON public.scheduled_campaigns (practice_id, scheduled_for);

-- ---------------------------------------------------------------------------
-- Webhook dead-letter queue
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.webhook_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  practice_id uuid REFERENCES public.practices (id) ON DELETE CASCADE,
  source text NOT NULL,
  event_type text,
  payload jsonb NOT NULL,
  error_message text,
  retry_count int NOT NULL DEFAULT 0,
  next_retry_at timestamptz,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS webhook_events_retry_idx
  ON public.webhook_events (status, next_retry_at) WHERE status IN ('pending', 'processing');

-- ---------------------------------------------------------------------------
-- RLS for all new tables
-- ---------------------------------------------------------------------------

ALTER TABLE public.practice_channels ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversation_threads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.thread_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.voice_calls ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.practice_hours ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.practice_faqs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.practice_services ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.patient_consent ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scheduled_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.webhook_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY practice_channels_all ON public.practice_channels FOR ALL
  USING (public.is_practice_member(practice_id))
  WITH CHECK (public.is_practice_member(practice_id));

CREATE POLICY conversation_threads_all ON public.conversation_threads FOR ALL
  USING (public.is_practice_member(practice_id))
  WITH CHECK (public.is_practice_member(practice_id));

CREATE POLICY thread_messages_all ON public.thread_messages FOR ALL
  USING (public.is_practice_member(practice_id))
  WITH CHECK (public.is_practice_member(practice_id));

CREATE POLICY voice_calls_all ON public.voice_calls FOR ALL
  USING (public.is_practice_member(practice_id))
  WITH CHECK (public.is_practice_member(practice_id));

CREATE POLICY practice_hours_all ON public.practice_hours FOR ALL
  USING (public.is_practice_member(practice_id))
  WITH CHECK (public.is_practice_member(practice_id));

CREATE POLICY practice_faqs_all ON public.practice_faqs FOR ALL
  USING (public.is_practice_member(practice_id))
  WITH CHECK (public.is_practice_member(practice_id));

CREATE POLICY practice_services_all ON public.practice_services FOR ALL
  USING (public.is_practice_member(practice_id))
  WITH CHECK (public.is_practice_member(practice_id));

CREATE POLICY whatsapp_templates_all ON public.whatsapp_templates FOR ALL
  USING (public.is_practice_member(practice_id))
  WITH CHECK (public.is_practice_member(practice_id));

CREATE POLICY patient_consent_all ON public.patient_consent FOR ALL
  USING (public.is_practice_member(practice_id))
  WITH CHECK (public.is_practice_member(practice_id));

CREATE POLICY scheduled_campaigns_all ON public.scheduled_campaigns FOR ALL
  USING (public.is_practice_member(practice_id))
  WITH CHECK (public.is_practice_member(practice_id));

CREATE POLICY webhook_events_all ON public.webhook_events FOR ALL
  USING (practice_id IS NULL OR public.is_practice_member(practice_id))
  WITH CHECK (practice_id IS NULL OR public.is_practice_member(practice_id));

-- ---------------------------------------------------------------------------
-- Service-role bypass for webhook handlers (they run without auth context)
-- ---------------------------------------------------------------------------

CREATE POLICY practice_channels_service ON public.practice_channels FOR SELECT
  TO service_role USING (true);

CREATE POLICY conversation_threads_service ON public.conversation_threads FOR ALL
  TO service_role USING (true) WITH CHECK (true);

CREATE POLICY thread_messages_service ON public.thread_messages FOR ALL
  TO service_role USING (true) WITH CHECK (true);

CREATE POLICY voice_calls_service ON public.voice_calls FOR ALL
  TO service_role USING (true) WITH CHECK (true);

CREATE POLICY practice_hours_service ON public.practice_hours FOR SELECT
  TO service_role USING (true);

CREATE POLICY practice_faqs_service ON public.practice_faqs FOR SELECT
  TO service_role USING (true);

CREATE POLICY practice_services_service ON public.practice_services FOR SELECT
  TO service_role USING (true);

CREATE POLICY patient_consent_service ON public.patient_consent FOR ALL
  TO service_role USING (true) WITH CHECK (true);

CREATE POLICY webhook_events_service ON public.webhook_events FOR ALL
  TO service_role USING (true) WITH CHECK (true);

CREATE POLICY practice_appointments_service ON public.practice_appointments FOR ALL
  TO service_role USING (true) WITH CHECK (true);

CREATE POLICY practice_patients_service ON public.practice_patients FOR ALL
  TO service_role USING (true) WITH CHECK (true);

-- Seed default hours template for quick provisioning
-- (actual seeding happens per-practice in the provisioning API)

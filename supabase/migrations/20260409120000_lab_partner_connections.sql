-- Lab partner HL7 / results routing: per-practice outreach workflow (Lancet, Ampath, PathCare).

CREATE TABLE IF NOT EXISTS public.lab_partner_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  practice_id uuid NOT NULL REFERENCES public.practices (id) ON DELETE CASCADE,
  lab_partner text NOT NULL CHECK (lab_partner IN ('lancet', 'ampath', 'pathcare')),
  status text NOT NULL DEFAULT 'not_started'
    CHECK (status IN ('not_started', 'outreach_sent', 'awaiting_lab', 'live', 'paused')),
  inbound_auth_token text,
  doctor_snapshot jsonb NOT NULL DEFAULT '[]'::jsonb,
  last_outreach_at timestamptz,
  last_outreach_to text,
  last_outreach_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (practice_id, lab_partner)
);

CREATE INDEX IF NOT EXISTS lab_partner_connections_practice_idx
  ON public.lab_partner_connections (practice_id);

CREATE UNIQUE INDEX IF NOT EXISTS lab_partner_connections_token_uidx
  ON public.lab_partner_connections (inbound_auth_token)
  WHERE inbound_auth_token IS NOT NULL;

ALTER TABLE public.lab_partner_connections ENABLE ROW LEVEL SECURITY;

CREATE POLICY lab_partner_connections_all ON public.lab_partner_connections FOR ALL
  USING (public.is_practice_member(practice_id))
  WITH CHECK (public.is_practice_member(practice_id));

CREATE POLICY lab_partner_connections_service ON public.lab_partner_connections FOR ALL
  TO service_role USING (true) WITH CHECK (true);

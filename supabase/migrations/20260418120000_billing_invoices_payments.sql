-- Billing: invoices, payments, receipts, credit notes, sequences, webhooks audit, cash drawer, audit log.
-- Extends patient_access_tokens with billing_invoice purpose + invoice_id.

-- ---------------------------------------------------------------------------
-- practice_invoices
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.practice_invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  practice_id uuid NOT NULL REFERENCES public.practices (id) ON DELETE CASCADE,
  patient_id uuid REFERENCES public.practice_patients (id) ON DELETE SET NULL,
  claim_id uuid REFERENCES public.practice_claims (id) ON DELETE SET NULL,
  clinical_encounter_id uuid REFERENCES public.clinical_encounters (id) ON DELETE SET NULL,
  appointment_id uuid REFERENCES public.practice_appointments (id) ON DELETE SET NULL,

  invoice_number text NOT NULL,
  currency text NOT NULL DEFAULT 'ZAR',
  subtotal_cents bigint NOT NULL DEFAULT 0,
  vat_cents bigint NOT NULL DEFAULT 0,
  total_cents bigint NOT NULL DEFAULT 0,
  amount_paid_cents bigint NOT NULL DEFAULT 0,
  amount_due_cents bigint GENERATED ALWAYS AS (total_cents - amount_paid_cents) STORED,

  billing_mode text NOT NULL DEFAULT 'cash'
    CHECK (billing_mode IN ('cash', 'card', 'eft_instant', 'split', 'scheme_only')),

  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN (
      'draft', 'issued', 'sent', 'viewed', 'partially_paid', 'paid',
      'refunded', 'write_off', 'void'
    )),

  practice_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  patient_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  line_items jsonb NOT NULL DEFAULT '[]'::jsonb,
  notes text,

  pdf_storage_path text,
  issued_at timestamptz,
  due_at timestamptz,
  last_reminded_at timestamptz,
  paid_at timestamptz,
  voided_at timestamptz,
  write_off_reason text,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  UNIQUE (practice_id, invoice_number)
);

CREATE INDEX IF NOT EXISTS practice_invoices_practice_status_idx
  ON public.practice_invoices (practice_id, status, updated_at DESC);
CREATE INDEX IF NOT EXISTS practice_invoices_patient_idx
  ON public.practice_invoices (practice_id, patient_id);
CREATE INDEX IF NOT EXISTS practice_invoices_claim_idx
  ON public.practice_invoices (claim_id) WHERE claim_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- practice_payments
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.practice_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  practice_id uuid NOT NULL REFERENCES public.practices (id) ON DELETE CASCADE,
  invoice_id uuid NOT NULL REFERENCES public.practice_invoices (id) ON DELETE CASCADE,

  provider text NOT NULL
    CHECK (provider IN ('cash', 'polar', 'stitch', 'eft_manual', 'medical_aid', 'write_off')),
  method text
    CHECK (method IS NULL OR method IN ('apple_pay', 'google_pay', 'card', 'payshap', 'eft', 'cash')),

  amount_cents bigint NOT NULL,
  currency text NOT NULL DEFAULT 'ZAR',
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN (
      'pending', 'authorized', 'succeeded', 'failed', 'refunded',
      'partially_refunded', 'canceled'
    )),

  provider_checkout_id text,
  provider_order_id text,
  provider_payment_intent text,
  provider_customer_id text,
  provider_raw jsonb,

  received_by_user_id uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  cash_drawer_session_id uuid,
  reference text,

  idempotency_key text,
  failure_reason text,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  succeeded_at timestamptz,
  refunded_at timestamptz,

  UNIQUE (practice_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS practice_payments_invoice_idx ON public.practice_payments (invoice_id);
CREATE INDEX IF NOT EXISTS practice_payments_practice_created_idx
  ON public.practice_payments (practice_id, created_at DESC);
CREATE INDEX IF NOT EXISTS practice_payments_provider_checkout_idx
  ON public.practice_payments (provider, provider_checkout_id)
  WHERE provider_checkout_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- cash_drawer_sessions (before FK from practice_payments)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.cash_drawer_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  practice_id uuid NOT NULL REFERENCES public.practices (id) ON DELETE CASCADE,
  opened_by uuid NOT NULL REFERENCES auth.users (id) ON DELETE SET NULL,
  opened_at timestamptz NOT NULL DEFAULT now(),
  opening_float_cents bigint NOT NULL DEFAULT 0,
  closed_by uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  closed_at timestamptz,
  counted_cash_cents bigint,
  variance_cents bigint,
  notes text,
  z_report_storage_path text
);

CREATE INDEX IF NOT EXISTS cash_drawer_sessions_practice_open_idx
  ON public.cash_drawer_sessions (practice_id, closed_at)
  WHERE closed_at IS NULL;

ALTER TABLE public.practice_payments
  ADD CONSTRAINT practice_payments_cash_drawer_fk
  FOREIGN KEY (cash_drawer_session_id) REFERENCES public.cash_drawer_sessions (id) ON DELETE SET NULL;

-- ---------------------------------------------------------------------------
-- practice_receipts
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.practice_receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  practice_id uuid NOT NULL REFERENCES public.practices (id) ON DELETE CASCADE,
  invoice_id uuid NOT NULL REFERENCES public.practice_invoices (id) ON DELETE CASCADE,
  payment_id uuid NOT NULL REFERENCES public.practice_payments (id) ON DELETE CASCADE,
  receipt_number text NOT NULL,
  pdf_storage_path text,
  snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  delivered_email_at timestamptz,
  delivered_sms_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (practice_id, receipt_number)
);

CREATE INDEX IF NOT EXISTS practice_receipts_invoice_idx ON public.practice_receipts (invoice_id);

-- ---------------------------------------------------------------------------
-- practice_credit_notes
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.practice_credit_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  practice_id uuid NOT NULL REFERENCES public.practices (id) ON DELETE CASCADE,
  invoice_id uuid NOT NULL REFERENCES public.practice_invoices (id) ON DELETE CASCADE,
  payment_id uuid REFERENCES public.practice_payments (id) ON DELETE SET NULL,
  credit_note_number text NOT NULL,
  amount_cents bigint NOT NULL,
  currency text NOT NULL DEFAULT 'ZAR',
  reason text,
  pdf_storage_path text,
  snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (practice_id, credit_note_number)
);

-- ---------------------------------------------------------------------------
-- practice_billing_sequences
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.practice_billing_sequences (
  practice_id uuid NOT NULL REFERENCES public.practices (id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('invoice', 'receipt', 'credit_note')),
  next_value bigint NOT NULL DEFAULT 1,
  prefix text NOT NULL DEFAULT '',
  PRIMARY KEY (practice_id, kind)
);

-- ---------------------------------------------------------------------------
-- payment_provider_events (webhook idempotency)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.payment_provider_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL,
  provider_event_id text NOT NULL,
  event_type text NOT NULL,
  signature_valid boolean NOT NULL DEFAULT true,
  payload jsonb NOT NULL DEFAULT '{}',
  processed_at timestamptz,
  received_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider, provider_event_id)
);

CREATE INDEX IF NOT EXISTS payment_provider_events_received_idx
  ON public.payment_provider_events (received_at DESC);

-- ---------------------------------------------------------------------------
-- billing_audit_log
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.billing_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  practice_id uuid NOT NULL REFERENCES public.practices (id) ON DELETE CASCADE,
  actor_user_id uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  entity_type text NOT NULL,
  entity_id uuid NOT NULL,
  action text NOT NULL,
  diff jsonb,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS billing_audit_log_practice_created_idx
  ON public.billing_audit_log (practice_id, created_at DESC);
CREATE INDEX IF NOT EXISTS billing_audit_log_entity_idx
  ON public.billing_audit_log (entity_type, entity_id);

-- ---------------------------------------------------------------------------
-- patient_access_tokens: billing_invoice + invoice_id
-- ---------------------------------------------------------------------------

ALTER TABLE public.patient_access_tokens DROP CONSTRAINT IF EXISTS patient_access_tokens_purpose_check;
ALTER TABLE public.patient_access_tokens ADD CONSTRAINT patient_access_tokens_purpose_check
  CHECK (purpose IN (
    'check_in', 'intake', 'billing', 'billing_invoice', 'lab_results', 'general', 'appointment'
  ));

ALTER TABLE public.patient_access_tokens
  ADD COLUMN IF NOT EXISTS invoice_id uuid REFERENCES public.practice_invoices (id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS patient_access_tokens_invoice_idx
  ON public.patient_access_tokens (invoice_id) WHERE invoice_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

ALTER TABLE public.practice_invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.practice_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.practice_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.practice_credit_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.practice_billing_sequences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_provider_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.billing_audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cash_drawer_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY practice_invoices_member ON public.practice_invoices FOR ALL
  USING (public.is_practice_member(practice_id))
  WITH CHECK (public.is_practice_member(practice_id));

CREATE POLICY practice_payments_member ON public.practice_payments FOR ALL
  USING (public.is_practice_member(practice_id))
  WITH CHECK (public.is_practice_member(practice_id));

CREATE POLICY practice_receipts_member ON public.practice_receipts FOR ALL
  USING (public.is_practice_member(practice_id))
  WITH CHECK (public.is_practice_member(practice_id));

CREATE POLICY practice_credit_notes_member ON public.practice_credit_notes FOR ALL
  USING (public.is_practice_member(practice_id))
  WITH CHECK (public.is_practice_member(practice_id));

CREATE POLICY practice_billing_sequences_member ON public.practice_billing_sequences FOR ALL
  USING (public.is_practice_member(practice_id))
  WITH CHECK (public.is_practice_member(practice_id));

-- payment_provider_events has no practice_id — only service_role (webhooks)
CREATE POLICY payment_provider_events_deny_authenticated ON public.payment_provider_events FOR ALL
  TO authenticated USING (false) WITH CHECK (false);

CREATE POLICY payment_provider_events_service ON public.payment_provider_events FOR ALL
  TO service_role USING (true) WITH CHECK (true);

CREATE POLICY billing_audit_log_member ON public.billing_audit_log FOR ALL
  USING (public.is_practice_member(practice_id))
  WITH CHECK (public.is_practice_member(practice_id));

CREATE POLICY cash_drawer_sessions_member ON public.cash_drawer_sessions FOR ALL
  USING (public.is_practice_member(practice_id))
  WITH CHECK (public.is_practice_member(practice_id));

CREATE POLICY practice_invoices_service ON public.practice_invoices FOR ALL
  TO service_role USING (true) WITH CHECK (true);
CREATE POLICY practice_payments_service ON public.practice_payments FOR ALL
  TO service_role USING (true) WITH CHECK (true);
CREATE POLICY practice_receipts_service ON public.practice_receipts FOR ALL
  TO service_role USING (true) WITH CHECK (true);
CREATE POLICY practice_credit_notes_service ON public.practice_credit_notes FOR ALL
  TO service_role USING (true) WITH CHECK (true);
CREATE POLICY practice_billing_sequences_service ON public.practice_billing_sequences FOR ALL
  TO service_role USING (true) WITH CHECK (true);
CREATE POLICY billing_audit_log_service ON public.billing_audit_log FOR ALL
  TO service_role USING (true) WITH CHECK (true);
CREATE POLICY cash_drawer_sessions_service ON public.cash_drawer_sessions FOR ALL
  TO service_role USING (true) WITH CHECK (true);

COMMENT ON TABLE public.practice_invoices IS 'Patient-facing tax invoices; immutable snapshots at issue.';
COMMENT ON TABLE public.payment_provider_events IS 'Idempotent webhook log; no practice_id; service_role only.';

-- Gapless per-practice sequence (atomic increment).
CREATE OR REPLACE FUNCTION public.next_billing_number(
  p_practice_id uuid,
  p_kind text,
  p_default_prefix text DEFAULT ''
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_num bigint;
  v_prefix text;
BEGIN
  INSERT INTO public.practice_billing_sequences (practice_id, kind, next_value, prefix)
  VALUES (
    p_practice_id,
    p_kind,
    0,
    COALESCE(NULLIF(trim(p_default_prefix), ''), CASE p_kind
      WHEN 'invoice' THEN 'INV-'
      WHEN 'receipt' THEN 'RCP-'
      WHEN 'credit_note' THEN 'CN-'
      ELSE ''
    END)
  )
  ON CONFLICT (practice_id, kind) DO NOTHING;

  UPDATE public.practice_billing_sequences
  SET next_value = next_value + 1
  WHERE practice_id = p_practice_id AND kind = p_kind
  RETURNING prefix, next_value INTO v_prefix, v_num;

  RETURN v_prefix || v_num::text;
END;
$$;

REVOKE ALL ON FUNCTION public.next_billing_number(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.next_billing_number(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.next_billing_number(uuid, text, text) TO service_role;

-- Private bucket for invoice/receipt PDFs (access via signed URLs only)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'billing-documents',
  'billing-documents',
  false,
  10485760,
  ARRAY['application/pdf']::text[]
)
ON CONFLICT (id) DO NOTHING;

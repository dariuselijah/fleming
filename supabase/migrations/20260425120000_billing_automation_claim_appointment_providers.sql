-- Billing automation settings, follow-up audit, claim→appointment link, extend payment providers.
--
-- If public.practice_invoices / practice_payments are missing (e.g. this file was run alone
-- in the SQL editor), create minimal copies so follow_ups + provider CHECK can apply.
-- For full billing (RLS, receipts, sequences, storage, patient_access_tokens): still apply
-- supabase/migrations/20260418120000_billing_invoices_payments.sql (or `supabase db push`).

DO $$
BEGIN
  IF to_regclass('public.practice_invoices') IS NULL THEN
    RAISE NOTICE 'Creating public.practice_invoices (minimal). Run 20260418120000_billing_invoices_payments.sql for full billing schema.';
  END IF;
  IF to_regclass('public.practice_payments') IS NULL THEN
    RAISE NOTICE 'Creating public.practice_payments (minimal). Run 20260418120000_billing_invoices_payments.sql for full billing schema.';
  END IF;
END $$;

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
-- practice_claims.appointment_id (optional link for invoice / today-strip matching)
-- ---------------------------------------------------------------------------

ALTER TABLE public.practice_claims
  ADD COLUMN IF NOT EXISTS appointment_id uuid REFERENCES public.practice_appointments (id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS practice_claims_appointment_idx
  ON public.practice_claims (appointment_id)
  WHERE appointment_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- practice_billing_automation_settings (one row per practice)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.practice_billing_automation_settings (
  practice_id uuid PRIMARY KEY REFERENCES public.practices (id) ON DELETE CASCADE,
  auto_submit_claims boolean NOT NULL DEFAULT false,
  auto_send_shortfall_sms boolean NOT NULL DEFAULT true,
  auto_ai_voice_call boolean NOT NULL DEFAULT false,
  overdue_sms_hours integer NOT NULL DEFAULT 72,
  overdue_voice_hours integer NOT NULL DEFAULT 72,
  escalation_hours integer NOT NULL DEFAULT 168,
  default_opening_float_cents bigint NOT NULL DEFAULT 0,
  cash_drawer_variance_alert_cents bigint NOT NULL DEFAULT 10000,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.practice_billing_automation_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY practice_billing_automation_settings_member
  ON public.practice_billing_automation_settings FOR ALL
  USING (public.is_practice_member(practice_id))
  WITH CHECK (public.is_practice_member(practice_id));

CREATE POLICY practice_billing_automation_settings_service
  ON public.practice_billing_automation_settings FOR ALL
  TO service_role USING (true) WITH CHECK (true);

-- ---------------------------------------------------------------------------
-- practice_billing_follow_ups (SMS / voice attempts per invoice)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.practice_billing_follow_ups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  practice_id uuid NOT NULL REFERENCES public.practices (id) ON DELETE CASCADE,
  invoice_id uuid NOT NULL REFERENCES public.practice_invoices (id) ON DELETE CASCADE,
  channel text NOT NULL
    CHECK (channel IN ('sms', 'voice', 'email')),
  status text NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'sent', 'failed', 'completed')),
  vapi_call_id text,
  provider_raw jsonb NOT NULL DEFAULT '{}'::jsonb,
  transcript_ref text,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

CREATE INDEX IF NOT EXISTS practice_billing_follow_ups_invoice_idx
  ON public.practice_billing_follow_ups (invoice_id, created_at DESC);

CREATE INDEX IF NOT EXISTS practice_billing_follow_ups_practice_idx
  ON public.practice_billing_follow_ups (practice_id, created_at DESC);

ALTER TABLE public.practice_billing_follow_ups ENABLE ROW LEVEL SECURITY;

CREATE POLICY practice_billing_follow_ups_member
  ON public.practice_billing_follow_ups FOR ALL
  USING (public.is_practice_member(practice_id))
  WITH CHECK (public.is_practice_member(practice_id));

CREATE POLICY practice_billing_follow_ups_service
  ON public.practice_billing_follow_ups FOR ALL
  TO service_role USING (true) WITH CHECK (true);

-- ---------------------------------------------------------------------------
-- Extend practice_payments.provider for Yoco / PayFast / Payflex
-- ---------------------------------------------------------------------------

ALTER TABLE public.practice_payments
  DROP CONSTRAINT IF EXISTS practice_payments_provider_check;

ALTER TABLE public.practice_payments
  ADD CONSTRAINT practice_payments_provider_check
  CHECK (provider IN (
    'cash', 'polar', 'stitch', 'yoco', 'payfast', 'payflex',
    'eft_manual', 'medical_aid', 'write_off'
  ));

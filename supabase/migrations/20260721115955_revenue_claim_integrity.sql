-- Revenue / MediKredit integrity hardening.
-- Additive only: preserves existing claims, invoices, and payment records.

ALTER TABLE public.practice_claims
  ADD COLUMN IF NOT EXISTS duplicate_of_claim_id uuid REFERENCES public.practice_claims (id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS resubmission_of_claim_id uuid REFERENCES public.practice_claims (id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS reversed_at timestamptz,
  ADD COLUMN IF NOT EXISTS reversal_tx_nbr text;

CREATE INDEX IF NOT EXISTS practice_claims_duplicate_of_idx
  ON public.practice_claims (duplicate_of_claim_id)
  WHERE duplicate_of_claim_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS practice_claims_resubmission_of_idx
  ON public.practice_claims (resubmission_of_claim_id)
  WHERE resubmission_of_claim_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.practice_claim_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  practice_id uuid NOT NULL REFERENCES public.practices (id) ON DELETE CASCADE,
  claim_id uuid NOT NULL REFERENCES public.practice_claims (id) ON DELETE CASCADE,
  event_type text NOT NULL,
  status text,
  tx_nbr text,
  related_claim_id uuid REFERENCES public.practice_claims (id) ON DELETE SET NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  actor_user_id uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS practice_claim_events_claim_created_idx
  ON public.practice_claim_events (claim_id, created_at DESC);

CREATE INDEX IF NOT EXISTS practice_claim_events_practice_created_idx
  ON public.practice_claim_events (practice_id, created_at DESC);

ALTER TABLE public.practice_claim_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY practice_claim_events_member_select
  ON public.practice_claim_events FOR SELECT
  USING (public.is_practice_member(practice_id));

CREATE POLICY practice_claim_events_member_insert
  ON public.practice_claim_events FOR INSERT
  WITH CHECK (public.is_practice_member(practice_id));

CREATE POLICY practice_claim_events_service
  ON public.practice_claim_events FOR ALL
  TO service_role USING (true) WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.reject_claim_event_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  RAISE EXCEPTION 'practice_claim_events is append-only';
END;
$$;

DROP TRIGGER IF EXISTS practice_claim_events_immutable ON public.practice_claim_events;
CREATE TRIGGER practice_claim_events_immutable
  BEFORE UPDATE OR DELETE ON public.practice_claim_events
  FOR EACH ROW EXECUTE FUNCTION public.reject_claim_event_mutation();

-- One non-void invoice per claim. The advisory lock closes the concurrent insert race
-- without failing this migration if old databases already contain duplicate invoices.
CREATE OR REPLACE FUNCTION public.guard_duplicate_claim_invoice()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.claim_id IS NULL OR NEW.status = 'void' THEN
    RETURN NEW;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(NEW.claim_id::text, 0));
  IF EXISTS (
    SELECT 1
    FROM public.practice_invoices pi
    WHERE pi.claim_id = NEW.claim_id
      AND pi.status <> 'void'
      AND pi.id <> NEW.id
  ) THEN
    RAISE EXCEPTION 'active invoice already exists for claim %', NEW.claim_id
      USING ERRCODE = '23505';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS practice_invoices_claim_duplicate_guard ON public.practice_invoices;
CREATE TRIGGER practice_invoices_claim_duplicate_guard
  BEFORE INSERT OR UPDATE OF claim_id, status ON public.practice_invoices
  FOR EACH ROW EXECUTE FUNCTION public.guard_duplicate_claim_invoice();

CREATE OR REPLACE FUNCTION public.guard_duplicate_payment_receipt()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(NEW.payment_id::text, 1));
  IF EXISTS (
    SELECT 1 FROM public.practice_receipts pr
    WHERE pr.payment_id = NEW.payment_id AND pr.id <> NEW.id
  ) THEN
    RAISE EXCEPTION 'receipt already exists for payment %', NEW.payment_id
      USING ERRCODE = '23505';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS practice_receipts_payment_duplicate_guard ON public.practice_receipts;
CREATE TRIGGER practice_receipts_payment_duplicate_guard
  BEFORE INSERT OR UPDATE OF payment_id ON public.practice_receipts
  FOR EACH ROW EXECUTE FUNCTION public.guard_duplicate_payment_receipt();

-- Atomically and idempotently finalize a pending provider payment and recompute
-- the invoice balance from succeeded payment rows.
CREATE OR REPLACE FUNCTION public.finalize_billing_payment_success(
  p_practice_id uuid,
  p_payment_id uuid,
  p_provider_order_id text DEFAULT NULL,
  p_method text DEFAULT NULL
)
RETURNS TABLE (
  payment_id uuid,
  invoice_id uuid,
  invoice_status text,
  amount_paid_cents bigint,
  changed boolean
)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_payment public.practice_payments%ROWTYPE;
  v_invoice public.practice_invoices%ROWTYPE;
  v_paid bigint;
  v_status text;
  v_changed boolean := false;
  v_now timestamptz := now();
BEGIN
  SELECT * INTO v_payment
  FROM public.practice_payments
  WHERE id = p_payment_id AND practice_id = p_practice_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'payment not found';
  END IF;

  SELECT * INTO v_invoice
  FROM public.practice_invoices
  WHERE id = v_payment.invoice_id AND practice_id = p_practice_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'invoice not found';
  END IF;

  IF v_payment.status NOT IN ('succeeded', 'refunded', 'partially_refunded') THEN
    UPDATE public.practice_payments
    SET status = 'succeeded',
        provider_order_id = COALESCE(p_provider_order_id, provider_order_id),
        method = COALESCE(NULLIF(p_method, ''), method),
        succeeded_at = COALESCE(succeeded_at, v_now),
        updated_at = v_now
    WHERE id = v_payment.id;
    v_changed := true;
  END IF;

  SELECT COALESCE(sum(amount_cents), 0)::bigint INTO v_paid
  FROM public.practice_payments
  WHERE invoice_id = v_invoice.id AND status = 'succeeded';

  v_status := CASE
    WHEN v_paid >= v_invoice.total_cents THEN 'paid'
    WHEN v_paid > 0 THEN 'partially_paid'
    ELSE v_invoice.status
  END;

  UPDATE public.practice_invoices
  SET amount_paid_cents = v_paid,
      status = v_status,
      paid_at = CASE WHEN v_status = 'paid' THEN COALESCE(paid_at, v_now) ELSE NULL END,
      updated_at = v_now
  WHERE id = v_invoice.id;

  RETURN QUERY SELECT v_payment.id, v_invoice.id, v_status, v_paid, v_changed;
END;
$$;

REVOKE ALL ON FUNCTION public.finalize_billing_payment_success(uuid, uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.finalize_billing_payment_success(uuid, uuid, text, text)
  TO authenticated, service_role;

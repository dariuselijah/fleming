-- Revenue cycle automation extensions: settlements, dunning reminders, reporting indexes.

CREATE TABLE IF NOT EXISTS public.practice_settlement_imports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  practice_id uuid NOT NULL REFERENCES public.practices (id) ON DELETE CASCADE,
  source text NOT NULL CHECK (source IN ('polar', 'stitch', 'bank')),
  period text,
  file_path text,
  totals jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'imported' CHECK (status IN ('imported', 'matched', 'needs_review')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.practice_settlement_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  import_id uuid NOT NULL REFERENCES public.practice_settlement_imports (id) ON DELETE CASCADE,
  external_ref text,
  amount_cents bigint NOT NULL DEFAULT 0,
  fees_cents bigint NOT NULL DEFAULT 0,
  matched_payment_id uuid REFERENCES public.practice_payments (id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'unmatched' CHECK (status IN ('unmatched', 'matched', 'disputed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.practice_invoice_reminders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  practice_id uuid NOT NULL REFERENCES public.practices (id) ON DELETE CASCADE,
  invoice_id uuid NOT NULL REFERENCES public.practice_invoices (id) ON DELETE CASCADE,
  level text NOT NULL CHECK (level IN ('7d', '14d', '30d')),
  channel text NOT NULL DEFAULT 'sms' CHECK (channel IN ('sms', 'email', 'whatsapp')),
  message_id text,
  sent_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (invoice_id, level, channel)
);

CREATE INDEX IF NOT EXISTS practice_invoices_practice_status_issued_idx
  ON public.practice_invoices (practice_id, status, issued_at);

CREATE INDEX IF NOT EXISTS practice_payments_practice_succeeded_idx
  ON public.practice_payments (practice_id, succeeded_at);

CREATE INDEX IF NOT EXISTS practice_settlement_imports_practice_created_idx
  ON public.practice_settlement_imports (practice_id, created_at DESC);

CREATE INDEX IF NOT EXISTS practice_settlement_lines_import_status_idx
  ON public.practice_settlement_lines (import_id, status);

CREATE INDEX IF NOT EXISTS practice_invoice_reminders_practice_sent_idx
  ON public.practice_invoice_reminders (practice_id, sent_at DESC);

ALTER TABLE public.practice_settlement_imports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.practice_settlement_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.practice_invoice_reminders ENABLE ROW LEVEL SECURITY;

CREATE POLICY practice_settlement_imports_member ON public.practice_settlement_imports FOR ALL
  USING (EXISTS (
    SELECT 1 FROM public.practice_members pm
    WHERE pm.practice_id = practice_settlement_imports.practice_id
      AND pm.user_id = auth.uid()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.practice_members pm
    WHERE pm.practice_id = practice_settlement_imports.practice_id
      AND pm.user_id = auth.uid()
  ));

CREATE POLICY practice_settlement_lines_member ON public.practice_settlement_lines FOR ALL
  USING (EXISTS (
    SELECT 1
    FROM public.practice_settlement_imports psi
    JOIN public.practice_members pm ON pm.practice_id = psi.practice_id
    WHERE psi.id = practice_settlement_lines.import_id
      AND pm.user_id = auth.uid()
  ))
  WITH CHECK (EXISTS (
    SELECT 1
    FROM public.practice_settlement_imports psi
    JOIN public.practice_members pm ON pm.practice_id = psi.practice_id
    WHERE psi.id = practice_settlement_lines.import_id
      AND pm.user_id = auth.uid()
  ));

CREATE POLICY practice_invoice_reminders_member ON public.practice_invoice_reminders FOR ALL
  USING (EXISTS (
    SELECT 1 FROM public.practice_members pm
    WHERE pm.practice_id = practice_invoice_reminders.practice_id
      AND pm.user_id = auth.uid()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.practice_members pm
    WHERE pm.practice_id = practice_invoice_reminders.practice_id
      AND pm.user_id = auth.uid()
  ));

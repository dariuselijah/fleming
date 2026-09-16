CREATE TABLE IF NOT EXISTS public.clinical_document_shares (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  practice_id uuid NOT NULL REFERENCES public.practices (id) ON DELETE CASCADE,
  patient_id uuid NOT NULL REFERENCES public.practice_patients (id) ON DELETE CASCADE,
  created_by uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  token_hash text NOT NULL UNIQUE,
  title text NOT NULL,
  doc_type text,
  content_ciphertext text NOT NULL,
  content_iv text NOT NULL,
  expires_at timestamptz NOT NULL,
  opened_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS clinical_document_shares_patient_idx
  ON public.clinical_document_shares (practice_id, patient_id, created_at DESC);

CREATE INDEX IF NOT EXISTS clinical_document_shares_expiry_idx
  ON public.clinical_document_shares (expires_at);

ALTER TABLE public.clinical_document_shares ENABLE ROW LEVEL SECURITY;

CREATE POLICY clinical_document_shares_practice_members
  ON public.clinical_document_shares
  FOR ALL
  USING (public.is_practice_member(practice_id))
  WITH CHECK (public.is_practice_member(practice_id));

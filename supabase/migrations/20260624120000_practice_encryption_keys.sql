-- Server-sealed practice DEK: lets authenticated staff decrypt patient data without a passphrase prompt.
CREATE TABLE IF NOT EXISTS public.practice_encryption_keys (
  practice_id uuid PRIMARY KEY REFERENCES public.practices (id) ON DELETE CASCADE,
  enc_dek text NOT NULL,
  dek_iv text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.practice_encryption_keys ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS practice_encryption_keys_select ON public.practice_encryption_keys;
CREATE POLICY practice_encryption_keys_select ON public.practice_encryption_keys FOR SELECT
  USING (public.is_practice_member(practice_id));

-- Writes happen via service role in API routes (members cannot mutate directly).

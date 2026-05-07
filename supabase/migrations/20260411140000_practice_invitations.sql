-- Pending invitations to join a practice with a specific role (hashed token, no raw token stored).

CREATE TABLE IF NOT EXISTS public.practice_invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  practice_id uuid NOT NULL REFERENCES public.practices (id) ON DELETE CASCADE,
  email text NOT NULL,
  role text NOT NULL
    CHECK (role IN ('owner', 'physician', 'nurse', 'admin', 'reception')),
  invited_by uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  token_hash text NOT NULL,
  expires_at timestamptz NOT NULL,
  accepted_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT practice_invitations_accept_revoke_exclusive CHECK (
    NOT (accepted_at IS NOT NULL AND revoked_at IS NOT NULL)
  )
);

-- If the table already existed without token_hash, CREATE TABLE IF NOT EXISTS skipped the
-- full definition; add the column before any index references it.
ALTER TABLE public.practice_invitations
  ADD COLUMN IF NOT EXISTS token_hash text;

DELETE FROM public.practice_invitations WHERE token_hash IS NULL;

ALTER TABLE public.practice_invitations
  ALTER COLUMN token_hash SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS practice_invitations_token_hash_idx
  ON public.practice_invitations (token_hash);

CREATE UNIQUE INDEX IF NOT EXISTS practice_invitations_pending_email_idx
  ON public.practice_invitations (practice_id, lower(email))
  WHERE accepted_at IS NULL AND revoked_at IS NULL;

CREATE INDEX IF NOT EXISTS practice_invitations_practice_idx
  ON public.practice_invitations (practice_id);

ALTER TABLE public.practice_invitations ENABLE ROW LEVEL SECURITY;

-- Invitations are read/written only via service role (API routes); JWT role has no policies.

-- Some projects have a legacy `practice_invitations` table (e.g. practice_email / user_id)
-- that conflicts with the team-invite schema (practice_id, email, token_hash, …).
-- Preserve legacy data under a renamed table and create the canonical definition.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'practice_invitations'
  ) THEN
    -- Legacy shape: has practice_email, lacks practice_id + token_hash
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'practice_invitations'
        AND column_name = 'practice_email'
    ) AND NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'practice_invitations'
        AND column_name = 'practice_id'
    ) THEN
      ALTER TABLE public.practice_invitations
        RENAME TO practice_invitations_legacy_pre_20260411;
    END IF;
  END IF;
END $$;

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

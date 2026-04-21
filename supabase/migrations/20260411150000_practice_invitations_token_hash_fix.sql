-- If practice_invitations already existed without token_hash, CREATE TABLE IF NOT EXISTS
-- in 20260411140000 would skip creating the full table and index creation then failed.
-- Run this after 20260411140000, or alone if the table exists but is missing columns.

ALTER TABLE public.practice_invitations
  ADD COLUMN IF NOT EXISTS token_hash text;

DELETE FROM public.practice_invitations WHERE token_hash IS NULL;

ALTER TABLE public.practice_invitations
  ALTER COLUMN token_hash SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS practice_invitations_token_hash_idx
  ON public.practice_invitations (token_hash);

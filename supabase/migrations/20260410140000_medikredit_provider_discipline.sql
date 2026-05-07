-- Add PHISC discipline to medikredit_providers for modifier catalog lookup.
ALTER TABLE public.medikredit_providers
  ADD COLUMN IF NOT EXISTS discipline text;

-- MediKredit VEND@vend_ver and optional display name for settings UI (parity with certified integration form).
ALTER TABLE public.medikredit_providers
  ADD COLUMN IF NOT EXISTS vendor_version text DEFAULT '1',
  ADD COLUMN IF NOT EXISTS provider_display_name text;

COMMENT ON COLUMN public.medikredit_providers.vendor_version IS 'Maps to VEND@vend_ver (often "1").';
COMMENT ON COLUMN public.medikredit_providers.provider_display_name IS 'Practice label for MediKredit / switch registration (optional).';

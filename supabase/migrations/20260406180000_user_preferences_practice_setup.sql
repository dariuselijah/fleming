-- Practice setup guide visibility + profile completion (clinician workspace)
ALTER TABLE public.user_preferences
  ADD COLUMN IF NOT EXISTS practice_profile_completed boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS practice_setup_guide_dismissed boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.user_preferences.practice_profile_completed IS 'True after clinician saves practice profile (BHF/HPCSA etc.) via setup or equivalent.';
COMMENT ON COLUMN public.user_preferences.practice_setup_guide_dismissed IS 'True when clinician dismissed the corner practice setup guide without completing profile.';

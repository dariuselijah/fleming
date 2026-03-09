-- Add role-specific onboarding profile fields to user_preferences.
ALTER TABLE user_preferences
ADD COLUMN IF NOT EXISTS student_school TEXT,
ADD COLUMN IF NOT EXISTS student_year TEXT,
ADD COLUMN IF NOT EXISTS clinician_name TEXT;

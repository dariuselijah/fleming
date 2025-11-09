-- Migration script to add encryption support for messages and health data
-- This adds IV (Initialization Vector) columns for encrypted content

-- Add IV column to messages table for encrypted content
ALTER TABLE messages 
ADD COLUMN IF NOT EXISTS content_iv TEXT;

-- Add IV columns to user_preferences table for encrypted health data
ALTER TABLE user_preferences
ADD COLUMN IF NOT EXISTS health_context_iv TEXT,
ADD COLUMN IF NOT EXISTS health_conditions_iv TEXT[],
ADD COLUMN IF NOT EXISTS medications_iv TEXT[],
ADD COLUMN IF NOT EXISTS allergies_iv TEXT[],
ADD COLUMN IF NOT EXISTS family_history_iv TEXT,
ADD COLUMN IF NOT EXISTS lifestyle_factors_iv TEXT;

-- Note: Existing data will remain unencrypted (plaintext)
-- New data will be encrypted if ENCRYPTION_KEY is set in environment variables


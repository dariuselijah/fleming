-- Add hourly rate limiting columns to users table
-- Run this migration to add hourly rate limiting support

ALTER TABLE users 
ADD COLUMN IF NOT EXISTS hourly_message_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS hourly_reset TIMESTAMP WITH TIME ZONE;

-- Create index for better performance on hourly reset queries
CREATE INDEX IF NOT EXISTS idx_users_hourly_reset ON users(hourly_reset);


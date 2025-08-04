-- Migration script to update existing attachments to use secure file paths
-- This script helps transition from public URLs to file paths for secure access

-- First, let's see what we have in the chat_attachments table
SELECT 
  id,
  file_url,
  file_name,
  file_type,
  created_at
FROM chat_attachments 
LIMIT 10;

-- If you have existing attachments with public URLs, you'll need to:
-- 1. Extract the file path from the URL
-- 2. Update the file_url column to store the path instead of the URL

-- Example: If file_url contains "https://your-project.supabase.co/storage/v1/object/public/chat-attachments/uploads/filename.jpg"
-- Extract just the "uploads/filename.jpg" part

-- Here's a sample update (uncomment and modify as needed):
/*
UPDATE chat_attachments 
SET file_url = SUBSTRING(
  file_url FROM 
  POSITION('/uploads/' IN file_url)
)
WHERE file_url LIKE '%/uploads/%'
AND file_url NOT LIKE 'uploads/%';
*/

-- Verify the changes
SELECT 
  id,
  file_url,
  file_name,
  file_type,
  created_at
FROM chat_attachments 
LIMIT 10;

-- Note: After running this migration, the application will:
-- 1. Store file paths instead of public URLs in the database
-- 2. Generate fresh signed URLs when displaying attachments
-- 3. Ensure secure access to medical files 
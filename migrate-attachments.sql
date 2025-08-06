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

-- Add type and discipline fields to projects table
ALTER TABLE projects ADD COLUMN IF NOT EXISTS type TEXT DEFAULT 'project';
ALTER TABLE projects ADD COLUMN IF NOT EXISTS discipline TEXT;

-- Create index for better performance
CREATE INDEX IF NOT EXISTS idx_projects_type ON projects(type);
CREATE INDEX IF NOT EXISTS idx_projects_discipline ON projects(discipline);

-- Create study_sessions table if it doesn't exist
CREATE TABLE IF NOT EXISTS study_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  discipline TEXT,
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create study_materials table if it doesn't exist
CREATE TABLE IF NOT EXISTS study_materials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  material_type TEXT NOT NULL,
  content TEXT,
  file_url TEXT,
  file_name TEXT,
  file_type TEXT,
  folder_name TEXT,
  tags TEXT[],
  discipline TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create study_session_materials junction table if it doesn't exist
CREATE TABLE IF NOT EXISTS study_session_materials (
  session_id UUID NOT NULL,
  material_id UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  PRIMARY KEY (session_id, material_id),
  FOREIGN KEY (session_id) REFERENCES study_sessions(id) ON DELETE CASCADE,
  FOREIGN KEY (material_id) REFERENCES study_materials(id) ON DELETE CASCADE
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_study_materials_user_id ON study_materials(user_id);
CREATE INDEX IF NOT EXISTS idx_study_materials_material_type ON study_materials(material_type);
CREATE INDEX IF NOT EXISTS idx_study_session_materials_session_id ON study_session_materials(session_id);
CREATE INDEX IF NOT EXISTS idx_study_session_materials_material_id ON study_session_materials(material_id); 
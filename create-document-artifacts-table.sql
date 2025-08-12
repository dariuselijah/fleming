-- Create document_artifacts table for storing document artifacts
CREATE TABLE IF NOT EXISTS document_artifacts (
  id TEXT PRIMARY KEY,
  chat_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  file_name TEXT NOT NULL,
  content_type TEXT NOT NULL,
  file_url TEXT NOT NULL,
  extracted_content TEXT NOT NULL,
  metadata JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- Foreign key constraints
  CONSTRAINT fk_document_artifacts_chat_id 
    FOREIGN KEY (chat_id) REFERENCES chats(id) ON DELETE CASCADE,
  CONSTRAINT fk_document_artifacts_user_id 
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_document_artifacts_chat_id ON document_artifacts(chat_id);
CREATE INDEX IF NOT EXISTS idx_document_artifacts_user_id ON document_artifacts(user_id);
CREATE INDEX IF NOT EXISTS idx_document_artifacts_created_at ON document_artifacts(created_at);

-- Add RLS (Row Level Security) policies
ALTER TABLE document_artifacts ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only see their own artifacts
CREATE POLICY "Users can view own artifacts" ON document_artifacts
  FOR SELECT USING (auth.uid()::text = user_id);

-- Policy: Users can only insert their own artifacts
CREATE POLICY "Users can insert own artifacts" ON document_artifacts
  FOR INSERT WITH CHECK (auth.uid()::text = user_id);

-- Policy: Users can only update their own artifacts
CREATE POLICY "Users can update own artifacts" ON document_artifacts
  FOR UPDATE USING (auth.uid()::text = user_id);

-- Policy: Users can only delete their own artifacts
CREATE POLICY "Users can delete own artifacts" ON document_artifacts
  FOR DELETE USING (auth.uid()::text = user_id);

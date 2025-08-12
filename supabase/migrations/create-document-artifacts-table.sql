-- Create document artifacts table
CREATE TABLE IF NOT EXISTS document_artifacts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  chat_id UUID NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  content_type TEXT NOT NULL DEFAULT 'text',
  file_name TEXT,
  file_size INTEGER,
  file_type TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_document_artifacts_chat_id ON document_artifacts(chat_id);
CREATE INDEX IF NOT EXISTS idx_document_artifacts_user_id ON document_artifacts(user_id);
CREATE INDEX IF NOT EXISTS idx_document_artifacts_created_at ON document_artifacts(created_at DESC);

-- Enable Row Level Security
ALTER TABLE document_artifacts ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
CREATE POLICY "Users can view their own document artifacts" ON document_artifacts
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own document artifacts" ON document_artifacts
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own document artifacts" ON document_artifacts
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own document artifacts" ON document_artifacts
  FOR DELETE USING (auth.uid() = user_id);

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_document_artifacts_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to automatically update updated_at
CREATE TRIGGER trigger_update_document_artifacts_updated_at
  BEFORE UPDATE ON document_artifacts
  FOR EACH ROW
  EXECUTE FUNCTION update_document_artifacts_updated_at();

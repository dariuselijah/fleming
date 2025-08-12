-- Run this in your Supabase SQL Editor to create the missing artifact tables

-- 1. Create document artifacts table
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

-- 2. Create AI artifacts table
CREATE TABLE IF NOT EXISTS ai_artifacts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  chat_id UUID NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  content_type TEXT NOT NULL DEFAULT 'text',
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 3. Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_document_artifacts_chat_id ON document_artifacts(chat_id);
CREATE INDEX IF NOT EXISTS idx_document_artifacts_user_id ON document_artifacts(user_id);
CREATE INDEX IF NOT EXISTS idx_document_artifacts_created_at ON document_artifacts(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ai_artifacts_chat_id ON ai_artifacts(chat_id);
CREATE INDEX IF NOT EXISTS idx_ai_artifacts_user_id ON ai_artifacts(user_id);
CREATE INDEX IF NOT EXISTS idx_ai_artifacts_created_at ON ai_artifacts(created_at DESC);

-- 4. Enable Row Level Security
ALTER TABLE document_artifacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_artifacts ENABLE ROW LEVEL SECURITY;

-- 5. Create RLS policies for document_artifacts
CREATE POLICY "Users can view their own document artifacts" ON document_artifacts
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own document artifacts" ON document_artifacts
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own document artifacts" ON document_artifacts
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own document artifacts" ON document_artifacts
  FOR DELETE USING (auth.uid() = user_id);

-- 6. Create RLS policies for ai_artifacts
CREATE POLICY "Users can view their own AI artifacts" ON ai_artifacts
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own AI artifacts" ON ai_artifacts
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own AI artifacts" ON ai_artifacts
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own AI artifacts" ON ai_artifacts
  FOR DELETE USING (auth.uid() = user_id);

-- 7. Create functions to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_document_artifacts_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION update_ai_artifacts_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 8. Create triggers to automatically update updated_at
CREATE TRIGGER trigger_update_document_artifacts_updated_at
  BEFORE UPDATE ON document_artifacts
  FOR EACH ROW
  EXECUTE FUNCTION update_document_artifacts_updated_at();

CREATE TRIGGER trigger_update_ai_artifacts_updated_at
  BEFORE UPDATE ON ai_artifacts
  FOR EACH ROW
  EXECUTE FUNCTION update_ai_artifacts_updated_at();

-- 9. Verify tables were created
SELECT 
  table_name, 
  table_type 
FROM information_schema.tables 
WHERE table_name IN ('document_artifacts', 'ai_artifacts')
ORDER BY table_name;

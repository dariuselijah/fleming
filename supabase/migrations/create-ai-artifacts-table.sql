-- Create AI-generated content artifacts table
CREATE TABLE IF NOT EXISTS ai_artifacts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  chat_id UUID NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  content_type TEXT NOT NULL DEFAULT 'text', -- 'text', 'markdown', 'code', 'summary', etc.
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_ai_artifacts_chat_id ON ai_artifacts(chat_id);
CREATE INDEX IF NOT EXISTS idx_ai_artifacts_user_id ON ai_artifacts(user_id);
CREATE INDEX IF NOT EXISTS idx_ai_artifacts_created_at ON ai_artifacts(created_at DESC);

-- Enable Row Level Security
ALTER TABLE ai_artifacts ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
CREATE POLICY "Users can view their own AI artifacts" ON ai_artifacts
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own AI artifacts" ON ai_artifacts
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own AI artifacts" ON ai_artifacts
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own AI artifacts" ON ai_artifacts
  FOR DELETE USING (auth.uid() = user_id);

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_ai_artifacts_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to automatically update updated_at
CREATE TRIGGER trigger_update_ai_artifacts_updated_at
  BEFORE UPDATE ON ai_artifacts
  FOR EACH ROW
  EXECUTE FUNCTION update_ai_artifacts_updated_at();

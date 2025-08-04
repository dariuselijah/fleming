-- Create the missing tables for the Fleming application

-- Create users table (if it doesn't exist)
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  message_count INTEGER DEFAULT 0,
  premium BOOLEAN DEFAULT FALSE,
  favorite_models TEXT[] DEFAULT ARRAY['gpt-4']::TEXT[],
  anonymous BOOLEAN DEFAULT FALSE,
  daily_message_count INTEGER DEFAULT 0,
  daily_reset TIMESTAMP WITH TIME ZONE,
  display_name TEXT,
  profile_image TEXT,
  last_active_at TIMESTAMP WITH TIME ZONE,
  daily_pro_message_count INTEGER DEFAULT 0,
  daily_pro_reset TIMESTAMP WITH TIME ZONE,
  system_prompt TEXT
);

-- Create user_keys table
CREATE TABLE IF NOT EXISTS user_keys (
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  encrypted_key TEXT NOT NULL,
  iv TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  PRIMARY KEY (user_id, provider)
);

-- Create user_preferences table
CREATE TABLE IF NOT EXISTS user_preferences (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  layout TEXT,
  prompt_suggestions BOOLEAN DEFAULT TRUE,
  show_tool_invocations BOOLEAN DEFAULT TRUE,
  show_conversation_previews BOOLEAN DEFAULT TRUE,
  hidden_models TEXT[],
  user_role TEXT,
  medical_specialty TEXT,
  healthcare_agent_enabled BOOLEAN DEFAULT FALSE,
  medical_compliance_mode BOOLEAN DEFAULT FALSE,
  clinical_decision_support BOOLEAN DEFAULT FALSE,
  medical_literature_access BOOLEAN DEFAULT FALSE,
  health_context TEXT,
  health_conditions TEXT[],
  medications TEXT[],
  allergies TEXT[],
  family_history TEXT,
  lifestyle_factors TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create chats table
CREATE TABLE IF NOT EXISTS chats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  title TEXT,
  model TEXT,
  project_id UUID,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  public BOOLEAN DEFAULT FALSE
);

-- Create messages table
CREATE TABLE IF NOT EXISTS messages (
  id SERIAL PRIMARY KEY,
  chat_id UUID REFERENCES chats(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('system', 'user', 'assistant', 'data')),
  content TEXT,
  parts JSONB,
  model TEXT,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  message_group_id UUID,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  experimental_attachments JSONB[]
);

-- Create projects table
CREATE TABLE IF NOT EXISTS projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create chat_attachments table
CREATE TABLE IF NOT EXISTS chat_attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chat_id UUID REFERENCES chats(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  file_name TEXT,
  file_size INTEGER,
  file_type TEXT,
  file_url TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create feedback table
CREATE TABLE IF NOT EXISTS feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  message TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add foreign key constraints
ALTER TABLE chats ADD CONSTRAINT IF NOT EXISTS chats_project_id_fkey 
  FOREIGN KEY (project_id) REFERENCES projects(id);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_chats_user_id ON chats(user_id);
CREATE INDEX IF NOT EXISTS idx_messages_chat_id ON messages(chat_id);
CREATE INDEX IF NOT EXISTS idx_user_keys_user_id ON user_keys(user_id);
CREATE INDEX IF NOT EXISTS idx_projects_user_id ON projects(user_id); 
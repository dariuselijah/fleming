const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

async function runMigration() {
  // Get Supabase credentials from environment variables
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  
  if (!supabaseUrl || !supabaseKey) {
    console.error('❌ Missing Supabase credentials!');
    return;
  }

  console.log('🔗 Connecting to Supabase...');
  const supabase = createClient(supabaseUrl, supabaseKey);

  try {
    // Test connection
    const { data, error } = await supabase.from('chats').select('count').limit(1);
    if (error) {
      console.error('❌ Connection failed:', error.message);
      return;
    }
    console.log('✅ Connected to Supabase successfully');

    console.log('\n⚠️  Since exec_sql is not available, you need to run the SQL manually.');
    console.log('Here\'s what you need to do:');
    console.log('\n1. Go to your Supabase Dashboard: https://supabase.com/dashboard');
    console.log('2. Select your project');
    console.log('3. Go to SQL Editor (left sidebar)');
    console.log('4. Copy and paste this SQL:');
    
    console.log('\n' + '='.repeat(80));
    console.log('CREATE TABLE IF NOT EXISTS ai_artifacts (');
    console.log('  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,');
    console.log('  chat_id UUID NOT NULL REFERENCES chats(id) ON DELETE CASCADE,');
    console.log('  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,');
    console.log('  title TEXT NOT NULL,');
    console.log('  content TEXT NOT NULL,');
    console.log('  content_type TEXT NOT NULL DEFAULT \'text\',');
    console.log('  metadata JSONB DEFAULT \'{}\',');
    console.log('  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),');
    console.log('  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()');
    console.log(');');
    console.log('');
    console.log('CREATE TABLE IF NOT EXISTS document_artifacts (');
    console.log('  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,');
    console.log('  chat_id UUID NOT NULL REFERENCES chats(id) ON DELETE CASCADE,');
    console.log('  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,');
    console.log('  title TEXT NOT NULL,');
    console.log('  content TEXT NOT NULL,');
    console.log('  content_type TEXT NOT NULL DEFAULT \'text\',');
    console.log('  file_name TEXT,');
    console.log('  file_size INTEGER,');
    console.log('  file_type TEXT,');
    console.log('  metadata JSONB DEFAULT \'{}\',');
    console.log('  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),');
    console.log('  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()');
    console.log(');');
    console.log('');
    console.log('-- Add indexes');
    console.log('CREATE INDEX IF NOT EXISTS idx_ai_artifacts_chat_id ON ai_artifacts(chat_id);');
    console.log('CREATE INDEX IF NOT EXISTS idx_ai_artifacts_user_id ON ai_artifacts(user_id);');
    console.log('CREATE INDEX IF NOT EXISTS idx_document_artifacts_chat_id ON document_artifacts(chat_id);');
    console.log('CREATE INDEX IF NOT EXISTS idx_document_artifacts_user_id ON document_artifacts(user_id);');
    console.log('');
    console.log('-- Enable RLS');
    console.log('ALTER TABLE ai_artifacts ENABLE ROW LEVEL SECURITY;');
    console.log('ALTER TABLE document_artifacts ENABLE ROW LEVEL SECURITY;');
    console.log('');
    console.log('-- Create RLS policies');
    console.log('CREATE POLICY "Users can view their own AI artifacts" ON ai_artifacts FOR SELECT USING (auth.uid() = user_id);');
    console.log('CREATE POLICY "Users can insert their own AI artifacts" ON ai_artifacts FOR INSERT WITH CHECK (auth.uid() = user_id);');
    console.log('CREATE POLICY "Users can view their own document artifacts" ON document_artifacts FOR SELECT USING (auth.uid() = user_id);');
    console.log('CREATE POLICY "Users can insert their own document artifacts" ON document_artifacts FOR INSERT WITH CHECK (auth.uid() = user_id);');
    console.log('='.repeat(80));
    
    console.log('\n5. Click "Run" to execute the SQL');
    console.log('\n6. After running, come back and test the artifact feature!');

  } catch (error) {
    console.error('❌ Migration failed:', error.message);
  }
}

// Run the migration
runMigration();

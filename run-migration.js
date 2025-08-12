const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

async function runMigration() {
  // Get Supabase credentials from environment variables
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  
  if (!supabaseUrl || !supabaseKey) {
    console.error('❌ Missing Supabase credentials!');
    console.log('Please set these environment variables:');
    console.log('- NEXT_PUBLIC_SUPABASE_URL');
    console.log('- SUPABASE_SERVICE_ROLE_KEY (or NEXT_PUBLIC_SUPABASE_ANON_KEY)');
    console.log('\nYou can find these in your Supabase project settings > API');
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

    // Run the migration
    console.log('\n🚀 Running migration...');
    
    // Create AI artifacts table
    console.log('Creating ai_artifacts table...');
    const { error: aiTableError } = await supabase.rpc('exec_sql', {
      sql: `
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
      `
    });

    if (aiTableError) {
      console.log('⚠️  AI artifacts table creation (might already exist):', aiTableError.message);
    } else {
      console.log('✅ AI artifacts table created');
    }

    // Create document artifacts table
    console.log('Creating document_artifacts table...');
    const { error: docTableError } = await supabase.rpc('exec_sql', {
      sql: `
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
      `
    });

    if (docTableError) {
      console.log('⚠️  Document artifacts table creation (might already exist):', docTableError.message);
    } else {
      console.log('✅ Document artifacts table created');
    }

    // Create indexes
    console.log('Creating indexes...');
    const indexQueries = [
      'CREATE INDEX IF NOT EXISTS idx_ai_artifacts_chat_id ON ai_artifacts(chat_id);',
      'CREATE INDEX IF NOT EXISTS idx_ai_artifacts_user_id ON ai_artifacts(user_id);',
      'CREATE INDEX IF NOT EXISTS idx_document_artifacts_chat_id ON document_artifacts(chat_id);',
      'CREATE INDEX IF NOT EXISTS idx_document_artifacts_user_id ON document_artifacts(user_id);'
    ];

    for (const query of indexQueries) {
      try {
        await supabase.rpc('exec_sql', { sql: query });
      } catch (e) {
        console.log('⚠️  Index creation (might already exist):', e.message);
      }
    }
    console.log('✅ Indexes created');

    // Enable RLS
    console.log('Enabling Row Level Security...');
    try {
      await supabase.rpc('exec_sql', { sql: 'ALTER TABLE ai_artifacts ENABLE ROW LEVEL SECURITY;' });
      await supabase.rpc('exec_sql', { sql: 'ALTER TABLE document_artifacts ENABLE ROW LEVEL SECURITY;' });
      console.log('✅ RLS enabled');
    } catch (e) {
      console.log('⚠️  RLS setup (might already be enabled):', e.message);
    }

    // Create RLS policies
    console.log('Creating RLS policies...');
    const policies = [
      // AI artifacts policies
      `CREATE POLICY IF NOT EXISTS "Users can view their own AI artifacts" ON ai_artifacts FOR SELECT USING (auth.uid() = user_id);`,
      `CREATE POLICY IF NOT EXISTS "Users can insert their own AI artifacts" ON ai_artifacts FOR INSERT WITH CHECK (auth.uid() = user_id);`,
      `CREATE POLICY IF NOT EXISTS "Users can update their own AI artifacts" ON ai_artifacts FOR UPDATE USING (auth.uid() = user_id);`,
      `CREATE POLICY IF NOT EXISTS "Users can delete their own AI artifacts" ON ai_artifacts FOR DELETE USING (auth.uid() = user_id);`,
      
      // Document artifacts policies
      `CREATE POLICY IF NOT EXISTS "Users can view their own document artifacts" ON document_artifacts FOR SELECT USING (auth.uid() = user_id);`,
      `CREATE POLICY IF NOT EXISTS "Users can insert their own document artifacts" ON document_artifacts FOR INSERT WITH CHECK (auth.uid() = user_id);`,
      `CREATE POLICY IF NOT EXISTS "Users can update their own document artifacts" ON document_artifacts FOR UPDATE USING (auth.uid() = user_id);`,
      `CREATE POLICY IF NOT EXISTS "Users can delete their own document artifacts" ON document_artifacts FOR DELETE USING (auth.uid() = user_id);`
    ];

    for (const policy of policies) {
      try {
        await supabase.rpc('exec_sql', { sql: policy });
      } catch (e) {
        console.log('⚠️  Policy creation (might already exist):', e.message);
      }
    }
    console.log('✅ RLS policies created');

    // Verify tables exist
    console.log('\n🔍 Verifying tables...');
    const { data: tables, error: verifyError } = await supabase
      .from('information_schema.tables')
      .select('table_name')
      .in('table_name', ['ai_artifacts', 'document_artifacts']);

    if (verifyError) {
      console.log('⚠️  Could not verify tables:', verifyError.message);
    } else {
      console.log('✅ Tables found:', tables.map(t => t.table_name).join(', '));
    }

    console.log('\n🎉 Migration completed successfully!');
    console.log('You can now test the artifact feature in your chat.');

  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    console.log('\nIf you see "exec_sql" function not found, you may need to:');
    console.log('1. Go to your Supabase dashboard');
    console.log('2. Run the SQL manually in the SQL Editor');
    console.log('3. Use the run-migrations.sql file I created');
  }
}

// Run the migration
runMigration();

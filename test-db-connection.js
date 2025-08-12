const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

async function testDatabaseConnection() {
  console.log('🔍 Testing Database Connection and Artifact Creation...\n');
  
  // Get Supabase credentials from environment variables
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  
  if (!supabaseUrl || !supabaseKey) {
    console.error('❌ Missing Supabase credentials!');
    console.log('Please check your .env file contains:');
    console.log('- NEXT_PUBLIC_SUPABASE_URL');
    console.log('- NEXT_PUBLIC_SUPABASE_ANON_KEY');
    return;
  }

  console.log('🔗 Connecting to Supabase...');
  const supabase = createClient(supabaseUrl, supabaseKey);

  try {
    // Test 1: Check if tables exist by trying to query them
    console.log('\n📋 Test 1: Checking if tables exist...');
    
    // Try to query ai_artifacts table
    const { data: aiArtifacts, error: aiError } = await supabase
      .from('ai_artifacts')
      .select('count')
      .limit(1);
    
    if (aiError) {
      if (aiError.code === '42P01') {
        console.error('❌ Table "ai_artifacts" does not exist!');
        return;
      } else {
        console.error('❌ Error querying ai_artifacts:', aiError);
        return;
      }
    }
    console.log('✅ Table "ai_artifacts" exists');

    // Try to query document_artifacts table
    const { data: docArtifacts, error: docError } = await supabase
      .from('document_artifacts')
      .select('count')
      .limit(1);
    
    if (docError) {
      if (docError.code === '42P01') {
        console.error('❌ Table "document_artifacts" does not exist!');
        return;
      } else {
        console.error('❌ Error querying document_artifacts:', docError);
        return;
      }
    }
    console.log('✅ Table "document_artifacts" exists');

    // Test 2: Check table structure by trying to insert with minimal data
    console.log('\n📋 Test 2: Checking table structure...');
    
    // First, get a sample chat_id and user_id from existing tables
    const { data: sampleChat, error: chatError } = await supabase
      .from('chats')
      .select('id')
      .limit(1);

    if (chatError || !sampleChat || sampleChat.length === 0) {
      console.error('❌ No chats found in database');
      console.log('This might be normal if you haven\'t created any chats yet');
      return;
    }

    const { data: sampleUser, error: userError } = await supabase
      .from('users')
      .select('id')
      .limit(1);

    if (userError || !sampleUser || sampleUser.length === 0) {
      console.error('❌ No users found in database');
      console.log('This might be normal if you haven\'t created any users yet');
      return;
    }

    const testChatId = sampleChat[0].id;
    const testUserId = sampleUser[0].id;

    console.log(`Using test chat_id: ${testChatId}`);
    console.log(`Using test user_id: ${testUserId}`);

    // Test 3: Try to insert a test artifact
    console.log('\n📋 Test 3: Testing artifact insertion...');
    
    const { data: testArtifact, error: insertError } = await supabase
      .from('ai_artifacts')
      .insert({
        chat_id: testChatId,
        user_id: testUserId,
        title: 'Test Artifact',
        content: 'This is a test artifact to verify the database is working.',
        content_type: 'text',
        metadata: { test: true, timestamp: new Date().toISOString() }
      })
      .select()
      .single();

    if (insertError) {
      console.error('❌ Failed to insert test artifact:', insertError);
      
      if (insertError.code === '23503') {
        console.error('❌ Foreign key constraint violation - check if chat_id and user_id exist');
        console.log('This means the chat_id or user_id you\'re trying to use doesn\'t exist in the referenced tables');
      } else if (insertError.code === '42501') {
        console.error('❌ Permission denied - check RLS policies');
        console.log('This means the Row Level Security policies are blocking the insert');
      } else if (insertError.code === '42P01') {
        console.error('❌ Table does not exist');
      } else {
        console.error('❌ Unknown error:', insertError);
      }
      return;
    }

    console.log('✅ Test artifact created successfully:', testArtifact.id);

    // Test 4: Try to fetch the artifact
    console.log('\n📋 Test 4: Testing artifact retrieval...');
    const { data: fetchedArtifact, error: fetchError } = await supabase
      .from('ai_artifacts')
      .select('*')
      .eq('id', testArtifact.id)
      .single();

    if (fetchError) {
      console.error('❌ Failed to fetch test artifact:', fetchError);
      return;
    }

    console.log('✅ Test artifact retrieved successfully:', {
      id: fetchedArtifact.id,
      title: fetchedArtifact.title,
      content_type: fetchedArtifact.content_type,
      created_at: fetchedArtifact.created_at
    });

    // Test 5: Clean up test data
    console.log('\n📋 Test 5: Cleaning up test data...');
    const { error: deleteError } = await supabase
      .from('ai_artifacts')
      .delete()
      .eq('id', testArtifact.id);

    if (deleteError) {
      console.error('❌ Failed to delete test artifact:', deleteError);
    } else {
      console.log('✅ Test artifact cleaned up successfully');
    }

    console.log('\n🎉 All database tests passed! The issue might be elsewhere.');
    console.log('\n🔍 Next steps to debug:');
    console.log('1. Check the browser console for JavaScript errors');
    console.log('2. Check the Network tab for failed API calls');
    console.log('3. Check the server console for backend errors');
    console.log('4. Verify the chat API is calling the artifact detection service');

  } catch (error) {
    console.error('❌ Database test failed:', error);
  }
}

// Run the test
testDatabaseConnection();

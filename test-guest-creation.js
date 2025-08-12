const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

async function testGuestUserCreation() {
  console.log('🧪 Testing Guest User Creation...\n');
  
  // Get Supabase credentials from environment variables
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  
  if (!supabaseUrl || !supabaseKey) {
    console.error('❌ Missing Supabase credentials!');
    console.log('Please check your .env file contains:');
    console.log('- NEXT_PUBLIC_SUPABASE_URL');
    console.log('- SUPABASE_SERVICE_ROLE (preferred) or NEXT_PUBLIC_SUPABASE_ANON_KEY');
    return;
  }

  console.log('🔗 Connecting to Supabase...');
  const supabase = createClient(supabaseUrl, supabaseKey);

  try {
    // Test 1: Check if we can connect to the database
    console.log('\n📋 Test 1: Testing database connection...');
    const { data: testData, error: testError } = await supabase
      .from('users')
      .select('count')
      .limit(1);
    
    if (testError) {
      console.error('❌ Database connection failed:', testError);
      return;
    }
    console.log('✅ Database connection successful');

    // Test 2: Try to create a guest user manually
    console.log('\n📋 Test 2: Creating guest user manually...');
    const guestUserId = 'test-guest-' + Date.now();
    
    const { data: newUser, error: insertError } = await supabase
      .from('users')
      .insert({
        id: guestUserId,
        email: `${guestUserId}@anonymous.example`,
        anonymous: true,
        message_count: 0,
        premium: false,
        created_at: new Date().toISOString(),
      })
      .select('*')
      .single();

    if (insertError) {
      console.error('❌ Failed to create guest user:', insertError);
      
      if (insertError.code === '23505') {
        console.log('User already exists, trying to fetch...');
        const { data: existingUser, error: fetchError } = await supabase
          .from('users')
          .select('*')
          .eq('id', guestUserId)
          .single();
        
        if (fetchError) {
          console.error('❌ Failed to fetch existing user:', fetchError);
          return;
        }
        console.log('✅ Found existing user:', existingUser);
      } else {
        return;
      }
    } else {
      console.log('✅ Guest user created successfully:', newUser);
    }

    // Test 3: Try to create a chat for this guest user
    console.log('\n📋 Test 3: Creating chat for guest user...');
    const { data: newChat, error: chatError } = await supabase
      .from('chats')
      .insert({
        id: 'test-chat-' + Date.now(),
        user_id: guestUserId,
        title: 'Test Chat',
        model: 'gpt-3.5-turbo',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .select('*')
      .single();

    if (chatError) {
      console.error('❌ Failed to create chat:', chatError);
      return;
    }
    console.log('✅ Chat created successfully:', newChat);

    // Test 4: Try to create an artifact for this chat
    console.log('\n📋 Test 4: Creating test artifact...');
    const { data: newArtifact, error: artifactError } = await supabase
      .from('ai_artifacts')
      .insert({
        chat_id: newChat.id,
        user_id: guestUserId,
        title: 'Test Artifact',
        content: 'This is a test artifact to verify the system is working.',
        content_type: 'text',
        metadata: { test: true, timestamp: new Date().toISOString() }
      })
      .select('*')
      .single();

    if (artifactError) {
      console.error('❌ Failed to create artifact:', artifactError);
      return;
    }
    console.log('✅ Artifact created successfully:', newArtifact);

    // Test 5: Try to fetch the artifact
    console.log('\n📋 Test 5: Fetching artifact...');
    const { data: fetchedArtifact, error: fetchError } = await supabase
      .from('ai_artifacts')
      .select('*')
      .eq('id', newArtifact.id)
      .single();

    if (fetchError) {
      console.error('❌ Failed to fetch artifact:', fetchError);
      return;
    }
    console.log('✅ Artifact fetched successfully:', fetchedArtifact);

    console.log('\n🎉 All tests passed! The database and artifact system is working.');
    console.log('\n🔍 The issue is likely in the guest user creation flow, not the database itself.');

  } catch (error) {
    console.error('❌ Test failed:', error);
  }
}

// Run the test
testGuestUserCreation();

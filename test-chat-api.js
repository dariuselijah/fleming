// Test the chat API directly
const fetch = require('node-fetch').default;

async function testChatAPI() {
  console.log('🧪 Testing Chat API Directly...\n');
  
  try {
    // Test 1: Check if the server is running
    console.log('📋 Test 1: Checking if server is running...');
    const healthResponse = await fetch('http://localhost:3001/api/health');
    if (healthResponse.ok) {
      console.log('✅ Server is running');
    } else {
      console.log('❌ Server is not responding');
      return;
    }

    // Test 2: Try to create a simple chat request
    console.log('\n📋 Test 2: Testing chat API...');
    
    const chatRequest = {
      messages: [
        {
          role: "user",
          content: "write an essay about climate change"
        }
      ],
      chatId: "test-chat-id",
      userId: "test-user-id", 
      model: "gpt-3.5-turbo",
      isAuthenticated: false,
      systemPrompt: "You are a helpful assistant.",
      enableSearch: false
    };

    console.log('Sending chat request...');
    const chatResponse = await fetch('http://localhost:3001/api/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(chatRequest)
    });

    if (chatResponse.ok) {
      console.log('✅ Chat API responded successfully');
      console.log('Status:', chatResponse.status);
      
      // Check if it's a streaming response
      const contentType = chatResponse.headers.get('content-type');
      if (contentType && contentType.includes('text/plain')) {
        console.log('📡 Response is streaming (this is expected)');
      }
    } else {
      console.log('❌ Chat API failed:', chatResponse.status, chatResponse.statusText);
      const errorText = await chatResponse.text();
      console.log('Error details:', errorText);
    }

    // Test 3: Check if artifacts endpoint is accessible
    console.log('\n📋 Test 3: Testing artifacts API...');
    const artifactsResponse = await fetch('http://localhost:3001/api/get-ai-artifacts?chatId=test-chat-id&userId=test-user-id&isAuthenticated=false');
    
    if (artifactsResponse.ok) {
      const artifactsData = await artifactsResponse.json();
      console.log('✅ Artifacts API responded successfully');
      console.log('Response:', artifactsData);
    } else {
      console.log('❌ Artifacts API failed:', artifactsResponse.status, artifactsResponse.statusText);
      const errorText = await artifactsResponse.text();
      console.log('Error details:', errorText);
    }

  } catch (error) {
    console.error('❌ Test failed:', error.message);
  }
}

// Run the test
testChatAPI();

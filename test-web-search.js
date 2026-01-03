#!/usr/bin/env node

/**
 * Test script to send a request to the chat API with web search enabled
 * This will help us see how xAI returns web search results
 */

// For Node.js, we'll use a simpler approach with http/https
const http = require('http');

const API_URL = 'http://localhost:3000/api/chat';
const TEST_MESSAGE = 'What are the latest guidelines for treating hypertension in elderly patients?';

function testWebSearch() {
  return new Promise((resolve, reject) => {
    console.log('🚀 Sending test request with web search enabled...\n');
    
    const postData = JSON.stringify({
      messages: [
        {
          role: 'user',
          content: TEST_MESSAGE,
        },
      ],
      chatId: 'test-web-search-' + Date.now(),
      userId: 'temp',
      model: 'fleming-4',
      isAuthenticated: false,
      enableSearch: true, // Explicitly enable web search
      userRole: 'doctor', // Set user role to doctor
      medicalSpecialty: 'general',
      clinicalDecisionSupport: false,
      medicalLiteratureAccess: false,
      medicalComplianceMode: false,
    });

    const options = {
      hostname: 'localhost',
      port: 3000,
      path: '/api/chat',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData),
      },
    };

    const req = http.request(options, (res) => {
      console.log(`✅ Response received (${res.statusCode})`);
      console.log('Response headers:', res.headers);
      console.log('='.repeat(80));
      
      if (res.statusCode !== 200) {
        let errorData = '';
        res.on('data', (chunk) => { errorData += chunk; });
        res.on('end', () => {
          console.error('❌ Error:', res.statusCode, errorData);
          reject(new Error(`HTTP ${res.statusCode}: ${errorData}`));
        });
        return;
      }

      let buffer = '';
      let fullResponse = '';

      res.on('data', (chunk) => {
        const chunkStr = chunk.toString();
        buffer += chunkStr;
        
        // Vercel AI SDK uses a different format - parse lines
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.trim() === '') continue;
          
          // Vercel AI SDK format: "0:"text"" for text, "f:"{...}" for functions, etc.
          if (line.startsWith('0:')) {
            // Text delta
            try {
              const text = JSON.parse(line.substring(2));
              process.stdout.write(text);
              fullResponse += text;
            } catch (e) {
              // Not valid JSON, skip
            }
          } else if (line.startsWith('f:')) {
            // Function/tool invocation
            try {
              const funcData = JSON.parse(line.substring(2));
              console.log('\n\n[FUNCTION/TOOL]', JSON.stringify(funcData, null, 2));
            } catch (e) {
              console.log('\n[FUNCTION RAW]', line.substring(2));
            }
          } else if (line.startsWith('s:')) {
            // Source
            try {
              const sourceData = JSON.parse(line.substring(2));
              console.log('\n\n[SOURCE]', JSON.stringify(sourceData, null, 2));
            } catch (e) {
              console.log('\n[SOURCE RAW]', line.substring(2));
            }
          } else if (line.startsWith('d:')) {
            // Done
            console.log('\n' + '='.repeat(80));
            console.log('✅ Stream completed');
            console.log('📝 Full response length:', fullResponse.length);
            resolve();
            return;
          } else {
            // Unknown format - log it
            console.log(`\n[UNKNOWN FORMAT] ${line.substring(0, 200)}`);
          }
        }
      });

      res.on('end', () => {
        console.log('\n\n' + '='.repeat(80));
        console.log('📝 Full response length:', fullResponse.length);
        console.log('='.repeat(80));
        resolve();
      });
    });

    req.on('error', (error) => {
      console.error('❌ Request error:', error);
      reject(error);
    });

    req.write(postData);
    req.end();
  });
}

testWebSearch();


// Simple test script to verify file upload functionality
// Run this with: node test-file-upload.js

const fs = require('fs');
const path = require('path');

async function testFileUpload() {
  console.log('Testing file upload functionality...');
  
  // Test 1: Check if upload endpoint exists
  try {
    const response = await fetch('http://localhost:3000/api/upload-file', {
      method: 'POST',
      body: 'test'
    });
    console.log('Upload endpoint response status:', response.status);
  } catch (error) {
    console.log('Upload endpoint test failed (expected if server not running):', error.message);
  }
  
  // Test 2: Check if get-signed-url endpoint exists
  try {
    const response = await fetch('http://localhost:3000/api/get-signed-url', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        filePath: 'test/path.jpg',
        expiresIn: 3600
      })
    });
    console.log('Get signed URL endpoint response status:', response.status);
  } catch (error) {
    console.log('Get signed URL endpoint test failed (expected if server not running):', error.message);
  }
  
  // Test 3: Check if get-attachments endpoint exists
  try {
    const response = await fetch('http://localhost:3000/api/get-attachments', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        chatId: 'test-chat-id',
        userId: 'test-user-id'
      })
    });
    console.log('Get attachments endpoint response status:', response.status);
  } catch (error) {
    console.log('Get attachments endpoint test failed (expected if server not running):', error.message);
  }
  
  // Test 4: Check if check-file-upload-limit endpoint exists
  try {
    const response = await fetch('http://localhost:3000/api/check-file-upload-limit', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        userId: 'test-user-id'
      })
    });
    console.log('Check file upload limit endpoint response status:', response.status);
  } catch (error) {
    console.log('Check file upload limit endpoint test failed (expected if server not running):', error.message);
  }
  
  console.log('Test completed. If you see 401/403 errors, that means the endpoints exist but require authentication (which is good!).');
}

testFileUpload().catch(console.error); 
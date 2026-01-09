#!/usr/bin/env node

/**
 * Test script for Evidence Search API
 * Tests the /api/evidence endpoint to verify search is working
 */

const http = require('http');

const API_URL = process.env.API_URL || 'http://localhost:3000';
const EVIDENCE_ENDPOINT = `${API_URL}/api/evidence`;

// Test queries
const TEST_QUERIES = [
  'hypertension treatment',
  'diabetes management',
  'asthma therapy',
  'heart failure',
  'COVID-19 treatment',
];

async function testEvidenceSearch(query) {
  return new Promise((resolve, reject) => {
    console.log(`\n🔍 Testing query: "${query}"`);
    
    const postData = JSON.stringify({
      query,
      maxResults: 5,
      minEvidenceLevel: 5, // Include all evidence levels
    });

    const url = new URL(EVIDENCE_ENDPOINT);
    const options = {
      hostname: url.hostname,
      port: url.port || (url.protocol === 'https:' ? 443 : 80),
      path: url.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData),
      },
    };

    const req = http.request(options, (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        try {
          const result = JSON.parse(data);
          
          if (res.statusCode === 200 && result.success) {
            console.log(`✅ Success! Found ${result.citations?.length || 0} citations`);
            console.log(`   Search time: ${result.searchTimeMs}ms`);
            
            if (result.citations && result.citations.length > 0) {
              console.log(`\n   Top results:`);
              result.citations.slice(0, 3).forEach((citation, idx) => {
                console.log(`   ${idx + 1}. ${citation.title}`);
                console.log(`      Journal: ${citation.journal} (${citation.year || 'N/A'})`);
                console.log(`      Evidence Level: ${citation.evidenceLevel} (${getEvidenceLevelName(citation.evidenceLevel)})`);
                console.log(`      PMID: ${citation.pmid || 'N/A'}`);
              });
            } else {
              console.log(`   ⚠️  No citations found - database may be empty or query didn't match`);
            }
            
            resolve(result);
          } else {
            console.log(`❌ Error: ${result.error || 'Unknown error'}`);
            console.log(`   Status: ${res.statusCode}`);
            resolve(null);
          }
        } catch (error) {
          console.log(`❌ Failed to parse response: ${error.message}`);
          console.log(`   Raw response: ${data.substring(0, 200)}...`);
          resolve(null);
        }
      });
    });

    req.on('error', (error) => {
      console.log(`❌ Request failed: ${error.message}`);
      reject(error);
    });

    req.write(postData);
    req.end();
  });
}

function getEvidenceLevelName(level) {
  const names = {
    1: 'Meta-Analysis/Systematic Review',
    2: 'Randomized Controlled Trial',
    3: 'Cohort/Case-Control Study',
    4: 'Case Series/Report',
    5: 'Expert Opinion/Review',
  };
  return names[level] || 'Unknown';
}

async function runTests() {
  console.log('🧪 Evidence Search Test Suite');
  console.log('='.repeat(50));
  console.log(`Testing endpoint: ${EVIDENCE_ENDPOINT}`);
  console.log(`\nRunning ${TEST_QUERIES.length} test queries...`);

  const results = [];
  
  for (const query of TEST_QUERIES) {
    try {
      const result = await testEvidenceSearch(query);
      results.push({ query, success: result !== null, citations: result?.citations?.length || 0 });
      
      // Small delay between requests
      await new Promise(resolve => setTimeout(resolve, 500));
    } catch (error) {
      console.log(`❌ Test failed for "${query}": ${error.message}`);
      results.push({ query, success: false, citations: 0 });
    }
  }

  // Summary
  console.log('\n' + '='.repeat(50));
  console.log('📊 Test Summary');
  console.log('='.repeat(50));
  
  const successful = results.filter(r => r.success).length;
  const totalCitations = results.reduce((sum, r) => sum + r.citations, 0);
  
  console.log(`Successful tests: ${successful}/${results.length}`);
  console.log(`Total citations found: ${totalCitations}`);
  console.log(`Average citations per query: ${(totalCitations / results.length).toFixed(1)}`);
  
  if (totalCitations === 0) {
    console.log('\n⚠️  WARNING: No citations found for any query.');
    console.log('   This could mean:');
    console.log('   1. The database is empty (run ingestion script first)');
    console.log('   2. The search function is not working');
    console.log('   3. The queries don\'t match any ingested articles');
    console.log('\n   To check database stats, query the medical_evidence table directly.');
  } else {
    console.log('\n✅ Search appears to be working!');
  }
}

// Run tests
runTests().catch(console.error);





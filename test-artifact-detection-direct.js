// Test the artifact detection service directly
console.log('🧪 Testing Artifact Detection Service Directly...\n');

// Simulate the artifact detection logic from lib/artifact-detection.ts
class MockArtifactDetectionService {
  static ARTIFACT_PATTERNS = {
    essay: {
      patterns: [
        /write.*essay/i,
        /create.*essay/i,
        /draft.*essay/i,
        /compose.*essay/i,
        /essay.*about/i,
        /essay.*on/i,
        /write.*about/i,
        /create.*about/i,
        /write.*on/i,
        /create.*on/i
      ],
      contentType: 'text',
      confidence: 0.95
    },
    code: {
      patterns: [
        /write.*code/i,
        /create.*code/i,
        /generate.*code/i,
        /show.*code/i,
        /provide.*code/i,
        /example.*code/i,
        /function.*code/i,
        /class.*code/i,
        /script.*code/i
      ],
      contentType: 'code',
      confidence: 0.95
    }
  };

  static CONTENT_LENGTH_THRESHOLDS = {
    MIN_LENGTH: 100,
    IDEAL_LENGTH: 300,
    MAX_LENGTH: 5000
  };

  static detectArtifactOpportunity(userPrompt, aiResponse) {
    console.log(`\n🔍 Analyzing: "${userPrompt}"`);
    console.log(`Response length: ${aiResponse.length} characters`);
    
    // Check for implicit artifact opportunities
    let bestMatch = null;
    let highestConfidence = 0;

    for (const [type, config] of Object.entries(this.ARTIFACT_PATTERNS)) {
      for (const pattern of config.patterns) {
        if (pattern.test(userPrompt)) {
          const confidence = config.confidence;
          
          if (confidence > highestConfidence) {
            highestConfidence = confidence;
            bestMatch = {
              shouldCreateArtifact: true,
              title: this.generateArtifactTitle(userPrompt, aiResponse),
              contentType: config.contentType,
              confidence,
              reasoning: `Detected ${type} pattern in user prompt`
            };
          }
        }
      }
    }

    if (bestMatch) {
      return bestMatch;
    }

    // Check content length
    const length = aiResponse.length;
    if (length >= this.CONTENT_LENGTH_THRESHOLDS.MIN_LENGTH) {
      if (length >= this.CONTENT_LENGTH_THRESHOLDS.IDEAL_LENGTH) {
        return {
          shouldCreateArtifact: true,
          title: "Generated Content",
          contentType: 'text',
          confidence: 0.7,
          reasoning: `Content length (${length} chars) is ideal for artifact creation`
        };
      } else {
        return {
          shouldCreateArtifact: true,
          title: "Generated Content",
          contentType: 'text',
          confidence: 0.5,
          reasoning: `Content length (${length} chars) meets minimum threshold for artifact`
        };
      }
    }

    return {
      shouldCreateArtifact: false,
      title: "",
      contentType: 'text',
      confidence: 0,
      reasoning: "No artifact opportunity detected"
    };
  }

  static generateArtifactTitle(userPrompt, aiResponse) {
    // Try to extract a title from the user prompt
    const promptWords = userPrompt.split(' ').slice(0, 8).join(' ');
    if (promptWords.length > 10 && promptWords.length < 60) {
      return promptWords.charAt(0).toUpperCase() + promptWords.slice(1);
    }

    // Try to extract from AI response (first line or first sentence)
    const firstLine = aiResponse.split('\n')[0].trim();
    if (firstLine.length > 10 && firstLine.length < 80) {
      return firstLine;
    }

    // Fallback to a generic title
    return "Generated Content";
  }
}

// Test cases
const testCases = [
  {
    userPrompt: "write an essay about climate change",
    aiResponse: "Climate change is one of the most pressing issues facing humanity today. The Earth's climate has been changing throughout history, but the current rate of change is unprecedented. Human activities, particularly the burning of fossil fuels, have led to a significant increase in greenhouse gas concentrations in the atmosphere. This has resulted in global warming, which is causing a cascade of environmental effects including rising sea levels, more frequent and severe weather events, and shifts in ecosystems."
  },
  {
    userPrompt: "what is 2+2?",
    aiResponse: "2+2 equals 4."
  },
  {
    userPrompt: "create a function to calculate fibonacci numbers",
    aiResponse: "Here's a function to calculate Fibonacci numbers:\n\n```javascript\nfunction fibonacci(n) {\n  if (n <= 1) return n;\n  return fibonacci(n - 1) + fibonacci(n - 2);\n}\n```"
  },
  {
    userPrompt: "write about the future of medicine",
    aiResponse: "The future of medicine is incredibly promising, with advancements in several key areas that will revolutionize healthcare delivery and patient outcomes. Artificial intelligence and machine learning are already transforming diagnostic capabilities, enabling earlier detection of diseases and more personalized treatment plans. Precision medicine, which tailors treatments to individual genetic profiles, is becoming increasingly accessible and effective. Nanotechnology offers the potential for targeted drug delivery and minimally invasive procedures. Telemedicine and remote monitoring are expanding access to care, especially in underserved areas. Additionally, breakthroughs in regenerative medicine, including stem cell therapies and tissue engineering, hold promise for treating previously incurable conditions."
  }
];

console.log('📋 Running test cases...\n');

testCases.forEach((testCase, index) => {
  console.log(`\n--- Test Case ${index + 1} ---`);
  const result = MockArtifactDetectionService.detectArtifactOpportunity(
    testCase.userPrompt,
    testCase.aiResponse
  );
  
  console.log(`Result: ${result.shouldCreateArtifact ? '✅ CREATE ARTIFACT' : '❌ NO ARTIFACT'}`);
  console.log(`Title: "${result.title}"`);
  console.log(`Content Type: ${result.contentType}`);
  console.log(`Confidence: ${result.confidence}`);
  console.log(`Reasoning: ${result.reasoning}`);
});

console.log('\n🎯 Summary:');
console.log('- If all test cases show "CREATE ARTIFACT" for essay/code requests, the detection logic is working');
console.log('- If short responses show "NO ARTIFACT", the length thresholds are working');
console.log('- The issue might be in the chat API integration or database insertion');

console.log('\n🔍 Next steps:');
console.log('1. Check if the chat API is calling the artifact detection service');
console.log('2. Check if artifacts are being created in the database');
console.log('3. Check if the frontend is displaying the artifacts');

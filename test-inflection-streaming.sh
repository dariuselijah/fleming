#!/bin/bash

# Test Inflection AI Streaming API
# Usage: ./test-inflection-streaming.sh YOUR_API_KEY

API_KEY="${1:-${INFLECTION_AI}}"

if [ -z "$API_KEY" ]; then
  echo "Error: API key required"
  echo "Usage: $0 YOUR_API_KEY"
  echo "   OR: export INFLECTION_AI=your_key && $0"
  exit 1
fi

echo "Testing Inflection AI streaming endpoint..."
echo "API Key prefix: ${API_KEY:0:10}..."
echo ""

curl --url "https://api.inflection.ai/v1/chat/completions" \
  -X POST \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $API_KEY" \
  -d '{
    "model": "inflection_3_pi",
    "messages": [
      {"role": "system", "content": "You are a helpful assistant."},
      {"role": "user", "content": "Say hello in one sentence"}
    ],
    "stream": true
  }' \
  --no-buffer \
  -v 2>&1 | head -50


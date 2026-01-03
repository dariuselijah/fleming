# Fleming AI Architecture

This document describes the AI architecture of the Fleming application, including how models are structured, routed, and how Fleming 3.5 and Fleming 4 are implemented.

## Table of Contents
1. [Architecture Overview](#architecture-overview)
2. [Model Provider System](#model-provider-system)
3. [Fleming 3.5 Architecture](#fleming-35-architecture)
4. [Fleming 4 Architecture](#fleming-4-architecture)
5. [Model Routing & Selection](#model-routing--selection)
6. [System Prompt Management](#system-prompt-management)
7. [Image Handling](#image-handling)
8. [Streaming Architecture](#streaming-architecture)

---

## Architecture Overview

Fleming uses a multi-provider AI architecture that supports multiple model providers through a unified interface. The system is designed for:

- **Instant Streaming**: Minimal blocking operations, immediate response streaming
- **Multi-Provider Support**: Unified interface for OpenAI, Anthropic, xAI (Grok), Google, Mistral, and others
- **Specialized Medical Models**: Fleming 3.5 and Fleming 4 are custom implementations optimized for medical use cases
- **Flexible Routing**: Automatic model selection based on capabilities (text, vision, reasoning)

### Core Components

```
┌─────────────────────────────────────────────────────────────┐
│                    Client (React/Next.js)                    │
│  - Chat Interface                                           │
│  - Model Selector                                           │
│  - File Upload                                              │
└────────────────────┬────────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────┐
│              API Route (/app/api/chat/route.ts)             │
│  - Request Validation                                       │
│  - Rate Limiting                                            │
│  - Model Selection Logic                                     │
│  - System Prompt Selection                                   │
└────────────────────┬────────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────┐
│              Model Provider System                           │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  Provider Map (lib/openproviders/provider-map.ts)     │  │
│  │  - Maps model IDs to providers                        │  │
│  └──────────────────────────────────────────────────────┘  │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  OpenProviders (lib/openproviders/index.ts)            │  │
│  │  - Unified provider interface                          │  │
│  └──────────────────────────────────────────────────────┘  │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  Model Adapters                                       │  │
│  │  - Fleming 3.5 Adapter                                │  │
│  │  - Fleming 4 Adapter (via Grok)                       │  │
│  └──────────────────────────────────────────────────────┘  │
└────────────────────┬────────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────┐
│              External AI Providers                           │
│  - xAI (Grok) - Fleming 3.5 & Fleming 4                    │
│  - OpenAI - GPT models                                      │
│  - Anthropic - Claude models                                 │
│  - Google - Gemini models                                   │
│  - Mistral - Mistral models                                 │
└─────────────────────────────────────────────────────────────┘
```

---

## Model Provider System

### Provider Map

The provider map (`lib/openproviders/provider-map.ts`) maps model IDs to their respective providers:

```typescript
const MODEL_PROVIDER_MAP: Record<string, Provider> = {
  "fleming-3.5": "xai",      // Uses Grok
  "fleming-4": "xai",        // Uses Grok-4-fast-reasoning
  "grok-3": "xai",
  "gpt-4o": "openai",
  "claude-3-5-sonnet": "anthropic",
  // ... more models
}
```

### OpenProviders Integration

The `openproviders` function (`lib/openproviders/index.ts`) provides a unified interface to all providers:

```typescript
export function openproviders<T extends SupportedModel>(
  modelId: T,
  settings?: OpenProvidersOptions<T>,
  apiKey?: string
): LanguageModelV1
```

This allows the application to use any supported model through a consistent API.

---

## Fleming 3.5 Architecture

**Model ID:** `fleming-3.5`  
**Provider:** xAI (Grok)  
**Base Model:** Grok-3 or Grok-4-fast-reasoning  
**Location:** `lib/openproviders/fleming-3.5-adapter.ts`

### Overview

Fleming 3.5 is a specialized medical AI model designed for:
- **Rapid clinical reasoning**: Fast history-taking and differential building
- **Text-only conversations**: Optimized for clinical text interactions
- **Automatic image fallback**: Automatically switches to Fleming 4 when images are detected

### Implementation

Fleming 3.5 uses a custom adapter that:

1. **Text Processing**: Uses Grok-3 (xAI) for text-only conversations
2. **Image Detection**: Automatically detects images in messages
3. **Automatic Fallback**: When images are detected, the API route automatically switches to Fleming 4 (Grok-4-fast-reasoning)

### Code Structure

```typescript
export function createFleming35Model(
  apiKey?: string,
  grokApiKey?: string
): LanguageModelV1 {
  // Uses Grok-3 for text processing
  const grokModel = openproviders("grok-3", undefined, grokApiKey)
  
  return {
    modelId: "fleming-3.5",
    provider: "fleming",
    supportsImageUrls: false, // Images trigger fallback to Fleming 4
    
    doStream: async function(options) {
      // Process text-only messages with Grok-3
      // Images are handled by API route switching to Fleming 4
    }
  }
}
```

### Image Handling

When images are detected in Fleming 3.5 requests:

1. **API Route Detection** (`app/api/chat/route.ts`):
   ```typescript
   if (model === "fleming-3.5") {
     // Check for images
     if (hasImages) {
       effectiveModel = "fleming-4"  // Switch to Fleming 4
     }
   }
   ```

2. **Automatic Switching**: The system automatically routes to Fleming 4, which has full vision support

### System Prompt

Fleming 3.5 uses a specialized system prompt (`FLEMING_3_5_SYSTEM_PROMPT`) that:
- Emphasizes clinical reasoning
- Focuses on rapid history-taking
- Prioritizes structured medical assessment
- Maintains professional clinical standards

See [System Prompts Documentation](./system-prompts.md) for full prompt details.

---

## Fleming 4 Architecture

**Model ID:** `fleming-4`  
**Provider:** xAI (Grok)  
**Base Model:** `grok-4-fast-reasoning`  
**Location:** `lib/models/data/grok.ts`

### Overview

Fleming 4 is an advanced medical AI model designed for:
- **Comprehensive analysis**: Deep, detailed medical responses
- **Vision support**: Full image and document analysis capabilities
- **Advanced reasoning**: Uses Grok-4-fast-reasoning for complex clinical reasoning
- **Multi-modal**: Supports text, images, and documents

### Implementation

Fleming 4 directly uses Grok-4-fast-reasoning through the OpenProviders interface:

```typescript
{
  id: "fleming-4",
  name: "Fleming 4",
  provider: "xAI",
  providerId: "xai",
  apiSdk: (apiKey?: string) => 
    openproviders("grok-4-fast-reasoning", undefined, apiKey),
}
```

### Capabilities

- **Vision**: Full image analysis (X-rays, CT scans, medical documents, etc.)
- **Reasoning**: Advanced clinical reasoning capabilities
- **Tools**: Function calling support
- **Context**: 200K token context window
- **Speed**: Medium speed, high intelligence

### System Prompt

Fleming 4 uses a specialized system prompt (`FLEMING_4_SYSTEM_PROMPT`) that:
- Emphasizes comprehensive medical depth
- Provides detailed clinical insights
- Maintains evidence-based medical standards
- Supports both medical students and healthcare professionals

See [System Prompts Documentation](./system-prompts.md) for full prompt details.

### Image Analysis

For medical image analysis, Fleming 4 uses a specialized image analysis prompt (`FLEMING_3_5_IMAGE_ANALYSIS_PROMPT`) that:
- Analyzes medical images systematically
- Extracts clinical findings
- Provides differential considerations
- Interprets medical documents

---

## Model Routing & Selection

### Request Flow

1. **Client Request** → API Route (`app/api/chat/route.ts`)
2. **Model Selection**:
   - User-selected model or default model
   - Automatic switching based on capabilities (images → Fleming 4)
3. **System Prompt Selection**:
   - Fleming models → Specialized Fleming prompts
   - Other models → Role-based prompts (general/doctor/medical_student)
4. **Provider Resolution**:
   - Model ID → Provider (via provider map)
   - Provider → API adapter
5. **Streaming Response** → Client

### Model Selection Logic

```typescript
// In app/api/chat/route.ts
let effectiveModel = model

// Fleming 3.5 image detection
if (model === "fleming-3.5") {
  if (hasImages) {
    effectiveModel = "fleming-4"  // Auto-switch to Fleming 4
  }
}

// System prompt selection
if (effectiveModel === "fleming-3.5") {
  effectiveSystemPrompt = FLEMING_3_5_SYSTEM_PROMPT
} else if (effectiveModel === "fleming-4") {
  effectiveSystemPrompt = FLEMING_4_SYSTEM_PROMPT
} else {
  effectiveSystemPrompt = getSystemPromptByRole(userRole, systemPrompt)
}
```

### Provider Resolution

```typescript
// lib/openproviders/provider-map.ts
export function getProviderForModel(model: SupportedModel): Provider {
  const provider = MODEL_PROVIDER_MAP[model]
  if (provider) return provider
  throw new Error(`Unknown provider for model: ${model}`)
}
```

---

## System Prompt Management

### Prompt Selection Priority

1. **Custom Prompt** (if provided by user) - Highest priority
2. **Fleming Model Prompts** (if using Fleming 3.5 or 4)
3. **Role-Based Prompts**:
   - `"doctor"` → Default prompt + doctor suffix
   - `"medical_student"` → Medical student prompt
   - `"general"` → Default prompt
4. **Cached Prompts** - Performance optimization

### Prompt Caching

System prompts are cached for instant access:

```typescript
const systemPromptCache = new Map<string, string>()

export function getSystemPromptByRole(
  role: "doctor" | "general" | "medical_student" | undefined,
  customPrompt?: string
): string {
  if (customPrompt) return customPrompt
  
  const cacheKey = role || "general"
  if (systemPromptCache.has(cacheKey)) {
    return systemPromptCache.get(cacheKey)!
  }
  
  // Generate and cache prompt
  // ...
}
```

See [System Prompts Documentation](./system-prompts.md) for all prompt details.

---

## Image Handling

### Image Detection

Images are detected in multiple formats:

1. **Experimental Attachments**: `message.experimental_attachments`
2. **Content Array**: `message.content` with `type: "image"` parts
3. **URL Detection**: Image URLs in text content

### Image Processing Flow

```
User Uploads Image
    ↓
Client: Convert to data URL or signed URL
    ↓
API Route: Detect images in messages
    ↓
Fleming 3.5: Auto-switch to Fleming 4
Fleming 4: Process with Grok-4-fast-reasoning
    ↓
Image Analysis: Apply FLEMING_3_5_IMAGE_ANALYSIS_PROMPT
    ↓
Response: Medical image analysis + clinical insights
```

### Supported Image Formats

- **Medical Images**: X-rays, CT scans, MRIs, ultrasounds, pathology slides
- **Medical Documents**: Lab reports, prescriptions, medical records
- **General Images**: Photos, diagrams, charts, graphs

### Image URL Handling

- **Data URLs** (base64): Used directly
- **HTTPS URLs** (signed URLs): Used directly
- **Blob URLs**: Must be converted to data URLs on client before sending

---

## Streaming Architecture

### Streaming Flow

```
API Route: streamText() from AI SDK
    ↓
Model Adapter: doStream() method
    ↓
Provider API: Streaming endpoint
    ↓
Response Stream: Server-Sent Events (SSE)
    ↓
Client: Real-time token streaming
```

### Instant Streaming

The architecture is optimized for instant streaming:

1. **Minimal Blocking**: Rate limits checked before streaming starts
2. **Immediate Response**: Stream starts immediately, no waiting
3. **Efficient Processing**: Model loading is instant (static models)
4. **Background Operations**: Non-critical operations run in background

### Stream Format

```typescript
// AI SDK stream format
{
  stream: ReadableStream<LanguageModelV1StreamPart>,
  rawCall: {
    rawPrompt: string,
    rawSettings: object
  }
}

// Stream parts
type LanguageModelV1StreamPart = 
  | { type: "text-delta", textDelta: string }
  | { type: "finish", finishReason: string }
```

---

## Model Configuration

### Model Definitions

Models are defined in `lib/models/data/`:

- `grok.ts` - Grok models (including Fleming 4)
- `openai.ts` - OpenAI models
- `anthropic.ts` - Claude models
- `gemini.ts` - Google models
- `mistral.ts` - Mistral models
- And more...

### Model Config Structure

```typescript
type ModelConfig = {
  id: string                    // Unique model ID
  name: string                  // Display name
  provider: string              // Provider name
  providerId: string            // Provider ID
  modelFamily: string           // Model family
  description: string           // Model description
  tags: string[]               // Searchable tags
  contextWindow: number        // Token context window
  vision: boolean              // Image support
  tools: boolean               // Function calling support
  reasoning: boolean           // Advanced reasoning
  apiSdk: (apiKey?: string) => LanguageModelV1
}
```

---

## API Key Management

### Key Resolution

1. **User API Keys**: Stored in database, user-specific
2. **Environment Keys**: Fallback for system-wide access
3. **Effective Key**: User key OR environment key

```typescript
const effectiveApiKey = await getEffectiveApiKey(
  userId,
  provider
)
```

### Key Requirements

- **Fleming 3.5**: Requires xAI (Grok) API key
- **Fleming 4**: Requires xAI (Grok) API key
- **Other Models**: Provider-specific API keys

---

## Error Handling

### Error Flow

```
Model Error
    ↓
Adapter Error Handling
    ↓
API Route Error Response
    ↓
Client Error Display
```

### Error Types

- **Rate Limiting**: 429 status with wait time
- **API Errors**: Provider-specific error messages
- **Validation Errors**: 400 status with validation details
- **Network Errors**: Retry logic and error messages

---

## Performance Optimizations

1. **Static Model Loading**: Models loaded at build time, not runtime
2. **Prompt Caching**: System prompts cached for instant access
3. **Instant Streaming**: Minimal blocking operations
4. **Background Processing**: Non-critical operations run asynchronously
5. **Efficient Routing**: Direct provider mapping, no dynamic lookups

---

## Future Enhancements

- **Multi-Agent Systems**: Healthcare agent orchestration
- **Enhanced Vision**: Specialized medical image analysis
- **Tool Integration**: Function calling for medical tools
- **Caching**: Response caching for common queries
- **Analytics**: Model performance tracking

---

## Related Documentation

- [System Prompts](./system-prompts.md) - All system prompts used in Fleming
- [API Documentation](../README.md) - API usage and examples
- [Model Configuration](../lib/models/data/) - Model definitions and configurations


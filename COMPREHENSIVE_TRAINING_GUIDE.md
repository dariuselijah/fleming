# AskFleming - Comprehensive Training Guide

**Version:** 1.0  
**Last Updated:** 2024  
**Purpose:** Complete training documentation for new employees

---

## Table of Contents

1. [Application Overview](#application-overview)
2. [Technology Stack](#technology-stack)
3. [Architecture Overview](#architecture-overview)
4. [Database Schema](#database-schema)
5. [Authentication & Authorization](#authentication--authorization)
6. [AI/ML System](#aiml-system)
7. [Evidence System & RAG](#evidence-system--rag)
8. [File Handling & Storage](#file-handling--storage)
9. [Frontend Architecture](#frontend-architecture)
10. [State Management](#state-management)
11. [API Routes](#api-routes)
12. [Key Features](#key-features)
13. [Development Workflow](#development-workflow)
14. [Deployment & Production](#deployment--production)
15. [Security & Compliance](#security--compliance)
16. [Troubleshooting](#troubleshooting)

---

## Application Overview

**AskFleming** is an AI-powered medical assistant and multi-model chat application designed for both general users and healthcare professionals. It provides evidence-based medical guidance, supports multiple AI models, and includes specialized features for healthcare use cases.

### Core Purpose

- **Medical AI Assistant:** Provides instant medical insights and health advice
- **Multi-Model Support:** Seamlessly switch between different AI models (Grok-4, GPT-4o, Claude, Gemini, etc.)
- **Healthcare Agent:** Specialized AI assistant for healthcare professionals
- **Evidence-Based:** Integrates medical literature and research citations
- **BYOK Support:** Users can bring their own API keys
- **Self-Hostable:** Can be deployed on your own infrastructure

### Target Users

1. **General Users:** Health-conscious individuals seeking medical information
2. **Medical Students:** Learning and studying medical concepts
3. **Healthcare Professionals:** Doctors, nurses, and other medical practitioners
4. **Researchers:** Accessing medical literature and evidence

---

## Technology Stack

### Frontend

- **Framework:** Next.js 15.4.8 (React 19)
- **Language:** TypeScript 5
- **Styling:** Tailwind CSS 4.1.5
- **UI Components:** 
  - Radix UI (headless components)
  - shadcn/ui (component library)
  - Motion Primitives (animations)
- **State Management:** 
  - Zustand (global state)
  - React Context API (user, preferences, chats)
  - TanStack Query (server state)
- **Form Handling:** React Hook Form
- **Markdown Rendering:** react-markdown with remark plugins

### Backend

- **Runtime:** Node.js 18+
- **Framework:** Next.js App Router (Server Components & API Routes)
- **Database:** Supabase (PostgreSQL)
- **Storage:** Supabase Storage
- **Authentication:** Supabase Auth (Google OAuth, Anonymous)

### AI/ML Stack

- **AI SDK:** Vercel AI SDK 4.3.13
- **Model Providers:**
  - OpenAI (GPT models)
  - Anthropic (Claude)
  - xAI (Grok, Fleming models)
  - Google (Gemini)
  - Mistral
  - Perplexity
  - OpenRouter
  - DeepSeek
- **Embeddings:** Custom embedding generation for RAG
- **Vector Search:** PostgreSQL with pgvector extension

### Development Tools

- **Package Manager:** npm
- **Build Tool:** Next.js (Turbopack in dev)
- **Linting:** ESLint 9
- **Type Checking:** TypeScript
- **Code Formatting:** Prettier

### Infrastructure

- **Hosting:** Vercel (recommended) or self-hosted
- **Database:** Supabase PostgreSQL
- **File Storage:** Supabase Storage buckets
- **CDN:** Vercel Edge Network

---

## Architecture Overview

### High-Level Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Client (Browser)                           │
│  - React Components                                           │
│  - State Management (Zustand, Context)                       │
│  - TanStack Query                                            │
└────────────────────┬────────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────┐
│              Next.js App Router                              │
│  - Server Components                                         │
│  - API Routes (/api/*)                                      │
│  - Middleware                                                │
└────────────────────┬────────────────────────────────────────┘
                      │
        ┌─────────────┴─────────────┐
        │                           │
        ▼                           ▼
┌───────────────┐         ┌──────────────────┐
│   Supabase   │         │   AI Providers    │
│  - Database  │         │  - OpenAI         │
│  - Storage   │         │  - Anthropic      │
│  - Auth      │         │  - xAI            │
│              │         │  - Google         │
│              │         │  - Mistral        │
└───────────────┘         └──────────────────┘
```

### Request Flow

1. **User Request** → Client Component
2. **API Call** → Next.js API Route (`/app/api/chat/route.ts`)
3. **Authentication** → Supabase Auth validation
4. **Rate Limiting** → Check daily/hourly limits
5. **Model Selection** → Resolve model provider
6. **Evidence Search** → Query medical_evidence table (if enabled)
7. **System Prompt** → Select appropriate prompt based on role/model
8. **AI Request** → Stream to AI provider
9. **Response Streaming** → Server-Sent Events (SSE) to client
10. **Storage** → Save messages to database (background)

### Key Design Principles

1. **Instant Streaming:** Minimal blocking operations, immediate response streaming
2. **Background Processing:** Non-critical operations run asynchronously
3. **Static Model Loading:** Models loaded at build time, not runtime
4. **Prompt Caching:** System prompts cached for instant access
5. **HIPAA Compliance:** Message anonymization before sending to LLM providers

---

## Database Schema

### Core Tables

#### `users`
Stores user account information.

```sql
CREATE TABLE users (
  id UUID PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  message_count INTEGER DEFAULT 0,
  premium BOOLEAN DEFAULT FALSE,
  favorite_models TEXT[] DEFAULT ARRAY['gpt-4']::TEXT[],
  anonymous BOOLEAN DEFAULT FALSE,
  daily_message_count INTEGER DEFAULT 0,
  daily_reset TIMESTAMPTZ,
  display_name TEXT,
  profile_image TEXT,
  last_active_at TIMESTAMPTZ,
  daily_pro_message_count INTEGER DEFAULT 0,
  daily_pro_reset TIMESTAMPTZ,
  system_prompt TEXT
);
```

**Key Fields:**
- `id`: UUID from Supabase Auth
- `daily_message_count`: Tracks daily message usage
- `daily_reset`: Timestamp for daily limit reset
- `favorite_models`: Array of preferred model IDs

#### `user_preferences`
User settings and preferences.

```sql
CREATE TABLE user_preferences (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  layout TEXT,
  prompt_suggestions BOOLEAN DEFAULT TRUE,
  show_tool_invocations BOOLEAN DEFAULT TRUE,
  show_conversation_previews BOOLEAN DEFAULT TRUE,
  hidden_models TEXT[],
  user_role TEXT, -- 'general', 'doctor', 'medical_student'
  medical_specialty TEXT,
  healthcare_agent_enabled BOOLEAN DEFAULT FALSE,
  medical_compliance_mode BOOLEAN DEFAULT FALSE,
  clinical_decision_support BOOLEAN DEFAULT FALSE,
  medical_literature_access BOOLEAN DEFAULT FALSE,
  health_context TEXT,
  health_conditions TEXT[],
  medications TEXT[],
  allergies TEXT[],
  family_history TEXT,
  lifestyle_factors TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

**Key Fields:**
- `user_role`: Determines system prompt and suggestions
- `medical_specialty`: For healthcare professionals
- `health_context`: User's health information

#### `chats`
Chat conversation containers.

```sql
CREATE TABLE chats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  title TEXT,
  model TEXT,
  project_id UUID,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  public BOOLEAN DEFAULT FALSE
);
```

#### `messages`
Individual messages in conversations.

```sql
CREATE TABLE messages (
  id SERIAL PRIMARY KEY,
  chat_id UUID REFERENCES chats(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('system', 'user', 'assistant', 'data')),
  content TEXT,
  parts JSONB,
  model TEXT,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  message_group_id UUID,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  experimental_attachments JSONB[]
);
```

**Key Fields:**
- `role`: Message role (system, user, assistant)
- `parts`: Structured content parts (for complex messages)
- `experimental_attachments`: File attachments
- `message_group_id`: Groups related messages

#### `user_keys`
Encrypted API keys for BYOK (Bring Your Own Key).

```sql
CREATE TABLE user_keys (
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  encrypted_key TEXT NOT NULL,
  iv TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (user_id, provider)
);
```

**Security:** Keys are encrypted using AES-256-GCM before storage.

#### `chat_attachments`
File attachments metadata.

```sql
CREATE TABLE chat_attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chat_id UUID REFERENCES chats(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  file_name TEXT,
  file_size INTEGER,
  file_type TEXT,
  file_url TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

#### `medical_evidence`
Medical literature and research evidence.

```sql
CREATE TABLE medical_evidence (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pmid TEXT UNIQUE,
  title TEXT NOT NULL,
  journal_name TEXT,
  publication_year INTEGER,
  doi TEXT,
  authors TEXT[],
  content TEXT NOT NULL,
  embedding vector(1536), -- OpenAI embedding dimension
  evidence_level INTEGER, -- 1-10 scale
  study_type TEXT,
  sample_size INTEGER,
  mesh_terms TEXT[],
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

**Key Features:**
- Vector embeddings for semantic search
- Evidence level scoring (1-10)
- MESH terms for medical categorization
- Full-text search capabilities

#### `projects`
User projects for organizing chats.

```sql
CREATE TABLE projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### Indexes

```sql
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_chats_user_id ON chats(user_id);
CREATE INDEX idx_messages_chat_id ON messages(chat_id);
CREATE INDEX idx_messages_user_id ON messages(user_id);
CREATE INDEX idx_medical_evidence_pmid ON medical_evidence(pmid);
CREATE INDEX idx_medical_evidence_embedding ON medical_evidence USING ivfflat (embedding vector_cosine_ops);
```

### Row Level Security (RLS)

All tables have RLS enabled with policies:
- Users can only access their own data
- Public chats are readable by all authenticated users
- Admin users have elevated permissions

---

## Authentication & Authorization

### Authentication Flow

1. **User Initiates Login** → Redirects to Supabase Auth
2. **OAuth Provider** → Google OAuth (or email/password)
3. **Callback Handler** → `/app/auth/callback/route.ts`
4. **Session Creation** → Supabase creates session
5. **User Record** → Creates/updates user in `users` table
6. **Redirect** → Returns to application

### Guest Users

- Anonymous sign-ins enabled in Supabase
- Limited functionality (5 messages/day, 3/hour)
- Can upgrade to authenticated account
- Guest user ID: `temp` or `temp-chat-*`

### Authentication Components

**Server-Side:**
- `lib/supabase/server.ts` - Server Supabase client
- `lib/supabase/server-guest.ts` - Guest user client
- `app/auth/callback/route.ts` - OAuth callback handler

**Client-Side:**
- `lib/supabase/client.ts` - Browser Supabase client
- `app/components/chat/dialog-auth.tsx` - Login dialog
- `app/components/auth-guard.tsx` - Protected route wrapper

### Session Management

- Sessions stored in HTTP-only cookies
- Automatic refresh via Supabase SSR
- Middleware validates sessions on each request
- Session timeout: 7 days (Supabase default)

### Authorization Levels

1. **Unauthenticated:** Guest users with limited access
2. **Authenticated:** Full access to personal chats
3. **Premium:** Enhanced limits and features
4. **Admin:** Access to admin dashboard (`/app/admin`)

---

## AI/ML System

### Model Provider Architecture

The application uses a unified provider interface through `lib/openproviders/`:

```
Model ID → Provider Map → Provider Adapter → AI Provider API
```

**Provider Map** (`lib/openproviders/provider-map.ts`):
- Maps model IDs to providers (xai, openai, anthropic, etc.)
- Resolves API keys (user keys or environment keys)
- Handles provider-specific configurations

**Supported Providers:**
- **xAI:** Grok models, Fleming 3.5, Fleming 4
- **OpenAI:** GPT-4o, GPT-4, GPT-3.5
- **Anthropic:** Claude 3.5 Sonnet, Claude 3 Opus
- **Google:** Gemini Pro, Gemini Ultra
- **Mistral:** Mistral Large, Mistral Medium
- **Perplexity:** Perplexity models
- **OpenRouter:** Aggregated model access
- **DeepSeek:** DeepSeek models

### Fleming Models

#### Fleming 3.5
- **Model ID:** `fleming-3.5`
- **Base Model:** Grok-3
- **Use Case:** Rapid clinical reasoning, text-only conversations
- **Special Feature:** Auto-switches to Fleming 4 when images detected
- **System Prompt:** Clinical physician focused on structured assessment

#### Fleming 4
- **Model ID:** `fleming-4`
- **Base Model:** Grok-4-fast-reasoning
- **Use Case:** Comprehensive medical analysis, vision support
- **Capabilities:** 
  - Full image analysis (X-rays, CT scans, documents)
  - Advanced clinical reasoning
  - 200K token context window
- **System Prompt:** Advanced medical AI doctor with evidence-based responses

### System Prompts

System prompts are role-based and model-specific:

1. **Default (General Users):** Compassionate health companion
2. **Medical Student:** Educational mentor focused on learning
3. **Doctor:** Evidence-based clinical guidance with citations
4. **Fleming 3.5:** Clinical physician with structured assessment
5. **Fleming 4:** Advanced medical AI with comprehensive depth

**Location:** `lib/config.ts`

**Caching:** System prompts are cached in memory for instant access.

### Model Selection Logic

```typescript
// In app/api/chat/route.ts
let effectiveModel = model

// Fleming 3.5 image detection
if (model === "fleming-3.5") {
  if (hasImages) {
    effectiveModel = "fleming-4"  // Auto-switch
  }
}

// System prompt selection
if (effectiveModel === "fleming-4") {
  effectiveSystemPrompt = FLEMING_4_SYSTEM_PROMPT
} else {
  effectiveSystemPrompt = getSystemPromptByRole(userRole, systemPrompt)
}
```

### Streaming Architecture

**Flow:**
1. API Route calls `streamText()` from AI SDK
2. Model adapter's `doStream()` method processes request
3. Provider API streams response
4. Server-Sent Events (SSE) deliver tokens to client
5. Client renders tokens in real-time

**Optimization:**
- Minimal blocking operations before streaming starts
- Rate limits checked before streaming
- Background operations (saving messages) don't block stream

### Web Search Integration

- **Provider:** xAI/Grok web search
- **Activation:** Enabled for healthcare professionals using Fleming 4
- **Usage:** Automatically searches web for current medical information
- **Citations:** Web sources included in response

---

## Evidence System & RAG

### Overview

The evidence system provides evidence-based medical responses by:
1. Searching medical literature from PubMed
2. Retrieving relevant research papers
3. Synthesizing evidence into context
4. Injecting citations into AI responses
5. Displaying citations in UI

### Components

#### Evidence Search (`lib/evidence/search.ts`)

**Hybrid Search:**
- **Semantic Search:** Vector similarity using embeddings
- **Keyword Search:** Full-text search on content
- **Reciprocal Rank Fusion:** Combines both search results

**Search Function:**
```typescript
searchMedicalEvidence({
  query: "diabetes treatment",
  maxResults: 8,
  minEvidenceLevel: 5,
  semanticWeight: 1.0,
  keywordWeight: 1.0
})
```

**Database Function:** Uses `hybrid_medical_search` RPC function in PostgreSQL.

#### Evidence Synthesis (`lib/evidence/synthesis.ts`)

**Process:**
1. Search medical evidence
2. Convert results to citations
3. Build evidence context
4. Enhance system prompt with evidence
5. Extract referenced citations from response

**Citation Format:**
```typescript
{
  index: 1,
  pmid: "12345678",
  title: "Study Title",
  journal: "Journal Name",
  year: 2024,
  doi: "10.1234/example",
  authors: ["Author 1", "Author 2"],
  evidenceLevel: 8,
  studyType: "RCT",
  url: "https://pubmed.ncbi.nlm.nih.gov/12345678"
}
```

### Evidence Mode

**Auto-Enabled For:**
- Healthcare professionals (doctors, medical students)
- Users with `medical_literature_access` enabled

**Manual Toggle:** Users can enable/disable in chat interface

**Flow:**
1. User sends message
2. System detects medical query
3. Searches `medical_evidence` table
4. Retrieves top 8 relevant papers
5. Enhances system prompt with evidence
6. AI generates response with citations
7. Citations displayed in UI

### Citation Display

**Components:**
- `evidence-citation-pill.tsx` - Individual citation badge
- `evidence-references-section.tsx` - Full references list
- `inline-citation.tsx` - In-text citation markers
- `journal-citation-tag.tsx` - Journal-specific formatting

**Citation Markers:** `[CITATION:1]`, `[CITATION:2]`, etc. in responses

### PubMed Ingestion

**Scripts:**
- `scripts/ingest-pubmed.ts` - Single ingestion
- `scripts/ingest-pubmed-scale.ts` - Batch ingestion

**Process:**
1. Fetch papers from PubMed API
2. Generate embeddings
3. Extract metadata (MESH terms, study type, etc.)
4. Store in `medical_evidence` table
5. Index embeddings for vector search

---

## File Handling & Storage

### File Upload Flow

1. **User Selects File** → Client-side validation
2. **Upload to Supabase Storage** → `/api/upload-file`
3. **Generate Signed URL** → Temporary access URL (1 hour)
4. **Store Metadata** → `chat_attachments` table
5. **Attach to Message** → Include in message attachments

### File Validation

**Supported Types:**
- Images: JPG, PNG, GIF, WebP
- Documents: PDF, DOCX, TXT
- Medical: DICOM (via specialized handling)

**Size Limits:**
- Daily limit: 25 files per user
- Max file size: 10MB (configurable)

**Validation Function:** `lib/file-handling.ts` - `validateFile()`

### Storage Buckets

**Supabase Storage:**
- `chat-attachments` - User-uploaded files
- `avatars` - User profile images

**Access Control:**
- Private buckets with signed URLs
- URLs expire after 1 hour
- Regenerated on-demand

### File Processing

**Parallel Processing:**
- Multiple files uploaded simultaneously
- Non-blocking validation
- Optimistic UI updates

**Components:**
- `app/components/chat-input/button-file-upload.tsx`
- `app/components/chat-input/file-list.tsx`
- `app/api/upload-file/route.ts`

### Image Handling

**Vision Models:**
- Support data URLs (base64)
- Support signed URLs (HTTPS)
- Automatic conversion for blob URLs

**Medical Images:**
- X-rays, CT scans, MRIs
- Pathology slides
- Medical documents
- Lab reports

---

## Frontend Architecture

### Component Structure

```
app/
├── components/
│   ├── chat/              # Chat interface components
│   │   ├── chat.tsx       # Main chat component
│   │   ├── conversation.tsx
│   │   ├── message.tsx
│   │   └── ...
│   ├── chat-input/        # Input components
│   ├── history/           # Chat history sidebar
│   ├── layout/            # Layout components
│   │   ├── header.tsx
│   │   ├── sidebar/
│   │   └── settings/
│   └── ...
├── api/                   # API routes
│   ├── chat/
│   ├── upload-file/
│   └── ...
└── page.tsx               # Root page
```

### Key Components

#### Chat Component (`app/components/chat/chat.tsx`)
- Main chat interface
- Manages chat state
- Handles message submission
- Coordinates file uploads

#### Chat Input (`app/components/chat-input/chat-input.tsx`)
- Message input field
- File upload button
- Search toggle
- Evidence mode toggle
- Model selector

#### Message Components
- `message-user.tsx` - User message display
- `message-assistant.tsx` - AI response display
- `citation-markdown.tsx` - Citation rendering
- `evidence-references-section.tsx` - References list

### Routing

**App Router Structure:**
- `/` - Main chat interface
- `/c/[chatId]` - Specific chat conversation
- `/p/[projectId]` - Project view
- `/auth/login` - Login page
- `/auth/callback` - OAuth callback
- `/admin` - Admin dashboard

### Client-Side Hooks

**Custom Hooks:**
- `useChatCore` - Core chat functionality
- `useFileUpload` - File handling
- `useModel` - Model selection
- `useChatDraft` - Draft message persistence
- `useUser` - User context
- `useUserPreferences` - User settings
- `useChats` - Chat list management
- `useMessages` - Message management

---

## State Management

### Global State (Zustand)

**Stores:**
- Chat state
- Model selection
- UI preferences

**Location:** `lib/chat-store/`, `lib/model-store/`

### Context API

**Providers:**
- `UserProvider` - User authentication state
- `UserPreferencesProvider` - User settings
- `ChatsProvider` - Chat list management
- `MessagesProvider` - Message state
- `ModelProvider` - Available models

**Location:** `lib/user-store/`, `lib/user-preference-store/`, `lib/chat-store/`

### Server State (TanStack Query)

**Queries:**
- User preferences
- Chat list
- Messages
- Model availability

**Caching:**
- 5-minute stale time
- Automatic refetch on window focus
- Optimistic updates

### Local Storage

**Stored Data:**
- Draft messages (sessionStorage)
- Evidence citations (sessionStorage)
- User preferences (localStorage for guests)
- Chat history cache

**Keys:**
- `pendingMessages:{chatId}` - Unsaved messages
- `evidenceCitations:{chatId}` - Citation data
- `userPreferences` - Guest preferences

---

## API Routes

### `/api/chat` (POST)

**Purpose:** Main chat endpoint

**Request Body:**
```typescript
{
  messages: Message[],
  chatId: string,
  userId: string,
  model: SupportedModel,
  isAuthenticated: boolean,
  systemPrompt?: string,
  enableSearch?: boolean,
  enableEvidence?: boolean,
  userRole?: "doctor" | "general" | "medical_student",
  medicalSpecialty?: string
}
```

**Response:** Server-Sent Events (SSE) stream

**Process:**
1. Validate request
2. Check rate limits
3. Select model and system prompt
4. Search evidence (if enabled)
5. Stream AI response
6. Save messages (background)

### `/api/upload-file` (POST)

**Purpose:** File upload endpoint

**Request:** FormData with file, userId, chatId

**Response:**
```typescript
{
  success: boolean,
  filePath: string,
  signedUrl: string,
  attachment: Attachment
}
```

### `/api/create-chat` (POST)

**Purpose:** Create new chat conversation

**Request:**
```typescript
{
  userId: string,
  title?: string,
  model?: string,
  projectId?: string
}
```

**Response:** Chat object with ID

### `/api/update-chat-model` (POST)

**Purpose:** Change model for a chat

**Request:**
```typescript
{
  chatId: string,
  model: string
}
```

### `/api/user-keys` (POST)

**Purpose:** Store encrypted API keys (BYOK)

**Request:**
```typescript
{
  provider: string,
  apiKey: string
}
```

**Security:** Keys encrypted with AES-256-GCM before storage

### `/api/user-preferences` (GET/POST)

**Purpose:** Get/update user preferences

### `/api/rate-limits` (GET)

**Purpose:** Check current rate limit status

**Response:**
```typescript
{
  dailyRemaining: number,
  hourlyRemaining: number,
  dailyLimit: number,
  hourlyLimit: number
}
```

---

## Key Features

### 1. Multi-Model Support

- **Model Selection:** Dropdown in chat input
- **Model Switching:** Change model mid-conversation
- **Model Favorites:** Save preferred models
- **Model Visibility:** Hide/show models in selector

### 2. Evidence Mode

- **Auto-Enable:** For healthcare professionals
- **Manual Toggle:** Available in chat interface
- **Citation Display:** In-text and reference list
- **Evidence Levels:** Filter by evidence quality (1-10)

### 3. File Uploads

- **Drag & Drop:** Upload files by dragging
- **Multiple Files:** Upload multiple files at once
- **Image Analysis:** Vision models analyze images
- **Document Processing:** PDF and document support

### 4. Chat Management

- **Chat History:** Sidebar with all conversations
- **Projects:** Organize chats into projects
- **Search:** Search chat history
- **Delete:** Remove chats or projects

### 5. User Roles

- **General:** Default user experience
- **Medical Student:** Educational prompts and suggestions
- **Doctor:** Clinical prompts with citations
- **Specialty Selection:** Choose medical specialty

### 6. Healthcare Agent System

- **Orchestrator Agent:** Coordinates specialized agents
- **Specialized Agents:**
  - Clinical Diagnosis Agent
  - Evidence-Based Medicine Agent
  - Pharmacology Agent
  - Radiology Agent
  - Laboratory Agent
  - Treatment Planning Agent
  - Risk Assessment Agent
  - Specialty Consultant Agent

### 7. Rate Limiting

- **Daily Limits:**
  - Unauthenticated: 5 messages/day
  - Authenticated: 1000 messages/day
- **Hourly Limits:**
  - Unauthenticated: 3 messages/hour
  - Authenticated: 50 messages/hour
- **File Limits:** 25 files/day

### 8. BYOK (Bring Your Own Key)

- **Secure Storage:** Encrypted API keys
- **Provider Support:** All major providers
- **User Control:** Users manage their own keys
- **Fallback:** Environment keys as backup

---

## Development Workflow

### Setup

1. **Clone Repository:**
```bash
git clone https://github.com/ibelick/fleming.git
cd fleming
```

2. **Install Dependencies:**
```bash
npm install
```

3. **Environment Variables:**
Create `.env.local` with required variables (see `INSTALL.md`)

4. **Database Setup:**
Run SQL migrations in Supabase SQL editor

5. **Start Development Server:**
```bash
npm run dev
```

### Development Commands

```bash
npm run dev          # Start dev server (Turbopack)
npm run build        # Build for production
npm run start        # Start production server
npm run lint         # Run ESLint
npm run type-check   # TypeScript type checking
npm run ingest       # Ingest PubMed data
```

### Code Structure

**Key Directories:**
- `app/` - Next.js app router (pages, components, API routes)
- `lib/` - Shared utilities and business logic
- `components/` - Reusable UI components
- `public/` - Static assets
- `scripts/` - Utility scripts

### TypeScript

- **Strict Mode:** Enabled
- **Path Aliases:** `@/*` maps to root
- **Type Generation:** Supabase types auto-generated

### Testing

- **Type Checking:** `npm run type-check`
- **Linting:** `npm run lint`
- **Manual Testing:** Test chat flows, file uploads, etc.

---

## Deployment & Production

### Vercel Deployment (Recommended)

1. **Connect Repository:** Link GitHub repo to Vercel
2. **Environment Variables:** Add all required env vars
3. **Build Settings:** Next.js auto-detected
4. **Deploy:** Automatic on push to main

### Self-Hosted Deployment

1. **Build Application:**
```bash
npm run build
```

2. **Start Server:**
```bash
npm start
```

3. **Docker Deployment:**
```bash
docker build -t fleming .
docker run -p 3000:3000 fleming
```

### Environment Variables (Production)

**Required:**
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE`
- `CSRF_SECRET`
- `ENCRYPTION_KEY` (for BYOK)

**Optional:**
- Provider API keys (OpenAI, Anthropic, etc.)
- `NEXT_PUBLIC_VERCEL_URL` (for production URL)

### Performance Optimization

**Build Optimizations:**
- Static model loading (no runtime model discovery)
- Prompt caching
- Bundle optimization (Turbopack)
- Image optimization (Next.js Image component)

**Runtime Optimizations:**
- Instant streaming (minimal blocking)
- Background message saving
- Parallel file processing
- Efficient state management

---

## Security & Compliance

### HIPAA Compliance

**Message Anonymization:**
- All messages anonymized before sending to LLM providers
- PII/PHI removed or replaced
- Location: `lib/anonymize.ts`

**Encryption:**
- API keys encrypted at rest (AES-256-GCM)
- Database connections encrypted (TLS)
- File storage encrypted (Supabase)

### Authentication Security

- **Session Management:** HTTP-only cookies
- **CSRF Protection:** CSRF tokens for state-changing operations
- **OAuth:** Secure OAuth 2.0 flow
- **Guest Users:** Limited access, no PII storage

### Data Privacy

- **User Data:** Stored in Supabase with RLS
- **Message Encryption:** Optional end-to-end encryption
- **File Storage:** Private buckets with signed URLs
- **Data Retention:** User-controlled deletion

### Rate Limiting

- **Prevents Abuse:** Daily and hourly limits
- **Fair Usage:** Prevents single user from monopolizing resources
- **Graceful Degradation:** Clear error messages with wait times

### API Security

- **Input Validation:** All inputs validated
- **SQL Injection:** Parameterized queries only
- **XSS Prevention:** Content sanitization
- **CORS:** Configured for allowed origins

---

## Troubleshooting

### Common Issues

#### 1. Models Not Loading

**Symptoms:** Model selector empty or models not appearing

**Solutions:**
- Check API keys in environment variables
- Verify model provider connectivity
- Check browser console for errors
- Restart development server

#### 2. Authentication Issues

**Symptoms:** Users can't log in or get logged out

**Solutions:**
- Verify Supabase URL and keys
- Check OAuth provider configuration
- Clear browser cookies
- Check Supabase Auth logs

#### 3. File Upload Failures

**Symptoms:** Files not uploading or errors

**Solutions:**
- Verify Supabase Storage buckets exist
- Check file size limits
- Verify storage permissions
- Check network connectivity

#### 4. Evidence Not Appearing

**Symptoms:** Citations not showing in responses

**Solutions:**
- Verify evidence mode is enabled
- Check `medical_evidence` table has data
- Verify embeddings are generated
- Check evidence search logs

#### 5. Streaming Issues

**Symptoms:** Responses not streaming or incomplete

**Solutions:**
- Check network connectivity
- Verify AI provider API status
- Check rate limits
- Review server logs

### Debugging

**Client-Side:**
- Browser DevTools console
- React DevTools
- Network tab for API calls

**Server-Side:**
- Next.js server logs
- Supabase logs
- API route console.log statements

**Database:**
- Supabase SQL editor
- Query performance analysis
- Table inspection

### Performance Monitoring

**Tools:**
- Vercel Analytics (if deployed on Vercel)
- Custom performance monitor (`app/components/chat/performance-monitor.tsx`)
- Browser Performance API

**Metrics:**
- Time to first token (TTFT)
- Streaming latency
- Message save time
- File upload time

---

## Additional Resources

### Documentation

- **AI Architecture:** `docs/ai-architecture.md`
- **System Prompts:** `docs/system-prompts.md`
- **Installation:** `INSTALL.md`
- **Mobile Citations:** `docs/mobile-evidence-citations.md`

### External Resources

- **Next.js Docs:** https://nextjs.org/docs
- **Supabase Docs:** https://supabase.com/docs
- **Vercel AI SDK:** https://sdk.vercel.ai/docs
- **Radix UI:** https://www.radix-ui.com

### Code Examples

**Creating a New API Route:**
```typescript
// app/api/example/route.ts
import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  const data = await request.json()
  // Process data
  return NextResponse.json({ success: true })
}
```

**Adding a New Model:**
```typescript
// lib/models/data/example.ts
export const exampleModels: ModelConfig[] = [
  {
    id: "example-model",
    name: "Example Model",
    provider: "Example",
    providerId: "example",
    apiSdk: (apiKey) => openproviders("example-model", undefined, apiKey),
    // ... other config
  }
]
```

**Creating a New Component:**
```typescript
// app/components/example/example.tsx
'use client'

export function Example() {
  return <div>Example Component</div>
}
```

---

## Conclusion

This guide provides a comprehensive overview of the AskFleming application architecture, features, and development workflow. For specific implementation details, refer to the source code and inline documentation.

**Key Takeaways:**
- Next.js 15 with App Router
- Supabase for backend services
- Multi-provider AI integration
- Evidence-based medical responses
- HIPAA-compliant message handling
- Real-time streaming responses
- Comprehensive state management

**Next Steps for New Employees:**
1. Set up local development environment
2. Review key components (chat, API routes)
3. Understand authentication flow
4. Explore evidence system
5. Practice making changes and testing

**Questions?** Refer to the codebase, documentation files, or ask the team.

---

**Document Version:** 1.0  
**Last Updated:** 2024  
**Maintained By:** Development Team


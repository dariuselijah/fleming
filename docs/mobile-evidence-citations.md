# Mobile Evidence & Citations Integration Guide

This guide documents how to integrate the evidence and article citations architecture into the mobile app (iOS/Android via Capacitor).

## Overview

The Fleming app uses **TWO citation systems** for evidence-based medical responses:

### 1. **Evidence System** (Active) ✅
- Searches a database of medical evidence (PubMed articles, clinical studies)
- Returns structured citations with metadata (journal, authors, evidence level, DOI, PMID)
- Uses simple citation format: `[1]`, `[2]`, `[1-3]`
- **Status**: ✅ Fully integrated and active

### 2. **RAG System** (In Progress) 🚧
- Retrieves citations from textbooks, journals, and guidelines with exact page numbers
- Uses structured citation format: `[CITATION:1]`, `[CITATION:2]`
- Provides page-level traceability for claims
- **Status**: 🚧 System built, integration pending

Both systems:
- Display citations inline in messages and in references sections
- Store citations in message metadata for persistence
- Support the same UI components (`CitationMarkdown` handles both formats)

## Architecture

### Evidence System Data Flow (Active)

```
User Query
    ↓
Chat API (/api/chat)
    ↓
Evidence Synthesis (lib/evidence/synthesis.ts)
    ↓
Evidence Search (lib/evidence/search.ts)
    ↓
Medical Evidence Database (medical_evidence table)
    ↓
Evidence Citations (EvidenceCitation[])
    ↓
LLM Response (with inline citations [1], [2], etc.)
    ↓
Frontend Display (CitationMarkdown, EvidenceReferencesSection)
```

### RAG System Data Flow (In Progress)

```
User Query
    ↓
Chat API (/api/chat) [TODO: Integration]
    ↓
Citation RAG System (lib/rag/citation-rag.ts)
    ↓
Vector Search (pgvector)
    ↓
Citation Documents Database (citation_documents, citation_document_chunks)
    ↓
Citation Chunks (CitationChunk[])
    ↓
LLM Response (with inline citations [CITATION:1], [CITATION:2])
    ↓
Frontend Display (CitationMarkdown) [Already supports this format]
```

### Key Components

#### 1. **EvidenceCitation Type**
```typescript
interface EvidenceCitation {
  index: number;              // Citation number (1, 2, 3, ...)
  pmid: string | null;        // PubMed ID
  title: string;              // Article title
  journal: string;            // Journal name
  year: number | null;        // Publication year
  doi: string | null;         // DOI
  authors: string[];          // Author list
  evidenceLevel: number;      // 1-5 (1 = best, 5 = opinion)
  studyType: string | null;   // "RCT", "Meta-Analysis", etc.
  sampleSize: number | null;  // Study sample size
  meshTerms: string[];        // Medical subject headings
  url: string | null;         // PubMed URL
  snippet: string;            // Relevant text snippet
  score: number;              // Search relevance score
}
```

#### 2. **Message Metadata Storage**

Citations are stored in message `parts` metadata:
```typescript
message.parts = [
  {
    type: "text",
    text: "Response with citations [1], [2]..."
  },
  {
    type: "metadata",
    metadata: {
      evidenceCitations: EvidenceCitation[]
    }
  }
]
```

#### 3. **Evidence Levels**

Evidence quality hierarchy (1 = highest quality):
- **Level 1**: Meta-Analysis / Systematic Review
- **Level 2**: Randomized Controlled Trial (RCT)
- **Level 3**: Cohort / Case-Control Study
- **Level 4**: Case Series / Case Report
- **Level 5**: Expert Opinion / Review

## Components to Reuse

Since you're using Capacitor, the web components should work in the mobile app with minimal changes. Key components:

### 1. **CitationMarkdown** (`app/components/chat/citation-markdown.tsx`)
Renders markdown with inline citations. Handles both formats:
- **Evidence format**: `[1]`, `[2,3]`, `[1-3]` (evidence mode - active)
- **RAG format**: `[CITATION:1]`, `[CITATION:2]` (RAG mode - ready)

**Props:**
```typescript
{
  children: string;              // Markdown text with citations
  citations?: CitationData[];    // Optional web search citations
  evidenceCitations?: EvidenceCitation[]; // Medical evidence citations
  className?: string;
}
```

### 2. **EvidenceCitationPill** (`app/components/chat/evidence-citation-pill.tsx`)
Inline citation pill with journal favicon. Clickable popup shows full citation details.

**Props:**
```typescript
{
  citation: EvidenceCitation;
  size?: "sm" | "md";
  showEvidenceLevel?: boolean;
  className?: string;
}
```

### 3. **EvidenceReferencesSection** (`app/components/chat/evidence-references-section.tsx`)
Collapsible references list grouped by evidence level.

**Props:**
```typescript
{
  citations: EvidenceCitation[];
  className?: string;
}
```

### 4. **CitationPopup** (`app/components/chat/citation-popup.tsx`)
Popup showing full citation details (used by EvidenceCitationPill).

## API Integration

### Chat Endpoint

The `/api/chat` endpoint automatically includes evidence when enabled:

**Request:**
```typescript
{
  messages: MessageAISDK[],
  chatId: string,
  userId: string,
  model: SupportedModel,
  enableEvidence?: boolean,  // Default: true
  // ... other fields
}
```

**Response (Streaming):**
- Text chunks with inline citations: `"Response text [1], [2]..."`
- Final metadata part with `evidenceCitations` array

### Evidence Endpoint

Direct evidence search endpoint (`/api/evidence`):

**Request:**
```typescript
POST /api/evidence
{
  query: string;
  maxResults?: number;        // Default: 8
  minEvidenceLevel?: number;  // Default: 5
  studyTypes?: string[];
  minYear?: number;
}
```

**Response:**
```typescript
{
  citations: EvidenceCitation[];
  searchTimeMs: number;
}
```

## Implementation Steps

### Step 1: Verify Evidence System is Enabled

Check that evidence mode is enabled in your chat component:

```typescript
// In use-chat-core.ts or similar
const [enableEvidence, setEnableEvidence] = useState(true) // Should be true
```

### Step 2: Extract Citations from Messages

Citations are stored in message `parts` metadata:

```typescript
import type { Message as MessageAISDK } from "ai"

function extractEvidenceCitations(message: MessageAISDK): EvidenceCitation[] {
  const parts = message.parts || []
  const metadataPart = parts.find(
    (p: any) => p.type === "metadata" && p.metadata?.evidenceCitations
  )
  return metadataPart?.metadata?.evidenceCitations || []
}
```

### Step 3: Pass Citations to Message Components

Update your message assistant component:

```typescript
import { CitationMarkdown } from "@/app/components/chat/citation-markdown"
import { EvidenceReferencesSection } from "@/app/components/chat/evidence-references-section"
import type { EvidenceCitation } from "@/lib/evidence/types"

function MessageAssistant({ message, ...props }) {
  const evidenceCitations = extractEvidenceCitations(message)
  
  return (
    <>
      <CitationMarkdown
        evidenceCitations={evidenceCitations}
      >
        {message.content}
      </CitationMarkdown>
      
      {evidenceCitations.length > 0 && (
        <EvidenceReferencesSection citations={evidenceCitations} />
      )}
    </>
  )
}
```

### Step 4: Handle Citation Storage (Session Persistence)

Citations are stored in sessionStorage for persistence:

```typescript
// Storing citations (in use-chat-core.ts)
if (typeof window !== 'undefined' && citations.length > 0) {
  const key = chatId || 'pending'
  sessionStorage.setItem(
    `evidenceCitations:${key}`, 
    JSON.stringify(citations)
  )
}

// Restoring citations
function restoreCitations(chatId: string): EvidenceCitation[] {
  if (typeof window === 'undefined') return []
  
  const stored = sessionStorage.getItem(`evidenceCitations:${chatId}`)
  if (!stored) return []
  
  try {
    return JSON.parse(stored)
  } catch {
    return []
  }
}
```

### Step 5: Mobile-Specific Considerations

#### Touch Interactions
- Citation pills should be tappable (already handled by onClick)
- Popups should dismiss on outside tap (already implemented)
- Consider larger tap targets on mobile (min 44x44px)

#### Viewport Considerations
- Citation popups need mobile-friendly positioning
- Consider bottom sheets for citation details on mobile
- Test scrolling behavior with long citation lists

#### Performance
- Favicon images should have fallbacks
- Consider lazy-loading citation details
- Cache citation data in IndexedDB for offline access

#### Capacitor-Specific
- Test WebView compatibility (should work, but verify)
- Handle deep linking to PubMed/DOI URLs
- Consider using Capacitor Browser plugin for external links

## Testing Checklist

### Functional Testing
- [ ] Citations appear inline in messages
- [ ] Citation pills are tappable and show popups
- [ ] References section displays correctly
- [ ] Citations persist across page refreshes
- [ ] Multiple citations in one message work correctly
- [ ] Citation ranges [1-3] are parsed correctly

### Visual Testing
- [ ] Citation pills are readable on mobile screens
- [ ] Popups are positioned correctly on mobile
- [ ] References section is scrollable
- [ ] Journal favicons load (or fallback displays)
- [ ] Evidence level badges are visible

### Data Testing
- [ ] Citations are extracted from message metadata
- [ ] Citations are stored in sessionStorage
- [ ] Citations are restored when navigating back
- [ ] Empty citation arrays don't break components

### Mobile-Specific Testing
- [ ] Touch interactions work (no hover states required)
- [ ] External links open in browser
- [ ] Scrolling works smoothly with citations
- [ ] Performance is acceptable on slower devices

## Type Definitions

All types are in `lib/evidence/types.ts`:

```typescript
export interface EvidenceCitation {
  index: number;
  pmid: string | null;
  title: string;
  journal: string;
  year: number | null;
  doi: string | null;
  authors: string[];
  evidenceLevel: number;
  studyType: string | null;
  sampleSize: number | null;
  meshTerms: string[];
  url: string | null;
  snippet: string;
  score: number;
}

export const EVIDENCE_LEVEL_LABELS: Record<number, string> = {
  1: 'Meta-Analysis / Systematic Review',
  2: 'Randomized Controlled Trial',
  3: 'Cohort / Case-Control Study',
  4: 'Case Series / Case Report',
  5: 'Expert Opinion / Review',
};

export const EVIDENCE_LEVEL_COLORS: Record<number, string> = {
  1: 'bg-emerald-500',
  2: 'bg-blue-500',
  3: 'bg-amber-500',
  4: 'bg-orange-500',
  5: 'bg-gray-500',
};
```

## Example Integration

### Complete Message Component Example

```typescript
"use client"

import { CitationMarkdown } from "@/app/components/chat/citation-markdown"
import { EvidenceReferencesSection } from "@/app/components/chat/evidence-references-section"
import type { Message as MessageAISDK } from "ai"
import type { EvidenceCitation } from "@/lib/evidence/types"

interface MessageProps {
  message: MessageAISDK & { evidenceCitations?: EvidenceCitation[] }
}

export function Message({ message }: MessageProps) {
  // Extract citations from message parts or direct property
  const evidenceCitations = 
    message.evidenceCitations || 
    extractEvidenceCitations(message) || 
    []

  return (
    <div className="message-container">
      {message.role === "assistant" ? (
        <>
          <CitationMarkdown
            evidenceCitations={evidenceCitations}
            className="prose dark:prose-invert"
          >
            {message.content}
          </CitationMarkdown>
          
          {evidenceCitations.length > 0 && (
            <EvidenceReferencesSection 
              citations={evidenceCitations}
              className="mt-4"
            />
          )}
        </>
      ) : (
        <div>{message.content}</div>
      )}
    </div>
  )
}

function extractEvidenceCitations(message: MessageAISDK): EvidenceCitation[] {
  const parts = message.parts || []
  const metadataPart = parts.find(
    (p: any) => p.type === "metadata" && p.metadata?.evidenceCitations
  )
  return metadataPart?.metadata?.evidenceCitations || []
}
```

## Troubleshooting

### Citations Not Appearing

1. **Check enableEvidence flag**: Ensure `enableEvidence: true` in chat API request
2. **Check message parts**: Verify citations are in message.parts metadata
3. **Check console**: Look for `📚 [EVIDENCE]` logs
4. **Check sessionStorage**: Verify citations are stored correctly

### Citations Not Clickable

1. **Check z-index**: Ensure popups are above other elements
2. **Check touch events**: Verify onClick handlers are attached
3. **Check portal**: Ensure `createPortal` is working in mobile WebView

### Performance Issues

1. **Lazy load favicons**: Consider using a placeholder first
2. **Virtualize lists**: For long reference lists, consider react-window
3. **Cache citations**: Use IndexedDB for offline citation access

## RAG System Setup

### Database Schema

The RAG system uses the following tables (created by `migrate-citation-system.sql`):

1. **citation_documents** - Source documents (textbooks, journals, guidelines)
2. **citation_document_chunks** - Chunked text with exact page numbers
3. **response_citations** - Links chat messages to specific chunks
4. **citation_verifications** - Verification log for citations
5. **citation_source_metadata** - Additional metadata

### Key Tables

#### citation_documents
```sql
CREATE TABLE citation_documents (
  id UUID PRIMARY KEY,
  title TEXT NOT NULL,
  document_type TEXT NOT NULL, -- 'textbook', 'journal_article', 'guideline', etc.
  author TEXT,
  publisher TEXT,
  publication_date DATE,
  isbn TEXT,
  doi TEXT,
  journal_name TEXT,
  volume TEXT,
  issue TEXT,
  url TEXT,
  metadata JSONB,
  file_path TEXT,
  file_url TEXT,
  processing_status TEXT DEFAULT 'pending',
  chunk_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

#### citation_document_chunks
```sql
CREATE TABLE citation_document_chunks (
  id UUID PRIMARY KEY,
  document_id UUID REFERENCES citation_documents(id),
  chunk_text TEXT NOT NULL,
  page_number INTEGER NOT NULL,
  page_range TEXT, -- e.g., "245-247"
  chapter TEXT,
  section TEXT,
  paragraph_index INTEGER,
  chunk_index INTEGER NOT NULL,
  embedding VECTOR(1536), -- OpenAI text-embedding-3-large
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### RAG System Components

#### CitationRAGSystem (`lib/rag/citation-rag.ts`)

Main RAG system class:

```typescript
import { CitationRAGSystem } from '@/lib/rag'

const ragSystem = new CitationRAGSystem()

// Retrieve citations for a query
const citations = await ragSystem.retrieveCitations({
  query: "What is the treatment for hypertension?",
  maxResults: 10,
  minRelevanceScore: 0.7,
  documentTypes: ['textbook', 'guideline'],
})

// Build citation context for system prompt
const citationContext = ragSystem.buildCitationContext(citations)
const systemPrompt = ragSystem.buildCitationSystemPrompt(citations)

// Store citations linked to a message
await ragSystem.storeCitations(messageId, [
  {
    chunkId: citation.id,
    citationType: 'direct_quote',
    quoteText: 'exact quote',
    relevanceScore: 0.95
  }
])
```

#### Document Ingestion (`lib/rag/document-ingestion.ts`)

Pipeline for ingesting documents:

```typescript
import { DocumentIngestionPipeline } from '@/lib/rag/document-ingestion'

const pipeline = new DocumentIngestionPipeline()

const document = await pipeline.ingestDocument(
  pdfFile,
  {
    title: "Harrison's Principles of Internal Medicine",
    document_type: 'textbook',
    author: "Jameson et al.",
    publisher: "McGraw-Hill",
    publication_date: "2024",
    isbn: "978-1-260-47042-5",
  },
  filePath,
  fileUrl,
  openaiApiKey
)
```

#### Citation Verification (`lib/rag/citation-verifier.ts`)

Verifies citations in responses:

```typescript
import { CitationVerifier } from '@/lib/rag'

const verifier = new CitationVerifier()

// Verify citations in response
const verification = await verifier.verifyCitations(
  responseText,
  retrievedCitations
)

// Detect hallucinations
const hallucinationCheck = await verifier.detectHallucinations(
  responseText,
  retrievedCitations
)
```

### RAG Types

```typescript
// lib/rag/types.ts

export interface CitationChunk {
  id: string
  document_id: string
  chunk_text: string
  page_number: number
  page_range?: string
  chapter?: string
  section?: string
  paragraph_index?: number
  chunk_index: number
  embedding?: number[]
  metadata: Record<string, any>
  document?: CitationDocument
}

export interface CitationDocument {
  id: string
  title: string
  document_type: 'textbook' | 'journal_article' | 'guideline' | 'research_paper' | 'reference_book'
  author?: string
  publisher?: string
  publication_date?: string
  isbn?: string
  doi?: string
  journal_name?: string
  // ... more fields
}

export interface RAGQuery {
  query: string
  maxResults?: number
  minRelevanceScore?: number
  documentTypes?: DocumentType[]
  specialties?: string[]
  evidenceLevelFilter?: ('A' | 'B' | 'C' | 'D')[]
}
```

### RAG Integration Status

**Current Status**: 🚧 RAG system is built but not yet integrated into chat API

**Completed**:
- ✅ Database schema with citation tracking
- ✅ Core RAG system with vector search
- ✅ Citation verification system
- ✅ Hallucination detection
- ✅ Embedding generation utilities
- ✅ Document ingestion pipeline structure
- ✅ UI components support RAG format (`[CITATION:X]`)

**TODO**:
- [ ] PDF parsing implementation (need to add pdf-parse or pdf.js)
- [ ] Vector search optimization (create database function for pgvector)
- [ ] Integration with chat API route (`/app/api/chat/route.ts`)
- [ ] Enable RAG mode based on user preferences
- [ ] Batch embedding generation optimization

### When to Use Each System

- **Use Evidence System** (Current): For medical literature searches, PubMed articles, clinical studies
- **Use RAG System** (Future): For textbook citations, exact page references, structured medical guidelines

Both systems can potentially be used together - Evidence for literature search, RAG for textbook references.

## Additional Resources

### Evidence System
- Evidence types: `lib/evidence/types.ts`
- Evidence search: `lib/evidence/search.ts`
- Evidence synthesis: `lib/evidence/synthesis.ts`
- Chat API: `app/api/chat/route.ts`
- Evidence API: `app/api/evidence/route.ts`

### RAG System
- RAG types: `lib/rag/types.ts`
- Citation RAG: `lib/rag/citation-rag.ts`
- Document ingestion: `lib/rag/document-ingestion.ts`
- Citation verifier: `lib/rag/citation-verifier.ts`
- RAG README: `lib/rag/README.md`
- Database migration: `migrate-citation-system.sql`

### Shared UI Components
- Citation markdown: `app/components/chat/citation-markdown.tsx`
- References section: `app/components/chat/evidence-references-section.tsx`
- Citation pill: `app/components/chat/evidence-citation-pill.tsx`

## Mobile Optimizations (Future Enhancements)

1. **Bottom Sheet for Citations**: Replace popups with native bottom sheets on mobile
2. **Offline Citation Cache**: Store citations in IndexedDB for offline viewing
3. **Share Citations**: Add native share functionality for citations
4. **Citation Notifications**: Notify users when new citations are available
5. **Citation Favorites**: Allow users to save favorite citations
6. **RAG Integration**: Complete RAG system integration for textbook citations


# Citation RAG System

A robust clinical evidence retrieval system with exact page-level citations from textbooks and journals. Designed to compete with OpenEvidence by providing:

- **Exact page-level citations** - Every claim is traceable to specific pages
- **Multi-stage RAG** - Vector similarity search with reranking
- **Citation verification** - Automatic verification and hallucination detection
- **Traceability** - Full audit trail of sources

## Architecture

```
┌─────────────────────────────────────────┐
│   Document Ingestion Pipeline           │
│   - PDF parsing with page tracking      │
│   - Chunking with overlap               │
│   - Embedding generation                │
└─────────────────┬───────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────┐
│   Vector Database (Supabase + pgvector) │
│   - citation_documents                  │
│   - citation_document_chunks            │
│   - Embeddings stored as vectors        │
└─────────────────┬───────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────┐
│   Citation RAG System                   │
│   - Query embedding generation          │
│   - Vector similarity search            │
│   - Relevance filtering                 │
└─────────────────┬───────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────┐
│   Citation Verification                 │
│   - Citation marker extraction          │
│   - Quote verification                  │
│   - Hallucination detection             │
└─────────────────┬───────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────┐
│   Response Generation                   │
│   - Forced citation system prompt       │
│   - Citation-linked responses           │
│   - Source attribution                  │
└─────────────────────────────────────────┘
```

## Database Schema

### Tables

1. **citation_documents** - Source documents (textbooks, journals, guidelines)
2. **citation_document_chunks** - Chunked text with exact page numbers
3. **response_citations** - Links chat messages to specific chunks
4. **citation_verifications** - Verification log for citations
5. **citation_source_metadata** - Additional metadata

## Usage

### Basic RAG Query

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

// Get citation context for system prompt
const citationContext = ragSystem.buildCitationContext(citations)
const systemPrompt = ragSystem.buildCitationSystemPrompt(citations)
```

### Document Ingestion

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

### Citation Verification

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

## Implementation Status

### ✅ Completed

- [x] Database schema with citation tracking
- [x] RLS policies for secure access
- [x] Core RAG system with vector search
- [x] Citation verification system
- [x] Hallucination detection
- [x] Embedding generation utilities
- [x] Document ingestion pipeline structure

### 🚧 In Progress / TODO

- [ ] PDF parsing implementation (need to add pdf-parse or pdf.js)
- [ ] Vector search optimization (create database function for pgvector)
- [ ] Integration with chat API route
- [ ] Citation display UI components
- [ ] Batch embedding generation optimization
- [ ] Reranking with cross-encoder models

## Next Steps

1. **Add PDF parsing library**
   ```bash
   npm install pdf-parse
   # or
   npm install pdfjs-dist
   ```
   Then implement `extractPDFWithPages` in `document-ingestion.ts`

2. **Create database function for vector search**
   - More efficient than in-memory similarity calculation
   - Use pgvector's native operators

3. **Integrate with chat API**
   - Add citation RAG to `/app/api/chat/route.ts`
   - Enable citation mode based on user preferences

4. **Build citation UI components**
   - Inline citation markers
   - Expandable citation details
   - Source list sidebar

## Notes

- Embeddings use OpenAI `text-embedding-3-large` (1536 dimensions)
- Vector search currently uses in-memory similarity (can be optimized)
- PDF parsing is placeholder - needs implementation
- Citation verification uses text similarity (can be enhanced with embeddings)


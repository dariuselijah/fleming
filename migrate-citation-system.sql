-- Citation System Migration for Clinical Evidence RAG
-- Creates tables for tracking citations with exact page numbers from textbooks and journals

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "vector";

-- Documents table - stores all source documents (textbooks, journals, guidelines)
CREATE TABLE IF NOT EXISTS citation_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  document_type TEXT NOT NULL CHECK (document_type IN ('textbook', 'journal_article', 'guideline', 'research_paper', 'reference_book')),
  author TEXT,
  publisher TEXT,
  publication_date DATE,
  isbn TEXT,
  doi TEXT,
  journal_name TEXT,
  volume TEXT,
  issue TEXT,
  url TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  file_path TEXT,
  file_url TEXT,
  processing_status TEXT DEFAULT 'pending' CHECK (processing_status IN ('pending', 'processing', 'completed', 'failed')),
  chunk_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Document chunks with exact page tracking
-- Note: This extends the existing document_chunks table structure
CREATE TABLE IF NOT EXISTS citation_document_chunks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID NOT NULL REFERENCES citation_documents(id) ON DELETE CASCADE,
  chunk_text TEXT NOT NULL,
  page_number INTEGER NOT NULL,
  page_range TEXT, -- e.g., "245-247" if chunk spans multiple pages
  chapter TEXT,
  section TEXT,
  paragraph_index INTEGER,
  chunk_index INTEGER NOT NULL, -- order within document
  embedding VECTOR(1536), -- OpenAI text-embedding-3-large dimension
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Indexes for fast lookups
  CONSTRAINT citation_chunks_document_id_fkey FOREIGN KEY (document_id) REFERENCES citation_documents(id) ON DELETE CASCADE
);

-- Indexes for citation_document_chunks
CREATE INDEX IF NOT EXISTS idx_citation_chunks_document_page ON citation_document_chunks(document_id, page_number);
CREATE INDEX IF NOT EXISTS idx_citation_chunks_document_index ON citation_document_chunks(document_id, chunk_index);
CREATE INDEX IF NOT EXISTS idx_citation_chunks_embedding ON citation_document_chunks USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- Response citations table - links chat messages to specific chunks
CREATE TABLE IF NOT EXISTS response_citations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id INTEGER REFERENCES messages(id) ON DELETE CASCADE,
  chunk_id UUID NOT NULL REFERENCES citation_document_chunks(id) ON DELETE CASCADE,
  citation_type TEXT NOT NULL CHECK (citation_type IN ('direct_quote', 'paraphrase', 'reference', 'background')),
  quote_text TEXT, -- exact quote if direct
  relevance_score FLOAT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  
  CONSTRAINT response_citations_chunk_id_fkey FOREIGN KEY (chunk_id) REFERENCES citation_document_chunks(id) ON DELETE CASCADE
);

-- Indexes for response_citations
CREATE INDEX IF NOT EXISTS idx_response_citations_message ON response_citations(message_id);
CREATE INDEX IF NOT EXISTS idx_response_citations_chunk ON response_citations(chunk_id);

-- Citation verification log - tracks verification of citations
CREATE TABLE IF NOT EXISTS citation_verifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id INTEGER REFERENCES messages(id) ON DELETE CASCADE,
  chunk_id UUID NOT NULL REFERENCES citation_document_chunks(id) ON DELETE CASCADE,
  verified BOOLEAN DEFAULT false,
  verification_method TEXT CHECK (verification_method IN ('embedding_similarity', 'manual', 'llm_check', 'quote_match')),
  confidence_score FLOAT,
  notes TEXT,
  verified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  
  CONSTRAINT citation_verifications_chunk_id_fkey FOREIGN KEY (chunk_id) REFERENCES citation_document_chunks(id) ON DELETE CASCADE
);

-- Indexes for citation_verifications
CREATE INDEX IF NOT EXISTS idx_citation_verifications_message ON citation_verifications(message_id);
CREATE INDEX IF NOT EXISTS idx_citation_verifications_chunk ON citation_verifications(chunk_id);

-- Citation source metadata - stores additional metadata about sources
CREATE TABLE IF NOT EXISTS citation_source_metadata (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID NOT NULL REFERENCES citation_documents(id) ON DELETE CASCADE,
  key TEXT NOT NULL,
  value TEXT,
  value_json JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  
  CONSTRAINT citation_source_metadata_document_id_fkey FOREIGN KEY (document_id) REFERENCES citation_documents(id) ON DELETE CASCADE,
  UNIQUE(document_id, key)
);

-- Update trigger for citation_documents updated_at
CREATE OR REPLACE FUNCTION update_citation_documents_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER citation_documents_updated_at
  BEFORE UPDATE ON citation_documents
  FOR EACH ROW
  EXECUTE FUNCTION update_citation_documents_updated_at();

-- Function to update chunk_count when chunks are added/removed
CREATE OR REPLACE FUNCTION update_citation_document_chunk_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE citation_documents
    SET chunk_count = chunk_count + 1
    WHERE id = NEW.document_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE citation_documents
    SET chunk_count = GREATEST(0, chunk_count - 1)
    WHERE id = OLD.document_id;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER citation_chunks_count_insert
  AFTER INSERT ON citation_document_chunks
  FOR EACH ROW
  EXECUTE FUNCTION update_citation_document_chunk_count();

CREATE TRIGGER citation_chunks_count_delete
  AFTER DELETE ON citation_document_chunks
  FOR EACH ROW
  EXECUTE FUNCTION update_citation_document_chunk_count();

-- RLS Policies (Row Level Security)
ALTER TABLE citation_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE citation_document_chunks ENABLE ROW LEVEL SECURITY;
ALTER TABLE response_citations ENABLE ROW LEVEL SECURITY;
ALTER TABLE citation_verifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE citation_source_metadata ENABLE ROW LEVEL SECURITY;

-- Policy: Allow authenticated users to read all citation documents (public knowledge base)
CREATE POLICY "Allow authenticated users to read citation documents"
  ON citation_documents FOR SELECT
  TO authenticated
  USING (true);

-- Policy: Allow authenticated users to read all citation chunks
CREATE POLICY "Allow authenticated users to read citation chunks"
  ON citation_document_chunks FOR SELECT
  TO authenticated
  USING (true);

-- Policy: Allow authenticated users to read response citations
CREATE POLICY "Allow authenticated users to read response citations"
  ON response_citations FOR SELECT
  TO authenticated
  USING (true);

-- Policy: Allow authenticated users to read citation verifications
CREATE POLICY "Allow authenticated users to read citation verifications"
  ON citation_verifications FOR SELECT
  TO authenticated
  USING (true);

-- Policy: Allow authenticated users to read citation source metadata
CREATE POLICY "Allow authenticated users to read citation source metadata"
  ON citation_source_metadata FOR SELECT
  TO authenticated
  USING (true);

-- Admin-only: Allow service role to insert/update documents
CREATE POLICY "Allow service role to manage citation documents"
  ON citation_documents FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Allow service role to manage citation chunks"
  ON citation_document_chunks FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Allow service role to manage response citations"
  ON response_citations FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Allow service role to manage citation verifications"
  ON citation_verifications FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Allow service role to manage citation source metadata"
  ON citation_source_metadata FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

COMMENT ON TABLE citation_documents IS 'Source documents (textbooks, journals, guidelines) for clinical evidence';
COMMENT ON TABLE citation_document_chunks IS 'Chunked text from documents with exact page number tracking';
COMMENT ON TABLE response_citations IS 'Links chat messages to specific document chunks with citation metadata';
COMMENT ON TABLE citation_verifications IS 'Verification log for citation accuracy and traceability';
COMMENT ON TABLE citation_source_metadata IS 'Additional metadata for citation sources';


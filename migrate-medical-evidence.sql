-- Medical Evidence Table Migration
-- Creates the medical_evidence table with hybrid search (semantic + full-text)
-- and the hybrid_medical_search RPC function using Reciprocal Rank Fusion (RRF)

-- ============================================================
-- STEP 1: Enable Required Extensions
-- ============================================================

CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pg_trgm;  -- For fuzzy text matching

-- ============================================================
-- STEP 2: Create Medical Evidence Table
-- ============================================================

CREATE TABLE IF NOT EXISTS medical_evidence (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- ========== Core Content ==========
  content text NOT NULL,                     -- The chunk/snippet text
  content_with_context text,                 -- Content with medical context prefix
  pmid text,                                 -- PubMed ID for deduplication
  
  -- ========== Article Metadata ==========
  title text NOT NULL,                       -- Article title
  journal_name text NOT NULL,                -- Journal name (e.g., "The Lancet")
  journal_abbrev text,                       -- Journal abbreviation
  publication_year int,                      -- Year of publication
  doi text,                                  -- DOI link
  authors text[],                            -- Author names array
  
  -- ========== Evidence Grading (Oxford CEBM) ==========
  evidence_level int DEFAULT 5 CHECK (evidence_level BETWEEN 1 AND 5),
  -- 1 = Meta-analysis / Systematic Review
  -- 2 = Randomized Controlled Trial  
  -- 3 = Cohort / Case-Control Study
  -- 4 = Case Series / Case Report
  -- 5 = Expert Opinion / Narrative Review
  
  study_type text,                           -- e.g., "RCT", "Meta-Analysis", "Cohort Study"
  sample_size int,                           -- Study sample size (if extracted)
  
  -- ========== Medical Context (CRITICAL for retrieval) ==========
  mesh_terms text[],                         -- MeSH descriptor names
  major_mesh_terms text[],                   -- MeSH terms marked as major topics
  chemicals text[],                          -- Drug/chemical names
  keywords text[],                           -- Author keywords
  section_type text,                         -- 'background', 'methods', 'results', 'conclusions', etc.
  
  -- ========== Chunk Metadata ==========
  chunk_index int DEFAULT 0,                 -- Order within the article
  token_estimate int,                        -- Approximate token count
  
  -- ========== Vector Embedding ==========
  embedding vector(1536),                    -- OpenAI text-embedding-3-small dimension
  
  -- ========== Full-Text Search Vector ==========
  -- Weighted FTS: Title (A) > Content (B) > MeSH terms (C) > Keywords (D)
  -- NOTE: Using regular column + trigger instead of GENERATED ALWAYS AS
  -- because to_tsvector is not immutable in PostgreSQL
  fts tsvector,
  
  -- ========== Timestamps ==========
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  
  -- ========== Constraints ==========
  -- Note: Using coalesce to handle NULLs in unique constraint for PostgreSQL < 15 compatibility
  -- For PostgreSQL 15+, you could use: UNIQUE NULLS NOT DISTINCT (pmid, chunk_index)
  CONSTRAINT medical_evidence_pmid_chunk_unique UNIQUE (pmid, chunk_index)
);

-- ============================================================
-- STEP 3: Create Indexes for Fast Search
-- ============================================================

-- GIN index for full-text search
CREATE INDEX IF NOT EXISTS idx_medical_evidence_fts 
  ON medical_evidence USING GIN (fts);

-- Vector similarity index
-- NOTE: IVFFlat requires data to exist first. If this fails on empty table,
-- either: 1) Create index after loading data, or 2) Use HNSW index instead
-- 
-- Option A: IVFFlat (faster queries, requires data for training)
-- CREATE INDEX idx_medical_evidence_embedding 
--   ON medical_evidence USING ivfflat (embedding vector_cosine_ops) 
--   WITH (lists = 100);
--
-- Option B: HNSW (works on empty tables, slightly slower but more accurate)
CREATE INDEX IF NOT EXISTS idx_medical_evidence_embedding 
  ON medical_evidence USING hnsw (embedding vector_cosine_ops);

-- B-tree indexes for filtering
CREATE INDEX IF NOT EXISTS idx_medical_evidence_pmid 
  ON medical_evidence(pmid);

CREATE INDEX IF NOT EXISTS idx_medical_evidence_evidence_level 
  ON medical_evidence(evidence_level);

CREATE INDEX IF NOT EXISTS idx_medical_evidence_year 
  ON medical_evidence(publication_year DESC);

CREATE INDEX IF NOT EXISTS idx_medical_evidence_study_type 
  ON medical_evidence(study_type);

-- GIN indexes for array columns
CREATE INDEX IF NOT EXISTS idx_medical_evidence_mesh 
  ON medical_evidence USING GIN (mesh_terms);

CREATE INDEX IF NOT EXISTS idx_medical_evidence_major_mesh 
  ON medical_evidence USING GIN (major_mesh_terms);

CREATE INDEX IF NOT EXISTS idx_medical_evidence_chemicals 
  ON medical_evidence USING GIN (chemicals);

-- ============================================================
-- STEP 4: Create Hybrid Search RPC Function (Reciprocal Rank Fusion)
-- ============================================================

CREATE OR REPLACE FUNCTION hybrid_medical_search(
  query_text TEXT,
  query_embedding vector(1536),
  match_count INT DEFAULT 10,
  full_text_weight FLOAT DEFAULT 1.0,
  semantic_weight FLOAT DEFAULT 1.0,
  recency_weight FLOAT DEFAULT 0.1,
  evidence_boost FLOAT DEFAULT 0.2,
  min_evidence_level INT DEFAULT 5,
  filter_study_types TEXT[] DEFAULT NULL,
  filter_mesh_terms TEXT[] DEFAULT NULL,
  min_year INT DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  content text,
  content_with_context text,
  title text,
  journal_name text,
  publication_year int,
  doi text,
  authors text[],
  evidence_level int,
  study_type text,
  sample_size int,
  mesh_terms text[],
  major_mesh_terms text[],
  chemicals text[],
  section_type text,
  pmid text,
  score float
)
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  current_year INT := EXTRACT(YEAR FROM NOW())::INT;
  rrf_k INT := 60;  -- RRF constant (standard value)
BEGIN
  RETURN QUERY
  WITH 
  -- Step 1: Semantic search using vector similarity
  semantic_search AS (
    SELECT 
      me.id,
      RANK() OVER (ORDER BY me.embedding <=> query_embedding) AS rank,
      1 - (me.embedding <=> query_embedding) AS similarity
    FROM medical_evidence me
    WHERE me.embedding IS NOT NULL
      AND me.evidence_level <= min_evidence_level
      AND (filter_study_types IS NULL OR me.study_type = ANY(filter_study_types))
      AND (filter_mesh_terms IS NULL OR me.mesh_terms && filter_mesh_terms)
      AND (min_year IS NULL OR me.publication_year >= min_year)
    ORDER BY me.embedding <=> query_embedding
    LIMIT match_count * 3  -- Fetch more for RRF fusion
  ),
  
  -- Step 2: Full-text keyword search
  keyword_search AS (
    SELECT 
      me.id,
      RANK() OVER (ORDER BY ts_rank_cd(me.fts, websearch_to_tsquery('english', query_text)) DESC) AS rank,
      ts_rank_cd(me.fts, websearch_to_tsquery('english', query_text)) AS text_score
    FROM medical_evidence me
    WHERE me.fts @@ websearch_to_tsquery('english', query_text)
      AND me.evidence_level <= min_evidence_level
      AND (filter_study_types IS NULL OR me.study_type = ANY(filter_study_types))
      AND (filter_mesh_terms IS NULL OR me.mesh_terms && filter_mesh_terms)
      AND (min_year IS NULL OR me.publication_year >= min_year)
    ORDER BY ts_rank_cd(me.fts, websearch_to_tsquery('english', query_text)) DESC
    LIMIT match_count * 3
  ),
  
  -- Step 3: Reciprocal Rank Fusion
  combined AS (
    SELECT
      COALESCE(ss.id, ks.id) AS id,
      -- RRF formula: sum of 1/(k + rank) for each ranking
      COALESCE(semantic_weight / (rrf_k + COALESCE(ss.rank, 1000)), 0) +
      COALESCE(full_text_weight / (rrf_k + COALESCE(ks.rank, 1000)), 0) AS rrf_score,
      COALESCE(ss.similarity, 0) AS semantic_similarity,
      COALESCE(ks.text_score, 0) AS keyword_score
    FROM semantic_search ss
    FULL OUTER JOIN keyword_search ks ON ss.id = ks.id
  )
  
  -- Step 4: Final scoring with recency and evidence boosts
  SELECT 
    me.id,
    me.content,
    me.content_with_context,
    me.title,
    me.journal_name,
    me.publication_year,
    me.doi,
    me.authors,
    me.evidence_level,
    me.study_type,
    me.sample_size,
    me.mesh_terms,
    me.major_mesh_terms,
    me.chemicals,
    me.section_type,
    me.pmid,
    (
      c.rrf_score + 
      -- Recency boost: articles from last 3 years get up to recency_weight extra
      CASE 
        WHEN me.publication_year >= current_year - 3 
        THEN recency_weight * (1.0 - (current_year - me.publication_year)::float / 10.0)
        ELSE 0 
      END +
      -- Evidence level boost: higher evidence (lower number) gets more boost
      evidence_boost * (6 - me.evidence_level)::float / 5.0
    )::float AS score
  FROM combined c
  JOIN medical_evidence me ON c.id = me.id
  ORDER BY score DESC
  LIMIT match_count;
END;
$$;

-- ============================================================
-- STEP 5: Create Helper Functions
-- ============================================================

-- Function to search by exact MeSH term
CREATE OR REPLACE FUNCTION search_by_mesh(
  mesh_term TEXT,
  match_count INT DEFAULT 20
)
RETURNS TABLE (
  id uuid,
  title text,
  journal_name text,
  publication_year int,
  evidence_level int,
  study_type text
)
LANGUAGE sql
STABLE
AS $$
  SELECT 
    id, title, journal_name, publication_year, evidence_level, study_type
  FROM medical_evidence
  WHERE mesh_term = ANY(mesh_terms)
  ORDER BY 
    (mesh_term = ANY(major_mesh_terms)) DESC,  -- Major topics first
    evidence_level ASC,                         -- Better evidence first
    publication_year DESC                       -- Newer first
  LIMIT match_count;
$$;

-- Function to search by chemical/drug name
CREATE OR REPLACE FUNCTION search_by_drug(
  drug_name TEXT,
  match_count INT DEFAULT 20
)
RETURNS TABLE (
  id uuid,
  title text,
  journal_name text,
  publication_year int,
  evidence_level int,
  study_type text
)
LANGUAGE sql
STABLE
AS $$
  SELECT 
    id, title, journal_name, publication_year, evidence_level, study_type
  FROM medical_evidence
  WHERE drug_name ILIKE ANY(
    SELECT '%' || unnest(chemicals) || '%'
  )
  OR EXISTS (
    SELECT 1 FROM unnest(chemicals) AS chem
    WHERE chem ILIKE '%' || drug_name || '%'
  )
  ORDER BY 
    evidence_level ASC,
    publication_year DESC
  LIMIT match_count;
$$;

-- Function to get evidence summary for a topic
CREATE OR REPLACE FUNCTION get_evidence_summary(
  topic_query TEXT
)
RETURNS TABLE (
  evidence_level int,
  study_type text,
  article_count bigint,
  avg_year numeric
)
LANGUAGE sql
STABLE
AS $$
  SELECT 
    evidence_level,
    study_type,
    COUNT(*) as article_count,
    ROUND(AVG(publication_year), 0) as avg_year
  FROM medical_evidence
  WHERE fts @@ websearch_to_tsquery('english', topic_query)
  GROUP BY evidence_level, study_type
  ORDER BY evidence_level ASC, article_count DESC;
$$;

-- ============================================================
-- STEP 6: Create Update Trigger
-- ============================================================

CREATE OR REPLACE FUNCTION update_medical_evidence_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS medical_evidence_updated_at ON medical_evidence;
CREATE TRIGGER medical_evidence_updated_at
  BEFORE UPDATE ON medical_evidence
  FOR EACH ROW
  EXECUTE FUNCTION update_medical_evidence_updated_at();

-- ============================================================
-- STEP 6b: Create FTS Update Trigger
-- ============================================================
-- This trigger updates the fts column on INSERT and UPDATE
-- We use a trigger instead of GENERATED ALWAYS AS because
-- to_tsvector('english', ...) is not considered immutable

CREATE OR REPLACE FUNCTION update_medical_evidence_fts()
RETURNS TRIGGER AS $$
BEGIN
  NEW.fts := 
    setweight(to_tsvector('english', coalesce(NEW.title, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(NEW.content, '')), 'B') ||
    setweight(to_tsvector('english', coalesce(array_to_string(NEW.mesh_terms, ' '), '')), 'C') ||
    setweight(to_tsvector('english', coalesce(array_to_string(NEW.keywords, ' '), '')), 'D');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS medical_evidence_fts_update ON medical_evidence;
CREATE TRIGGER medical_evidence_fts_update
  BEFORE INSERT OR UPDATE ON medical_evidence
  FOR EACH ROW
  EXECUTE FUNCTION update_medical_evidence_fts();

-- ============================================================
-- STEP 7: Row Level Security (RLS)
-- ============================================================

ALTER TABLE medical_evidence ENABLE ROW LEVEL SECURITY;

-- Allow all authenticated users to read (public knowledge base)
CREATE POLICY "Allow authenticated users to read medical evidence"
  ON medical_evidence FOR SELECT
  TO authenticated
  USING (true);

-- Allow anon users to read (for guest access if needed)
CREATE POLICY "Allow anon users to read medical evidence"
  ON medical_evidence FOR SELECT
  TO anon
  USING (true);

-- Only service role can insert/update/delete
CREATE POLICY "Allow service role to manage medical evidence"
  ON medical_evidence FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ============================================================
-- STEP 8: Comments for Documentation
-- ============================================================

COMMENT ON TABLE medical_evidence IS 
  'Medical evidence chunks from PubMed articles with full metadata for hybrid RAG search';

COMMENT ON COLUMN medical_evidence.evidence_level IS 
  'Oxford CEBM evidence level: 1=Meta/SR, 2=RCT, 3=Observational, 4=Case, 5=Opinion';

COMMENT ON COLUMN medical_evidence.mesh_terms IS 
  'MeSH (Medical Subject Headings) descriptors for the source article';

COMMENT ON COLUMN medical_evidence.major_mesh_terms IS 
  'MeSH terms marked as major topics of the article';

COMMENT ON COLUMN medical_evidence.fts IS 
  'Weighted full-text search vector: Title(A) > Content(B) > MeSH(C) > Keywords(D)';

COMMENT ON FUNCTION hybrid_medical_search IS 
  'Hybrid search combining semantic vector similarity and full-text keyword search using Reciprocal Rank Fusion (RRF)';

-- ============================================================
-- STEP 9: Create View for Easy Querying
-- ============================================================

-- Simple summary view (won't fail on empty tables)
CREATE OR REPLACE VIEW medical_evidence_summary AS
SELECT
  COUNT(*) as total_chunks,
  COUNT(DISTINCT pmid) as total_articles,
  COUNT(DISTINCT journal_name) as total_journals,
  MIN(publication_year) as earliest_year,
  MAX(publication_year) as latest_year
FROM medical_evidence;

-- Detailed breakdown by evidence level
CREATE OR REPLACE VIEW medical_evidence_by_level AS
SELECT 
  evidence_level,
  COUNT(*) as chunk_count,
  COUNT(DISTINCT pmid) as article_count
FROM medical_evidence
GROUP BY evidence_level
ORDER BY evidence_level;

-- Detailed breakdown by study type
CREATE OR REPLACE VIEW medical_evidence_by_type AS
SELECT 
  COALESCE(study_type, 'Unknown') as study_type,
  COUNT(*) as chunk_count,
  COUNT(DISTINCT pmid) as article_count
FROM medical_evidence
GROUP BY study_type
ORDER BY article_count DESC;


-- Track when encounter RAG chunks were last rebuilt (avoid redundant full re-index).
ALTER TABLE public.clinical_encounters
  ADD COLUMN IF NOT EXISTS last_indexed_at timestamptz;

COMMENT ON COLUMN public.clinical_encounters.last_indexed_at IS 'When clinical_rag_chunks were last rebuilt for this encounter.';

-- Store plaintext chunk body for FTS; trigger fills tsvector (indexing boundary per product policy).

ALTER TABLE public.clinical_rag_chunks
  ADD COLUMN IF NOT EXISTS chunk_body text;

CREATE OR REPLACE FUNCTION public.clinical_rag_chunks_set_tsv()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.content_tsv := to_tsvector('english', coalesce(NEW.chunk_body, ''));
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_clinical_rag_tsv ON public.clinical_rag_chunks;
CREATE TRIGGER trg_clinical_rag_tsv
  BEFORE INSERT OR UPDATE OF chunk_body ON public.clinical_rag_chunks
  FOR EACH ROW
  EXECUTE FUNCTION public.clinical_rag_chunks_set_tsv();

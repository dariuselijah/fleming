-- Vector Quantization Migration
-- Adds a half-precision (float16) HNSW index alongside the existing float32 index.
-- halfvec cuts memory usage ~50 % with negligible recall loss for most workloads.
--
-- Requires pgvector >= 0.7.0 (Supabase supports this).
-- The original float32 index remains; drop it once the halfvec index is validated.

-- 1. Add halfvec HNSW index (cosine distance)
CREATE INDEX IF NOT EXISTS idx_medical_evidence_embedding_halfvec
  ON medical_evidence
  USING hnsw ((embedding::halfvec(1536)) halfvec_cosine_ops)
  WITH (m = 16, ef_construction = 128);

COMMENT ON INDEX idx_medical_evidence_embedding_halfvec IS
  'Half-precision HNSW cosine index – ~50 % less memory than float32, negligible recall loss.';

-- 2. (Optional) If you want to go further, consider binary quantization for a first-pass
-- coarse filter. This requires pgvector >= 0.8.0 and bit type support:
--
-- CREATE INDEX IF NOT EXISTS idx_medical_evidence_embedding_binary
--   ON medical_evidence
--   USING hnsw ((binary_quantize(embedding)::bit(1536)) bit_hamming_ops)
--   WITH (m = 16, ef_construction = 128);

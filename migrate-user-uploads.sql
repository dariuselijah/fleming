CREATE TABLE IF NOT EXISTS user_uploads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  file_name TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  file_size BIGINT NOT NULL,
  storage_bucket TEXT NOT NULL DEFAULT 'chat-attachments',
  original_file_path TEXT NOT NULL UNIQUE,
  upload_kind TEXT NOT NULL CHECK (
    upload_kind IN ('pdf', 'pptx', 'docx', 'image', 'text', 'other')
  ),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (
    status IN ('pending', 'processing', 'completed', 'failed')
  ),
  parser_version TEXT NOT NULL DEFAULT '2026-03-doc-image-v1',
  last_error TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  last_ingested_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS upload_ingestion_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  upload_id UUID NOT NULL REFERENCES user_uploads(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (
    status IN ('pending', 'processing', 'completed', 'failed')
  ),
  parser_version TEXT NOT NULL DEFAULT '2026-03-doc-image-v1',
  attempt_count INTEGER NOT NULL DEFAULT 0,
  retryable BOOLEAN NOT NULL DEFAULT true,
  error_message TEXT,
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS user_upload_source_units (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  upload_id UUID NOT NULL REFERENCES user_uploads(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  unit_type TEXT NOT NULL CHECK (
    unit_type IN ('page', 'slide', 'image', 'section')
  ),
  unit_number INTEGER NOT NULL,
  title TEXT,
  extracted_text TEXT NOT NULL DEFAULT '',
  preview_bucket TEXT,
  preview_path TEXT,
  preview_mime_type TEXT,
  width INTEGER,
  height INTEGER,
  ocr_status TEXT NOT NULL DEFAULT 'not_required' CHECK (
    ocr_status IN ('not_required', 'pending', 'completed', 'failed')
  ),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (upload_id, unit_type, unit_number)
);

CREATE TABLE IF NOT EXISTS user_upload_assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  upload_id UUID NOT NULL REFERENCES user_uploads(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  source_unit_id UUID REFERENCES user_upload_source_units(id) ON DELETE CASCADE,
  asset_type TEXT NOT NULL CHECK (
    asset_type IN ('figure', 'preview')
  ),
  label TEXT,
  caption TEXT,
  storage_bucket TEXT NOT NULL DEFAULT 'chat-attachments',
  file_path TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  width INTEGER,
  height INTEGER,
  sort_order INTEGER NOT NULL DEFAULT 0,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS user_upload_chunks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  upload_id UUID NOT NULL REFERENCES user_uploads(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  source_unit_id UUID NOT NULL REFERENCES user_upload_source_units(id) ON DELETE CASCADE,
  preview_asset_id UUID REFERENCES user_upload_assets(id) ON DELETE SET NULL,
  chunk_index INTEGER NOT NULL,
  chunk_text TEXT NOT NULL,
  source_offset_start INTEGER,
  source_offset_end INTEGER,
  embedding VECTOR(1536),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (upload_id, chunk_index)
);

CREATE TABLE IF NOT EXISTS user_upload_chunk_assets (
  chunk_id UUID NOT NULL REFERENCES user_upload_chunks(id) ON DELETE CASCADE,
  asset_id UUID NOT NULL REFERENCES user_upload_assets(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (chunk_id, asset_id)
);

CREATE INDEX IF NOT EXISTS idx_user_uploads_user_id_status
  ON user_uploads (user_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_upload_ingestion_jobs_upload_id
  ON upload_ingestion_jobs (upload_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_user_upload_source_units_upload_unit
  ON user_upload_source_units (upload_id, unit_type, unit_number);

CREATE INDEX IF NOT EXISTS idx_user_upload_assets_upload_type
  ON user_upload_assets (upload_id, asset_type, sort_order);

CREATE INDEX IF NOT EXISTS idx_user_upload_chunks_upload_source
  ON user_upload_chunks (upload_id, source_unit_id, chunk_index);

ALTER TABLE user_uploads ENABLE ROW LEVEL SECURITY;
ALTER TABLE upload_ingestion_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_upload_source_units ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_upload_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_upload_chunks ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_upload_chunk_assets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own uploads"
  ON user_uploads
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users manage own upload jobs"
  ON upload_ingestion_jobs
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users manage own upload source units"
  ON user_upload_source_units
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users manage own upload assets"
  ON user_upload_assets
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users manage own upload chunks"
  ON user_upload_chunks
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users manage own upload chunk assets"
  ON user_upload_chunk_assets
  FOR ALL
  USING (
    EXISTS (
      SELECT 1
      FROM user_upload_chunks chunks
      WHERE chunks.id = user_upload_chunk_assets.chunk_id
        AND chunks.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM user_upload_chunks chunks
      WHERE chunks.id = user_upload_chunk_assets.chunk_id
        AND chunks.user_id = auth.uid()
    )
  );

CREATE OR REPLACE FUNCTION update_user_upload_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_user_uploads_updated_at ON user_uploads;
CREATE TRIGGER trg_user_uploads_updated_at
BEFORE UPDATE ON user_uploads
FOR EACH ROW
EXECUTE FUNCTION update_user_upload_updated_at();

DROP TRIGGER IF EXISTS trg_upload_ingestion_jobs_updated_at ON upload_ingestion_jobs;
CREATE TRIGGER trg_upload_ingestion_jobs_updated_at
BEFORE UPDATE ON upload_ingestion_jobs
FOR EACH ROW
EXECUTE FUNCTION update_user_upload_updated_at();

DROP TRIGGER IF EXISTS trg_user_upload_source_units_updated_at ON user_upload_source_units;
CREATE TRIGGER trg_user_upload_source_units_updated_at
BEFORE UPDATE ON user_upload_source_units
FOR EACH ROW
EXECUTE FUNCTION update_user_upload_updated_at();

DROP TRIGGER IF EXISTS trg_user_upload_assets_updated_at ON user_upload_assets;
CREATE TRIGGER trg_user_upload_assets_updated_at
BEFORE UPDATE ON user_upload_assets
FOR EACH ROW
EXECUTE FUNCTION update_user_upload_updated_at();

DROP TRIGGER IF EXISTS trg_user_upload_chunks_updated_at ON user_upload_chunks;
CREATE TRIGGER trg_user_upload_chunks_updated_at
BEFORE UPDATE ON user_upload_chunks
FOR EACH ROW
EXECUTE FUNCTION update_user_upload_updated_at();

COMMENT ON TABLE user_uploads IS 'Durable user-owned documents and image uploads for private retrieval.';
COMMENT ON TABLE user_upload_source_units IS 'Normalized pages, slides, sections, and image units extracted from uploaded documents.';
COMMENT ON TABLE user_upload_assets IS 'Stored figure crops and page or slide preview assets linked to uploads.';
COMMENT ON TABLE user_upload_chunks IS 'Embeddable retrieval chunks for user uploads with source-unit provenance.';
COMMENT ON TABLE upload_ingestion_jobs IS 'Ingestion attempts and retry state for user-uploaded documents.';

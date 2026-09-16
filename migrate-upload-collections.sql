CREATE TABLE IF NOT EXISTS upload_collections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (
    status IN ('pending', 'uploading', 'processing', 'completed', 'partial', 'failed', 'archived')
  ),
  total_files INTEGER NOT NULL DEFAULT 0,
  completed_files INTEGER NOT NULL DEFAULT 0,
  failed_files INTEGER NOT NULL DEFAULT 0,
  processing_files INTEGER NOT NULL DEFAULT 0,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS upload_batch_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  collection_id UUID NOT NULL REFERENCES upload_collections(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (
    status IN ('pending', 'queued', 'processing', 'completed', 'partial', 'failed', 'cancelled')
  ),
  max_concurrency INTEGER NOT NULL DEFAULT 2 CHECK (max_concurrency >= 1 AND max_concurrency <= 8),
  total_files INTEGER NOT NULL DEFAULT 0,
  processed_files INTEGER NOT NULL DEFAULT 0,
  completed_files INTEGER NOT NULL DEFAULT 0,
  failed_files INTEGER NOT NULL DEFAULT 0,
  progress_percent INTEGER NOT NULL DEFAULT 0 CHECK (progress_percent >= 0 AND progress_percent <= 100),
  error_message TEXT,
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS upload_collection_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  collection_id UUID NOT NULL REFERENCES upload_collections(id) ON DELETE CASCADE,
  batch_job_id UUID REFERENCES upload_batch_jobs(id) ON DELETE SET NULL,
  upload_id UUID NOT NULL REFERENCES user_uploads(id) ON DELETE CASCADE,
  file_order INTEGER NOT NULL DEFAULT 0,
  ingest_state TEXT NOT NULL DEFAULT 'pending' CHECK (
    ingest_state IN ('pending', 'queued', 'processing', 'completed', 'failed')
  ),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (collection_id, upload_id)
);

CREATE INDEX IF NOT EXISTS idx_upload_collections_user_status
  ON upload_collections (user_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_upload_batch_jobs_collection_status
  ON upload_batch_jobs (collection_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_upload_collection_items_collection_order
  ON upload_collection_items (collection_id, file_order, created_at DESC);

ALTER TABLE upload_collections ENABLE ROW LEVEL SECURITY;
ALTER TABLE upload_batch_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE upload_collection_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own upload collections"
  ON upload_collections
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users manage own upload batch jobs"
  ON upload_batch_jobs
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users manage own collection items"
  ON upload_collection_items
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION update_upload_collections_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_upload_collections_updated_at ON upload_collections;
CREATE TRIGGER trg_upload_collections_updated_at
BEFORE UPDATE ON upload_collections
FOR EACH ROW
EXECUTE FUNCTION update_upload_collections_updated_at();

DROP TRIGGER IF EXISTS trg_upload_batch_jobs_updated_at ON upload_batch_jobs;
CREATE TRIGGER trg_upload_batch_jobs_updated_at
BEFORE UPDATE ON upload_batch_jobs
FOR EACH ROW
EXECUTE FUNCTION update_upload_collections_updated_at();

DROP TRIGGER IF EXISTS trg_upload_collection_items_updated_at ON upload_collection_items;
CREATE TRIGGER trg_upload_collection_items_updated_at
BEFORE UPDATE ON upload_collection_items
FOR EACH ROW
EXECUTE FUNCTION update_upload_collections_updated_at();

CREATE TABLE IF NOT EXISTS evidence_visual_assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id TEXT NOT NULL,
  pmid TEXT,
  pmcid TEXT,
  doi TEXT,
  article_url TEXT,
  source_page_url TEXT,
  figure_key TEXT NOT NULL,
  asset_type TEXT NOT NULL DEFAULT 'figure' CHECK (
    asset_type IN ('figure', 'preview')
  ),
  label TEXT,
  caption TEXT,
  license TEXT,
  storage_bucket TEXT NOT NULL DEFAULT 'chat-attachments',
  file_path TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  width INTEGER,
  height INTEGER,
  sort_order INTEGER NOT NULL DEFAULT 0,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (source_id, figure_key)
);

CREATE INDEX IF NOT EXISTS idx_evidence_visual_assets_source_id
  ON evidence_visual_assets (source_id, sort_order);

CREATE INDEX IF NOT EXISTS idx_evidence_visual_assets_pmcid
  ON evidence_visual_assets (pmcid);

CREATE OR REPLACE FUNCTION update_evidence_visual_assets_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_evidence_visual_assets_updated_at ON evidence_visual_assets;
CREATE TRIGGER trg_evidence_visual_assets_updated_at
BEFORE UPDATE ON evidence_visual_assets
FOR EACH ROW
EXECUTE FUNCTION update_evidence_visual_assets_updated_at();

COMMENT ON TABLE evidence_visual_assets IS 'Mirrored journal-native figure assets attached to evidence citations.';

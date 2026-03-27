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

CREATE TABLE IF NOT EXISTS student_study_graph_nodes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  upload_id UUID REFERENCES user_uploads(id) ON DELETE SET NULL,
  node_type TEXT NOT NULL CHECK (
    node_type IN ('topic', 'objective', 'deadline', 'weak_area', 'source_unit')
  ),
  label TEXT NOT NULL,
  description TEXT,
  source_unit_number INTEGER,
  deadline_at TIMESTAMPTZ,
  weak_score NUMERIC(4,2) NOT NULL DEFAULT 0,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS student_study_graph_edges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  from_node_id UUID NOT NULL REFERENCES student_study_graph_nodes(id) ON DELETE CASCADE,
  to_node_id UUID NOT NULL REFERENCES student_study_graph_nodes(id) ON DELETE CASCADE,
  edge_type TEXT NOT NULL CHECK (
    edge_type IN ('contains', 'supports', 'depends_on', 'scheduled_for', 'reinforces')
  ),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (from_node_id, to_node_id, edge_type)
);

CREATE TABLE IF NOT EXISTS student_study_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  timezone TEXT NOT NULL DEFAULT 'UTC',
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  generated_from_collection_id UUID REFERENCES upload_collections(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (
    status IN ('draft', 'active', 'completed', 'archived')
  ),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS student_study_plan_blocks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  plan_id UUID NOT NULL REFERENCES student_study_plans(id) ON DELETE CASCADE,
  graph_node_id UUID REFERENCES student_study_graph_nodes(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  description TEXT,
  block_type TEXT NOT NULL DEFAULT 'study' CHECK (
    block_type IN ('study', 'review', 'quiz', 'remediation', 'exam_prep')
  ),
  start_at TIMESTAMPTZ NOT NULL,
  end_at TIMESTAMPTZ NOT NULL,
  duration_minutes INTEGER NOT NULL DEFAULT 50,
  status TEXT NOT NULL DEFAULT 'scheduled' CHECK (
    status IN ('scheduled', 'completed', 'missed', 'cancelled')
  ),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS student_review_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  graph_node_id UUID REFERENCES student_study_graph_nodes(id) ON DELETE SET NULL,
  prompt TEXT NOT NULL,
  answer TEXT,
  topic_label TEXT,
  difficulty INTEGER NOT NULL DEFAULT 3 CHECK (difficulty BETWEEN 1 AND 5),
  repetition INTEGER NOT NULL DEFAULT 0,
  interval_days INTEGER NOT NULL DEFAULT 1,
  ease_factor NUMERIC(4,2) NOT NULL DEFAULT 2.5,
  error_streak INTEGER NOT NULL DEFAULT 0,
  last_seen_at TIMESTAMPTZ,
  next_review_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  status TEXT NOT NULL DEFAULT 'active' CHECK (
    status IN ('active', 'suspended', 'mastered')
  ),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS student_review_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  review_item_id UUID NOT NULL REFERENCES student_review_items(id) ON DELETE CASCADE,
  score INTEGER NOT NULL CHECK (score BETWEEN 0 AND 5),
  response_time_ms INTEGER,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS student_plugin_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  plugin_id TEXT NOT NULL,
  plugin_category TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'not_connected' CHECK (
    status IN ('not_connected', 'pending', 'connected', 'error', 'coming_soon')
  ),
  last_sync_at TIMESTAMPTZ,
  last_error TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, plugin_id)
);

CREATE TABLE IF NOT EXISTS student_plugin_sync_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  plugin_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (
    status IN ('pending', 'running', 'completed', 'failed')
  ),
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  error_message TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS student_lms_courses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  plugin_id TEXT NOT NULL,
  provider TEXT NOT NULL CHECK (provider IN ('canvas', 'moodle')),
  external_course_id TEXT NOT NULL,
  course_name TEXT NOT NULL,
  course_code TEXT,
  term_name TEXT,
  last_synced_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, plugin_id, external_course_id)
);

CREATE TABLE IF NOT EXISTS student_lms_artifacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  plugin_id TEXT NOT NULL,
  provider TEXT NOT NULL CHECK (provider IN ('canvas', 'moodle')),
  course_id TEXT NOT NULL,
  course_name TEXT NOT NULL,
  external_id TEXT NOT NULL,
  artifact_type TEXT NOT NULL,
  title TEXT NOT NULL,
  body_text TEXT NOT NULL DEFAULT '',
  due_at TIMESTAMPTZ,
  external_updated_at TIMESTAMPTZ,
  file_name TEXT,
  mime_type TEXT,
  file_url TEXT,
  content_hash TEXT,
  upload_id UUID REFERENCES user_uploads(id) ON DELETE SET NULL,
  synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, plugin_id, course_id, artifact_type, external_id)
);

CREATE INDEX IF NOT EXISTS idx_upload_collections_user_status
  ON upload_collections (user_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_upload_batch_jobs_collection_status
  ON upload_batch_jobs (collection_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_upload_collection_items_collection_order
  ON upload_collection_items (collection_id, file_order, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_study_graph_nodes_user_type
  ON student_study_graph_nodes (user_id, node_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_study_plan_blocks_plan_start
  ON student_study_plan_blocks (plan_id, start_at);
CREATE INDEX IF NOT EXISTS idx_review_items_due
  ON student_review_items (user_id, status, next_review_at);
CREATE INDEX IF NOT EXISTS idx_plugin_connections_user_status
  ON student_plugin_connections (user_id, status);
CREATE INDEX IF NOT EXISTS idx_lms_courses_user_plugin
  ON student_lms_courses (user_id, plugin_id, course_name);
CREATE INDEX IF NOT EXISTS idx_lms_artifacts_user_course
  ON student_lms_artifacts (user_id, course_id, synced_at DESC);
CREATE INDEX IF NOT EXISTS idx_lms_artifacts_upload_id
  ON student_lms_artifacts (upload_id);

ALTER TABLE upload_collections ENABLE ROW LEVEL SECURITY;
ALTER TABLE upload_batch_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE upload_collection_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE student_study_graph_nodes ENABLE ROW LEVEL SECURITY;
ALTER TABLE student_study_graph_edges ENABLE ROW LEVEL SECURITY;
ALTER TABLE student_study_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE student_study_plan_blocks ENABLE ROW LEVEL SECURITY;
ALTER TABLE student_review_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE student_review_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE student_plugin_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE student_plugin_sync_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE student_lms_courses ENABLE ROW LEVEL SECURITY;
ALTER TABLE student_lms_artifacts ENABLE ROW LEVEL SECURITY;

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

CREATE POLICY "Users manage own study graph nodes"
  ON student_study_graph_nodes
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users manage own study graph edges"
  ON student_study_graph_edges
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users manage own study plans"
  ON student_study_plans
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users manage own study plan blocks"
  ON student_study_plan_blocks
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users manage own review items"
  ON student_review_items
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users manage own review attempts"
  ON student_review_attempts
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users manage own plugin connections"
  ON student_plugin_connections
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users manage own plugin sync jobs"
  ON student_plugin_sync_jobs
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users manage own LMS courses"
  ON student_lms_courses
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users manage own LMS artifacts"
  ON student_lms_artifacts
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION update_student_workspace_updated_at()
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
EXECUTE FUNCTION update_student_workspace_updated_at();

DROP TRIGGER IF EXISTS trg_upload_batch_jobs_updated_at ON upload_batch_jobs;
CREATE TRIGGER trg_upload_batch_jobs_updated_at
BEFORE UPDATE ON upload_batch_jobs
FOR EACH ROW
EXECUTE FUNCTION update_student_workspace_updated_at();

DROP TRIGGER IF EXISTS trg_upload_collection_items_updated_at ON upload_collection_items;
CREATE TRIGGER trg_upload_collection_items_updated_at
BEFORE UPDATE ON upload_collection_items
FOR EACH ROW
EXECUTE FUNCTION update_student_workspace_updated_at();

DROP TRIGGER IF EXISTS trg_study_graph_nodes_updated_at ON student_study_graph_nodes;
CREATE TRIGGER trg_study_graph_nodes_updated_at
BEFORE UPDATE ON student_study_graph_nodes
FOR EACH ROW
EXECUTE FUNCTION update_student_workspace_updated_at();

DROP TRIGGER IF EXISTS trg_study_plans_updated_at ON student_study_plans;
CREATE TRIGGER trg_study_plans_updated_at
BEFORE UPDATE ON student_study_plans
FOR EACH ROW
EXECUTE FUNCTION update_student_workspace_updated_at();

DROP TRIGGER IF EXISTS trg_study_plan_blocks_updated_at ON student_study_plan_blocks;
CREATE TRIGGER trg_study_plan_blocks_updated_at
BEFORE UPDATE ON student_study_plan_blocks
FOR EACH ROW
EXECUTE FUNCTION update_student_workspace_updated_at();

DROP TRIGGER IF EXISTS trg_review_items_updated_at ON student_review_items;
CREATE TRIGGER trg_review_items_updated_at
BEFORE UPDATE ON student_review_items
FOR EACH ROW
EXECUTE FUNCTION update_student_workspace_updated_at();

DROP TRIGGER IF EXISTS trg_plugin_connections_updated_at ON student_plugin_connections;
CREATE TRIGGER trg_plugin_connections_updated_at
BEFORE UPDATE ON student_plugin_connections
FOR EACH ROW
EXECUTE FUNCTION update_student_workspace_updated_at();

DROP TRIGGER IF EXISTS trg_plugin_sync_jobs_updated_at ON student_plugin_sync_jobs;
CREATE TRIGGER trg_plugin_sync_jobs_updated_at
BEFORE UPDATE ON student_plugin_sync_jobs
FOR EACH ROW
EXECUTE FUNCTION update_student_workspace_updated_at();

DROP TRIGGER IF EXISTS trg_lms_courses_updated_at ON student_lms_courses;
CREATE TRIGGER trg_lms_courses_updated_at
BEFORE UPDATE ON student_lms_courses
FOR EACH ROW
EXECUTE FUNCTION update_student_workspace_updated_at();

DROP TRIGGER IF EXISTS trg_lms_artifacts_updated_at ON student_lms_artifacts;
CREATE TRIGGER trg_lms_artifacts_updated_at
BEFORE UPDATE ON student_lms_artifacts
FOR EACH ROW
EXECUTE FUNCTION update_student_workspace_updated_at();

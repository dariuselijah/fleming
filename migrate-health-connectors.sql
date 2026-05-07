-- Health connector foundation tables (wearables + medical records)

CREATE TABLE IF NOT EXISTS health_connector_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  connector_id TEXT NOT NULL,
  connector_category TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'not_connected',
  access_token TEXT,
  access_token_iv TEXT,
  refresh_token TEXT,
  refresh_token_iv TEXT,
  token_expires_at TIMESTAMP WITH TIME ZONE,
  scopes TEXT[] DEFAULT ARRAY[]::TEXT[],
  metadata JSONB DEFAULT '{}'::JSONB,
  last_sync_at TIMESTAMP WITH TIME ZONE,
  last_error TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE (user_id, connector_id)
);

CREATE TABLE IF NOT EXISTS health_connector_sync_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  connector_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  finished_at TIMESTAMP WITH TIME ZONE,
  result_summary JSONB DEFAULT '{}'::JSONB,
  error TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS health_connector_audit_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  connector_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  event_data JSONB DEFAULT '{}'::JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_health_connector_accounts_user_id
  ON health_connector_accounts(user_id);
CREATE INDEX IF NOT EXISTS idx_health_connector_accounts_connector_id
  ON health_connector_accounts(connector_id);
CREATE INDEX IF NOT EXISTS idx_health_connector_sync_jobs_user_id
  ON health_connector_sync_jobs(user_id);
CREATE INDEX IF NOT EXISTS idx_health_connector_sync_jobs_connector_id
  ON health_connector_sync_jobs(connector_id);
CREATE INDEX IF NOT EXISTS idx_health_connector_audit_events_user_id
  ON health_connector_audit_events(user_id);

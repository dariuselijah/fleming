-- Normalized health data tables for connector sync pipelines

CREATE TABLE IF NOT EXISTS health_metric_samples (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  connector_id TEXT NOT NULL,
  metric_type TEXT NOT NULL,
  value_numeric DOUBLE PRECISION,
  value_text TEXT,
  unit TEXT,
  observed_at TIMESTAMP WITH TIME ZONE NOT NULL,
  source TEXT,
  payload JSONB DEFAULT '{}'::JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE (user_id, connector_id, metric_type, observed_at, source)
);

CREATE TABLE IF NOT EXISTS health_clinical_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  connector_id TEXT NOT NULL,
  resource_type TEXT NOT NULL,
  resource_id TEXT NOT NULL,
  status TEXT,
  code TEXT,
  display TEXT,
  effective_at TIMESTAMP WITH TIME ZONE,
  payload JSONB DEFAULT '{}'::JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE (user_id, connector_id, resource_type, resource_id)
);

CREATE INDEX IF NOT EXISTS idx_health_metric_samples_user_observed
  ON health_metric_samples(user_id, observed_at DESC);
CREATE INDEX IF NOT EXISTS idx_health_metric_samples_connector
  ON health_metric_samples(connector_id, metric_type);
CREATE INDEX IF NOT EXISTS idx_health_clinical_records_user_updated
  ON health_clinical_records(user_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_health_clinical_records_connector
  ON health_clinical_records(connector_id, resource_type);

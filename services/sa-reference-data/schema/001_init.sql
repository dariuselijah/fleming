-- SA Health Codes — production Postgres schema (also mirrored in SQLite for local MVP)

CREATE TABLE IF NOT EXISTS ingest_batches (
  id TEXT PRIMARY KEY,
  source TEXT NOT NULL,
  dataset TEXT NOT NULL,
  filename TEXT,
  notes TEXT,
  row_count INTEGER NOT NULL DEFAULT 0,
  ingested_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS schemes (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  administrator TEXT,
  scheme_type TEXT,
  effective_from DATE NOT NULL DEFAULT '2026-01-01',
  effective_to DATE,
  ingest_batch_id TEXT REFERENCES ingest_batches(id),
  UNIQUE (code, effective_from)
);

CREATE TABLE IF NOT EXISTS plan_options (
  id TEXT PRIMARY KEY,
  scheme_code TEXT NOT NULL,
  option_code TEXT NOT NULL,
  plan_code TEXT,
  name TEXT NOT NULL,
  claim_type TEXT,
  option_type TEXT,
  mas_code TEXT,
  famcheck BOOLEAN NOT NULL DEFAULT FALSE,
  authcheck BOOLEAN NOT NULL DEFAULT FALSE,
  administrator TEXT,
  effective_from DATE NOT NULL DEFAULT '2026-01-01',
  effective_to DATE,
  ingest_batch_id TEXT REFERENCES ingest_batches(id),
  UNIQUE (option_code, claim_type, effective_from)
);

CREATE INDEX IF NOT EXISTS plan_options_scheme_idx ON plan_options (scheme_code);
CREATE INDEX IF NOT EXISTS plan_options_name_idx ON plan_options (name);

CREATE TABLE IF NOT EXISTS icd10_codes (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL,
  description TEXT NOT NULL,
  category TEXT,
  valid_for_morbidity BOOLEAN NOT NULL DEFAULT TRUE,
  asterisk BOOLEAN NOT NULL DEFAULT FALSE,
  dagger BOOLEAN NOT NULL DEFAULT FALSE,
  effective_from DATE NOT NULL DEFAULT '2021-03-16',
  effective_to DATE,
  ingest_batch_id TEXT REFERENCES ingest_batches(id),
  UNIQUE (code, effective_from)
);

CREATE INDEX IF NOT EXISTS icd10_codes_code_idx ON icd10_codes (code);
CREATE INDEX IF NOT EXISTS icd10_codes_desc_idx ON icd10_codes (description);

CREATE TABLE IF NOT EXISTS nappi_products (
  id TEXT PRIMARY KEY,
  nappi_code TEXT NOT NULL,
  name TEXT NOT NULL,
  full_description TEXT,
  strength TEXT,
  pack_size TEXT,
  manufacturer TEXT,
  product_class TEXT NOT NULL DEFAULT 'pharma',
  -- pharma | consumable | surgical
  atc_code TEXT,
  gmdn_code TEXT,
  effective_from DATE NOT NULL DEFAULT '2026-01-01',
  effective_to DATE,
  ingest_batch_id TEXT REFERENCES ingest_batches(id),
  UNIQUE (nappi_code, effective_from)
);

CREATE INDEX IF NOT EXISTS nappi_products_code_idx ON nappi_products (nappi_code);
CREATE INDEX IF NOT EXISTS nappi_products_name_idx ON nappi_products (name);

CREATE TABLE IF NOT EXISTS product_prices (
  id TEXT PRIMARY KEY,
  nappi_code TEXT NOT NULL,
  price_type TEXT NOT NULL DEFAULT 'sep',
  -- sep | list | max_nett
  amount_cents INTEGER NOT NULL,
  currency TEXT NOT NULL DEFAULT 'ZAR',
  vat_inclusive BOOLEAN NOT NULL DEFAULT TRUE,
  effective_from DATE NOT NULL,
  effective_to DATE,
  ingest_batch_id TEXT REFERENCES ingest_batches(id),
  UNIQUE (nappi_code, price_type, effective_from)
);

CREATE INDEX IF NOT EXISTS product_prices_nappi_idx ON product_prices (nappi_code);

CREATE TABLE IF NOT EXISTS tariff_rates (
  id TEXT PRIMARY KEY,
  year INTEGER NOT NULL,
  scheme_code TEXT,
  scheme_name TEXT,
  plan_option_code TEXT,
  discipline_code TEXT NOT NULL,
  tariff_code TEXT NOT NULL,
  description TEXT,
  network_flag TEXT NOT NULL DEFAULT 'any',
  -- network | non_network | any | contracted | non_contracted
  amount_cents INTEGER NOT NULL,
  currency TEXT NOT NULL DEFAULT 'ZAR',
  source_file_id TEXT,
  effective_from DATE NOT NULL,
  effective_to DATE,
  ingest_batch_id TEXT REFERENCES ingest_batches(id),
  UNIQUE (year, plan_option_code, discipline_code, tariff_code, network_flag, effective_from)
);

CREATE INDEX IF NOT EXISTS tariff_rates_lookup_idx
  ON tariff_rates (year, plan_option_code, discipline_code, tariff_code);

CREATE TABLE IF NOT EXISTS api_keys (
  id TEXT PRIMARY KEY,
  tenant_name TEXT NOT NULL,
  key_hash TEXT NOT NULL UNIQUE,
  key_prefix TEXT NOT NULL,
  quota_per_day INTEGER NOT NULL DEFAULT 100000,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

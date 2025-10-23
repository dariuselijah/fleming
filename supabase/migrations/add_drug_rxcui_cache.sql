-- Migration: Add drug RxCUI cache table
-- Purpose: Cache RxNorm RxCUI lookups to avoid repeated API calls
-- Date: 2025-10-23

-- Create drug_rxcui_cache table
CREATE TABLE IF NOT EXISTS public.drug_rxcui_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  drug_name TEXT NOT NULL,
  drug_name_normalized TEXT NOT NULL, -- Lowercase, trimmed for matching
  rxcui TEXT NOT NULL,
  source TEXT DEFAULT 'rxnorm', -- Source of the RxCUI (rxnorm, drugbank, etc.)
  last_verified_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for fast lookups
CREATE INDEX IF NOT EXISTS idx_drug_rxcui_cache_normalized
  ON public.drug_rxcui_cache(drug_name_normalized);

CREATE INDEX IF NOT EXISTS idx_drug_rxcui_cache_rxcui
  ON public.drug_rxcui_cache(rxcui);

CREATE INDEX IF NOT EXISTS idx_drug_rxcui_cache_last_verified
  ON public.drug_rxcui_cache(last_verified_at);

-- Create unique constraint to prevent duplicate entries
CREATE UNIQUE INDEX IF NOT EXISTS idx_drug_rxcui_cache_unique_name
  ON public.drug_rxcui_cache(drug_name_normalized, source);

-- Add comments for documentation
COMMENT ON TABLE public.drug_rxcui_cache IS 'Cache for RxNorm RxCUI lookups to reduce API calls';
COMMENT ON COLUMN public.drug_rxcui_cache.drug_name IS 'Original drug name as entered';
COMMENT ON COLUMN public.drug_rxcui_cache.drug_name_normalized IS 'Normalized (lowercase, trimmed) for matching';
COMMENT ON COLUMN public.drug_rxcui_cache.rxcui IS 'RxNorm Concept Unique Identifier';
COMMENT ON COLUMN public.drug_rxcui_cache.source IS 'API source (rxnorm, drugbank, etc.)';
COMMENT ON COLUMN public.drug_rxcui_cache.last_verified_at IS 'Last time RxCUI was verified with API';

-- Create function to automatically update updated_at timestamp
CREATE OR REPLACE FUNCTION update_drug_rxcui_cache_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to call the function
CREATE TRIGGER trigger_update_drug_rxcui_cache_updated_at
  BEFORE UPDATE ON public.drug_rxcui_cache
  FOR EACH ROW
  EXECUTE FUNCTION update_drug_rxcui_cache_updated_at();

-- Enable Row Level Security
ALTER TABLE public.drug_rxcui_cache ENABLE ROW LEVEL SECURITY;

-- Create policy: Everyone can read (drug lookups are not sensitive)
CREATE POLICY "Anyone can read drug RxCUI cache"
  ON public.drug_rxcui_cache
  FOR SELECT
  USING (true);

-- Create policy: Only authenticated users can insert
CREATE POLICY "Authenticated users can insert drug RxCUI cache"
  ON public.drug_rxcui_cache
  FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

-- Create policy: Only authenticated users can update
CREATE POLICY "Authenticated users can update drug RxCUI cache"
  ON public.drug_rxcui_cache
  FOR UPDATE
  USING (auth.role() = 'authenticated');

-- Seed with common medications for immediate availability
INSERT INTO public.drug_rxcui_cache (drug_name, drug_name_normalized, rxcui, source) VALUES
  ('Warfarin', 'warfarin', '11289', 'rxnorm'),
  ('Aspirin', 'aspirin', '1191', 'rxnorm'),
  ('Ibuprofen', 'ibuprofen', '5640', 'rxnorm'),
  ('Lisinopril', 'lisinopril', '29046', 'rxnorm'),
  ('Metformin', 'metformin', '6809', 'rxnorm'),
  ('Atorvastatin', 'atorvastatin', '83367', 'rxnorm'),
  ('Amlodipine', 'amlodipine', '17767', 'rxnorm'),
  ('Omeprazole', 'omeprazole', '7646', 'rxnorm'),
  ('Levothyroxine', 'levothyroxine', '10582', 'rxnorm'),
  ('Metoprolol', 'metoprolol', '6918', 'rxnorm'),
  ('Losartan', 'losartan', '52175', 'rxnorm'),
  ('Gabapentin', 'gabapentin', '25480', 'rxnorm'),
  ('Hydrochlorothiazide', 'hydrochlorothiazide', '5487', 'rxnorm'),
  ('Sertraline', 'sertraline', '36437', 'rxnorm'),
  ('Clopidogrel', 'clopidogrel', '32968', 'rxnorm'),
  ('Furosemide', 'furosemide', '4603', 'rxnorm'),
  ('Prednisone', 'prednisone', '8640', 'rxnorm'),
  ('Amoxicillin', 'amoxicillin', '723', 'rxnorm'),
  ('Albuterol', 'albuterol', '435', 'rxnorm'),
  ('Simvastatin', 'simvastatin', '36567', 'rxnorm')
ON CONFLICT (drug_name_normalized, source) DO NOTHING;

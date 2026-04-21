-- MediKredit switch integration: provider settings, eligibility audit trail, claim submissions.
-- Credentials for HTTPS Basic auth to MediKredit live in server env (MEDIKREDIT_*), not this table.

-- ---------------------------------------------------------------------------
-- Per-practice MediKredit / switch identifiers (BHF, HPC, prescriber account, etc.)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.medikredit_providers (
  practice_id uuid PRIMARY KEY REFERENCES public.practices (id) ON DELETE CASCADE,
  vendor_id text,
  bhf_number text,
  hpc_number text,
  group_practice_number text,
  pc_number text,
  works_number text,
  prescriber_mem_acc_nbr text,
  use_test_provider boolean NOT NULL DEFAULT false,
  extra_settings jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS medikredit_providers_bhf_idx
  ON public.medikredit_providers (bhf_number)
  WHERE bhf_number IS NOT NULL;

-- ---------------------------------------------------------------------------
-- Eligibility + family (famcheck) checks — persisted adjudication for audit / UI
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.eligibility_checks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  practice_id uuid NOT NULL REFERENCES public.practices (id) ON DELETE CASCADE,
  patient_id uuid NOT NULL REFERENCES public.practice_patients (id) ON DELETE CASCADE,
  check_type text NOT NULL CHECK (check_type IN ('eligibility', 'famcheck')),
  tx_nbr text,
  res text,
  response jsonb NOT NULL DEFAULT '{}',
  raw_xml text,
  created_by uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS eligibility_checks_practice_patient_idx
  ON public.eligibility_checks (practice_id, patient_id, created_at DESC);

-- ---------------------------------------------------------------------------
-- Claims submitted to MediKredit (adjudication JSON + optional raw XML)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.practice_claims (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  practice_id uuid NOT NULL REFERENCES public.practices (id) ON DELETE CASCADE,
  patient_id uuid NOT NULL REFERENCES public.practice_patients (id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'submitted', 'partial', 'rejected', 'approved', 'paid', 'reversed')),
  lines jsonb NOT NULL DEFAULT '[]',
  medikredit_response jsonb,
  submission_fingerprint text,
  tx_nbr text,
  orig_code text,
  raw_last_response_xml text,
  created_by uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS practice_claims_practice_patient_idx
  ON public.practice_claims (practice_id, patient_id, created_at DESC);

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

ALTER TABLE public.medikredit_providers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.eligibility_checks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.practice_claims ENABLE ROW LEVEL SECURITY;

CREATE POLICY medikredit_providers_member_select ON public.medikredit_providers
  FOR SELECT USING (public.is_practice_member(practice_id));
CREATE POLICY medikredit_providers_member_all ON public.medikredit_providers
  FOR ALL USING (public.is_practice_member(practice_id))
  WITH CHECK (public.is_practice_member(practice_id));

CREATE POLICY eligibility_checks_member_select ON public.eligibility_checks
  FOR SELECT USING (public.is_practice_member(practice_id));
CREATE POLICY eligibility_checks_member_insert ON public.eligibility_checks
  FOR INSERT WITH CHECK (public.is_practice_member(practice_id));

CREATE POLICY practice_claims_member_select ON public.practice_claims
  FOR SELECT USING (public.is_practice_member(practice_id));
CREATE POLICY practice_claims_member_all ON public.practice_claims
  FOR ALL USING (public.is_practice_member(practice_id))
  WITH CHECK (public.is_practice_member(practice_id));

-- Clinical workspace: practice-scoped E2EE payloads, admin entities, hybrid RAG, chat patient FK.
-- Requires: public.practices (existing), auth.users, vector extension.

CREATE EXTENSION IF NOT EXISTS vector;

-- ---------------------------------------------------------------------------
-- Core membership & crypto
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.practice_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  practice_id uuid NOT NULL REFERENCES public.practices (id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'physician'
    CHECK (role IN ('owner', 'physician', 'nurse', 'admin', 'reception')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (practice_id, user_id)
);

CREATE INDEX IF NOT EXISTS practice_members_user_id_idx ON public.practice_members (user_id);
CREATE INDEX IF NOT EXISTS practice_members_practice_id_idx ON public.practice_members (practice_id);

CREATE TABLE IF NOT EXISTS public.practice_crypto_wrappers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  practice_id uuid NOT NULL REFERENCES public.practices (id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  salt text NOT NULL,
  wrapped_dek text NOT NULL,
  iv text NOT NULL,
  key_version int NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (practice_id, user_id)
);

CREATE INDEX IF NOT EXISTS practice_crypto_wrappers_user_idx
  ON public.practice_crypto_wrappers (user_id);

CREATE TABLE IF NOT EXISTS public.practice_billing_settings (
  practice_id uuid PRIMARY KEY REFERENCES public.practices (id) ON DELETE CASCADE,
  provider_name text NOT NULL DEFAULT '',
  medprax_discipline_code text,
  billing_ciphertext text,
  billing_iv text,
  billing_version int NOT NULL DEFAULT 1,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- Reference: medical schemes
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.medical_schemes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL,
  name text NOT NULL,
  administrator text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (code)
);

CREATE INDEX IF NOT EXISTS medical_schemes_name_idx ON public.medical_schemes USING gin (to_tsvector('english', name));

-- ---------------------------------------------------------------------------
-- Patients & encounters (E2EE ciphertext)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.practice_patients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  practice_id uuid NOT NULL REFERENCES public.practices (id) ON DELETE CASCADE,
  profile_ciphertext text,
  profile_iv text,
  profile_version int NOT NULL DEFAULT 1,
  display_name_hint text,
  created_by uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS practice_patients_practice_updated_idx
  ON public.practice_patients (practice_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS public.clinical_encounters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  practice_id uuid NOT NULL REFERENCES public.practices (id) ON DELETE CASCADE,
  patient_id uuid NOT NULL REFERENCES public.practice_patients (id) ON DELETE CASCADE,
  provider_user_id uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'in_progress',
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  chat_id uuid REFERENCES public.chats (id) ON DELETE SET NULL,
  state_ciphertext text,
  state_iv text,
  state_version int NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS clinical_encounters_patient_idx
  ON public.clinical_encounters (practice_id, patient_id, updated_at DESC);

-- ---------------------------------------------------------------------------
-- Session vault: server-wrapped practice DEK for tool execution (short TTL)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.clinical_session_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  practice_id uuid NOT NULL REFERENCES public.practices (id) ON DELETE CASCADE,
  enc_dek text NOT NULL,
  dek_iv text NOT NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS clinical_session_keys_user_exp_idx
  ON public.clinical_session_keys (user_id, expires_at DESC);

-- ---------------------------------------------------------------------------
-- Staff directory (per practice; sensitive fields in ciphertext)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.practice_staff (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  practice_id uuid NOT NULL REFERENCES public.practices (id) ON DELETE CASCADE,
  linked_user_id uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  display_name text NOT NULL DEFAULT '',
  role text,
  credential_status text,
  email text,
  sensitive_ciphertext text,
  sensitive_iv text,
  sensitive_version int NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS practice_staff_practice_idx ON public.practice_staff (practice_id);

-- ---------------------------------------------------------------------------
-- Admin domain (normalized)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.practice_appointments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  practice_id uuid NOT NULL REFERENCES public.practices (id) ON DELETE CASCADE,
  patient_id uuid REFERENCES public.practice_patients (id) ON DELETE SET NULL,
  patient_name_snapshot text,
  provider_staff_id uuid REFERENCES public.practice_staff (id) ON DELETE SET NULL,
  appt_date date NOT NULL,
  start_time text NOT NULL,
  end_time text NOT NULL,
  hour_val int,
  minute_val int,
  duration_minutes int NOT NULL DEFAULT 30,
  reason text,
  service text,
  status text NOT NULL DEFAULT 'booked',
  payment_type text,
  medical_aid text,
  member_number text,
  notes text,
  icd_codes text[],
  total_fee numeric,
  linked_consult_id uuid,
  payload_ciphertext text,
  payload_iv text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS practice_appointments_practice_date_idx
  ON public.practice_appointments (practice_id, appt_date);

CREATE TABLE IF NOT EXISTS public.practice_claims (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  practice_id uuid NOT NULL REFERENCES public.practices (id) ON DELETE CASCADE,
  patient_id uuid REFERENCES public.practice_patients (id) ON DELETE SET NULL,
  patient_name_snapshot text,
  doctor_staff_id uuid REFERENCES public.practice_staff (id) ON DELETE SET NULL,
  session_document_id text,
  total_amount numeric NOT NULL DEFAULT 0,
  medical_aid_amount numeric NOT NULL DEFAULT 0,
  cash_amount numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'draft',
  rejection_reason text,
  payment_method text,
  payment_ref text,
  paid_at timestamptz,
  submitted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.practice_claim_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  claim_id uuid NOT NULL REFERENCES public.practice_claims (id) ON DELETE CASCADE,
  description text NOT NULL,
  icd_code text,
  tariff_code text,
  nappi_code text,
  quantity int,
  amount numeric NOT NULL,
  line_type text NOT NULL,
  status text NOT NULL DEFAULT 'draft'
);

CREATE INDEX IF NOT EXISTS practice_claims_practice_idx ON public.practice_claims (practice_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS public.practice_inventory_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  practice_id uuid NOT NULL REFERENCES public.practices (id) ON DELETE CASCADE,
  name text NOT NULL,
  nappi_code text,
  category text NOT NULL DEFAULT '',
  current_stock int NOT NULL DEFAULT 0,
  min_stock int NOT NULL DEFAULT 0,
  unit text NOT NULL DEFAULT '',
  unit_price numeric NOT NULL DEFAULT 0,
  cost_price numeric,
  supplier text,
  expires_at date,
  last_restocked date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS practice_inventory_practice_idx ON public.practice_inventory_items (practice_id);

CREATE TABLE IF NOT EXISTS public.practice_inbox_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  practice_id uuid NOT NULL REFERENCES public.practices (id) ON DELETE CASCADE,
  channel text NOT NULL,
  from_label text NOT NULL,
  preview text NOT NULL,
  read_flag boolean NOT NULL DEFAULT false,
  patient_id uuid REFERENCES public.practice_patients (id) ON DELETE SET NULL,
  message_at timestamptz NOT NULL DEFAULT now(),
  payload_ciphertext text,
  payload_iv text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS practice_inbox_practice_idx ON public.practice_inbox_messages (practice_id, message_at DESC);

CREATE TABLE IF NOT EXISTS public.practice_admin_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  practice_id uuid NOT NULL REFERENCES public.practices (id) ON DELETE CASCADE,
  type text NOT NULL,
  title text NOT NULL,
  detail text,
  read_flag boolean NOT NULL DEFAULT false,
  action_tab text,
  action_entity_id text,
  notif_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS practice_admin_notif_practice_idx
  ON public.practice_admin_notifications (practice_id, notif_at DESC);

CREATE TABLE IF NOT EXISTS public.practice_flow_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  practice_id uuid NOT NULL REFERENCES public.practices (id) ON DELETE CASCADE,
  patient_id uuid REFERENCES public.practice_patients (id) ON DELETE CASCADE,
  patient_name_snapshot text NOT NULL,
  status text NOT NULL,
  doctor_staff_id uuid REFERENCES public.practice_staff (id) ON DELETE SET NULL,
  room_number text,
  appointment_time timestamptz,
  check_in_time timestamptz,
  start_time timestamptz,
  end_time timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS practice_flow_practice_idx ON public.practice_flow_entries (practice_id, updated_at DESC);

-- ---------------------------------------------------------------------------
-- Hybrid RAG chunks (vectors + FTS; no long plaintext PHI column)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.clinical_rag_chunks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  practice_id uuid NOT NULL REFERENCES public.practices (id) ON DELETE CASCADE,
  patient_id uuid NOT NULL REFERENCES public.practice_patients (id) ON DELETE CASCADE,
  encounter_id uuid NOT NULL REFERENCES public.clinical_encounters (id) ON DELETE CASCADE,
  chunk_index int NOT NULL,
  source_type text NOT NULL,
  chunk_key text,
  embedding vector(1536),
  content_tsv tsvector,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (encounter_id, chunk_index)
);

CREATE INDEX IF NOT EXISTS clinical_rag_chunks_embedding_idx
  ON public.clinical_rag_chunks USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 128);

CREATE INDEX IF NOT EXISTS clinical_rag_chunks_tsv_idx
  ON public.clinical_rag_chunks USING gin (content_tsv);

CREATE INDEX IF NOT EXISTS clinical_rag_chunks_patient_idx
  ON public.clinical_rag_chunks (practice_id, patient_id);

-- ---------------------------------------------------------------------------
-- Chats.patient_id → uuid FK (null legacy non-UUID values)
-- ---------------------------------------------------------------------------

DO $chat_pid$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'chats'
      AND column_name = 'patient_id' AND data_type = 'text'
  ) THEN
    UPDATE public.chats SET patient_id = NULL
    WHERE patient_id IS NOT NULL
      AND patient_id::text !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$';
    UPDATE public.chats SET patient_id = NULL WHERE patient_id IS NOT NULL;
    ALTER TABLE public.chats
      ALTER COLUMN patient_id TYPE uuid USING patient_id::uuid;
  END IF;
END;
$chat_pid$;

ALTER TABLE public.chats
  DROP CONSTRAINT IF EXISTS chats_patient_id_fkey;

ALTER TABLE public.chats
  ADD CONSTRAINT chats_patient_id_fkey
  FOREIGN KEY (patient_id) REFERENCES public.practice_patients (id) ON DELETE SET NULL;

-- ---------------------------------------------------------------------------
-- RLS (DROP policies first for idempotent re-apply)
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS practice_members_select ON public.practice_members;
DROP POLICY IF EXISTS practice_members_insert ON public.practice_members;
DROP POLICY IF EXISTS practice_members_update ON public.practice_members;
DROP POLICY IF EXISTS practice_crypto_wrappers_all ON public.practice_crypto_wrappers;
DROP POLICY IF EXISTS practice_billing_select ON public.practice_billing_settings;
DROP POLICY IF EXISTS practice_billing_mutate ON public.practice_billing_settings;
DROP POLICY IF EXISTS practice_billing_update ON public.practice_billing_settings;
DROP POLICY IF EXISTS medical_schemes_read ON public.medical_schemes;
DROP POLICY IF EXISTS practice_patients_select ON public.practice_patients;
DROP POLICY IF EXISTS practice_patients_insert ON public.practice_patients;
DROP POLICY IF EXISTS practice_patients_update ON public.practice_patients;
DROP POLICY IF EXISTS practice_patients_delete ON public.practice_patients;
DROP POLICY IF EXISTS clinical_encounters_select ON public.clinical_encounters;
DROP POLICY IF EXISTS clinical_encounters_insert ON public.clinical_encounters;
DROP POLICY IF EXISTS clinical_encounters_update ON public.clinical_encounters;
DROP POLICY IF EXISTS clinical_encounters_delete ON public.clinical_encounters;
DROP POLICY IF EXISTS clinical_session_keys_all ON public.clinical_session_keys;
DROP POLICY IF EXISTS practice_staff_select ON public.practice_staff;
DROP POLICY IF EXISTS practice_staff_mutate ON public.practice_staff;
DROP POLICY IF EXISTS practice_appointments_all ON public.practice_appointments;
DROP POLICY IF EXISTS practice_claims_all ON public.practice_claims;
DROP POLICY IF EXISTS practice_claim_lines_all ON public.practice_claim_lines;
DROP POLICY IF EXISTS practice_inventory_all ON public.practice_inventory_items;
DROP POLICY IF EXISTS practice_inbox_all ON public.practice_inbox_messages;
DROP POLICY IF EXISTS practice_admin_notif_all ON public.practice_admin_notifications;
DROP POLICY IF EXISTS practice_flow_all ON public.practice_flow_entries;
DROP POLICY IF EXISTS clinical_rag_chunks_all ON public.clinical_rag_chunks;

ALTER TABLE public.practice_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.practice_crypto_wrappers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.practice_billing_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.medical_schemes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.practice_patients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clinical_encounters ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clinical_session_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.practice_staff ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.practice_appointments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.practice_claims ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.practice_claim_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.practice_inventory_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.practice_inbox_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.practice_admin_notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.practice_flow_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clinical_rag_chunks ENABLE ROW LEVEL SECURITY;

-- Helper: user is member of practice
CREATE OR REPLACE FUNCTION public.is_practice_member(p_practice_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.practice_members pm
    WHERE pm.practice_id = p_practice_id AND pm.user_id = auth.uid()
  );
$$;

REVOKE ALL ON FUNCTION public.is_practice_member(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_practice_member(uuid) TO authenticated;

-- practice_members
CREATE POLICY practice_members_select ON public.practice_members FOR SELECT
  USING (user_id = auth.uid() OR public.is_practice_member(practice_id));
CREATE POLICY practice_members_insert ON public.practice_members FOR INSERT
  WITH CHECK (user_id = auth.uid());
CREATE POLICY practice_members_update ON public.practice_members FOR UPDATE
  USING (user_id = auth.uid() OR public.is_practice_member(practice_id));

-- crypto wrappers: only own rows
CREATE POLICY practice_crypto_wrappers_all ON public.practice_crypto_wrappers FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- billing
CREATE POLICY practice_billing_select ON public.practice_billing_settings FOR SELECT
  USING (public.is_practice_member(practice_id));
CREATE POLICY practice_billing_mutate ON public.practice_billing_settings FOR INSERT
  WITH CHECK (public.is_practice_member(practice_id));
CREATE POLICY practice_billing_update ON public.practice_billing_settings FOR UPDATE
  USING (public.is_practice_member(practice_id));

-- schemes: any authenticated member of any practice (simplified: any auth user read)
CREATE POLICY medical_schemes_read ON public.medical_schemes FOR SELECT TO authenticated
  USING (true);

-- patients
CREATE POLICY practice_patients_select ON public.practice_patients FOR SELECT
  USING (public.is_practice_member(practice_id));
CREATE POLICY practice_patients_insert ON public.practice_patients FOR INSERT
  WITH CHECK (public.is_practice_member(practice_id));
CREATE POLICY practice_patients_update ON public.practice_patients FOR UPDATE
  USING (public.is_practice_member(practice_id));
CREATE POLICY practice_patients_delete ON public.practice_patients FOR DELETE
  USING (public.is_practice_member(practice_id));

-- encounters
CREATE POLICY clinical_encounters_select ON public.clinical_encounters FOR SELECT
  USING (public.is_practice_member(practice_id));
CREATE POLICY clinical_encounters_insert ON public.clinical_encounters FOR INSERT
  WITH CHECK (public.is_practice_member(practice_id));
CREATE POLICY clinical_encounters_update ON public.clinical_encounters FOR UPDATE
  USING (public.is_practice_member(practice_id));
CREATE POLICY clinical_encounters_delete ON public.clinical_encounters FOR DELETE
  USING (public.is_practice_member(practice_id));

-- session keys
CREATE POLICY clinical_session_keys_all ON public.clinical_session_keys FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- staff
CREATE POLICY practice_staff_select ON public.practice_staff FOR SELECT
  USING (public.is_practice_member(practice_id));
CREATE POLICY practice_staff_mutate ON public.practice_staff FOR ALL
  USING (public.is_practice_member(practice_id))
  WITH CHECK (public.is_practice_member(practice_id));

-- appointments
CREATE POLICY practice_appointments_all ON public.practice_appointments FOR ALL
  USING (public.is_practice_member(practice_id))
  WITH CHECK (public.is_practice_member(practice_id));

-- claims + lines
CREATE POLICY practice_claims_all ON public.practice_claims FOR ALL
  USING (public.is_practice_member(practice_id))
  WITH CHECK (public.is_practice_member(practice_id));
CREATE POLICY practice_claim_lines_all ON public.practice_claim_lines FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.practice_claims c
      WHERE c.id = claim_id AND public.is_practice_member(c.practice_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.practice_claims c
      WHERE c.id = claim_id AND public.is_practice_member(c.practice_id)
    )
  );

-- inventory
CREATE POLICY practice_inventory_all ON public.practice_inventory_items FOR ALL
  USING (public.is_practice_member(practice_id))
  WITH CHECK (public.is_practice_member(practice_id));

-- inbox
CREATE POLICY practice_inbox_all ON public.practice_inbox_messages FOR ALL
  USING (public.is_practice_member(practice_id))
  WITH CHECK (public.is_practice_member(practice_id));

-- notifications
CREATE POLICY practice_admin_notif_all ON public.practice_admin_notifications FOR ALL
  USING (public.is_practice_member(practice_id))
  WITH CHECK (public.is_practice_member(practice_id));

-- flow
CREATE POLICY practice_flow_all ON public.practice_flow_entries FOR ALL
  USING (public.is_practice_member(practice_id))
  WITH CHECK (public.is_practice_member(practice_id));

-- rag chunks
CREATE POLICY clinical_rag_chunks_all ON public.clinical_rag_chunks FOR ALL
  USING (public.is_practice_member(practice_id))
  WITH CHECK (public.is_practice_member(practice_id));

-- ---------------------------------------------------------------------------
-- Hybrid search RPC (RRF)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.hybrid_search_clinical_chunks(
  p_practice_id uuid,
  p_patient_id uuid,
  p_query_text text,
  p_query_embedding vector(1536),
  p_match_count int DEFAULT 12,
  p_encounter_id uuid DEFAULT NULL,
  p_source_types text[] DEFAULT NULL
)
RETURNS TABLE (
  chunk_id uuid,
  encounter_id uuid,
  chunk_index int,
  source_type text,
  chunk_key text,
  rrf_score float8,
  similarity float8,
  keyword_rank float8
)
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  rrf_k int := 60;
BEGIN
  PERFORM set_config('hnsw.ef_search', '100', true);

  RETURN QUERY
  WITH
  semantic AS (
    SELECT
      c.id AS cid,
      RANK() OVER (ORDER BY c.embedding <=> p_query_embedding) AS rnk,
      1::float8 - (c.embedding <=> p_query_embedding)::float8 AS sim
    FROM public.clinical_rag_chunks c
    WHERE c.practice_id = p_practice_id
      AND c.patient_id = p_patient_id
      AND c.embedding IS NOT NULL
      AND (p_encounter_id IS NULL OR c.encounter_id = p_encounter_id)
      AND (p_source_types IS NULL OR c.source_type = ANY (p_source_types))
    ORDER BY c.embedding <=> p_query_embedding
    LIMIT GREATEST(p_match_count * 3, 24)
  ),
  lexical AS (
    SELECT
      c.id AS cid,
      RANK() OVER (
        ORDER BY ts_rank_cd(c.content_tsv, websearch_to_tsquery('english', p_query_text)) DESC
      ) AS rnk,
      ts_rank_cd(c.content_tsv, websearch_to_tsquery('english', p_query_text))::float8 AS kw
    FROM public.clinical_rag_chunks c
    WHERE c.practice_id = p_practice_id
      AND c.patient_id = p_patient_id
      AND c.content_tsv @@ websearch_to_tsquery('english', p_query_text)
      AND (p_encounter_id IS NULL OR c.encounter_id = p_encounter_id)
      AND (p_source_types IS NULL OR c.source_type = ANY (p_source_types))
    ORDER BY ts_rank_cd(c.content_tsv, websearch_to_tsquery('english', p_query_text)) DESC
    LIMIT GREATEST(p_match_count * 3, 24)
  ),
  fused AS (
    SELECT
      COALESCE(s.cid, l.cid) AS cid,
      (COALESCE(1.0::float8 / (rrf_k + s.rnk), 0::float8)
        + COALESCE(1.0::float8 / (rrf_k + l.rnk), 0::float8)) AS score,
      COALESCE(s.sim, 0::float8) AS sim,
      COALESCE(l.kw, 0::float8) AS kw
    FROM semantic s
    FULL OUTER JOIN lexical l ON s.cid = l.cid
  )
  SELECT
    c.id,
    c.encounter_id,
    c.chunk_index,
    c.source_type,
    c.chunk_key,
    f.score,
    f.sim,
    f.kw
  FROM fused f
  JOIN public.clinical_rag_chunks c ON c.id = f.cid
  ORDER BY f.score DESC
  LIMIT p_match_count;
END;
$$;

REVOKE ALL ON FUNCTION public.hybrid_search_clinical_chunks(uuid, uuid, text, vector, int, uuid, text[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.hybrid_search_clinical_chunks(uuid, uuid, text, vector, int, uuid, text[]) TO authenticated;

-- Seed a few schemes (idempotent)
INSERT INTO public.medical_schemes (code, name, administrator)
VALUES
  ('DISC', 'Discovery Health', 'Discovery'),
  ('BONI', 'Bonitas', 'Bonitas'),
  ('MOM', 'Momentum Health', 'Momentum'),
  ('GEMS', 'GEMS', 'GEMS')
ON CONFLICT (code) DO NOTHING;

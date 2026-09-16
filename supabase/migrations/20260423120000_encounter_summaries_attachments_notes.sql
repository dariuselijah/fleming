-- AI visit summaries, patient file attachments, quick notes; storage bucket for attachments.

-- ---------------------------------------------------------------------------
-- 1. Encounter summaries (plaintext summary generated after signed consult)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.practice_encounter_summaries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  practice_id uuid NOT NULL REFERENCES public.practices (id) ON DELETE CASCADE,
  patient_id uuid NOT NULL REFERENCES public.practice_patients (id) ON DELETE CASCADE,
  encounter_id uuid NOT NULL REFERENCES public.clinical_encounters (id) ON DELETE CASCADE,
  summary_text text NOT NULL,
  key_findings jsonb NOT NULL DEFAULT '[]'::jsonb,
  follow_up text,
  model text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (encounter_id) 
);

CREATE INDEX IF NOT EXISTS practice_encounter_summaries_patient_idx
  ON public.practice_encounter_summaries (practice_id, patient_id, created_at DESC);

ALTER TABLE public.practice_encounter_summaries ENABLE ROW LEVEL SECURITY;

CREATE POLICY practice_encounter_summaries_member ON public.practice_encounter_summaries FOR ALL
  USING (public.is_practice_member(practice_id))
  WITH CHECK (public.is_practice_member(practice_id));

CREATE POLICY practice_encounter_summaries_service ON public.practice_encounter_summaries FOR ALL
  TO service_role USING (true) WITH CHECK (true);

-- ---------------------------------------------------------------------------
-- 2. Patient attachments (metadata; file bytes in storage bucket)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.patient_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  practice_id uuid NOT NULL REFERENCES public.practices (id) ON DELETE CASCADE,
  patient_id uuid NOT NULL REFERENCES public.practice_patients (id) ON DELETE CASCADE,
  uploader_user_id uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  storage_path text NOT NULL,
  mime text NOT NULL DEFAULT 'application/octet-stream',
  size_bytes bigint NOT NULL DEFAULT 0,
  description text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS patient_attachments_patient_idx
  ON public.patient_attachments (practice_id, patient_id, created_at DESC);

ALTER TABLE public.patient_attachments ENABLE ROW LEVEL SECURITY;

CREATE POLICY patient_attachments_member ON public.patient_attachments FOR ALL
  USING (public.is_practice_member(practice_id))
  WITH CHECK (public.is_practice_member(practice_id));

CREATE POLICY patient_attachments_service ON public.patient_attachments FOR ALL
  TO service_role USING (true) WITH CHECK (true);

-- ---------------------------------------------------------------------------
-- 3. Quick patient notes (assistant / staff)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.patient_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  practice_id uuid NOT NULL REFERENCES public.practices (id) ON DELETE CASCADE,
  patient_id uuid NOT NULL REFERENCES public.practice_patients (id) ON DELETE CASCADE,
  author_user_id uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  body text NOT NULL,
  tags text[] NOT NULL DEFAULT '{}',
  source text NOT NULL DEFAULT 'assistant' CHECK (source IN ('assistant', 'staff', 'system')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS patient_notes_patient_idx
  ON public.patient_notes (practice_id, patient_id, created_at DESC);

ALTER TABLE public.patient_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY patient_notes_member ON public.patient_notes FOR ALL
  USING (public.is_practice_member(practice_id))
  WITH CHECK (public.is_practice_member(practice_id));

CREATE POLICY patient_notes_service ON public.patient_notes FOR ALL
  TO service_role USING (true) WITH CHECK (true);

-- ---------------------------------------------------------------------------
-- 4. Storage bucket (private; signed URLs in app)
-- ---------------------------------------------------------------------------

INSERT INTO storage.buckets (id, name, public)
VALUES ('patient-attachments', 'patient-attachments', false)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS patient_attachments_storage_insert ON storage.objects;
DROP POLICY IF EXISTS patient_attachments_storage_select ON storage.objects;
DROP POLICY IF EXISTS patient_attachments_storage_delete ON storage.objects;

-- Authenticated users can upload/read/delete in bucket (paths scoped by API to practice/patient)
CREATE POLICY patient_attachments_storage_insert ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'patient-attachments');

CREATE POLICY patient_attachments_storage_select ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'patient-attachments');

CREATE POLICY patient_attachments_storage_delete ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'patient-attachments');

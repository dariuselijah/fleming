-- Link clinical encounters and AI summaries to appointments; longitudinal chart facts for patient sidebar.

-- ---------------------------------------------------------------------------
-- 1. Encounter ↔ appointment (optional FK)
-- ---------------------------------------------------------------------------

ALTER TABLE public.clinical_encounters
  ADD COLUMN IF NOT EXISTS appointment_id uuid REFERENCES public.practice_appointments (id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS clinical_encounters_appointment_idx
  ON public.clinical_encounters (practice_id, appointment_id)
  WHERE appointment_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 2. AI summary ↔ appointment (denormalized for fast patient panel reads)
-- ---------------------------------------------------------------------------

ALTER TABLE public.practice_encounter_summaries
  ADD COLUMN IF NOT EXISTS appointment_id uuid REFERENCES public.practice_appointments (id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS practice_encounter_summaries_appt_idx
  ON public.practice_encounter_summaries (practice_id, appointment_id)
  WHERE appointment_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 3. Promoted chart facts (longitudinal, encounter-sourced)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.patient_chart_facts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  practice_id uuid NOT NULL REFERENCES public.practices (id) ON DELETE CASCADE,
  patient_id uuid NOT NULL REFERENCES public.practice_patients (id) ON DELETE CASCADE,
  encounter_id uuid REFERENCES public.clinical_encounters (id) ON DELETE CASCADE,
  domain text NOT NULL
    CHECK (domain IN (
      'chief_complaint',
      'finding',
      'problem',
      'medication',
      'procedure',
      'referral',
      'lab',
      'imaging',
      'follow_up',
      'immunization',
      'family_history',
      'social_history',
      'vital',
      'note'
    )),
  summary text NOT NULL,
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS patient_chart_facts_patient_idx
  ON public.patient_chart_facts (practice_id, patient_id, created_at DESC);

CREATE INDEX IF NOT EXISTS patient_chart_facts_encounter_idx
  ON public.patient_chart_facts (encounter_id)
  WHERE encounter_id IS NOT NULL;

ALTER TABLE public.patient_chart_facts ENABLE ROW LEVEL SECURITY;

CREATE POLICY patient_chart_facts_member ON public.patient_chart_facts FOR ALL
  USING (public.is_practice_member(practice_id))
  WITH CHECK (public.is_practice_member(practice_id));

CREATE POLICY patient_chart_facts_service ON public.patient_chart_facts FOR ALL
  TO service_role USING (true) WITH CHECK (true);

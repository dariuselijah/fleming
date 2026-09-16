-- Standalone: patient_chart_facts table + RLS (idempotent).
-- Fixes PostgREST "[promote-chart-facts] Could not find the table 'public.patient_chart_facts' in the schema cache"
-- when migration 20260427120000 was not applied remotely.

CREATE TABLE IF NOT EXISTS public.patient_chart_facts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  practice_id uuid NOT NULL REFERENCES public.practices (id) ON DELETE CASCADE,
  patient_id uuid NOT NULL REFERENCES public.practice_patients (id) ON DELETE CASCADE,
  encounter_id uuid REFERENCES public.clinical_encounters (id) ON DELETE CASCADE,
  domain text NOT NULL
    CHECK (
      domain IN (
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
      )
    ),
  summary text NOT NULL,
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS patient_chart_facts_patient_idx ON public.patient_chart_facts (
  practice_id,
  patient_id,
  created_at DESC
);

CREATE INDEX IF NOT EXISTS patient_chart_facts_encounter_idx ON public.patient_chart_facts (encounter_id)
WHERE encounter_id IS NOT NULL;

ALTER TABLE public.patient_chart_facts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS patient_chart_facts_member ON public.patient_chart_facts;
CREATE POLICY patient_chart_facts_member ON public.patient_chart_facts FOR ALL USING (public.is_practice_member(practice_id))
WITH CHECK (public.is_practice_member(practice_id));

DROP POLICY IF EXISTS patient_chart_facts_service ON public.patient_chart_facts;
CREATE POLICY patient_chart_facts_service ON public.patient_chart_facts FOR ALL TO service_role USING (true)
WITH CHECK (true);

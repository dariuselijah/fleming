-- Chief complaint from signed encounter summaries (prefill next appointment reason / AI context).

ALTER TABLE public.practice_encounter_summaries
  ADD COLUMN IF NOT EXISTS chief_complaint text;

-- Link voice_calls to practice appointment when outcome/tool resolves an id.
ALTER TABLE public.voice_calls
  ADD COLUMN IF NOT EXISTS appointment_id uuid REFERENCES public.practice_appointments (id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS voice_calls_appointment_id_idx
  ON public.voice_calls (appointment_id)
  WHERE appointment_id IS NOT NULL;

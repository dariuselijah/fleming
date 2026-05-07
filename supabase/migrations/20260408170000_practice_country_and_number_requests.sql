-- Add country_code to practices for country-aware number provisioning
ALTER TABLE public.practices
  ADD COLUMN IF NOT EXISTS country_code text NOT NULL DEFAULT 'ZA';

-- Number request queue: when Twilio inventory is empty for a country,
-- admins can request a number and platform ops fulfils it.
CREATE TABLE IF NOT EXISTS public.number_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  practice_id uuid NOT NULL REFERENCES public.practices (id) ON DELETE CASCADE,
  country_code text NOT NULL,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'fulfilled', 'cancelled')),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS number_requests_practice_idx
  ON public.number_requests (practice_id);

CREATE INDEX IF NOT EXISTS number_requests_pending_idx
  ON public.number_requests (status)
  WHERE status = 'pending';

ALTER TABLE public.number_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY number_requests_owner ON public.number_requests FOR ALL
  USING (practice_id IN (
    SELECT practice_id FROM public.practice_members
    WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
  ));

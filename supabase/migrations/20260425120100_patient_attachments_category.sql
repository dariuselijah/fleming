-- Optional attachment taxonomy for assistant / manual uploads
ALTER TABLE public.patient_attachments
  ADD COLUMN IF NOT EXISTS category text;

ALTER TABLE public.patient_attachments
  DROP CONSTRAINT IF EXISTS patient_attachments_category_check;

ALTER TABLE public.patient_attachments
  ADD CONSTRAINT patient_attachments_category_check
  CHECK (category IS NULL OR category IN ('lab', 'id', 'referral', 'script', 'other'));

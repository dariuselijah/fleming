-- Adds lecture video support to upload_kind checks.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'user_uploads'
  ) THEN
    ALTER TABLE public.user_uploads
      DROP CONSTRAINT IF EXISTS user_uploads_upload_kind_check;

    ALTER TABLE public.user_uploads
      ADD CONSTRAINT user_uploads_upload_kind_check
      CHECK (upload_kind IN ('pdf', 'pptx', 'docx', 'image', 'text', 'video', 'other'));
  END IF;
END $$;

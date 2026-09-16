-- Security hardening for practice membership, clinical session keys, and
-- patient attachment storage. This migration is intentionally additive.

CREATE SCHEMA IF NOT EXISTS app_private;
REVOKE ALL ON SCHEMA app_private FROM PUBLIC;
GRANT USAGE ON SCHEMA app_private TO authenticated;

CREATE OR REPLACE FUNCTION app_private.has_practice_role(
  p_practice_id uuid,
  p_roles text[]
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.practice_members pm
    WHERE pm.practice_id = p_practice_id
      AND pm.user_id = (SELECT auth.uid())
      AND pm.role = ANY (p_roles)
  );
$$;

REVOKE ALL ON FUNCTION app_private.has_practice_role(uuid, text[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_private.has_practice_role(uuid, text[]) TO authenticated;

-- Stop users from inserting their own arbitrary membership or changing their
-- own role. Owners may manage all roles; admins may only manage non-privileged
-- staff memberships.
DROP POLICY IF EXISTS practice_members_insert ON public.practice_members;
DROP POLICY IF EXISTS practice_members_update ON public.practice_members;
DROP POLICY IF EXISTS practice_members_delete ON public.practice_members;

CREATE POLICY practice_members_insert
ON public.practice_members
FOR INSERT
TO authenticated
WITH CHECK (
  app_private.has_practice_role(practice_id, ARRAY['owner'])
  OR (
    role NOT IN ('owner', 'admin')
    AND app_private.has_practice_role(practice_id, ARRAY['admin'])
  )
);

CREATE POLICY practice_members_update
ON public.practice_members
FOR UPDATE
TO authenticated
USING (
  app_private.has_practice_role(practice_id, ARRAY['owner'])
  OR (
    role NOT IN ('owner', 'admin')
    AND app_private.has_practice_role(practice_id, ARRAY['admin'])
  )
)
WITH CHECK (
  app_private.has_practice_role(practice_id, ARRAY['owner'])
  OR (
    role NOT IN ('owner', 'admin')
    AND app_private.has_practice_role(practice_id, ARRAY['admin'])
  )
);

CREATE POLICY practice_members_delete
ON public.practice_members
FOR DELETE
TO authenticated
USING (
  app_private.has_practice_role(practice_id, ARRAY['owner'])
  OR (
    role NOT IN ('owner', 'admin')
    AND app_private.has_practice_role(practice_id, ARRAY['admin'])
  )
);

-- Session keys are only usable by the owning user while they remain a member
-- of the referenced practice.
DROP POLICY IF EXISTS clinical_session_keys_all ON public.clinical_session_keys;
CREATE POLICY clinical_session_keys_all
ON public.clinical_session_keys
FOR ALL
TO authenticated
USING (
  user_id = (SELECT auth.uid())
  AND public.is_practice_member(practice_id)
)
WITH CHECK (
  user_id = (SELECT auth.uid())
  AND public.is_practice_member(practice_id)
);

-- Attachment object paths are:
--   <practice_id>/<patient_id>/<opaque-file-name>
-- Authorize both the practice membership and patient/practice relationship.
DROP POLICY IF EXISTS patient_attachments_storage_insert ON storage.objects;
DROP POLICY IF EXISTS patient_attachments_storage_select ON storage.objects;
DROP POLICY IF EXISTS patient_attachments_storage_update ON storage.objects;
DROP POLICY IF EXISTS patient_attachments_storage_delete ON storage.objects;

CREATE POLICY patient_attachments_storage_insert
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'patient-attachments'
  AND EXISTS (
    SELECT 1
    FROM public.practice_members pm
    WHERE pm.practice_id::text = (storage.foldername(name))[1]
      AND pm.user_id = (SELECT auth.uid())
  )
  AND EXISTS (
    SELECT 1
    FROM public.practice_patients pp
    WHERE pp.practice_id::text = (storage.foldername(name))[1]
      AND pp.id::text = (storage.foldername(name))[2]
  )
);

CREATE POLICY patient_attachments_storage_select
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'patient-attachments'
  AND EXISTS (
    SELECT 1
    FROM public.practice_members pm
    WHERE pm.practice_id::text = (storage.foldername(name))[1]
      AND pm.user_id = (SELECT auth.uid())
  )
);

CREATE POLICY patient_attachments_storage_update
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'patient-attachments'
  AND EXISTS (
    SELECT 1
    FROM public.practice_members pm
    WHERE pm.practice_id::text = (storage.foldername(name))[1]
      AND pm.user_id = (SELECT auth.uid())
  )
)
WITH CHECK (
  bucket_id = 'patient-attachments'
  AND EXISTS (
    SELECT 1
    FROM public.practice_members pm
    WHERE pm.practice_id::text = (storage.foldername(name))[1]
      AND pm.user_id = (SELECT auth.uid())
  )
  AND EXISTS (
    SELECT 1
    FROM public.practice_patients pp
    WHERE pp.practice_id::text = (storage.foldername(name))[1]
      AND pp.id::text = (storage.foldername(name))[2]
  )
);

CREATE POLICY patient_attachments_storage_delete
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'patient-attachments'
  AND EXISTS (
    SELECT 1
    FROM public.practice_members pm
    WHERE pm.practice_id::text = (storage.foldername(name))[1]
      AND pm.user_id = (SELECT auth.uid())
  )
);

-- POPIA/access-accountability foundation. Application code can record
-- purpose-bound access without placing PHI in the audit payload.
CREATE TABLE IF NOT EXISTS public.practice_access_audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  practice_id uuid NOT NULL REFERENCES public.practices(id) ON DELETE CASCADE,
  actor_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  action text NOT NULL,
  resource_type text NOT NULL,
  resource_id uuid,
  purpose text,
  outcome text NOT NULL CHECK (outcome IN ('allowed', 'denied')),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS practice_access_audit_events_lookup_idx
  ON public.practice_access_audit_events (practice_id, created_at DESC);

ALTER TABLE public.practice_access_audit_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS practice_access_audit_events_insert
  ON public.practice_access_audit_events;
DROP POLICY IF EXISTS practice_access_audit_events_select
  ON public.practice_access_audit_events;

CREATE POLICY practice_access_audit_events_insert
ON public.practice_access_audit_events
FOR INSERT
TO authenticated
WITH CHECK (
  actor_user_id = (SELECT auth.uid())
  AND public.is_practice_member(practice_id)
);

CREATE POLICY practice_access_audit_events_select
ON public.practice_access_audit_events
FOR SELECT
TO authenticated
USING (
  app_private.has_practice_role(practice_id, ARRAY['owner', 'admin'])
);

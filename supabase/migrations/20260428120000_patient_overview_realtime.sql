-- Ensure the aggregated patient-overview realtime feeds actually stream to the
-- browser. Without a table being part of the `supabase_realtime` publication,
-- `.on("postgres_changes", ...)` subscriptions are silently no-ops which is
-- why signed-consult AI summaries were not appearing in the sidebar live.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime'
  ) THEN
    IF to_regclass('public.practice_encounter_summaries') IS NOT NULL THEN
      BEGIN
        EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.practice_encounter_summaries';
      EXCEPTION WHEN duplicate_object THEN NULL;
      END;
    END IF;
    IF to_regclass('public.patient_attachments') IS NOT NULL THEN
      BEGIN
        EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.patient_attachments';
      EXCEPTION WHEN duplicate_object THEN NULL;
      END;
    END IF;
    IF to_regclass('public.patient_notes') IS NOT NULL THEN
      BEGIN
        EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.patient_notes';
      EXCEPTION WHEN duplicate_object THEN NULL;
      END;
    END IF;
    IF to_regclass('public.patient_chart_facts') IS NOT NULL THEN
      BEGIN
        EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.patient_chart_facts';
      EXCEPTION WHEN duplicate_object THEN NULL;
      END;
    END IF;
    IF to_regclass('public.practice_appointments') IS NOT NULL THEN
      BEGIN
        EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.practice_appointments';
      EXCEPTION WHEN duplicate_object THEN NULL;
      END;
    END IF;
    IF to_regclass('public.practice_claims') IS NOT NULL THEN
      BEGIN
        EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.practice_claims';
      EXCEPTION WHEN duplicate_object THEN NULL;
      END;
    END IF;
    IF to_regclass('public.practice_invoices') IS NOT NULL THEN
      BEGIN
        EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.practice_invoices';
      EXCEPTION WHEN duplicate_object THEN NULL;
      END;
    END IF;
  END IF;
END$$;

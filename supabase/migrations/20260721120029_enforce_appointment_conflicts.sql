-- Serialize appointment scheduling writes per practice/day and reject overlaps.
-- Application helpers still validate opening hours; this trigger closes the
-- check-then-insert race and protects every database write path.
CREATE OR REPLACE FUNCTION public.enforce_practice_appointment_conflict()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  candidate_end time;
BEGIN
  IF NEW.status NOT IN ('booked', 'confirmed', 'checked_in', 'in_progress', 'completed') THEN
    RETURN NEW;
  END IF;

  IF NEW.start_time IS NULL OR NEW.appt_date IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = '22007',
      MESSAGE = 'Appointment date and start time are required';
  END IF;

  candidate_end := CASE
    WHEN NEW.end_time IS NULL OR NEW.end_time <= NEW.start_time
      THEN NEW.start_time + make_interval(mins => GREATEST(COALESCE(NEW.duration_minutes, 30), 1))
    ELSE NEW.end_time
  END;

  PERFORM pg_advisory_xact_lock(
    hashtextextended(NEW.practice_id::text || ':' || NEW.appt_date::text, 0)
  );

  IF EXISTS (
    SELECT 1
    FROM public.practice_appointments existing
    WHERE existing.practice_id = NEW.practice_id
      AND existing.appt_date = NEW.appt_date
      AND existing.id <> NEW.id
      AND existing.status IN ('booked', 'confirmed', 'checked_in', 'in_progress', 'completed')
      AND (
        NEW.provider_staff_id IS NULL
        OR existing.provider_staff_id IS NULL
        OR existing.provider_staff_id = NEW.provider_staff_id
      )
      AND NEW.start_time < CASE
        WHEN existing.end_time IS NULL OR existing.end_time <= existing.start_time
          THEN existing.start_time + make_interval(mins => GREATEST(COALESCE(existing.duration_minutes, 30), 1))
        ELSE existing.end_time
      END
      AND existing.start_time < candidate_end
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '23P01',
      MESSAGE = 'Appointment conflicts with an existing active booking';
  END IF;

  NEW.end_time := candidate_end;
  NEW.duration_minutes :=
    GREATEST(1, (EXTRACT(EPOCH FROM (candidate_end - NEW.start_time)) / 60)::integer);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS practice_appointments_conflict_guard
  ON public.practice_appointments;

CREATE TRIGGER practice_appointments_conflict_guard
BEFORE INSERT OR UPDATE OF
  appt_date,
  start_time,
  end_time,
  duration_minutes,
  provider_staff_id,
  status
ON public.practice_appointments
FOR EACH ROW
EXECUTE FUNCTION public.enforce_practice_appointment_conflict();

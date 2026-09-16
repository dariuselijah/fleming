import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"

const conflictMigration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20260721120029_enforce_appointment_conflicts.sql"
  ),
  "utf8"
)
assert.match(conflictMigration, /pg_advisory_xact_lock/)
assert.match(conflictMigration, /existing\.practice_id = NEW\.practice_id/)
assert.match(conflictMigration, /existing\.appt_date = NEW\.appt_date/)
assert.match(conflictMigration, /existing\.provider_staff_id = NEW\.provider_staff_id/)
assert.match(conflictMigration, /ERRCODE = '23P01'/)
assert.match(conflictMigration, /BEFORE INSERT OR UPDATE OF/)

const rescheduleRoute = readFileSync(
  resolve(
    process.cwd(),
    "app/api/practice/appointments/[id]/reschedule/route.ts"
  ),
  "utf8"
)
assert.match(rescheduleRoute, /\.eq\("user_id", user\.id\)/)
assert.match(rescheduleRoute, /\.eq\("practice_id", practiceId\)/)
assert.match(
  rescheduleRoute,
  /rescheduleAppointmentForPractice\(supabase, practiceId/
)

console.log("Appointment regression checks passed.")

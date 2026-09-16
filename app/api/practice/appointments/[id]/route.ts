import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { rescheduleAppointmentForPractice } from "@/lib/practice/reschedule-appointment-server"

export const runtime = "nodejs"

type Ctx = { params: Promise<{ id: string }> }

function endTimeFromStartAndDuration(startTime: string, durationMinutes: number): string {
  const [sh, sm] = String(startTime).split(":").map((x) => parseInt(x, 10))
  const h0 = Number.isFinite(sh) ? sh : 0
  const m0 = Number.isFinite(sm) ? sm : 0
  const startMin = h0 * 60 + m0
  const endMin = startMin + Math.max(1, durationMinutes)
  const eh = Math.floor(endMin / 60) % 24
  const em = endMin % 60
  return `${String(eh).padStart(2, "0")}:${String(em).padStart(2, "0")}`
}

export async function PATCH(req: Request, context: Ctx) {
  const supabase = await createClient()
  if (!supabase) return NextResponse.json({ error: "Service unavailable" }, { status: 500 })

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id } = await context.params

  const { data: appt, error: apErr } = await supabase
    .from("practice_appointments")
    .select("practice_id, metadata, appt_date, start_time, end_time, duration_minutes, provider_staff_id")
    .eq("id", id)
    .maybeSingle()
  if (apErr || !appt) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const { data: mem } = await supabase
    .from("practice_members")
    .select("practice_id")
    .eq("user_id", user.id)
    .eq("practice_id", appt.practice_id)
    .maybeSingle()
  if (!mem) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  let body: {
    reason?: string | null
    service?: string | null
    duration_minutes?: number
    provider_staff_id?: string | null
    notes?: string | null
    icd_codes?: string[] | null
    total_fee?: number | null
    metadata?: Record<string, unknown>
  }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  const row: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (body.reason !== undefined) row.reason = body.reason
  if (body.service !== undefined) row.service = body.service
  if (body.notes !== undefined) row.notes = body.notes
  if (body.icd_codes !== undefined) row.icd_codes = body.icd_codes
  if (body.total_fee !== undefined) row.total_fee = body.total_fee
  if (body.duration_minutes != null || body.provider_staff_id !== undefined) {
    const duration = body.duration_minutes ?? Number(appt.duration_minutes ?? 30)
    if (!Number.isFinite(duration) || duration < 5) {
      return NextResponse.json({ error: "duration_minutes must be at least 5" }, { status: 400 })
    }
    const startTime = String(appt.start_time ?? "09:00")
    const result = await rescheduleAppointmentForPractice(supabase, String(appt.practice_id), {
      appointmentId: id,
      startTime,
      endTime: endTimeFromStartAndDuration(startTime, duration),
      providerStaffId:
        body.provider_staff_id !== undefined
          ? body.provider_staff_id
          : (appt.provider_staff_id as string | null),
    })
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 409 })
    }
  }

  if (body.metadata !== undefined) {
    const prev =
      appt.metadata && typeof appt.metadata === "object" && !Array.isArray(appt.metadata)
        ? (appt.metadata as Record<string, unknown>)
        : {}
    row.metadata = { ...prev, ...body.metadata }
  }

  const { data: updated, error } = await supabase
    .from("practice_appointments")
    .update(row)
    .eq("id", id)
    .select("*")
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ appointment: updated })
}

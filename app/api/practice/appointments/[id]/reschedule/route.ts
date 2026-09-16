import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { rescheduleAppointmentForPractice } from "@/lib/practice/reschedule-appointment-server"

export const runtime = "nodejs"

type Ctx = { params: Promise<{ id: string }> }

export async function POST(req: Request, context: Ctx) {
  const supabase = await createClient()
  if (!supabase) return NextResponse.json({ error: "Service unavailable" }, { status: 500 })

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id: appointmentId } = await context.params

  let body: { apptDate?: string; startTime: string; endTime: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  if (!body.startTime || !body.endTime) {
    return NextResponse.json({ error: "startTime and endTime required" }, { status: 400 })
  }

  const { data: appt, error: apErr } = await supabase
    .from("practice_appointments")
    .select("practice_id")
    .eq("id", appointmentId)
    .maybeSingle()
  if (apErr || !appt) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const practiceId = (appt as { practice_id: string }).practice_id

  const { data: mem } = await supabase
    .from("practice_members")
    .select("practice_id")
    .eq("user_id", user.id)
    .eq("practice_id", practiceId)
    .maybeSingle()
  if (!mem) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const result = await rescheduleAppointmentForPractice(supabase, practiceId, {
    appointmentId,
    startTime: body.startTime,
    endTime: body.endTime,
    apptDate: body.apptDate,
  })

  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error }, { status: 400 })
  }

  return NextResponse.json({
    ...result,
    ok: true,
    clientAction: { type: "refresh_appointments" },
  })
}

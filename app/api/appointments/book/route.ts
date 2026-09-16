import { NextResponse } from "next/server"
import { getAuthenticatedPracticeContextWithRole } from "@/lib/billing/context"
import { bookAppointmentForPractice, type BookAppointmentInput } from "@/lib/practice/book-appointment-server"

export const runtime = "nodejs"

const REFRESH = { type: "refresh_appointments" as const }

export async function POST(req: Request) {
  const ctx = await getAuthenticatedPracticeContextWithRole()
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  const patientId = typeof body.patientId === "string" ? body.patientId : ""
  const apptDate = typeof body.apptDate === "string" ? body.apptDate : ""
  const startTime = typeof body.startTime === "string" ? body.startTime : ""
  if (!patientId || !apptDate || !startTime) {
    return NextResponse.json({ error: "patientId, apptDate, startTime required" }, { status: 400 })
  }

  const paymentRaw = typeof body.paymentType === "string" ? body.paymentType : "cash"
  const paymentType =
    paymentRaw === "medical_aid" || paymentRaw === "card" || paymentRaw === "cash" ? paymentRaw : "cash"

  const icdRaw = body.icdCodes
  const icdCodes = Array.isArray(icdRaw) ? icdRaw.filter((x): x is string => typeof x === "string") : undefined

  const input: BookAppointmentInput = {
    patientId,
    apptDate,
    startTime,
    endTime: typeof body.endTime === "string" ? body.endTime : undefined,
    durationMinutes: typeof body.durationMinutes === "number" ? body.durationMinutes : undefined,
    providerStaffId: typeof body.providerStaffId === "string" ? body.providerStaffId : null,
    service: typeof body.service === "string" ? body.service : null,
    reason: typeof body.reason === "string" ? body.reason : null,
    paymentType,
    medicalAid: typeof body.medicalAid === "string" ? body.medicalAid : null,
    memberNumber: typeof body.memberNumber === "string" ? body.memberNumber : null,
    notes: typeof body.notes === "string" ? body.notes : null,
    icdCodes: icdCodes && icdCodes.length > 0 ? icdCodes : null,
    totalFee: typeof body.totalFee === "number" ? body.totalFee : null,
  }

  const r = await bookAppointmentForPractice(ctx.supabase, ctx.practiceId, input)
  if (!r.ok) {
    return NextResponse.json({ ok: false, error: r.error }, { status: 400 })
  }
  return NextResponse.json({ ok: true, appointment: r.appointment, clientAction: REFRESH })
}

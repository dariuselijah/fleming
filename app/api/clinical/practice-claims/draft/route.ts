import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { assertPracticeMember } from "@/lib/medikredit/practice-guard"

export const runtime = "nodejs"

/**
 * Save or update a MediKredit claim preview as `practice_claims.status = draft`
 * with workspace-shaped `lines` json (full ClaimLine[] for resume).
 */
export async function POST(req: Request) {
  const supabase = await createClient()
  if (!supabase) {
    return NextResponse.json({ error: "Service unavailable" }, { status: 500 })
  }

  let body: {
    practiceId?: string
    patientId?: string
    clinicalEncounterId?: string | null
    claimId?: string | null
    lines?: unknown[]
    appointmentId?: string | null
    resubmissionOfClaimId?: string | null
  }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  const practiceId = body.practiceId?.trim()
  const patientId = body.patientId?.trim()
  const lines = body.lines
  if (!practiceId || !patientId || !Array.isArray(lines) || lines.length === 0) {
    return NextResponse.json(
      { error: "practiceId, patientId, and non-empty lines are required" },
      { status: 400 }
    )
  }

  let userId: string
  try {
    ;({ userId } = await assertPracticeMember(practiceId))
  } catch (e) {
    const status = (e as Error & { status?: number }).status ?? 500
    return NextResponse.json({ error: (e as Error).message }, { status })
  }

  const clinicalEncounterId = body.clinicalEncounterId?.trim() || null
  const existingId = body.claimId?.trim()
  const resubmissionOfClaimId = body.resubmissionOfClaimId?.trim() || null

  if (resubmissionOfClaimId) {
    const { data: original, error: originalError } = await supabase
      .from("practice_claims")
      .select("id, patient_id, status")
      .eq("id", resubmissionOfClaimId)
      .eq("practice_id", practiceId)
      .maybeSingle()
    if (originalError) return NextResponse.json({ error: originalError.message }, { status: 500 })
    if (!original || original.patient_id !== patientId || original.status !== "reversed") {
      return NextResponse.json(
        { error: "A corrected draft can only link to a reversed claim for this patient." },
        { status: 409 }
      )
    }
  }

  const { data: patient, error: patientErr } = await supabase
    .from("practice_patients")
    .select("id")
    .eq("id", patientId)
    .eq("practice_id", practiceId)
    .maybeSingle()
  if (patientErr) {
    return NextResponse.json({ error: patientErr.message }, { status: 500 })
  }
  if (!patient) {
    return NextResponse.json({ error: "Patient profile not found for this practice." }, { status: 400 })
  }

  if (existingId) {
    const { data: existing, error: fetchErr } = await supabase
      .from("practice_claims")
      .select("id, status")
      .eq("id", existingId)
      .eq("practice_id", practiceId)
      .maybeSingle()

    if (fetchErr || !existing) {
      return NextResponse.json({ error: "Draft not found" }, { status: 404 })
    }
    if (String((existing as { status?: string }).status) !== "draft") {
      return NextResponse.json({ error: "Only draft claims can be updated" }, { status: 409 })
    }

    const appointmentId = body.appointmentId?.trim() || null
    const updatePayload: Record<string, unknown> = {
      lines: lines as Record<string, unknown>[],
      clinical_encounter_id: clinicalEncounterId,
      updated_at: new Date().toISOString(),
    }
    if (appointmentId) updatePayload.appointment_id = appointmentId
    if (resubmissionOfClaimId) updatePayload.resubmission_of_claim_id = resubmissionOfClaimId

    let { error: upErr } = await supabase
      .from("practice_claims")
      .update(updatePayload as never)
      .eq("id", existingId)
      .eq("practice_id", practiceId)
      .eq("status", "draft")

    if (upErr && /appointment_id/i.test(upErr.message)) {
      delete updatePayload.appointment_id
      const retry = await supabase
        .from("practice_claims")
        .update(updatePayload as never)
        .eq("id", existingId)
        .eq("practice_id", practiceId)
        .eq("status", "draft")
      upErr = retry.error
    }

    if (upErr) {
      console.error("[practice-claims/draft PATCH]", upErr)
      return NextResponse.json({ error: upErr.message }, { status: 500 })
    }
    return NextResponse.json({ claimId: existingId })
  }

  const appointmentId = body.appointmentId?.trim() || null
  const insertPayload: Record<string, unknown> = {
    practice_id: practiceId,
    patient_id: patientId,
    clinical_encounter_id: clinicalEncounterId,
    status: "draft",
    lines: lines as Record<string, unknown>[],
    medikredit_response: null,
    created_by: userId,
  }
  if (appointmentId) insertPayload.appointment_id = appointmentId
  if (resubmissionOfClaimId) insertPayload.resubmission_of_claim_id = resubmissionOfClaimId

  let { data: inserted, error: insErr } = await supabase
    .from("practice_claims")
    .insert(insertPayload as never)
    .select("id")
    .single()

  if (insErr && /appointment_id/i.test(insErr.message)) {
    delete insertPayload.appointment_id
    const retry = await supabase
      .from("practice_claims")
      .insert(insertPayload as never)
      .select("id")
      .single()
    inserted = retry.data
    insErr = retry.error
  }

  if (insErr) {
    console.error("[practice-claims/draft POST]", insErr)
    return NextResponse.json({ error: insErr.message }, { status: 500 })
  }

  return NextResponse.json({ claimId: (inserted as { id: string }).id })
}

export async function DELETE(req: Request) {
  const supabase = await createClient()
  if (!supabase) {
    return NextResponse.json({ error: "Service unavailable" }, { status: 500 })
  }

  const url = new URL(req.url)
  const id = url.searchParams.get("id")?.trim()
  const practiceId = url.searchParams.get("practiceId")?.trim()
  if (!id || !practiceId) {
    return NextResponse.json({ error: "id and practiceId query params are required" }, { status: 400 })
  }

  try {
    await assertPracticeMember(practiceId)
  } catch (e) {
    const status = (e as Error & { status?: number }).status ?? 500
    return NextResponse.json({ error: (e as Error).message }, { status })
  }

  const { error } = await supabase
    .from("practice_claims")
    .delete()
    .eq("id", id)
    .eq("practice_id", practiceId)
    .eq("status", "draft")

  if (error) {
    console.error("[practice-claims/draft DELETE]", error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}

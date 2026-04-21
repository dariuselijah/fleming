import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { buildPreviewClaimXml, resolveClaimDoctorOption } from "@/lib/medikredit/claim-service"
import { assertPracticeMember } from "@/lib/medikredit/practice-guard"
import { fetchMedikreditProviderSettings } from "@/lib/medikredit/provider-settings"
import type { ClaimLineInput, MedikreditPatientPayload } from "@/lib/medikredit/types"

export const runtime = "nodejs"

export async function POST(req: Request) {
  const supabase = await createClient()
  if (!supabase) {
    return NextResponse.json({ error: "Service unavailable" }, { status: 500 })
  }

  let body: {
    practiceId?: string
    patient?: MedikreditPatientPayload
    lines?: ClaimLineInput[]
    medicalSchemeOptionCode?: string
    schemeCode?: string
    acuteChronic?: "acute" | "chronic"
  }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  const practiceId = body.practiceId?.trim()
  const patient = body.patient
  const lines = body.lines
  if (!practiceId || !patient?.id || !patient.name || !lines?.length) {
    return NextResponse.json({ error: "practiceId, patient, and lines are required" }, { status: 400 })
  }

  try {
    await assertPracticeMember(practiceId)
  } catch (e) {
    const status = (e as Error & { status?: number }).status ?? 500
    return NextResponse.json({ error: (e as Error).message }, { status })
  }

  const provider = await fetchMedikreditProviderSettings(supabase, practiceId)
  const submitInput = {
    patient,
    provider,
    lines,
    medicalSchemeOptionCode: body.medicalSchemeOptionCode,
    schemeCode: body.schemeCode?.trim(),
    acuteChronic: body.acuteChronic,
  }
  const doctorOption = resolveClaimDoctorOption(submitInput)
  const xml = buildPreviewClaimXml(submitInput)
  return NextResponse.json({ xml, resolvedOption: doctorOption })
}

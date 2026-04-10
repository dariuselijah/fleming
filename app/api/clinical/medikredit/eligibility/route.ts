import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { checkEligibility } from "@/lib/medikredit/eligibility-service"
import { getMedikreditEnv } from "@/lib/medikredit/env"
import { insertEligibilityCheck } from "@/lib/medikredit/persist"
import { assertPracticeMember } from "@/lib/medikredit/practice-guard"
import { fetchMedikreditProviderSettings } from "@/lib/medikredit/provider-settings"
import type { MedikreditPatientPayload } from "@/lib/medikredit/types"

export const runtime = "nodejs"

export async function POST(req: Request) {
  const supabase = await createClient()
  if (!supabase) {
    return NextResponse.json({ error: "Service unavailable" }, { status: 500 })
  }

  let body: { practiceId?: string; patient?: MedikreditPatientPayload; persist?: boolean }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  const practiceId = body.practiceId?.trim()
  const patient = body.patient
  if (!practiceId || !patient?.id || !patient.name) {
    return NextResponse.json({ error: "practiceId and patient (id, name) are required" }, { status: 400 })
  }

  let userId: string
  try {
    ;({ userId } = await assertPracticeMember(practiceId))
  } catch (e) {
    const status = (e as Error & { status?: number }).status ?? 500
    return NextResponse.json({ error: (e as Error).message }, { status })
  }

  if (!getMedikreditEnv() && process.env.MEDIKREDIT_DRY_RUN !== "1") {
    return NextResponse.json(
      {
        error: "MediKredit is not configured on the server (set MEDIKREDIT_* env) or enable MEDIKREDIT_DRY_RUN=1 for development.",
      },
      { status: 503 }
    )
  }

  const provider = await fetchMedikreditProviderSettings(supabase, practiceId)
  try {
    const result = await checkEligibility(patient, provider)
    if (body.persist !== false) {
      await insertEligibilityCheck(supabase, {
        practiceId,
        patientId: patient.id,
        checkType: "eligibility",
        response: result,
        rawXml: result.rawXml,
        userId,
      })
    }
    return NextResponse.json({ result })
  } catch (e) {
    console.error("[medikredit/eligibility]", e)
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Eligibility check failed" },
      { status: 502 }
    )
  }
}

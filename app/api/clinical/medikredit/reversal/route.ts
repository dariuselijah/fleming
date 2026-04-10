import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { reverseClaim, validateReversal } from "@/lib/medikredit/claim-service"
import type { ClaimResponse } from "@/lib/medikredit/types"
import { getMedikreditEnv } from "@/lib/medikredit/env"
import { assertPracticeMember } from "@/lib/medikredit/practice-guard"
import { fetchMedikreditProviderSettings } from "@/lib/medikredit/provider-settings"
import type { MedikreditPatientPayload } from "@/lib/medikredit/types"

export const runtime = "nodejs"

export async function POST(req: Request) {
  const supabase = await createClient()
  if (!supabase) {
    return NextResponse.json({ error: "Service unavailable" }, { status: 500 })
  }

  let body: {
    practiceId?: string
    patient?: MedikreditPatientPayload
    originalTxNbr?: string
    originalResponse?: ClaimResponse
  }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  const practiceId = body.practiceId?.trim()
  const patient = body.patient
  const originalTxNbr = body.originalTxNbr?.trim()
  if (!practiceId || !patient?.id || !originalTxNbr) {
    return NextResponse.json({ error: "practiceId, patient, and originalTxNbr are required" }, { status: 400 })
  }

  try {
    await assertPracticeMember(practiceId)
  } catch (e) {
    const status = (e as Error & { status?: number }).status ?? 500
    return NextResponse.json({ error: (e as Error).message }, { status })
  }

  if (body.originalResponse) {
    const v = validateReversal(body.originalResponse)
    if (!v.ok) {
      return NextResponse.json({ error: v.reason }, { status: 400 })
    }
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
    const result = await reverseClaim({ originalTxNbr, patient, provider })
    return NextResponse.json({ result })
  } catch (e) {
    console.error("[medikredit/reversal]", e)
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Reversal failed" },
      { status: 502 }
    )
  }
}

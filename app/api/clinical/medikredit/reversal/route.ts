import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { reverseClaim, validateReversal } from "@/lib/medikredit/claim-service"
import type { ClaimResponse } from "@/lib/medikredit/types"
import { isMedikreditConfigured } from "@/lib/medikredit/env"
import { assertPracticeMember } from "@/lib/medikredit/practice-guard"
import { fetchMedikreditProviderSettings } from "@/lib/medikredit/provider-settings"
import { appendClaimEvent, publicMedikreditResponse } from "@/lib/medikredit/persist"
import type { MedikreditPatientPayload } from "@/lib/medikredit/types"
import type { SupabaseClient } from "@supabase/supabase-js"

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
    claimId?: string
  }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  const practiceId = body.practiceId?.trim()
  const patient = body.patient
  const claimId = body.claimId?.trim()
  if (!practiceId || !patient?.id || !claimId) {
    return NextResponse.json({ error: "practiceId, patient, and claimId are required" }, { status: 400 })
  }

  let userId: string
  try {
    ;({ userId } = await assertPracticeMember(practiceId))
  } catch (e) {
    const status = (e as Error & { status?: number }).status ?? 500
    return NextResponse.json({ error: (e as Error).message }, { status })
  }

  const { data: storedClaim, error: claimError } = await supabase
    .from("practice_claims")
    .select("id, patient_id, status, tx_nbr, medikredit_response")
    .eq("id", claimId)
    .eq("practice_id", practiceId)
    .maybeSingle()
  if (claimError) return NextResponse.json({ error: claimError.message }, { status: 500 })
  if (!storedClaim || storedClaim.patient_id !== patient.id) {
    return NextResponse.json({ error: "Claim not found for this patient" }, { status: 404 })
  }
  if (storedClaim.status === "reversed") {
    return NextResponse.json({ error: "Claim is already reversed", code: "ALREADY_REVERSED" }, { status: 409 })
  }

  const originalResponse = storedClaim.medikredit_response as unknown as ClaimResponse | null
  if (!originalResponse) {
    return NextResponse.json({ error: "Claim has no persisted MediKredit adjudication" }, { status: 409 })
  }
  const v = validateReversal(originalResponse)
  if (!v.ok) {
    return NextResponse.json({ error: v.reason }, { status: 400 })
  }
  const originalTxNbr = storedClaim.tx_nbr?.trim() || originalResponse.txNbr?.trim()
  if (!originalTxNbr) {
    return NextResponse.json({ error: "Claim has no switch transaction number" }, { status: 409 })
  }

  if (!isMedikreditConfigured()) {
    return NextResponse.json(
      {
        error:
          "MediKredit is not configured on the server (set CLINICAL_PROXY_URL, or MEDIKREDIT_* for direct SOAP, or MEDIKREDIT_DRY_RUN=1 for development).",
      },
      { status: 503 }
    )
  }

  const provider = await fetchMedikreditProviderSettings(supabase, practiceId)
  try {
    const result = await reverseClaim({ originalTxNbr, patient, provider })
    if (!result.ok || (result.outcome !== "approved" && result.outcome !== "partially_approved")) {
      await appendClaimEvent(supabase, {
        practiceId,
        claimId,
        eventType: "reversal_rejected",
        status: storedClaim.status,
        txNbr: result.txNbr ?? originalTxNbr,
        payload: publicMedikreditResponse(result) as unknown as Record<string, unknown>,
        userId,
      })
      return NextResponse.json({ result: publicMedikreditResponse(result) }, { status: 409 })
    }

    const db = supabase as unknown as SupabaseClient
    const reversedAt = new Date().toISOString()
    const { error: updateError } = await db
      .from("practice_claims")
      .update({
        status: "reversed",
        reversed_at: reversedAt,
        reversal_tx_nbr: result.txNbr ?? originalTxNbr,
        updated_at: reversedAt,
      })
      .eq("id", claimId)
      .eq("practice_id", practiceId)
    if (updateError) throw updateError
    await appendClaimEvent(supabase, {
      practiceId,
      claimId,
      eventType: "reversed",
      status: "reversed",
      txNbr: result.txNbr ?? originalTxNbr,
      payload: publicMedikreditResponse(result) as unknown as Record<string, unknown>,
      userId,
    })
    return NextResponse.json({ result: publicMedikreditResponse(result), claimId, status: "reversed" })
  } catch (e) {
    console.error("[medikredit/reversal]", e)
    const code = (e as Error & { code?: string }).code
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Reversal failed", code: code ?? "MEDIKREDIT_TRANSPORT" },
      { status: (e as Error & { status?: number }).status ?? 502 }
    )
  }
}

import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { fingerprintClaimLines, resolveClaimDoctorOption, submitClaim } from "@/lib/medikredit/claim-service"
import { validateMembershipFormat } from "@/lib/medikredit/doctor-option-catalog"
import { isMedikreditConfigured } from "@/lib/medikredit/env"
import { insertPracticeClaim } from "@/lib/medikredit/persist"
import { createInvoiceFromClaim } from "@/lib/billing/invoices"
import { zarToCents } from "@/lib/billing/money"
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
    persist?: boolean
    medicalSchemeOptionCode?: string
    schemeCode?: string
    acuteChronic?: "acute" | "chronic"
    clinicalEncounterId?: string
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

  if (body.schemeCode && patient.memberNumber) {
    const memberErr = validateMembershipFormat(body.schemeCode, patient.memberNumber)
    if (memberErr) {
      return NextResponse.json({ error: memberErr }, { status: 422 })
    }
  }

  let userId: string
  try {
    ;({ userId } = await assertPracticeMember(practiceId))
  } catch (e) {
    const status = (e as Error & { status?: number }).status ?? 500
    return NextResponse.json({ error: (e as Error).message }, { status })
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
    const submitInput = {
      patient,
      provider,
      lines,
      medicalSchemeOptionCode: body.medicalSchemeOptionCode,
      schemeCode: body.schemeCode?.trim(),
      acuteChronic: body.acuteChronic,
    }
    const doctorOption = resolveClaimDoctorOption(submitInput)
    const result = await submitClaim(submitInput)
    let claimId: string | undefined
    if (body.persist !== false) {
      claimId = await insertPracticeClaim(supabase, {
        practiceId,
        patientId: patient.id,
        lines,
        medikreditResponse: result,
        fingerprint: fingerprintClaimLines(patient.id, lines),
        userId,
        clinicalEncounterId: body.clinicalEncounterId?.trim() || null,
      })
    }
    if (claimId && result.patientResponsibility != null && result.patientResponsibility > 0) {
      if (result.outcome === "approved" || result.outcome === "partially_approved") {
        try {
          await createInvoiceFromClaim(supabase, {
            practiceId,
            claimId,
            billingMode: "split",
            actorUserId: userId,
            shortfallCents: zarToCents(result.patientResponsibility),
          })
        } catch (e) {
          console.warn("[medikredit/claim] shortfall invoice", e)
        }
      }
    }

    return NextResponse.json({
      result,
      claimId,
      resolvedOption: doctorOption
        ? {
            schemeCode: doctorOption.schemeCode,
            masCode: doctorOption.masCode,
            optionCode: doctorOption.optionCode,
            name: doctorOption.name,
            authcheck: doctorOption.authcheck,
            famcheck: doctorOption.famcheck,
            reversalPeriodDays: doctorOption.reversalPeriodDays,
          }
        : null,
    })
  } catch (e) {
    console.error("[medikredit/claim]", e)
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Claim submission failed" },
      { status: 502 }
    )
  }
}

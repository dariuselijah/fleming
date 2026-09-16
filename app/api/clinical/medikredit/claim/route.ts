import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { fingerprintClaimLines, resolveClaimDoctorOption, submitClaim } from "@/lib/medikredit/claim-service"
import { validateMembershipFormat } from "@/lib/medikredit/doctor-option-catalog"
import { isMedikreditConfigured } from "@/lib/medikredit/env"
import {
  appendClaimEvent,
  insertPracticeClaim,
  publicMedikreditResponse,
  updatePracticeClaimAfterSubmission,
} from "@/lib/medikredit/persist"
import { validateClaimLinesPrimaryIcd } from "@/lib/medikredit/claim-primary-icd"
import { validateClaimModifiers } from "@/lib/medikredit/modifier-validator"
import { findRecentDuplicateFingerprint } from "@/lib/medikredit/submission-guard"
import {
  ELIGIBILITY_FRESHNESS_HOURS,
  runMedpraxClaimPreflight,
  validateClaimPayload,
} from "@/lib/medikredit/claim-preflight"
import { createInvoiceFromClaim } from "@/lib/billing/invoices"
import { getBillingAutomationSettings } from "@/lib/billing/automation-settings"
import { issueAndSendInvoiceSms } from "@/lib/billing/invoice-delivery"
import { zarToCents } from "@/lib/billing/money"
import { assertPracticeMember } from "@/lib/medikredit/practice-guard"
import { fetchMedikreditProviderSettings } from "@/lib/medikredit/provider-settings"
import type { ClaimLineInput, MedikreditPatientPayload } from "@/lib/medikredit/types"
import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "@/app/types/database.types"
import { createRequestLogger } from "@/lib/observability/server"

export const runtime = "nodejs"
/** MediKredit + DB can exceed default serverless limits during switch round-trips. */
export const maxDuration = 150

async function claimHasInvoice(
  supabase: SupabaseClient<Database>,
  practiceId: string,
  claimId: string
): Promise<boolean> {
  const { data, error } = await supabase
    .from("practice_invoices")
    .select("id")
    .eq("practice_id", practiceId)
    .eq("claim_id", claimId)
    .limit(1)
  if (error) return false
  return (data?.length ?? 0) > 0
}

export async function POST(req: Request) {
  const log = createRequestLogger(req, "/api/clinical/medikredit/claim")
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
    appointmentId?: string
    /** When set, MediKredit result updates this existing `practice_claims` row instead of inserting. */
    claimId?: string
    /** Optional: PHISC modifier validation (matches clinical preview defaults when omitted). */
    isSpecialist?: boolean
    anaestheticDurationMinutes?: number
    isOptometry?: boolean
    /** Guided reverse/resubmit chain. The original must already be persisted as reversed. */
    resubmissionOfClaimId?: string
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

  if (body.schemeCode?.trim() && !patient.memberNumber?.trim()) {
    return NextResponse.json(
      { error: "memberNumber is required when schemeCode is provided" },
      { status: 422 }
    )
  }

  if (body.schemeCode && patient.memberNumber) {
    const memberErr = validateMembershipFormat(body.schemeCode, patient.memberNumber)
    if (memberErr) {
      return NextResponse.json({ error: memberErr }, { status: 422 })
    }
  }

  const payloadErrors = validateClaimPayload(patient, lines)
  if (payloadErrors.length > 0) {
    return NextResponse.json(
      { error: payloadErrors.join(" "), code: "CLAIM_PATIENT_OR_TREATMENT_DATA" },
      { status: 422 }
    )
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

  const modifierResults = validateClaimModifiers({
    lines,
    discipline: provider.discipline ?? undefined,
    isSpecialist: body.isSpecialist,
    durationMinutes: body.anaestheticDurationMinutes,
    isOptometry: body.isOptometry,
  })
  const modifierErrors = modifierResults.filter((r) => r.severity === "error")
  if (modifierErrors.length > 0) {
    return NextResponse.json(
      {
        error: modifierErrors.map((m) => m.message).join("; "),
        code: "CLAIM_MODIFIER_VALIDATION",
      },
      { status: 422 }
    )
  }

  const icdErr = validateClaimLinesPrimaryIcd(lines)
  if (icdErr) {
    return NextResponse.json({ error: icdErr, code: "CLAIM_PRIMARY_ICD_REQUIRED" }, { status: 422 })
  }

  const fingerprint = fingerprintClaimLines(patient.id, lines)

  try {
    const recentDup = await findRecentDuplicateFingerprint(supabase, {
      practiceId,
      patientId: patient.id,
      fingerprint,
      excludeClaimId: body.claimId?.trim(),
    })
    if (recentDup) {
      const currentClaimId = body.claimId?.trim()
      if (currentClaimId) {
        const db = supabase as unknown as SupabaseClient
        await db
          .from("practice_claims")
          .update({ duplicate_of_claim_id: recentDup.id, updated_at: new Date().toISOString() })
          .eq("id", currentClaimId)
          .eq("practice_id", practiceId)
        await appendClaimEvent(supabase, {
          practiceId,
          claimId: currentClaimId,
          eventType: "duplicate_blocked",
          status: "draft",
          relatedClaimId: recentDup.id,
          payload: { fingerprint },
          userId,
        })
      }
      return NextResponse.json(
        {
          error:
            "An identical claim was submitted recently. Open the linked claim; reverse it first if it was accepted, then resubmit from this draft.",
          code: "DUPLICATE_SUBMISSION",
          duplicateClaimId: recentDup.id,
          nextAction: "review_reverse_then_resubmit",
        },
        { status: 409 }
      )
    }

    const submitInput = {
      patient,
      provider,
      lines,
      medicalSchemeOptionCode: body.medicalSchemeOptionCode,
      schemeCode: body.schemeCode?.trim(),
      acuteChronic: body.acuteChronic,
    }
    const doctorOption = resolveClaimDoctorOption(submitInput)
    if (!doctorOption) {
      return NextResponse.json(
        {
          error:
            "The medical scheme option is not in the certified DoctorOption catalog. Select a valid six-digit option before submitting.",
          code: "DOCTOR_OPTION_REQUIRED",
        },
        { status: 422 }
      )
    }

    const requiredCheckType = doctorOption.famcheck ? "famcheck" : "eligibility"
    const freshSince = new Date(
      Date.now() - ELIGIBILITY_FRESHNESS_HOURS * 60 * 60 * 1000
    ).toISOString()
    const { data: latestCheck, error: checkError } = await supabase
      .from("eligibility_checks")
      .select("id, check_type, response, created_at")
      .eq("practice_id", practiceId)
      .eq("patient_id", patient.id)
      .eq("check_type", requiredCheckType)
      .gte("created_at", freshSince)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle()
    if (checkError) throw checkError
    const checkResponse = latestCheck?.response as { ok?: boolean; status?: string } | undefined
    if (!latestCheck || !checkResponse?.ok || checkResponse.status !== "eligible") {
      return NextResponse.json(
        {
          error: `Run a successful ${requiredCheckType} within ${ELIGIBILITY_FRESHNESS_HOURS} hours before submitting this DoctorOption.`,
          code: requiredCheckType === "famcheck" ? "FRESH_FAMCHECK_REQUIRED" : "FRESH_ELIGIBILITY_REQUIRED",
          requiredCheckType,
          freshnessHours: ELIGIBILITY_FRESHNESS_HOURS,
        },
        { status: 409 }
      )
    }

    let resubmissionOfClaimId = body.resubmissionOfClaimId?.trim()
    if (!resubmissionOfClaimId && body.claimId?.trim()) {
      const db = supabase as unknown as SupabaseClient
      const { data: linkedDraft, error: linkedDraftError } = await db
        .from("practice_claims")
        .select("resubmission_of_claim_id")
        .eq("id", body.claimId.trim())
        .eq("practice_id", practiceId)
        .maybeSingle()
      if (linkedDraftError) throw linkedDraftError
      const linked = linkedDraft as { resubmission_of_claim_id?: string | null } | null
      resubmissionOfClaimId = linked?.resubmission_of_claim_id ?? undefined
    }
    if (resubmissionOfClaimId) {
      const { data: original, error: originalError } = await supabase
        .from("practice_claims")
        .select("id, status, patient_id")
        .eq("id", resubmissionOfClaimId)
        .eq("practice_id", practiceId)
        .maybeSingle()
      if (originalError) throw originalError
      if (!original || original.patient_id !== patient.id) {
        return NextResponse.json({ error: "Original claim was not found for this patient." }, { status: 404 })
      }
      if (original.status !== "reversed") {
        return NextResponse.json(
          {
            error: "The original claim must be successfully reversed before this resubmission can be sent.",
            code: "REVERSE_BEFORE_RESUBMIT",
            originalClaimId: resubmissionOfClaimId,
          },
          { status: 409 }
        )
      }
    }

    const medpraxPreflight = await runMedpraxClaimPreflight({
      lines,
      planOptionCode: doctorOption.optionCode,
      disciplineCode: provider.discipline?.trim() || process.env.MEDPRAX_DEFAULT_DISCIPLINE_CODE?.trim() || "014",
    })
    const result = await submitClaim(submitInput)
    let claimId: string | undefined
    const existingClaimId = body.claimId?.trim()

    if (body.persist !== false) {
      if (existingClaimId) {
        const { data: existing, error: exErr } = await supabase
          .from("practice_claims")
          .select("id, patient_id, lines")
          .eq("id", existingClaimId)
          .eq("practice_id", practiceId)
          .maybeSingle()
        if (exErr) throw exErr
        if (!existing) {
          return NextResponse.json({ error: "Claim not found" }, { status: 404 })
        }
        if (existing.patient_id !== patient.id) {
          return NextResponse.json({ error: "Patient does not match this claim" }, { status: 400 })
        }

        await updatePracticeClaimAfterSubmission(supabase, {
          claimId: existingClaimId,
          practiceId,
          patientId: patient.id,
          existingLines: Array.isArray(existing.lines) ? [...(existing.lines as unknown[])] : [],
          medikreditResponse: result,
          fingerprint,
          userId,
        })
        claimId = existingClaimId
      } else {
        claimId = await insertPracticeClaim(supabase, {
          practiceId,
          patientId: patient.id,
          lines,
          medikreditResponse: result,
          fingerprint,
          userId,
          clinicalEncounterId: body.clinicalEncounterId?.trim() || null,
          appointmentId: body.appointmentId?.trim() || null,
        })
      }
    }

    if (claimId && resubmissionOfClaimId) {
      const db = supabase as unknown as SupabaseClient
      const { error: linkError } = await db
        .from("practice_claims")
        .update({ resubmission_of_claim_id: resubmissionOfClaimId })
        .eq("id", claimId)
        .eq("practice_id", practiceId)
      if (linkError) throw linkError
      await appendClaimEvent(supabase, {
        practiceId,
        claimId,
        eventType: "resubmitted",
        status: result.outcome,
        txNbr: result.txNbr,
        relatedClaimId: resubmissionOfClaimId,
        userId,
      })
    }

    if (
      claimId &&
      result.patientResponsibility != null &&
      result.patientResponsibility > 0 &&
      (result.outcome === "approved" || result.outcome === "partially_approved")
    ) {
      const alreadyInvoiced = await claimHasInvoice(supabase, practiceId, claimId)
      if (!alreadyInvoiced) {
        try {
          const { invoiceId: shortfallInvoiceId } = await createInvoiceFromClaim(supabase, {
            practiceId,
            claimId,
            billingMode: "split",
            actorUserId: userId,
            shortfallCents: zarToCents(result.patientResponsibility),
            appointmentId: body.appointmentId?.trim() || null,
          })
          const automation = await getBillingAutomationSettings(supabase, practiceId)
          if (automation.autoSendShortfallSms && shortfallInvoiceId) {
            const sent = await issueAndSendInvoiceSms(supabase, {
              practiceId,
              invoiceId: shortfallInvoiceId,
              actorUserId: userId,
            })
            if (!sent.ok) {
              log.warn("claim_shortfall_sms_failed", { reason: sent.reason })
            }
          }
        } catch (e) {
          log.warn("claim_shortfall_invoice_failed", { error: e })
        }
      }
    }

    log.info("medikredit_claim_complete", {
      outcome: result.outcome,
      persisted: Boolean(claimId),
    })
    return log.withRequestId(
      NextResponse.json({
        result: publicMedikreditResponse(result),
        claimId,
        preflight: medpraxPreflight,
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
    )
  } catch (e) {
    log.error("medikredit_claim_failed", { error: e })
    const message = e instanceof Error ? e.message : "Claim submission failed"
    const transportCode = (e as Error & { code?: string }).code
    const transportStatus = (e as Error & { status?: number }).status
    const upstream =
      transportCode?.startsWith("MEDIKREDIT_") ||
      /^MediKredit /i.test(message) ||
      /\bHTTP \d{3}\b/.test(message) ||
      /fetch failed/i.test(message) ||
      /ECONNREFUSED|ECONNRESET|ETIMEDOUT|ENOTFOUND|UND_ERR_/i.test(message) ||
      /\bproxy\b/i.test(message) && /\/api\/medikredit/i.test(message)
    const status = upstream ? transportStatus ?? 502 : 500
    const code = upstream ? transportCode ?? "MEDIKREDIT_TRANSPORT" : "CLAIM_ROUTE"
    return log.withRequestId(
      NextResponse.json(
        {
          error: message,
          code,
          hint: upstream
            ? code === "MEDIKREDIT_CONFIG"
              ? "The clinical proxy is reachable but missing its own MediKredit env. Configure MEDIKREDIT_API_URL, MEDIKREDIT_USERNAME, MEDIKREDIT_PASSWORD, and MEDIKREDIT_REQUEST_TIMEOUT_MS in the proxy process on port 3001, then restart that proxy. Fleming only sends JSON with raw DOCUMENT XML to CLINICAL_PROXY_URL."
              : "Check the clinical proxy health and its MediKredit upstream connectivity. Fleming is proxy-only for live MediKredit; local UI testing can use MEDIKREDIT_DRY_RUN=1."
            : undefined,
        },
        { status }
      )
    )
  }
}

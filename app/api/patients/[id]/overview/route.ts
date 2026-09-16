import { NextResponse } from "next/server"
import { getAuthenticatedPracticeContextWithRole } from "@/lib/billing/context"
import { createAdminClient } from "@/lib/supabase/admin"
import type { PatientOverviewResponse } from "@/lib/patient/patient-overview-types"

export const runtime = "nodejs"

const BUCKET = "patient-attachments"
const ATTACH_LIMIT = 50
const APPT_LIMIT = 30
const SUMMARY_LIMIT = 50
const FACT_LIMIT = 20
const NOTE_LIMIT = 5
const CLAIM_LIMIT = 20
const INVOICE_LIMIT = 20

type Ctx = { params: Promise<{ id: string }> }

function parseKeyFindings(raw: unknown): string[] {
  if (!Array.isArray(raw)) return []
  return raw.map((x) => String(x ?? "").trim()).filter(Boolean)
}

function moneyFromClaimLine(raw: Record<string, unknown>): number {
  const amount = Number(raw.amount ?? 0)
  if (Number.isFinite(amount) && amount !== 0) return amount
  const gross = Number(raw.grossAmount ?? 0)
  return Number.isFinite(gross) ? gross : 0
}

function totalClaimAmount(raw: unknown): number {
  if (!Array.isArray(raw)) return 0
  return raw.reduce((sum, item) => {
    if (typeof item !== "object" || item === null) return sum
    return sum + moneyFromClaimLine(item as Record<string, unknown>)
  }, 0)
}

export async function GET(_req: Request, context: Ctx) {
  const ctx = await getAuthenticatedPracticeContextWithRole()
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const patientId = (await context.params).id

  const { data: p } = await ctx.supabase
    .from("practice_patients")
    .select("id")
    .eq("id", patientId)
    .eq("practice_id", ctx.practiceId)
    .maybeSingle()
  if (!p) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const [
    { data: apptRows, error: apptErr },
    { data: sumRows, error: sumErr },
    { data: attRows, error: attErr },
    { data: factRows, error: factErr },
    { data: noteRows, error: noteErr },
    { data: claimRows, error: claimErr },
    { data: invoiceRows, error: invoiceErr },
  ] = await Promise.all([
    ctx.supabase
      .from("practice_appointments")
      .select("id, appt_date, start_time, end_time, status, reason, linked_consult_id")
      .eq("practice_id", ctx.practiceId)
      .eq("patient_id", patientId)
      .order("appt_date", { ascending: false })
      .limit(APPT_LIMIT * 2),
    ctx.supabase
      .from("practice_encounter_summaries")
      .select(
        "id, encounter_id, appointment_id, chief_complaint, summary_text, key_findings, follow_up, created_at"
      )
      .eq("practice_id", ctx.practiceId)
      .eq("patient_id", patientId)
      .order("created_at", { ascending: false })
      .limit(SUMMARY_LIMIT),
    ctx.supabase
      .from("patient_attachments")
      .select("id, storage_path, mime, size_bytes, description, category, created_at")
      .eq("practice_id", ctx.practiceId)
      .eq("patient_id", patientId)
      .order("created_at", { ascending: false })
      .limit(ATTACH_LIMIT),
    ctx.supabase
      .from("patient_chart_facts")
      .select("id, domain, summary, encounter_id, created_at")
      .eq("practice_id", ctx.practiceId)
      .eq("patient_id", patientId)
      .order("created_at", { ascending: false })
      .limit(FACT_LIMIT),
    ctx.supabase
      .from("patient_notes")
      .select("id, body, source, created_at")
      .eq("practice_id", ctx.practiceId)
      .eq("patient_id", patientId)
      .order("created_at", { ascending: false })
      .limit(NOTE_LIMIT),
    ctx.supabase
      .from("practice_claims")
      .select("id, status, clinical_encounter_id, appointment_id, created_at, lines, tx_nbr, medikredit_response")
      .eq("practice_id", ctx.practiceId)
      .eq("patient_id", patientId)
      .order("created_at", { ascending: false })
      .limit(CLAIM_LIMIT),
    ctx.supabase
      .from("practice_invoices")
      .select("id, invoice_number, status, claim_id, clinical_encounter_id, appointment_id, created_at, total_cents, amount_paid_cents")
      .eq("practice_id", ctx.practiceId)
      .eq("patient_id", patientId)
      .order("created_at", { ascending: false })
      .limit(INVOICE_LIMIT),
  ])

  if (apptErr) return NextResponse.json({ error: apptErr.message }, { status: 500 })
  if (sumErr) return NextResponse.json({ error: sumErr.message }, { status: 500 })
  if (attErr) return NextResponse.json({ error: attErr.message }, { status: 500 })
  if (factErr) return NextResponse.json({ error: factErr.message }, { status: 500 })
  if (noteErr) return NextResponse.json({ error: noteErr.message }, { status: 500 })
  if (claimErr) return NextResponse.json({ error: claimErr.message }, { status: 500 })
  if (invoiceErr) return NextResponse.json({ error: invoiceErr.message }, { status: 500 })

  type RawSum = {
    id: string
    encounter_id: string
    appointment_id: string | null
    chief_complaint: string | null
    summary_text: string
    key_findings: unknown
    follow_up: string | null
    created_at: string
  }

  const summaries = (sumRows ?? []) as RawSum[]
  const encounterSummaries = summaries.map((s) => ({
    id: s.id,
    encounter_id: s.encounter_id,
    appointment_id: s.appointment_id,
    chief_complaint: s.chief_complaint,
    summary_text: s.summary_text,
    key_findings: parseKeyFindings(s.key_findings),
    follow_up: s.follow_up,
    created_at: s.created_at,
  }))

  const byEncounter = new Map(encounterSummaries.map((s) => [s.encounter_id, s]))
  const byAppointment = new Map(
    encounterSummaries.filter((s) => s.appointment_id).map((s) => [s.appointment_id!, s])
  )

  const apptSorted = [...(apptRows ?? [])].sort((a, b) => {
    const ra = a as { appt_date: string; start_time: string }
    const rb = b as { appt_date: string; start_time: string }
    const dc = rb.appt_date.localeCompare(ra.appt_date)
    if (dc !== 0) return dc
    return rb.start_time.localeCompare(ra.start_time)
  }).slice(0, APPT_LIMIT)

  const appointments = apptSorted.map((r) => {
    const row = r as {
      id: string
      appt_date: string
      start_time: string
      end_time: string
      status: string
      reason: string | null
      linked_consult_id: string | null
    }
    const linked = row.linked_consult_id ? String(row.linked_consult_id) : null
    const fromAppt = byAppointment.get(row.id) ?? null
    const fromEnc = linked ? byEncounter.get(linked) ?? null : null
    return {
      id: row.id,
      appt_date: row.appt_date,
      start_time: row.start_time,
      end_time: row.end_time,
      status: row.status,
      reason: row.reason,
      linked_consult_id: linked,
      encounter_summary: fromAppt ?? fromEnc,
    }
  })

  const admin = createAdminClient()
  const rawAtt = (attRows ?? []) as {
    id: string
    storage_path: string
    mime: string
    size_bytes: number
    description: string | null
    category: string | null
    created_at: string
  }[]
  const attachments = await Promise.all(
    rawAtt.map(async (row) => {
      const { data: signed } = await admin.storage.from(BUCKET).createSignedUrl(row.storage_path, 600)
      return {
        ...row,
        signedUrl: signed?.signedUrl ?? null,
      }
    })
  )

  const latest = encounterSummaries[0] ?? null
  const recentKeyFindings = encounterSummaries.slice(0, 3).flatMap((s) => s.key_findings).slice(0, 8)

  const payload: PatientOverviewResponse = {
    ok: true,
    patientId,
    summaryCount: encounterSummaries.length,
    latestSummaryAt: latest?.created_at ?? null,
    aiContext: {
      latestChiefComplaint: latest?.chief_complaint?.trim() || null,
      latestSummaryText: latest?.summary_text?.trim() || null,
      recentKeyFindings,
      latestFollowUp: latest?.follow_up?.trim() || null,
    },
    appointments,
    attachments,
    chartFacts: ((factRows ?? []) as { id: string; domain: string; summary: string; encounter_id: string | null; created_at: string }[]).map(
      (f) => ({
        id: f.id,
        domain: f.domain,
        summary: f.summary,
        encounter_id: f.encounter_id,
        created_at: f.created_at,
      })
    ),
    notes: ((noteRows ?? []) as { id: string; body: string; source: string; created_at: string }[]).map((n) => ({
      id: n.id,
      body: n.body,
      source: n.source,
      created_at: n.created_at,
    })),
    claims: ((claimRows ?? []) as {
      id: string
      status: string
      clinical_encounter_id: string | null
      appointment_id: string | null
      created_at: string
      lines: unknown
      tx_nbr: string | null
      medikredit_response: Record<string, unknown> | null
    }[]).map((claim) => {
      const med = claim.medikredit_response as { outcome?: string; patientResponsibility?: unknown } | null
      let prZar: number | null =
        typeof med?.patientResponsibility === "number" && Number.isFinite(med.patientResponsibility)
          ? med.patientResponsibility
          : null
      if (prZar === 0) prZar = null
      return {
        id: claim.id,
        status: claim.status,
        clinical_encounter_id: claim.clinical_encounter_id,
        appointment_id: claim.appointment_id,
        created_at: claim.created_at,
        total_amount: totalClaimAmount(claim.lines),
        tx_nbr: claim.tx_nbr,
        adjudication_outcome: med?.outcome != null ? String(med.outcome) : null,
        patient_responsibility_zar: prZar,
      }
    }),
    invoices: ((invoiceRows ?? []) as {
      id: string
      invoice_number: string
      status: string
      claim_id: string | null
      clinical_encounter_id: string | null
      appointment_id: string | null
      created_at: string
      total_cents: number
      amount_paid_cents: number
    }[]).map((invoice) => ({
      id: invoice.id,
      invoice_number: invoice.invoice_number,
      status: invoice.status,
      claim_id: invoice.claim_id,
      clinical_encounter_id: invoice.clinical_encounter_id,
      appointment_id: invoice.appointment_id,
      created_at: invoice.created_at,
      total_cents: invoice.total_cents,
      amount_paid_cents: invoice.amount_paid_cents,
    })),
    encounterSummaries,
  }

  return NextResponse.json(payload)
}

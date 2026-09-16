/** Shared contract for GET /api/patients/:id/overview and PatientDetailPanel. */

export type PatientOverviewAttachment = {
  id: string
  storage_path: string
  mime: string
  size_bytes: number
  description: string | null
  category: string | null
  created_at: string
  signedUrl: string | null
}

export type PatientOverviewEncounterSummary = {
  id: string
  encounter_id: string
  appointment_id: string | null
  chief_complaint: string | null
  summary_text: string
  key_findings: string[]
  follow_up: string | null
  created_at: string
}

export type PatientOverviewAppointment = {
  id: string
  appt_date: string
  start_time: string
  end_time: string
  status: string
  reason: string | null
  linked_consult_id: string | null
  /** Signed visit summary when linked by appointment_id, encounter, or linked_consult_id */
  encounter_summary: PatientOverviewEncounterSummary | null
}

export type PatientOverviewChartFact = {
  id: string
  domain: string
  summary: string
  encounter_id: string | null
  created_at: string
}

export type PatientOverviewNote = {
  id: string
  body: string
  source: string
  created_at: string
}

export type PatientOverviewClaim = {
  id: string
  status: string
  clinical_encounter_id: string | null
  appointment_id: string | null
  created_at: string
  total_amount: number
  /** Last MediKredit TX number when persisted */
  tx_nbr?: string | null
  /** From stored `medikredit_response` JSON */
  adjudication_outcome?: string | null
  patient_responsibility_zar?: number | null
}

export type PatientOverviewInvoice = {
  id: string
  invoice_number: string
  status: string
  claim_id: string | null
  clinical_encounter_id: string | null
  appointment_id: string | null
  created_at: string
  total_cents: number
  amount_paid_cents: number
}

export type PatientOverviewResponse = {
  ok: true
  patientId: string
  /** Count of signed visit summaries (for rollup trigger) */
  summaryCount: number
  latestSummaryAt: string | null
  aiContext: {
    latestChiefComplaint: string | null
    latestSummaryText: string | null
    recentKeyFindings: string[]
    latestFollowUp: string | null
  }
  appointments: PatientOverviewAppointment[]
  attachments: PatientOverviewAttachment[]
  chartFacts: PatientOverviewChartFact[]
  notes: PatientOverviewNote[]
  claims: PatientOverviewClaim[]
  invoices: PatientOverviewInvoice[]
  /** All recent summaries (newest first), for expanded visit list */
  encounterSummaries: PatientOverviewEncounterSummary[]
}

export type PatientAiRollupResponse = {
  ok: true
  rollup: string | null
  basedOnCount: number
  latestSummaryAt?: string | null
  modelId?: string | null
  cached?: boolean
  updatedAt?: string | null
}

/** GET /api/patients/:id/ai-summary — cached rollup + latest visit context */
export type PatientAiSummaryResponse = {
  ok: true
  patientId: string
  summaryCount: number
  rollup: string | null
  basedOnCount: number
  latestChiefComplaint: string | null
  latestSummaryText: string | null
  recentKeyFindings: string[]
  latestFollowUp: string | null
  latestSummaryAt: string | null
  cached?: boolean
  updatedAt?: string | null
}

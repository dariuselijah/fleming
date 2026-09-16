/**
 * Sanity-check PatientOverviewResponse shape (offline, no server).
 * Run: npx ts-node --compiler-options '{"module":"commonjs"}' scripts/test-patient-overview-shape.ts
 */
import type { PatientAiRollupResponse, PatientOverviewResponse } from "../lib/patient/patient-overview-types"

const sample: PatientOverviewResponse = {
  ok: true,
  patientId: "00000000-0000-0000-0000-000000000001",
  summaryCount: 1,
  latestSummaryAt: new Date().toISOString(),
  aiContext: {
    latestChiefComplaint: "Headache",
    latestSummaryText: "Brief summary text.",
    recentKeyFindings: ["BP stable"],
    latestFollowUp: "RTC 1 week",
  },
  appointments: [
    {
      id: "00000000-0000-0000-0000-000000000002",
      appt_date: "2026-04-23",
      start_time: "09:00",
      end_time: "09:30",
      status: "completed",
      reason: "Follow-up",
      linked_consult_id: "00000000-0000-0000-0000-000000000003",
      encounter_summary: {
        id: "00000000-0000-0000-0000-000000000004",
        encounter_id: "00000000-0000-0000-0000-000000000003",
        appointment_id: "00000000-0000-0000-0000-000000000002",
        chief_complaint: "Headache",
        summary_text: "Visit narrative.",
        key_findings: ["Finding"],
        follow_up: "RTC",
        created_at: new Date().toISOString(),
      },
    },
  ],
  attachments: [],
  chartFacts: [
    {
      id: "00000000-0000-0000-0000-000000000005",
      domain: "finding",
      summary: "BP stable",
      encounter_id: "00000000-0000-0000-0000-000000000003",
      created_at: new Date().toISOString(),
    },
  ],
  notes: [],
  claims: [],
  invoices: [],
  encounterSummaries: [],
}

const rollupSample: PatientAiRollupResponse = {
  ok: true,
  rollup: "Recent visits are stable, with follow-up still pending.",
  basedOnCount: 2,
  latestSummaryAt: sample.latestSummaryAt,
  modelId: "gpt-4o-mini",
  cached: true,
  updatedAt: new Date().toISOString(),
}

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg)
}

function run() {
  assert(sample.ok === true, "ok")
  assert(typeof sample.summaryCount === "number", "summaryCount")
  assert(Array.isArray(sample.appointments), "appointments")
  assert(Array.isArray(sample.attachments), "attachments")
  assert(Array.isArray(sample.chartFacts), "chartFacts")
  assert(Array.isArray(sample.notes), "notes")
  assert(Array.isArray(sample.claims), "claims")
  assert(Array.isArray(sample.invoices), "invoices")
  assert(Array.isArray(sample.encounterSummaries), "encounterSummaries")
  assert(sample.aiContext.recentKeyFindings.every((x) => typeof x === "string"), "key findings")
  assert(rollupSample.ok === true, "rollup ok")
  assert(typeof rollupSample.basedOnCount === "number", "rollup count")
  assert(rollupSample.rollup === null || typeof rollupSample.rollup === "string", "rollup text")
  console.log("patient overview shape OK")
}

run()

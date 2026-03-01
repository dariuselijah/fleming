export const CLINICIAN_WORKFLOW_MODES = [
  "open_search",
  "clinical_summary",
  "drug_interactions",
  "stewardship",
  "icd10_codes",
  "med_review",
] as const

export type ClinicianWorkflowMode = (typeof CLINICIAN_WORKFLOW_MODES)[number]

export const DEFAULT_CLINICIAN_WORKFLOW_MODE: ClinicianWorkflowMode =
  "open_search"

export function normalizeClinicianWorkflowMode(
  value: string | null | undefined
): ClinicianWorkflowMode {
  if (!value) return DEFAULT_CLINICIAN_WORKFLOW_MODE
  if ((CLINICIAN_WORKFLOW_MODES as readonly string[]).includes(value)) {
    return value as ClinicianWorkflowMode
  }
  return DEFAULT_CLINICIAN_WORKFLOW_MODE
}

export const CLINICIAN_MODE_LABELS: Record<ClinicianWorkflowMode, string> = {
  open_search: "Open Search",
  clinical_summary: "Clinical Summary",
  drug_interactions: "Drug Interactions",
  stewardship: "Stewardship",
  icd10_codes: "ICD10 Codes",
  med_review: "Med Review",
}

export const CLINICIAN_MODE_PLACEHOLDERS: Record<
  ClinicianWorkflowMode,
  string
> = {
  open_search:
    "Search across notes, labs, and clinical context (e.g., summarize key findings for today's patient)...",
  clinical_summary:
    "Generate a concise clinical summary (e.g., problem list, active issues, and plan)...",
  drug_interactions:
    "Check interactions and safety (e.g., interactions between apixaban, amiodarone, and clarithromycin)...",
  stewardship:
    "Request antimicrobial stewardship guidance (e.g., de-escalation options after cultures)...",
  icd10_codes:
    "Map assessment to ICD10 coding options (e.g., diabetes with CKD and hypertension)...",
  med_review:
    "Review medication regimen for risks and optimization opportunities...",
}

export function getClinicianModeSystemInstructions(
  mode: ClinicianWorkflowMode
): string {
  const commonGuardrail =
    "If critical clinical data is missing, ask targeted follow-up questions before concluding."
  const escalationGuardrail =
    'If emergency red flags are present, explicitly escalate with direct language such as "call 911 now" or "go to the emergency department immediately."'

  switch (mode) {
    case "open_search":
      return `
CLINICIAN WORKFLOW MODE: OPEN SEARCH

Operate as a broad clinical copilot:
- Synthesize the user's query with all relevant context.
- Prioritize high-signal facts, differential framing, and next diagnostic/management steps.
- Use concise structure with practical action points.
- ${commonGuardrail}
- ${escalationGuardrail}
`.trim()
    case "clinical_summary":
      return `
CLINICIAN WORKFLOW MODE: CLINICAL SUMMARY

Prioritize a concise, chart-ready summary:
- Organize output into: one-liner, active problems, key data, and plan.
- Preserve uncertainty and clearly label assumptions.
- Keep language clinically precise and scannable.
- ${commonGuardrail}
- ${escalationGuardrail}
`.trim()
    case "drug_interactions":
      return `
CLINICIAN WORKFLOW MODE: DRUG INTERACTIONS

Prioritize medication safety analysis:
- Identify interaction pairs, mechanism, and expected clinical impact.
- Flag high-risk combinations and monitoring requirements.
- Offer safer alternatives when appropriate.
- ${commonGuardrail}
- ${escalationGuardrail}
`.trim()
    case "stewardship":
      return `
CLINICIAN WORKFLOW MODE: STEWARDSHIP

Focus on antimicrobial stewardship:
- Match likely source/pathogen risk with empiric or targeted options.
- Encourage narrowing/de-escalation when evidence allows.
- Mention duration, culture follow-up, and resistance considerations.
- ${commonGuardrail}
- ${escalationGuardrail}
`.trim()
    case "icd10_codes":
      return `
CLINICIAN WORKFLOW MODE: ICD10 CODES

Focus on coding support:
- Provide likely ICD10 candidates with short rationale for each.
- Distinguish primary versus secondary coding options when relevant.
- Note documentation details needed to improve coding specificity.
- ${commonGuardrail}
- ${escalationGuardrail}
`.trim()
    case "med_review":
      return `
CLINICIAN WORKFLOW MODE: MED REVIEW

Run a medication optimization review:
- Identify duplications, contraindications, interaction risks, and adherence complexity.
- Highlight deprescribing or optimization opportunities with rationale.
- Prioritize patient-safety and monitoring actions.
- ${commonGuardrail}
- ${escalationGuardrail}
`.trim()
    default:
      return ""
  }
}

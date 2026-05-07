import type {
  ClinicalAcuity,
  ClinicalComplexityMode,
  ClinicalCompleteness,
  ClinicalEntityExtraction,
  ClinicalIntelPreflight,
  ClinicalWorkflowIntent,
  ChartDrilldownContext,
} from "@/lib/clinical-agent/graph/types"

type NamedPattern = {
  label: string
  pattern: RegExp
}

const SYMPTOM_PATTERNS: NamedPattern[] = [
  { label: "chest pain", pattern: /\bchest pain\b/i },
  { label: "dyspnea", pattern: /\b(shortness of breath|dyspnea|breathlessness)\b/i },
  { label: "cough", pattern: /\bcough\b/i },
  { label: "fever", pattern: /\b(fever|febrile|temperature)\b/i },
  { label: "headache", pattern: /\bheadache\b/i },
  { label: "dizziness", pattern: /\b(dizziness|vertigo|lightheaded)\b/i },
  { label: "fatigue", pattern: /\b(fatigue|tired|lethargy)\b/i },
  { label: "abdominal pain", pattern: /\b(abdominal pain|stomach pain|abdominal discomfort)\b/i },
  { label: "nausea/vomiting", pattern: /\b(nausea|vomiting|emesis)\b/i },
  { label: "diarrhea", pattern: /\bdiarrhea\b/i },
  { label: "syncope", pattern: /\b(syncope|fainting)\b/i },
  { label: "palpitations", pattern: /\bpalpitations\b/i },
  { label: "edema", pattern: /\b(edema|swelling)\b/i },
  { label: "rash", pattern: /\brash\b/i },
  { label: "dysuria", pattern: /\b(dysuria|painful urination)\b/i },
]

const COMORBIDITY_PATTERNS: NamedPattern[] = [
  { label: "hypertension", pattern: /\b(hypertension|htn|high blood pressure)\b/i },
  { label: "diabetes", pattern: /\b(diabetes|dm2|type 2 diabetes|type ii diabetes)\b/i },
  { label: "heart failure", pattern: /\b(heart failure|hfr?ef|hfpef)\b/i },
  { label: "coronary artery disease", pattern: /\b(cad|coronary artery disease|ischemic heart disease)\b/i },
  { label: "chronic kidney disease", pattern: /\b(ckd|chronic kidney disease|renal insufficiency)\b/i },
  { label: "chronic liver disease", pattern: /\b(cirrhosis|chronic liver disease|hepatic insufficiency)\b/i },
  { label: "copd", pattern: /\b(copd|chronic obstructive pulmonary disease)\b/i },
  { label: "asthma", pattern: /\basthma\b/i },
  { label: "immunosuppression", pattern: /\b(immunosuppression|immunocompromised|neutropenia)\b/i },
  { label: "pregnancy", pattern: /\b(pregnan|gestation|third trimester|postpartum)\b/i },
]

const CONTRAINDICATION_PATTERNS: NamedPattern[] = [
  { label: "drug allergy", pattern: /\b(allergy|allergic|anaphylaxis)\b/i },
  { label: "bleeding risk", pattern: /\b(bleeding|hemorrhage|coagulopathy)\b/i },
  { label: "renal impairment", pattern: /\b(renal failure|ckd|e?gfr|creatinine clearance)\b/i },
  { label: "hepatic impairment", pattern: /\b(hepatic failure|liver failure|cirrhosis)\b/i },
  { label: "pregnancy", pattern: /\b(pregnan|breastfeeding|lactation)\b/i },
  { label: "qt prolongation risk", pattern: /\b(qt prolongation|torsades|qtc)\b/i },
]

const MEDICATION_PATTERNS: NamedPattern[] = [
  { label: "metformin", pattern: /\bmetformin\b/i },
  { label: "insulin", pattern: /\binsulin\b/i },
  { label: "lisinopril", pattern: /\blisinopril\b/i },
  { label: "losartan", pattern: /\blosartan\b/i },
  { label: "amlodipine", pattern: /\bamlodipine\b/i },
  { label: "atorvastatin", pattern: /\batorvastatin\b/i },
  { label: "simvastatin", pattern: /\bsimvastatin\b/i },
  { label: "aspirin", pattern: /\baspirin\b/i },
  { label: "apixaban", pattern: /\bapixaban\b/i },
  { label: "warfarin", pattern: /\bwarfarin\b/i },
  { label: "amiodarone", pattern: /\bamiodarone\b/i },
  { label: "ibuprofen", pattern: /\bibuprofen\b/i },
]

const LAB_PATTERNS: NamedPattern[] = [
  { label: "troponin", pattern: /\btroponin\b/i },
  { label: "creatinine", pattern: /\bcreatinine\b/i },
  { label: "egfr", pattern: /\be\s?gfr\b/i },
  { label: "a1c", pattern: /\b(hba1c|a1c)\b/i },
  { label: "hemoglobin", pattern: /\b(hemoglobin|hb)\b/i },
  { label: "wbc", pattern: /\b(wbc|white blood cell)\b/i },
  { label: "crp", pattern: /\bcrp\b/i },
  { label: "esr", pattern: /\besr\b/i },
  { label: "lactate", pattern: /\blactate\b/i },
  { label: "d-dimer", pattern: /\bd-?dimer\b/i },
]

const VITAL_PATTERNS: NamedPattern[] = [
  { label: "heart rate", pattern: /\b(heart rate|hr|tachycardia|bradycardia)\b/i },
  { label: "blood pressure", pattern: /\b(blood pressure|bp|hypotension|hypertension)\b/i },
  { label: "respiratory rate", pattern: /\b(respiratory rate|rr|tachypnea)\b/i },
  { label: "oxygen saturation", pattern: /\b(oxygen saturation|spo2|o2 sat)\b/i },
  { label: "temperature", pattern: /\b(temperature|temp|febrile)\b/i },
]

const HIGH_RISK_PATTERNS: NamedPattern[] = [
  { label: "hemodynamic instability", pattern: /\b(shock|hypotension|unstable)\b/i },
  { label: "acute coronary syndrome concern", pattern: /\b(stemi|nstemi|acute coronary|acs)\b/i },
  { label: "stroke concern", pattern: /\b(stroke|focal deficit|hemiparesis|aphasia)\b/i },
  { label: "sepsis concern", pattern: /\b(sepsis|septic|bacteremia)\b/i },
  { label: "airway compromise", pattern: /\b(stridor|airway|anaphylaxis)\b/i },
]

const CHART_DRILLDOWN_MARKER = "CHART_DRILLDOWN_CONTEXT:"

function dedupe(values: string[]): string[] {
  return Array.from(new Set(values))
}

function pickMatches(query: string, patterns: NamedPattern[]): string[] {
  return dedupe(
    patterns
      .filter((item) => item.pattern.test(query))
      .map((item) => item.label)
  )
}

function parseAgeYears(query: string): number | undefined {
  const agePattern = /\b(?:age\s*)?(\d{1,3})\s*(?:y\/o|yo|years?\s*old|yr(?:s)?\s*old)\b/i
  const directAgePattern = /\bage\s*[:=]?\s*(\d{1,3})\b/i
  const match = query.match(agePattern) || query.match(directAgePattern)
  if (!match?.[1]) return undefined
  const parsed = Number.parseInt(match[1], 10)
  if (!Number.isFinite(parsed) || parsed <= 0 || parsed > 120) return undefined
  return parsed
}

function inferSex(query: string): ClinicalEntityExtraction["sex"] {
  if (/\b(female|woman|girl|f)\b/i.test(query)) return "female"
  if (/\b(male|man|boy|m)\b/i.test(query)) return "male"
  if (/\b(nonbinary|trans|intersex)\b/i.test(query)) return "other"
  return "unknown"
}

function inferWorkflowIntent(query: string): ClinicalWorkflowIntent {
  if (/\b(viva|osce|exam mode|exam|board|shelf|simulate|oral exam)\b/i.test(query)) {
    return "exam_mode"
  }
  if (
    /\b(workflow|handoff|icd|coding|billing|coverage|npi|documentation|administrative)\b/i.test(
      query
    )
  ) {
    return "operational"
  }
  if (
    /\b(lab workflow|benchling|protocol setup|assay|wet lab|sample processing)\b/i.test(
      query
    )
  ) {
    return "lab_workflow"
  }
  if (
    /\b(treatment|manage|management|dose|dosing|drug|medication|therapy|plan)\b/i.test(
      query
    )
  ) {
    return "treatment_planning"
  }
  if (
    /\b(differential|diagnos|workup|red flags|triage|what could this be|etiology)\b/i.test(
      query
    )
  ) {
    return "diagnostic_reasoning"
  }
  return "general"
}

function inferAcuity(query: string, highRiskSignals: string[]): ClinicalAcuity {
  if (
    highRiskSignals.length > 0 ||
    /\b(emergency|urgent|critical|severe|unstable|acute)\b/i.test(query)
  ) {
    return "high"
  }
  if (/\b(worsening|persistent|moderate|concerning)\b/i.test(query)) {
    return "moderate"
  }
  return "low"
}

function detectPregnancy(query: string, inferredSex: ClinicalEntityExtraction["sex"]): boolean | undefined {
  const pregnancySignal = /\b(pregnan|postpartum|gestation|trimester)\b/i.test(query)
  if (!pregnancySignal) return undefined
  if (inferredSex === "female" || inferredSex === "unknown") return true
  return undefined
}

function parseChartDrilldownContext(query: string): ChartDrilldownContext | null {
  const markerIndex = query.lastIndexOf(CHART_DRILLDOWN_MARKER)
  if (markerIndex < 0) return null
  const payload = query
    .slice(markerIndex + CHART_DRILLDOWN_MARKER.length)
    .trim()
  if (!payload) return null
  try {
    const parsed = JSON.parse(payload) as Record<string, unknown>
    const context: ChartDrilldownContext = {
      chartTitle:
        typeof parsed.chartTitle === "string"
          ? parsed.chartTitle
          : typeof parsed.title === "string"
            ? parsed.title
            : undefined,
      chartType: typeof parsed.chartType === "string" ? parsed.chartType : undefined,
      source: typeof parsed.source === "string" ? parsed.source : undefined,
      xKey: typeof parsed.xKey === "string" ? parsed.xKey : undefined,
      xValue:
        typeof parsed.xValue === "string" || typeof parsed.xValue === "number"
          ? parsed.xValue
          : undefined,
      seriesKey: typeof parsed.seriesKey === "string" ? parsed.seriesKey : undefined,
      seriesLabel: typeof parsed.seriesLabel === "string" ? parsed.seriesLabel : undefined,
      value:
        typeof parsed.value === "string" ||
        typeof parsed.value === "number" ||
        parsed.value === null
          ? (parsed.value as string | number | null)
          : undefined,
    }
    return context
  } catch {
    return null
  }
}

function stripChartDrilldownContext(query: string): string {
  const markerIndex = query.lastIndexOf(CHART_DRILLDOWN_MARKER)
  if (markerIndex < 0) return query
  return query.slice(0, markerIndex).trim()
}

function hasTimeCourseSignal(query: string): boolean {
  return /\b(since|for\s+\d+|hours?|days?|weeks?|months?|started|onset)\b/i.test(query)
}

function buildCompletenessState(
  entities: ClinicalEntityExtraction,
  normalizedQuery: string,
  chartDrilldownContext: ChartDrilldownContext | null
): ClinicalCompleteness {
  const missing: string[] = []
  const rationale: string[] = []
  const hasCoreProblemSignal =
    entities.symptoms.length > 0 ||
    /\b(problem|issue|condition|case|diagnosis|management)\b/i.test(normalizedQuery)

  if (
    (entities.workflowIntent === "diagnostic_reasoning" ||
      entities.workflowIntent === "treatment_planning" ||
      entities.workflowIntent === "exam_mode") &&
    !hasCoreProblemSignal &&
    !chartDrilldownContext
  ) {
    missing.push("primary_problem_or_symptom")
  }

  if (
    (entities.workflowIntent === "diagnostic_reasoning" ||
      entities.workflowIntent === "treatment_planning") &&
    !hasTimeCourseSignal(normalizedQuery) &&
    !chartDrilldownContext
  ) {
    missing.push("timeline_or_onset")
  }

  if (
    (entities.workflowIntent === "diagnostic_reasoning" ||
      entities.workflowIntent === "treatment_planning" ||
      entities.workflowIntent === "exam_mode") &&
    !entities.ageYears &&
    !chartDrilldownContext
  ) {
    missing.push("age")
  }

  if (
    entities.workflowIntent === "treatment_planning" &&
    entities.comorbidities.length === 0
  ) {
    missing.push("relevant_comorbidities")
  }

  if (
    entities.workflowIntent === "treatment_planning" &&
    entities.medications.length === 0
  ) {
    missing.push("current_medications")
  }

  if (
    entities.acuity === "high" &&
    entities.vitalsMentioned.length === 0 &&
    entities.labsMentioned.length === 0
  ) {
    missing.push("critical_vitals_or_labs")
  }

  if (missing.length === 0) {
    rationale.push("Critical variables for the inferred workflow are present.")
    return {
      state: "complete",
      missingCriticalVariables: [],
      rationale,
    }
  }

  const severeMissing = missing.length >= 3 || missing.includes("primary_problem_or_symptom")
  if (severeMissing) {
    rationale.push(
      "Several high-impact clinical variables are missing; response should remain conditional."
    )
    return {
      state: "incomplete_evidence",
      missingCriticalVariables: missing,
      rationale,
    }
  }

  rationale.push("Some context is missing; safe partial guidance is still possible.")
  return {
    state: "partial",
    missingCriticalVariables: missing,
    rationale,
  }
}

function computeComplexityMode(input: {
  query: string
  entities: ClinicalEntityExtraction
  completeness: ClinicalCompleteness
  chartDrilldownContext: ChartDrilldownContext | null
}): ClinicalComplexityMode {
  if (input.chartDrilldownContext) {
    return "fast-track"
  }

  const deepDiveSignalCount = [
    input.entities.acuity === "high",
    input.entities.highRiskSignals.length > 0,
    input.entities.workflowIntent === "exam_mode",
    input.entities.workflowIntent === "diagnostic_reasoning",
    input.entities.symptoms.length >= 2,
    input.entities.comorbidities.length >= 2,
    input.completeness.state === "incomplete_evidence",
    /\b(compare|versus|differential|algorithm|complex|multifactor)\b/i.test(input.query),
    input.query.length > 180,
  ].filter(Boolean).length

  return deepDiveSignalCount >= 3 ? "deep-dive" : "fast-track"
}

export function buildClinicalIntelPreflight(query: string): ClinicalIntelPreflight {
  const chartDrilldownContext = parseChartDrilldownContext(query)
  const normalizedQuery = stripChartDrilldownContext(query)
  const sex = inferSex(normalizedQuery)
  const highRiskSignals = pickMatches(normalizedQuery, HIGH_RISK_PATTERNS)
  const entities: ClinicalEntityExtraction = {
    ageYears: parseAgeYears(normalizedQuery),
    sex,
    pregnant: detectPregnancy(normalizedQuery, sex),
    symptoms: pickMatches(normalizedQuery, SYMPTOM_PATTERNS),
    comorbidities: pickMatches(normalizedQuery, COMORBIDITY_PATTERNS),
    contraindications: pickMatches(normalizedQuery, CONTRAINDICATION_PATTERNS),
    medications: pickMatches(normalizedQuery, MEDICATION_PATTERNS),
    labsMentioned: pickMatches(normalizedQuery, LAB_PATTERNS),
    vitalsMentioned: pickMatches(normalizedQuery, VITAL_PATTERNS),
    workflowIntent: inferWorkflowIntent(normalizedQuery),
    highRiskSignals,
    acuity: inferAcuity(normalizedQuery, highRiskSignals),
  }
  const completeness = buildCompletenessState(
    entities,
    normalizedQuery,
    chartDrilldownContext
  )
  const complexityMode = computeComplexityMode({
    query: normalizedQuery,
    entities,
    completeness,
    chartDrilldownContext,
  })
  const examMode = entities.workflowIntent === "exam_mode"
  return {
    entities,
    completeness,
    complexityMode,
    examMode,
    chartDrilldownContext,
  }
}

export function formatMissingVariablePrompt(variable: string): string {
  const prompts: Record<string, string> = {
    primary_problem_or_symptom:
      "What is the primary symptom/problem and the top concern you want prioritized?",
    timeline_or_onset:
      "What is the timeline (onset, duration, progression, and any recent change)?",
    age: "What is the patient's age?",
    relevant_comorbidities:
      "Which major comorbidities should influence risk and treatment decisions?",
    current_medications:
      "What medications is the patient currently taking (including recent changes)?",
    critical_vitals_or_labs:
      "What recent vitals or critical labs are available right now?",
  }
  return prompts[variable] || `Please provide: ${variable.replace(/_/g, " ")}.`
}


import type {
  ClinicalConnectorId,
  ClinicalIntentClass,
  ClinicalModePolicy,
  GraphRole,
} from "./types"

function includesAny(text: string, terms: string[]): boolean {
  return terms.some((term) => text.includes(term))
}

/**
 * Determine if the query targets a static guideline that should be
 * resolved from the pre-indexed local corpus rather than live PubMed.
 */
export function isStaticGuidelineQuery(query: string): boolean {
  const normalized = query.toLowerCase()
  return includesAny(normalized, [
    "nccn",
    "aha guideline",
    "acc guideline",
    "aha/acc",
    "uspstf",
    "nice guideline",
    "who guideline",
    "idsa guideline",
    "esc guideline",
    "asco guideline",
    "kdigo",
    "gold copd",
    "ats guideline",
    "jnc ",
    "chest guideline",
    "guideline",
    "recommendation",
    "consensus statement",
    "practice guideline",
    "position statement",
    "first-line",
    "first line",
    "management of",
    "treatment of",
    "workup",
    "initial management",
    "stepwise",
    "empiric",
    "prophylaxis",
    "screening",
    "acp",
    "ada guideline",
    "acog",
    "aap guideline",
    "acr guideline",
    "aga guideline",
    "acg guideline",
    "aasld",
    "apa guideline",
    "cdc guideline",
    "nih guideline",
    "gina",
    "eular",
    "aan guideline",
  ])
}

/**
 * Score how sufficient local evidence results are.
 * Returns true if local results are "good enough" to skip live PubMed.
 */
export function isLocalEvidenceSufficient(
  resultCount: number,
  topScore: number | undefined,
  thresholds?: { minCount?: number; minScore?: number },
): boolean {
  const minCount = thresholds?.minCount ?? 2
  const minScore = thresholds?.minScore ?? 0.12
  if (resultCount >= minCount && (topScore ?? 0) >= minScore) return true
  if (resultCount >= 6) return true
  return false
}

export function classifyClinicalIntent(query: string): ClinicalIntentClass {
  const normalized = query.toLowerCase()

  if (
    includesAny(normalized, [
      "guideline",
      "treatment",
      "therapy",
      "diagnosis",
      "management",
      "latest",
      "recent",
      "current",
      "rct",
      "randomized",
      "trial",
      "systematic review",
      "meta-analysis",
      "bp",
      "hypertension",
      "differential",
      "risk",
      "contraindication",
      "screening",
      "prevention",
      "prophylaxis",
      "dose",
      "dosing",
      "first-line",
      "first line",
      "second-line",
      "medication",
      "drug",
      "antibiotic",
      "antihypertensive",
      "statin",
      "insulin",
      "workup",
      "algorithm",
      "protocol",
      "empiric",
      "sepsis",
      "pneumonia",
      "diabetes",
      "cancer",
      "heart failure",
      "stroke",
      "infection",
      "surgery",
      "perioperative",
      "emergency",
      "acute",
      "chronic",
      "symptom",
      "side effect",
      "adverse",
      "indication",
      "evidence",
    ])
  ) {
    return "clinical_evidence"
  }

  if (
    includesAny(normalized, [
      "preprint",
      "dataset",
      "molecule",
      "compound",
      "mechanism",
      "research",
      "pathway",
      "study design",
      "schematic",
      "biomarker",
      "transcriptomic",
      "proteomic",
    ])
  ) {
    return "research_discovery"
  }

  if (
    includesAny(normalized, [
      "npi",
      "provider",
      "coverage",
      "billing",
      "cms",
      "payer",
      "reimbursement",
    ])
  ) {
    return "provider_admin"
  }

  if (
    includesAny(normalized, ["biorender", "figure", "diagram", "illustration", "icon"])
  ) {
    return "visual_asset"
  }

  if (
    includesAny(normalized, ["benchling", "lab workflow", "experiment", "protocol"])
  ) {
    return "lab_workflow"
  }

  return "general"
}

function isDrugQuery(query: string): boolean {
  const n = query.toLowerCase()
  return includesAny(n, [
    "interaction",
    "contraindication",
    "side effect",
    "adverse",
    "drug label",
    "prescribing",
    "boxed warning",
    "black box",
    "dosing",
    "dose adjustment",
    "renal dosing",
    "hepatic dosing",
    "drug interaction",
    "ddi",
    "warfarin",
    "heparin",
    "doac",
    "anticoagulant",
    "antibiotic",
    "nsaid",
    "opioid",
    "statin",
    "ace inhibitor",
    "arb",
    "beta blocker",
    "calcium channel",
    "ssri",
    "snri",
    "benzodiazepine",
    "insulin",
    "metformin",
    "sglt2",
    "glp-1",
    "medication safety",
    "polypharmacy",
    "deprescribing",
  ])
}

export function selectConnectorPriority(
  intent: ClinicalIntentClass,
  query?: string,
): ClinicalConnectorId[] {
  const drugFocused = query ? isDrugQuery(query) : false

  if (intent === "clinical_evidence") {
    if (drugFocused) {
      return [
        "openfda",
        "rxnorm",
        "guideline",
        "pubmed",
        "clinical_trials",
        "scholar_gateway",
        "chembl",
        "biorxiv",
        "cms_coverage",
        "npi_registry",
        "synapse",
        "benchling",
        "biorender",
      ]
    }
    if (query && isStaticGuidelineQuery(query)) {
      return [
        "guideline",
        "clinical_trials",
        "scholar_gateway",
        "pubmed",
        "openfda",
        "rxnorm",
        "biorxiv",
        "chembl",
        "cms_coverage",
        "npi_registry",
        "synapse",
        "benchling",
        "biorender",
      ]
    }
    return [
      "guideline",
      "pubmed",
      "clinical_trials",
      "openfda",
      "rxnorm",
      "scholar_gateway",
      "biorxiv",
      "chembl",
      "cms_coverage",
      "npi_registry",
      "synapse",
      "benchling",
      "biorender",
    ]
  }
  if (intent === "research_discovery") {
    return [
      "pubmed",
      "scholar_gateway",
      "biorxiv",
      "chembl",
      "synapse",
      "clinical_trials",
      "guideline",
      "rxnorm",
      "openfda",
      "benchling",
      "cms_coverage",
      "npi_registry",
      "biorender",
    ]
  }
  if (intent === "provider_admin") {
    return [
      "cms_coverage",
      "npi_registry",
      "guideline",
      "pubmed",
      "openfda",
      "rxnorm",
      "clinical_trials",
      "scholar_gateway",
      "biorxiv",
      "chembl",
      "synapse",
      "benchling",
      "biorender",
    ]
  }
  if (intent === "visual_asset") {
    return [
      "biorender",
      "scholar_gateway",
      "pubmed",
      "guideline",
      "biorxiv",
      "clinical_trials",
      "chembl",
      "synapse",
      "rxnorm",
      "openfda",
      "benchling",
      "cms_coverage",
      "npi_registry",
    ]
  }
  if (intent === "lab_workflow") {
    return [
      "benchling",
      "synapse",
      "chembl",
      "pubmed",
      "scholar_gateway",
      "biorxiv",
      "clinical_trials",
      "guideline",
      "rxnorm",
      "openfda",
      "cms_coverage",
      "npi_registry",
      "biorender",
    ]
  }
  return [
    "guideline",
    "pubmed",
    "clinical_trials",
    "openfda",
    "rxnorm",
    "scholar_gateway",
    "biorxiv",
    "chembl",
    "synapse",
    "cms_coverage",
    "npi_registry",
    "benchling",
    "biorender",
  ]
}

export function buildModePolicy(
  role: GraphRole,
  learningMode?: string | null,
  clinicianMode?: string | null
): ClinicalModePolicy {
  const studentMode = role === "medical_student"
  const clinicianModeEnabled = role === "doctor"

  const strictUncertaintyFromClinicianMode =
    clinicianModeEnabled &&
    (clinicianMode === "clinical_summary" ||
      clinicianMode === "stewardship" ||
      clinicianMode === "drug_interactions")

  const evidenceForStudentGuideline = studentMode && learningMode === "guideline"

  return {
    studentMode,
    clinicianMode: clinicianModeEnabled,
    requireStrictUncertainty: strictUncertaintyFromClinicianMode,
    requireEvidenceForClinicalClaims:
      clinicianModeEnabled || evidenceForStudentGuideline || studentMode,
  }
}

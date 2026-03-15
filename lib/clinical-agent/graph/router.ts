import type {
  ClinicalConnectorId,
  ClinicalIntentClass,
  ClinicalModePolicy,
  GraphRole,
} from "./types"

function includesAny(text: string, terms: string[]): boolean {
  return terms.some((term) => text.includes(term))
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

export function selectConnectorPriority(intent: ClinicalIntentClass): ClinicalConnectorId[] {
  if (intent === "clinical_evidence") {
    return [
      "guideline",
      "pubmed",
      "clinical_trials",
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
      "cms_coverage",
      "npi_registry",
      "biorender",
    ]
  }
  return [
    "pubmed",
    "guideline",
    "clinical_trials",
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

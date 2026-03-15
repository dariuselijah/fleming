export type ClinicalConnectorId =
  | "pubmed"
  | "guideline"
  | "clinical_trials"
  | "scholar_gateway"
  | "biorxiv"
  | "biorender"
  | "npi_registry"
  | "synapse"
  | "cms_coverage"
  | "chembl"
  | "benchling"

export type ClinicalIntentClass =
  | "clinical_evidence"
  | "research_discovery"
  | "provider_admin"
  | "visual_asset"
  | "lab_workflow"
  | "general"

export type GraphRole = "doctor" | "general" | "medical_student" | undefined

export type ClinicalModePolicy = {
  studentMode: boolean
  clinicianMode: boolean
  requireStrictUncertainty: boolean
  requireEvidenceForClinicalClaims: boolean
}

export type ClinicalGraphInput = {
  query: string
  role: GraphRole
  learningMode?: string | null
  clinicianMode?: string | null
  artifactIntent?: "none" | "quiz"
  supportsTools: boolean
  evidenceEnabled: boolean
  fanoutPreferred?: boolean
  availableToolNames: string[]
}

export type ClinicalGraphOutput = {
  intent: ClinicalIntentClass
  selectedConnectorIds: ClinicalConnectorId[]
  selectedToolNames: string[]
  modePolicy: ClinicalModePolicy
  systemPromptAdditions: string[]
  maxSteps: number
  trace: string[]
  routingSummary: {
    intent: ClinicalIntentClass
    selectedConnectorIds: ClinicalConnectorId[]
    selectedToolNames: string[]
    modePolicy: ClinicalModePolicy
    maxSteps: number
  }
}

export const CONNECTOR_TOOL_NAME_MAP: Record<ClinicalConnectorId, string[]> = {
  pubmed: ["pubmedSearch", "pubmedLookup"],
  guideline: ["guidelineSearch"],
  clinical_trials: ["clinicalTrialsSearch"],
  scholar_gateway: ["scholarGatewaySearch"],
  biorxiv: ["bioRxivSearch"],
  biorender: ["bioRenderSearch"],
  npi_registry: ["npiRegistrySearch"],
  synapse: ["synapseSearch"],
  cms_coverage: ["cmsCoverageSearch"],
  chembl: ["chemblSearch"],
  benchling: ["benchlingSearch"],
}

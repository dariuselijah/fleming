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

export type ClinicalComplexityMode = "fast-track" | "deep-dive"

export type ClinicalWorkflowIntent =
  | "diagnostic_reasoning"
  | "treatment_planning"
  | "operational"
  | "lab_workflow"
  | "exam_mode"
  | "general"

export type ClinicalAcuity = "low" | "moderate" | "high"

export type ClinicalEntityExtraction = {
  ageYears?: number
  sex?: "female" | "male" | "other" | "unknown"
  pregnant?: boolean
  symptoms: string[]
  comorbidities: string[]
  contraindications: string[]
  medications: string[]
  labsMentioned: string[]
  vitalsMentioned: string[]
  workflowIntent: ClinicalWorkflowIntent
  acuity: ClinicalAcuity
  highRiskSignals: string[]
}

export type ClinicalCompletenessState =
  | "complete"
  | "partial"
  | "incomplete_evidence"

export type ClinicalCompleteness = {
  state: ClinicalCompletenessState
  missingCriticalVariables: string[]
  rationale: string[]
}

export type ChartDrilldownContext = {
  chartTitle?: string
  chartType?: string
  source?: string
  xKey?: string
  xValue?: string | number
  seriesKey?: string
  seriesLabel?: string
  value?: string | number | null
}

export type ClinicalIntelPreflight = {
  entities: ClinicalEntityExtraction
  completeness: ClinicalCompleteness
  complexityMode: ClinicalComplexityMode
  examMode: boolean
  chartDrilldownContext?: ChartDrilldownContext | null
}

export type ClinicalIncompleteEvidencePolicy =
  | "none"
  | "balanced_conditional"
  | "strict_blocking"

export type GatekeeperDecision = {
  scope: "connector" | "tool"
  id: string
  decision: "allow" | "skip"
  reasonCode: string
  reason: string
  detail?: string
}

export type ConfidenceTransition = {
  iteration: number
  before: number
  after: number
  reason: string
}

export type LoopTransition = {
  iteration: number
  decision: "continue" | "compose"
  reason: string
  observedConfidence: number
  targetConfidence: number
}

export type PlannerTaskStatus = "pending" | "running" | "completed" | "failed"

export type PlannerTaskPhase =
  | "preflight"
  | "planner"
  | "gatekeeper"
  | "retrieval"
  | "evaluator"
  | "visualization"
  | "composer"

export type PlannerTaskPlanItem = {
  id: string
  taskName: string
  description: string
  reasoning: string
  status: PlannerTaskStatus
  dependsOn: string[]
  phase: PlannerTaskPhase
  isCritical: boolean
}

export type RetrievalNoteOutcome = "success" | "no-signal" | "fallback" | "error"

export type RetrievalFallbackNote = {
  id: string
  connectorId: string
  outcome: RetrievalNoteOutcome
  note: string
  fallbackConnectorId?: string
  detail?: string
}

export type LmsProvider = "moodle" | "canvas"

export type LmsContextSnapshot = {
  courseCount: number
  artifactCount: number
  providerIds: LmsProvider[]
  recentCourseNames: string[]
  upcomingDueTitles: string[]
}

export type ClinicalGraphInput = {
  query: string
  role: GraphRole
  learningMode?: string | null
  clinicianMode?: string | null
  lmsContext?: LmsContextSnapshot | null
  artifactIntent?: "none" | "quiz"
  supportsTools: boolean
  evidenceEnabled: boolean
  fanoutPreferred?: boolean
  availableToolNames: string[]
  clinicalIntel?: ClinicalIntelPreflight
  incompleteEvidencePolicy?: ClinicalIncompleteEvidencePolicy
  chartDrilldownContext?: ChartDrilldownContext | null
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
    complexityMode?: ClinicalComplexityMode
    clinicalCompleteness?: ClinicalCompleteness
  }
  clinicalIntel?: ClinicalIntelPreflight
  complexityMode?: ClinicalComplexityMode
  clinicalCompleteness?: ClinicalCompleteness
  gatekeeperDecisions?: GatekeeperDecision[]
  confidenceTransitions?: ConfidenceTransition[]
  loopTransitions?: LoopTransition[]
  taskPlan?: PlannerTaskPlanItem[]
  retrievalNotes?: RetrievalFallbackNote[]
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

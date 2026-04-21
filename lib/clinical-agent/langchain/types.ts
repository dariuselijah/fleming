import type {
  ClinicalCompleteness,
  ClinicalComplexityMode,
  ClinicalGraphInput,
  ClinicalGraphOutput,
  ClinicalIntelPreflight,
  ConfidenceTransition,
  GatekeeperDecision,
  LoopTransition,
  PlannerTaskPlanItem,
  RetrievalFallbackNote,
} from "@/lib/clinical-agent/graph/types"

export type SupervisorRuntimeStepStatus =
  | "pending"
  | "running"
  | "completed"
  | "failed"

export type SupervisorRuntimeStep = {
  id: string
  label: string
  status: SupervisorRuntimeStepStatus
  detail?: string
  dependsOn?: string[]
  phase?:
    | "preflight"
    | "planner"
    | "gatekeeper"
    | "retrieval"
    | "evaluator"
    | "visualization"
    | "composer"
}

export type SupervisorDagNode = {
  id: string
  label: string
  status: SupervisorRuntimeStepStatus
  dependsOn: string[]
  detail?: string
}

export type ChartDataShape =
  | "none"
  | "temporal"
  | "comparison"
  | "proportional"
  | "decision-tree"
  | "trade-off"

export type ChartVisualMode = "text-first" | "visual-first"

export type ChartTypeRecommendation =
  | "line"
  | "bar"
  | "area"
  | "stacked-bar"
  | "composed"
  | "decision-tree"

export type IncompleteEvidenceState =
  | "complete"
  | "partial"
  | "incomplete_evidence"

export type MissingVariablePrompt = {
  variable: string
  prompt: string
}

export type ChartPlanHint = {
  enabled: boolean
  suggestedCount: number
  reasons: string[]
  dataShape: ChartDataShape
  visualMode: ChartVisualMode
  preferredChartTypes: ChartTypeRecommendation[]
  feasibilityScore: number
  examDecisionTree: boolean
  drilldownEnabled: boolean
  fallbackReason?: string
}

export type LangChainSupervisorInput = ClinicalGraphInput

export type LangChainSupervisorOutput = ClinicalGraphOutput & {
  orchestrationEngine: "langchain-supervisor"
  loopIterations: number
  confidence: number
  sourceDiversity: number
  complexityMode: ClinicalComplexityMode
  clinicalIntel: ClinicalIntelPreflight
  clinicalCompleteness: ClinicalCompleteness
  incompleteEvidenceState: IncompleteEvidenceState
  missingVariablePrompts: MissingVariablePrompt[]
  gatekeeperDecisions: GatekeeperDecision[]
  loopTransitions: LoopTransition[]
  confidenceTransitions: ConfidenceTransition[]
  taskPlan: PlannerTaskPlanItem[]
  retrievalNotes: RetrievalFallbackNote[]
  dynamicChecklist: SupervisorRuntimeStep[]
  runtimeSteps: SupervisorRuntimeStep[]
  runtimeDag: SupervisorDagNode[]
  chartPlan: ChartPlanHint
}

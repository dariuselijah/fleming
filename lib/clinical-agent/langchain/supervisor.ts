import { Annotation, END, START, StateGraph } from "@langchain/langgraph"
import {
  buildModePolicy,
  classifyClinicalIntent,
  selectConnectorPriority,
} from "@/lib/clinical-agent/graph/router"
import {
  CONNECTOR_TOOL_NAME_MAP,
  type ClinicalCompleteness,
  type ClinicalComplexityMode,
  type ClinicalConnectorId,
  type ClinicalIncompleteEvidencePolicy,
  type ClinicalIntentClass,
  type LmsContextSnapshot,
  type ClinicalModePolicy,
  type ClinicalIntelPreflight,
  type ConfidenceTransition,
  type GatekeeperDecision,
  type LoopTransition,
  type PlannerTaskPlanItem,
  type RetrievalFallbackNote,
  type PlannerTaskStatus,
} from "@/lib/clinical-agent/graph/types"
import { recordHarnessRun } from "@/lib/clinical-agent/telemetry"
import {
  buildAdaptiveFanoutPlan,
  evaluateAdaptiveFanoutCoverage,
} from "./policy"
import {
  buildClinicalIntelPreflight,
  formatMissingVariablePrompt,
} from "./clinical-intel"
import type {
  ChartPlanHint,
  IncompleteEvidenceState,
  LangChainSupervisorInput,
  LangChainSupervisorOutput,
  MissingVariablePrompt,
  SupervisorDagNode,
  SupervisorRuntimeStep,
} from "./types"

type TaskDepthTier = "simple" | "moderate" | "complex"

type SupervisorState = {
  input: LangChainSupervisorInput
  intent: ClinicalIntentClass
  modePolicy: ClinicalModePolicy
  connectorOrder: ClinicalConnectorId[]
  selectedConnectorIds: ClinicalConnectorId[]
  selectedToolNames: string[]
  systemPromptAdditions: string[]
  maxSteps: number
  trace: string[]
  iteration: number
  maxIterations: number
  confidence: number
  sourceDiversity: number
  shouldContinue: boolean
  plannerNotes: string[]
  taskPlan: PlannerTaskPlanItem[]
  retrievalNotes: RetrievalFallbackNote[]
  depthTier: TaskDepthTier
  depthTarget: number
  plannerPreferredConnectorIds: ClinicalConnectorId[]
  plannerPreferredToolNames: string[]
  runtimeSteps: SupervisorRuntimeStep[]
  dynamicChecklist: SupervisorRuntimeStep[]
  runtimeDag: SupervisorDagNode[]
  chartPlan: ChartPlanHint
  clinicalIntel: ClinicalIntelPreflight
  complexityMode: ClinicalComplexityMode
  clinicalCompleteness: ClinicalCompleteness
  incompleteEvidencePolicy: ClinicalIncompleteEvidencePolicy
  incompleteEvidenceState: IncompleteEvidenceState
  missingVariablePrompts: MissingVariablePrompt[]
  gatekeeperDecisions: GatekeeperDecision[]
  loopTransitions: LoopTransition[]
  confidenceTransitions: ConfidenceTransition[]
}

const SupervisorStateAnnotation = Annotation.Root({
  input: Annotation<LangChainSupervisorInput>,
  intent: Annotation<ClinicalIntentClass>,
  modePolicy: Annotation<ClinicalModePolicy>,
  connectorOrder: Annotation<ClinicalConnectorId[]>,
  selectedConnectorIds: Annotation<ClinicalConnectorId[]>,
  selectedToolNames: Annotation<string[]>,
  systemPromptAdditions: Annotation<string[]>,
  maxSteps: Annotation<number>,
  trace: Annotation<string[]>,
  iteration: Annotation<number>,
  maxIterations: Annotation<number>,
  confidence: Annotation<number>,
  sourceDiversity: Annotation<number>,
  shouldContinue: Annotation<boolean>,
  plannerNotes: Annotation<string[]>,
  taskPlan: Annotation<PlannerTaskPlanItem[]>,
  retrievalNotes: Annotation<RetrievalFallbackNote[]>,
  depthTier: Annotation<TaskDepthTier>,
  depthTarget: Annotation<number>,
  plannerPreferredConnectorIds: Annotation<ClinicalConnectorId[]>,
  plannerPreferredToolNames: Annotation<string[]>,
  runtimeSteps: Annotation<SupervisorRuntimeStep[]>,
  dynamicChecklist: Annotation<SupervisorRuntimeStep[]>,
  runtimeDag: Annotation<SupervisorDagNode[]>,
  chartPlan: Annotation<ChartPlanHint>,
  clinicalIntel: Annotation<ClinicalIntelPreflight>,
  complexityMode: Annotation<ClinicalComplexityMode>,
  clinicalCompleteness: Annotation<ClinicalCompleteness>,
  incompleteEvidencePolicy: Annotation<ClinicalIncompleteEvidencePolicy>,
  incompleteEvidenceState: Annotation<IncompleteEvidenceState>,
  missingVariablePrompts: Annotation<MissingVariablePrompt[]>,
  gatekeeperDecisions: Annotation<GatekeeperDecision[]>,
  loopTransitions: Annotation<LoopTransition[]>,
  confidenceTransitions: Annotation<ConfidenceTransition[]>,
})

function dedupe<T>(values: T[]): T[] {
  return Array.from(new Set(values))
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

function formatPercent(value: number): string {
  return `${Math.round(clamp(value, 0, 1) * 100)}%`
}

function summarizeClinicalIntel(clinicalIntel: ClinicalIntelPreflight): string {
  const symptoms = clinicalIntel.entities.symptoms.slice(0, 3).join(", ") || "none"
  const comorbidities =
    clinicalIntel.entities.comorbidities.slice(0, 3).join(", ") || "none"
  const missing =
    clinicalIntel.completeness.missingCriticalVariables.slice(0, 3).join(", ") ||
    "none"
  return `symptoms=${symptoms}; comorbidities=${comorbidities}; missing=${missing}; workflow=${clinicalIntel.entities.workflowIntent}`
}

function clampLabel(value: string, max = 56): string {
  const normalized = value.replace(/\s+/g, " ").trim()
  if (!normalized) return ""
  if (normalized.length <= max) return normalized
  return `${normalized.slice(0, max - 3)}...`
}

function workflowFocusLabel(
  workflowIntent: ClinicalIntelPreflight["entities"]["workflowIntent"]
): string {
  switch (workflowIntent) {
    case "diagnostic_reasoning":
      return "diagnostic reasoning"
    case "treatment_planning":
      return "treatment planning"
    case "operational":
      return "operational planning"
    case "lab_workflow":
      return "lab interpretation"
    case "exam_mode":
      return "exam prep"
    default:
      return "clinical support"
  }
}

function scenarioFocusLabel(input: {
  clinicalIntel: ClinicalIntelPreflight
  query: string
}): string {
  const candidates = [
    input.clinicalIntel.entities.symptoms[0],
    input.clinicalIntel.entities.labsMentioned[0],
    input.clinicalIntel.entities.vitalsMentioned[0],
    input.clinicalIntel.entities.comorbidities[0],
    input.query,
  ]
  const focus = candidates
    .map((value) => (typeof value === "string" ? value.trim() : ""))
    .find((value) => value.length > 0)
  return clampLabel(focus || "current scenario")
}

type TaskDepthBudget = {
  tier: TaskDepthTier
  targetTaskCount: number
  reasons: string[]
}

type PlannerSelectionHints = {
  preferredConnectorIds: ClinicalConnectorId[]
  preferredToolNames: string[]
  justifications: string[]
}

function humanizeConnectorId(connectorId: ClinicalConnectorId): string {
  return connectorId.replace(/_/g, " ")
}

function chartTaskNameForShape(dataShape: ChartPlanHint["dataShape"]): string {
  switch (dataShape) {
    case "comparison":
      return "Generating Comparison Chart"
    case "temporal":
      return "Generating Trend Chart"
    case "proportional":
      return "Generating Distribution Chart"
    case "decision-tree":
      return "Generating Decision Tree"
    case "trade-off":
      return "Synthesizing Efficacy Matrix"
    default:
      return "Generating Clinical Chart"
  }
}

const EDUCATIONAL_INTENT_PATTERN =
  /\b(curriculum|course|module|lecture|assignment|syllabus|learning objective|exam|osce|shelf|board|moodle|canvas|study plan|revision)\b/i

function taskNameForFocus(prefix: string, _scenarioFocus: string): string {
  // Titles should represent action only; prompt context belongs in task details.
  return sanitizePlannerTaskTitle(prefix)
}

const FORBIDDEN_TASK_TITLE_REWRITES: Array<[RegExp, string]> = [
  [/\bpreflight\b/gi, "context audit"],
  [/\bretrieval\b/gi, "evidence scan"],
  [/\bexpansion\b/gi, "scope broadening"],
  [/\bfinal answer\b/gi, "final synthesis"],
]

function sanitizePlannerTaskTitle(taskName: string): string {
  let next = taskName
  for (const [pattern, replacement] of FORBIDDEN_TASK_TITLE_REWRITES) {
    next = next.replace(pattern, replacement)
  }
  return clampLabel(next.replace(/\s+/g, " ").trim(), 40)
}

function connectorSpecificRetrievalTaskName(input: {
  query: string
  connectorIds: ClinicalConnectorId[]
  toolNames: string[]
  curriculumEnabled: boolean
  scenarioFocus: string
}): string {
  const normalized = input.query.toLowerCase()
  const hasGuidelineComparison =
    /\b(compare|versus|vs|delta|difference)\b/.test(normalized) &&
    /\b(nice|aap|esc|aha|acc|who|cdc)\b/.test(normalized)
  if (hasGuidelineComparison) {
    return taskNameForFocus("Mapping Treatment Divergence", input.scenarioFocus)
  }
  if (input.curriculumEnabled && input.connectorIds.length === 0) {
    return taskNameForFocus("Checking Curriculum Alignment", input.scenarioFocus)
  }
  if (
    input.connectorIds.length === 1 &&
    input.connectorIds[0] === "pubmed" &&
    input.toolNames.some((name) => /clinicaltrials|pubmed/i.test(name))
  ) {
    return taskNameForFocus("Auditing Clinical Trials", input.scenarioFocus)
  }
  if (input.connectorIds.length === 1 && input.connectorIds[0] === "guideline") {
    return taskNameForFocus("Auditing Clinical Guidelines", input.scenarioFocus)
  }
  return taskNameForFocus("Auditing Evidence Sources", input.scenarioFocus)
}

function curriculumTaskName(input: {
  scenarioFocus: string
  lmsContext: LmsContextSnapshot | null
}): string {
  return taskNameForFocus("Checking Curriculum Alignment", input.scenarioFocus)
}

function summarizeLmsContext(lmsContext: LmsContextSnapshot | null | undefined): string {
  if (!lmsContext) return "no LMS context"
  const providerLabel =
    lmsContext.providerIds.length > 0 ? lmsContext.providerIds.join("/") : "lms"
  const courseLabel =
    lmsContext.recentCourseNames.length > 0
      ? lmsContext.recentCourseNames.slice(0, 2).join(", ")
      : "active courses"
  return `${providerLabel}; ${lmsContext.courseCount} courses; ${lmsContext.artifactCount} artifacts; sample=${courseLabel}`
}

function hasEducationalIntentSignal(input: {
  query: string
  modePolicy: ClinicalModePolicy
  clinicalIntel: ClinicalIntelPreflight
  learningMode?: string | null
}): boolean {
  if (!input.modePolicy.studentMode) return false
  if (input.clinicalIntel.entities.workflowIntent === "exam_mode") return true
  if (input.learningMode && input.learningMode !== "ask") return true
  return EDUCATIONAL_INTENT_PATTERN.test(input.query)
}

function chainSequentialDependencies(
  taskPlan: PlannerTaskPlanItem[]
): PlannerTaskPlanItem[] {
  return taskPlan.map((task, index) => ({
    ...task,
    dependsOn: index === 0 ? [] : [taskPlan[index - 1].id],
  }))
}

function computeTaskDepthBudget(input: {
  query: string
  clinicalIntel: ClinicalIntelPreflight
  complexityMode: ClinicalComplexityMode
  modePolicy: ClinicalModePolicy
  chartPlan: ChartPlanHint
  learningMode?: string | null
}): TaskDepthBudget {
  const normalized = input.query.toLowerCase()
  const signalScore = [
    input.complexityMode === "deep-dive" ? 2 : 0,
    input.clinicalIntel.entities.highRiskSignals.length > 0 ? 2 : 0,
    input.clinicalIntel.entities.acuity === "high" ? 1 : 0,
    input.clinicalIntel.completeness.state === "incomplete_evidence" ? 2 : 0,
    input.clinicalIntel.completeness.state === "partial" ? 1 : 0,
    /\b(compare|versus|vs|differential|trade[-\s]?off|multifactor)\b/.test(normalized)
      ? 1
      : 0,
    /\b(latest|meta-analysis|systematic review|trial|rct|guideline)\b/.test(normalized)
      ? 1
      : 0,
    input.modePolicy.requireEvidenceForClinicalClaims ? 1 : 0,
    input.modePolicy.studentMode && input.learningMode && input.learningMode !== "ask"
      ? 1
      : 0,
    input.modePolicy.studentMode && EDUCATIONAL_INTENT_PATTERN.test(normalized) ? 1 : 0,
    input.chartPlan.enabled ? 1 : 0,
    input.query.length > 150 ? 1 : 0,
  ].reduce((sum, value) => sum + value, 0)

  const simpleLookup =
    /\b(define|what is|explain|overview|quick summary|meaning)\b/.test(normalized) &&
    input.query.trim().split(/\s+/).length <= 14 &&
    !/\b(compare|versus|vs|differential|trade[-\s]?off)\b/.test(normalized)

  if (simpleLookup && signalScore <= 2) {
    const targetTaskCount =
      input.modePolicy.requireEvidenceForClinicalClaims || input.chartPlan.enabled ? 2 : 1
    return {
      tier: "simple",
      targetTaskCount,
      reasons: ["Simple lookup detected; using rapid task depth."],
    }
  }

  if (signalScore >= 6) {
    return {
      tier: "complex",
      targetTaskCount: clamp(7 + Math.min(3, signalScore - 6), 7, 10),
      reasons: [
        "Complex/high-stakes clinical markers detected; using deep multi-stage audit.",
      ],
    }
  }

  if (signalScore >= 3) {
    const moderateTarget = clamp(3 + Math.min(2, signalScore - 3), 3, 5)
    return {
      tier: "moderate",
      targetTaskCount: input.chartPlan.enabled ? Math.max(4, moderateTarget) : moderateTarget,
      reasons: ["Moderate reasoning load detected; using balanced task depth."],
    }
  }

  return {
    tier: "simple",
    targetTaskCount: input.modePolicy.requireEvidenceForClinicalClaims ? 2 : 1,
    reasons: ["Low complexity signal; using minimal task depth."],
  }
}

function buildPlannerSelectionHints(input: {
  connectorOrder: ClinicalConnectorId[]
  availableToolNames: string[]
  depthTier: TaskDepthTier
  query: string
  clinicalIntel: ClinicalIntelPreflight
  modePolicy: ClinicalModePolicy
  chartPlan: ChartPlanHint
}): PlannerSelectionHints {
  const availableTools = new Set(input.availableToolNames)
  const preferredConnectorIds: ClinicalConnectorId[] = []
  const justifications: string[] = []
  const connectorBudget =
    input.depthTier === "simple" ? 1 : input.depthTier === "moderate" ? 3 : 5

  const addConnector = (connectorId: ClinicalConnectorId, reason: string) => {
    if (preferredConnectorIds.includes(connectorId)) return
    const hasTool = CONNECTOR_TOOL_NAME_MAP[connectorId].some((toolName) =>
      availableTools.has(toolName)
    )
    if (!hasTool) return
    preferredConnectorIds.push(connectorId)
    justifications.push(reason)
  }

  const normalized = input.query.toLowerCase()
  const workflowIntent = input.clinicalIntel.entities.workflowIntent
  const hasFreshEvidenceSignal =
    /\b(latest|recent|trial|rct|meta-analysis|systematic review)\b/.test(normalized)
  const hasComparisonSignal =
    /\b(compare|comparison|versus|vs|trade[-\s]?off|risk[-\s]?benefit)\b/.test(normalized)

  if (input.modePolicy.requireEvidenceForClinicalClaims) {
    addConnector(
      "guideline",
      "Guideline selected as the baseline source for evidence-grounded clinical claims."
    )
  }
  if (hasFreshEvidenceSignal || hasComparisonSignal || input.depthTier !== "simple") {
    addConnector(
      "pubmed",
      "PubMed selected for recency-sensitive or comparative clinical evidence."
    )
  }
  if (hasFreshEvidenceSignal && input.depthTier !== "simple") {
    addConnector(
      "clinical_trials",
      "Clinical-trials connector selected to capture ongoing or recently completed studies."
    )
  }

  if (workflowIntent === "operational") {
    addConnector("cms_coverage", "Coverage connector selected for operational/admin workflow.")
    addConnector("npi_registry", "NPI connector selected for provider lookup workflow.")
  } else if (workflowIntent === "lab_workflow") {
    addConnector("benchling", "Benchling selected for lab-workflow context.")
    addConnector("chembl", "ChEMBL selected for molecular/lab context.")
    addConnector("synapse", "Synapse selected for dataset/lab context.")
  }

  if (input.chartPlan.enabled && input.chartPlan.dataShape === "trade-off") {
    addConnector(
      "guideline",
      "Guideline retrieval prioritized for risk-benefit trade-off chart generation."
    )
    addConnector(
      "pubmed",
      "PubMed retrieval prioritized for comparative efficacy/safety chart evidence."
    )
  }

  for (const connectorId of input.connectorOrder) {
    if (preferredConnectorIds.length >= connectorBudget) break
    addConnector(
      connectorId,
      `Connector ${humanizeConnectorId(connectorId)} selected by priority order for this turn.`
    )
  }

  const preferredToolNames: string[] = []
  const addTool = (toolName: string, reason: string) => {
    if (!availableTools.has(toolName) || preferredToolNames.includes(toolName)) return
    preferredToolNames.push(toolName)
    justifications.push(reason)
  }

  preferredConnectorIds.forEach((connectorId) => {
    CONNECTOR_TOOL_NAME_MAP[connectorId].forEach((toolName) => {
      addTool(
        toolName,
        `${toolName} is enabled because ${humanizeConnectorId(
          connectorId
        )} passed planner selection.`
      )
    })
  })

  if (/\b(upload|slides?|deck|lecture|document|pdf|pptx|file)\b/.test(normalized)) {
    addTool(
      "uploadContextSearch",
      "uploadContextSearch selected to ground the answer in user-uploaded files."
    )
  }
  if (/\b(timetable|schedule|study plan|revision plan)\b/.test(normalized)) {
    addTool(
      "generateTimetableFromUploads",
      "Timetable generation tool selected due to explicit study planning intent."
    )
    addTool(
      "rebalanceTimetablePlan",
      "Rebalancer selected for timetable adjustment and missed-block recovery."
    )
  }
  if (/\b(lecture|video|recording|transcript|summary)\b/.test(normalized)) {
    addTool(
      "summarizeLectureUpload",
      "Lecture summarizer selected for lecture/video extraction workflow."
    )
  }
  if (/\b(review queue|spaced repetition|flashcard|recall)\b/.test(normalized)) {
    addTool(
      "createReviewQueueFromUploads",
      "Review queue builder selected for spaced-repetition workflow."
    )
  }

  const toolBudget =
    input.depthTier === "simple" ? 2 : input.depthTier === "moderate" ? 5 : 10
  return {
    preferredConnectorIds: preferredConnectorIds.slice(0, connectorBudget),
    preferredToolNames: preferredToolNames.slice(0, toolBudget),
    justifications: dedupe([...justifications]).slice(0, 14),
  }
}

function createPlannerTask(input: {
  id: string
  taskName: string
  description: string
  reasoning: string
  phase: PlannerTaskPlanItem["phase"]
  status?: PlannerTaskStatus
  dependsOn?: string[]
  isCritical?: boolean
}): PlannerTaskPlanItem {
  return {
    id: input.id,
    taskName: sanitizePlannerTaskTitle(input.taskName),
    description: input.description,
    reasoning: input.reasoning,
    status: input.status || "pending",
    dependsOn: input.dependsOn || [],
    phase: input.phase,
    isCritical: input.isCritical ?? true,
  }
}

type PlannerTaskPlanBuildInput = {
  query: string
  depthBudget: TaskDepthBudget
  clinicalIntel: ClinicalIntelPreflight
  modePolicy: ClinicalModePolicy
  chartPlan: ChartPlanHint
  selectionHints: PlannerSelectionHints
  learningMode?: string | null
  lmsContext?: LmsContextSnapshot | null
}

function buildPlannerTaskPlan(input: PlannerTaskPlanBuildInput): PlannerTaskPlanItem[] {
  const workflowFocus = workflowFocusLabel(input.clinicalIntel.entities.workflowIntent)
  const scenarioFocus = scenarioFocusLabel({
    clinicalIntel: input.clinicalIntel,
    query: input.query,
  })
  const chartFeasible =
    input.chartPlan.enabled && input.chartPlan.feasibilityScore >= 0.55
  const connectorPreview =
    input.selectionHints.preferredConnectorIds
      .slice(0, 3)
      .map((connectorId) => humanizeConnectorId(connectorId))
      .join(", ") || "none"
  const toolPreview =
    input.selectionHints.preferredToolNames.slice(0, 4).join(", ") || "none"
  const curriculumEnabled =
    hasEducationalIntentSignal({
      query: input.query,
      modePolicy: input.modePolicy,
      clinicalIntel: input.clinicalIntel,
      learningMode: input.learningMode,
    }) &&
    Boolean(
      input.lmsContext &&
        (input.lmsContext.courseCount > 0 || input.lmsContext.artifactCount > 0)
    )
  const curriculumReasoning = `Educational intent with LMS context detected (${summarizeLmsContext(
    input.lmsContext
  )}).`
  const retrievalTaskLabel = connectorSpecificRetrievalTaskName({
    query: input.query,
    connectorIds: input.selectionHints.preferredConnectorIds,
    toolNames: input.selectionHints.preferredToolNames,
    curriculumEnabled,
    scenarioFocus,
  })

  if (input.depthBudget.tier === "simple") {
    const target = clamp(input.depthBudget.targetTaskCount, 1, 2)
    if (target <= 1) {
      return [
        createPlannerTask({
          id: "task-compose",
          taskName: taskNameForFocus(
            curriculumEnabled
              ? "Rapid curriculum-aligned synthesis"
              : "Rapid clinical response",
            scenarioFocus
          ),
          description: curriculumEnabled
            ? "Return a concise answer aligned to the active curriculum context."
            : "Return a concise, bounded answer for this direct query.",
          reasoning: curriculumEnabled
            ? `${curriculumReasoning} Minimal-depth response requested.`
            : "Simple request detected; using one-pass synthesis.",
          phase: "composer",
          status: "running",
          isCritical: true,
        }),
      ]
    }

    const tasks = curriculumEnabled
      ? [
          createPlannerTask({
            id: "task-curriculum-alignment",
            taskName: curriculumTaskName({ scenarioFocus, lmsContext: input.lmsContext ?? null }),
            description:
              "Map response framing to active courses and upcoming learning artifacts.",
            reasoning: `${curriculumReasoning} Keeping depth strict at two steps.`,
            phase: "planner",
            status: "completed",
            isCritical: true,
          }),
          createPlannerTask({
            id: "task-compose",
            taskName: taskNameForFocus("Final synthesis for viva-style delivery", scenarioFocus),
            description:
              "Compose concise guidance with confidence framing and immediate next step.",
            reasoning: `Fast-track ${workflowFocus} response tuned for student workflow.`,
            phase: "composer",
            status: "pending",
            isCritical: true,
          }),
        ]
      : [
          createPlannerTask({
            id: "task-retrieval",
            taskName: retrievalTaskLabel,
            description: "Run only the highest-yield planner-selected source slice.",
            reasoning: `Connector scope ${connectorPreview}; tool slice ${toolPreview}.`,
            phase: "retrieval",
            status: "pending",
            isCritical: true,
          }),
          createPlannerTask({
            id: "task-compose",
            taskName: taskNameForFocus("Final synthesis for viva-style delivery", scenarioFocus),
            description:
              "Return concise answer with explicit uncertainty bounds and next action.",
            reasoning: `Fast-track ${workflowFocus} response for ${scenarioFocus}.`,
            phase: "composer",
            status: "pending",
            isCritical: true,
          }),
        ]
    return chainSequentialDependencies(tasks)
  }

  if (input.depthBudget.tier === "moderate") {
    const target = clamp(input.depthBudget.targetTaskCount, 3, 5)
    const tasks: PlannerTaskPlanItem[] = [
      curriculumEnabled
        ? createPlannerTask({
            id: "task-curriculum-alignment",
            taskName: curriculumTaskName({ scenarioFocus, lmsContext: input.lmsContext ?? null }),
            description:
              "Anchor this response to active course context and assessment cadence.",
            reasoning: curriculumReasoning,
            phase: "planner",
            status: "completed",
            isCritical: true,
          })
        : createPlannerTask({
            id: "task-intel",
            taskName: taskNameForFocus("Extracting clinical nuances", scenarioFocus),
            description: "Extract entities and constraints before retrieval.",
            reasoning: `Workflow=${workflowFocus}; scenario=${scenarioFocus}.`,
            phase: "preflight",
            status: "completed",
            isCritical: true,
          }),
      createPlannerTask({
        id: "task-retrieval",
        taskName: retrievalTaskLabel,
        description:
          "Retrieve from planner-approved connectors/tools only (no broad fan-out).",
        reasoning: `Connector scope ${connectorPreview}; tool slice ${toolPreview}.`,
        phase: "retrieval",
        status: "pending",
        isCritical: true,
      }),
      createPlannerTask({
        id: "task-compose",
        taskName: taskNameForFocus("Composing evidence-grounded synthesis", scenarioFocus),
        description:
          "Compose final response with uncertainty framing and practical next actions.",
        reasoning: `Moderate-depth policy budget=${target}.`,
        phase: "composer",
        status: "pending",
        isCritical: true,
      }),
    ]

    if (chartFeasible) {
      const composeIndex = tasks.findIndex((task) => task.id === "task-compose")
      tasks.splice(
        composeIndex,
        0,
        createPlannerTask({
          id: "task-chart",
          taskName: taskNameForFocus(
            chartTaskNameForShape(input.chartPlan.dataShape),
            scenarioFocus
          ),
          description:
            "Generate chart output because structured data feasibility passed threshold.",
          reasoning: `Feasibility=${formatPercent(
            input.chartPlan.feasibilityScore
          )}; shape=${input.chartPlan.dataShape}.`,
          phase: "visualization",
          status: "pending",
          isCritical: false,
        })
      )
    }

    const optionalInsertions: PlannerTaskPlanItem[] = [
      createPlannerTask({
        id: "task-gatekeeper",
        taskName: taskNameForFocus("Selecting evidence channels", scenarioFocus),
        description:
          "Emit explicit ALLOW/SKIP decisions for connectors and tools before execution.",
        reasoning: `Planner-lazy gating against ${connectorPreview}.`,
        phase: "gatekeeper",
        status: "pending",
        isCritical: true,
      }),
      createPlannerTask({
        id: "task-evaluator",
        taskName: taskNameForFocus("Deciding evidence sufficiency", scenarioFocus),
        description:
          "Evaluate confidence and decide whether retrieval expansion is required.",
        reasoning: "Expansion tasks are gated strictly behind evaluator decisions.",
        phase: "evaluator",
        status: "pending",
        isCritical: false,
      }),
      ...(curriculumEnabled
        ? [
            createPlannerTask({
              id: "task-intel",
              taskName: taskNameForFocus("Extracting clinical nuances", scenarioFocus),
              description: "Extract entities and constraints before retrieval.",
              reasoning: `Workflow=${workflowFocus}; scenario=${scenarioFocus}.`,
              phase: "preflight",
              status: "completed",
              isCritical: false,
            }),
          ]
        : []),
    ]

    while (tasks.length < target && optionalInsertions.length > 0) {
      const nextOptional = optionalInsertions.shift()!
      const composeIndex = tasks.findIndex((task) => task.id === "task-compose")
      tasks.splice(composeIndex, 0, nextOptional)
    }

    return chainSequentialDependencies(tasks.slice(0, target))
  }

  const target = clamp(input.depthBudget.targetTaskCount, 7, 10)
  const tasks: PlannerTaskPlanItem[] = [
    curriculumEnabled
      ? createPlannerTask({
          id: "task-curriculum-alignment",
          taskName: curriculumTaskName({ scenarioFocus, lmsContext: input.lmsContext ?? null }),
          description:
            "Align retrieval and answer framing with active LMS course material.",
          reasoning: curriculumReasoning,
          phase: "planner",
          status: "completed",
          isCritical: true,
        })
      : createPlannerTask({
          id: "task-intel",
          taskName: taskNameForFocus("Extracting clinical nuances", scenarioFocus),
          description:
            "Extract entities, acuity, and completeness constraints for deep audit.",
          reasoning: `Workflow=${workflowFocus}; focus=${scenarioFocus}.`,
          phase: "preflight",
          status: "completed",
          isCritical: true,
        }),
    createPlannerTask({
      id: "task-hypothesis",
      taskName: taskNameForFocus("Framing competing clinical pathways", scenarioFocus),
      description:
        "Frame competing hypotheses and differential anchors for deep reasoning.",
      reasoning: "Complex prompt detected; multi-stage audit required.",
      phase: "planner",
      status: "pending",
      isCritical: true,
    }),
    createPlannerTask({
      id: "task-gatekeeper",
      taskName: taskNameForFocus("Selecting evidence channels", scenarioFocus),
      description:
        "Generate explicit ALLOW/SKIP decisions before initializing connectors/tools.",
      reasoning: `Planner-approved connector scope: ${connectorPreview}.`,
      phase: "gatekeeper",
      status: "pending",
      isCritical: true,
    }),
    createPlannerTask({
      id: "task-retrieval",
      taskName: retrievalTaskLabel,
      description: "Execute retrieve -> reason -> retrieve loop with planner-lazy fan-out.",
      reasoning: `Planner-approved tools: ${toolPreview}.`,
      phase: "retrieval",
      status: "pending",
      isCritical: true,
    }),
    createPlannerTask({
      id: "task-confidence-loop",
      taskName: taskNameForFocus("Gating retrieval loop by confidence", scenarioFocus),
      description:
        "Track confidence transitions and gate expansion versus composition decisions.",
      reasoning:
        "Loop expansion is evaluator-gated and never pre-rendered as template rows.",
      phase: "evaluator",
      status: "pending",
      isCritical: true,
    }),
    ...(chartFeasible
      ? [
          createPlannerTask({
            id: "task-chart",
            taskName: taskNameForFocus(
              chartTaskNameForShape(input.chartPlan.dataShape),
              scenarioFocus
            ),
            description:
              "Generate visualization because chart feasibility and data-shape checks passed.",
            reasoning: `Feasibility=${formatPercent(
              input.chartPlan.feasibilityScore
            )}; shape=${input.chartPlan.dataShape}.`,
            phase: "visualization",
            status: "pending",
            isCritical: false,
          }),
        ]
      : []),
    createPlannerTask({
      id: "task-compose",
      taskName: taskNameForFocus("Final synthesis for viva-style delivery", scenarioFocus),
      description:
        "Deliver calibrated final answer with uncertainty bounds and actionable next steps.",
      reasoning: `Deep-dive policy budget=${target}.`,
      phase: "composer",
      status: "pending",
      isCritical: true,
    }),
  ]

  const optionalInsertions: PlannerTaskPlanItem[] = [
    ...(curriculumEnabled
      ? [
          createPlannerTask({
            id: "task-intel",
            taskName: taskNameForFocus("Extracting clinical nuances", scenarioFocus),
            description:
              "Extract entities, acuity, and completeness constraints for deep audit.",
            reasoning: `Workflow=${workflowFocus}; focus=${scenarioFocus}.`,
            phase: "preflight",
            status: "completed",
            isCritical: false,
          }),
        ]
      : []),
    ...(input.clinicalIntel.completeness.state !== "complete"
      ? [
          createPlannerTask({
            id: "task-missing-vars",
            taskName: taskNameForFocus("Auditing missing clinical variables", scenarioFocus),
            description:
              "Identify high-impact missing variables and branch guidance conditionally.",
            reasoning: `Completeness=${input.clinicalIntel.completeness.state}.`,
            phase: "preflight",
            status: "pending",
            isCritical: false,
          }),
        ]
      : []),
    createPlannerTask({
      id: "task-evidence-grade",
      taskName: taskNameForFocus("Calibrating evidence quality", scenarioFocus),
      description: "Grade source quality and resolve conflicts across retrieved evidence.",
      reasoning: "Deep audits require explicit source calibration before final synthesis.",
      phase: "evaluator",
      status: "pending",
      isCritical: false,
    }),
    createPlannerTask({
      id: "task-conflict-scan",
      taskName: taskNameForFocus("Resolving evidence conflicts", scenarioFocus),
      description: "Resolve contradictory findings before composing recommendations.",
      reasoning: "Added for high-stakes prompts with multi-source evidence.",
      phase: "evaluator",
      status: "pending",
      isCritical: false,
    }),
    createPlannerTask({
      id: "task-safety-guardrails",
      taskName: taskNameForFocus("Validating safety guardrails", scenarioFocus),
      description:
        "Validate contraindications and high-risk caveats before answer finalization.",
      reasoning: "Added to prevent overconfident recommendations in complex scenarios.",
      phase: "evaluator",
      status: "pending",
      isCritical: false,
    }),
    createPlannerTask({
      id: "task-next-actions",
      taskName: taskNameForFocus("Generating next actionables", scenarioFocus),
      description: "Translate synthesis into concrete next actions and follow-up checks.",
      reasoning: "Complex workflows should terminate with practical action plans.",
      phase: "composer",
      status: "pending",
      isCritical: false,
    }),
  ]

  while (tasks.length < target && optionalInsertions.length > 0) {
    const nextOptional = optionalInsertions.shift()!
    const composeIndex = tasks.findIndex((task) => task.id === "task-compose")
    tasks.splice(composeIndex, 0, nextOptional)
  }

  return chainSequentialDependencies(tasks.slice(0, target))
}

function buildDeterministicFallbackTaskPlan(
  input: PlannerTaskPlanBuildInput
): PlannerTaskPlanItem[] {
  const scenarioFocus = scenarioFocusLabel({
    clinicalIntel: input.clinicalIntel,
    query: input.query,
  })
  const chartFeasible =
    input.chartPlan.enabled && input.chartPlan.feasibilityScore >= 0.55
  const curriculumEnabled =
    hasEducationalIntentSignal({
      query: input.query,
      modePolicy: input.modePolicy,
      clinicalIntel: input.clinicalIntel,
      learningMode: input.learningMode,
    }) &&
    Boolean(
      input.lmsContext &&
        (input.lmsContext.courseCount > 0 || input.lmsContext.artifactCount > 0)
    )
  const minByTier = input.depthBudget.tier === "simple" ? 1 : input.depthBudget.tier === "moderate" ? 3 : 7
  const maxByTier = input.depthBudget.tier === "simple" ? 2 : input.depthBudget.tier === "moderate" ? 5 : 10
  const target = clamp(input.depthBudget.targetTaskCount, minByTier, maxByTier)
  const tasks: PlannerTaskPlanItem[] = [
    ...(curriculumEnabled
      ? [
          createPlannerTask({
            id: "task-curriculum-alignment",
            taskName: curriculumTaskName({ scenarioFocus, lmsContext: input.lmsContext ?? null }),
            description:
              "Align answer framing to LMS course context in deterministic fallback mode.",
            reasoning: summarizeLmsContext(input.lmsContext),
            phase: "planner",
            status: "completed",
            isCritical: true,
          }),
        ]
      : []),
    createPlannerTask({
      id: "task-retrieval",
      taskName: connectorSpecificRetrievalTaskName({
        query: input.query,
        connectorIds: input.selectionHints.preferredConnectorIds,
        toolNames: input.selectionHints.preferredToolNames,
        curriculumEnabled,
        scenarioFocus,
      }),
      description: "Use planner-lazy fallback retrieval slice when dynamic planning fails.",
      reasoning:
        "Fallback path keeps source selection explicit and avoids template task expansion.",
      phase: "retrieval",
      status: "pending",
      isCritical: true,
    }),
    ...(chartFeasible
      ? [
          createPlannerTask({
            id: "task-chart",
            taskName: taskNameForFocus(
              chartTaskNameForShape(input.chartPlan.dataShape),
              scenarioFocus
            ),
            description:
              "Retain visualization task because chart feasibility remains above threshold.",
            reasoning: `Feasibility=${formatPercent(
              input.chartPlan.feasibilityScore
            )}; shape=${input.chartPlan.dataShape}.`,
            phase: "visualization",
            status: "pending",
            isCritical: false,
          }),
        ]
      : []),
    createPlannerTask({
      id: "task-compose",
      taskName: taskNameForFocus("Compose fallback answer", scenarioFocus),
      description:
        "Compose response with confidence framing while preserving deterministic plan integrity.",
      reasoning: "Planner fallback mode engaged after task-plan generation failure.",
      phase: "composer",
      status: input.depthBudget.tier === "simple" ? "running" : "pending",
      isCritical: true,
    }),
  ]
  return chainSequentialDependencies(tasks.slice(0, target))
}

function buildPlannerTaskPlanWithFallback(input: PlannerTaskPlanBuildInput): {
  taskPlan: PlannerTaskPlanItem[]
  usedFallback: boolean
  fallbackReason?: string
} {
  try {
    const planned = buildPlannerTaskPlan(input)
    if (planned.length === 0) {
      throw new Error("planner returned empty task plan")
    }
    return { taskPlan: planned, usedFallback: false }
  } catch (error) {
    const reason = error instanceof Error ? error.message : "unknown planner error"
    return {
      taskPlan: buildDeterministicFallbackTaskPlan(input),
      usedFallback: true,
      fallbackReason: reason,
    }
  }
}

function appendTaskReasoning(task: PlannerTaskPlanItem, reasoningAppend?: string) {
  const appendValue = reasoningAppend?.trim()
  if (!appendValue) return task
  if (task.reasoning.includes(appendValue)) return task
  return {
    ...task,
    reasoning: `${task.reasoning} ${appendValue}`.trim(),
  }
}

function updateFirstTaskByPhase(
  taskPlan: PlannerTaskPlanItem[],
  phase: PlannerTaskPlanItem["phase"],
  update: {
    status?: PlannerTaskStatus
    description?: string
    reasoningAppend?: string
    taskName?: string
  }
): PlannerTaskPlanItem[] {
  const index = taskPlan.findIndex((task) => task.phase === phase)
  if (index < 0) return taskPlan
  return taskPlan.map((task, taskIndex) => {
    if (taskIndex !== index) return task
    let nextTask: PlannerTaskPlanItem = {
      ...task,
      ...(update.status ? { status: update.status } : {}),
      ...(update.description ? { description: update.description } : {}),
      ...(update.taskName
        ? { taskName: sanitizePlannerTaskTitle(update.taskName) }
        : {}),
    }
    nextTask = appendTaskReasoning(nextTask, update.reasoningAppend)
    return nextTask
  })
}

function updateTaskById(
  taskPlan: PlannerTaskPlanItem[],
  taskId: string,
  update: {
    status?: PlannerTaskStatus
    description?: string
    reasoningAppend?: string
    taskName?: string
  }
): PlannerTaskPlanItem[] {
  return taskPlan.map((task) => {
    if (task.id !== taskId) return task
    let nextTask: PlannerTaskPlanItem = {
      ...task,
      ...(update.status ? { status: update.status } : {}),
      ...(update.description ? { description: update.description } : {}),
      ...(update.taskName
        ? { taskName: sanitizePlannerTaskTitle(update.taskName) }
        : {}),
    }
    nextTask = appendTaskReasoning(nextTask, update.reasoningAppend)
    return nextTask
  })
}

function appendTaskPlanItem(
  taskPlan: PlannerTaskPlanItem[],
  task: PlannerTaskPlanItem,
  beforeTaskId?: string
): PlannerTaskPlanItem[] {
  if (taskPlan.some((item) => item.id === task.id)) return taskPlan
  if (!beforeTaskId) return [...taskPlan, task]
  const insertionIndex = taskPlan.findIndex((item) => item.id === beforeTaskId)
  if (insertionIndex < 0) return [...taskPlan, task]
  return [
    ...taskPlan.slice(0, insertionIndex),
    task,
    ...taskPlan.slice(insertionIndex),
  ]
}

function removeTasksByPhase(
  taskPlan: PlannerTaskPlanItem[],
  phase: PlannerTaskPlanItem["phase"]
): PlannerTaskPlanItem[] {
  return taskPlan.filter((task) => task.phase !== phase)
}

function taskPlanToRuntimeSteps(taskPlan: PlannerTaskPlanItem[]): SupervisorRuntimeStep[] {
  return taskPlan.map((task) => ({
    id: task.id,
    label: task.taskName,
    status: task.status,
    detail: `${task.description} ${task.reasoning}`.trim(),
    dependsOn: task.dependsOn,
    phase: task.phase,
  }))
}

function taskPlanToRuntimeDag(taskPlan: PlannerTaskPlanItem[]): SupervisorDagNode[] {
  return taskPlan.map((task) => ({
    id: task.id,
    label: task.taskName,
    status: task.status,
    dependsOn: task.dependsOn,
    detail: `${task.description} ${task.reasoning}`.trim(),
  }))
}

function mergeRetrievalNotes(
  existing: RetrievalFallbackNote[],
  next: RetrievalFallbackNote[]
): RetrievalFallbackNote[] {
  const merged = new Map<string, RetrievalFallbackNote>()
  for (const note of [...existing, ...next]) {
    const key = `${note.connectorId}:${note.outcome}:${note.note}`
    merged.set(key, note)
  }
  return Array.from(merged.values())
}

function mergeGatekeeperDecisions(
  existing: GatekeeperDecision[],
  next: GatekeeperDecision[]
): GatekeeperDecision[] {
  const map = new Map<string, GatekeeperDecision>()
  ;[...existing, ...next].forEach((decision) => {
    const key = `${decision.scope}:${decision.id}`
    const current = map.get(key)
    if (!current) {
      map.set(key, decision)
      return
    }
    if (current.decision === "allow" && decision.decision === "skip") {
      return
    }
    map.set(key, decision)
  })
  return Array.from(map.values())
}

function upsertDagNode(
  dag: SupervisorDagNode[],
  nodeId: string,
  update: Partial<SupervisorDagNode> & { status?: SupervisorDagNode["status"] }
): SupervisorDagNode[] {
  const existing = dag.find((node) => node.id === nodeId)
  if (!existing) return dag
  return dag.map((node) => {
    if (node.id !== nodeId) return node
    return {
      ...node,
      ...update,
      status: update.status || node.status,
    }
  })
}

function toChecklistFromDag(dag: SupervisorDagNode[]): SupervisorRuntimeStep[] {
  return dag.map((node) => ({
    id: node.id,
    label: node.label,
    status: node.status,
    detail: node.detail,
    dependsOn: node.dependsOn,
  }))
}

function buildDynamicDagTemplate(input: {
  complexityMode: ClinicalComplexityMode
  clinicalIntel: ClinicalIntelPreflight
  query: string
}): SupervisorDagNode[] {
  const workflowFocus = workflowFocusLabel(input.clinicalIntel.entities.workflowIntent)
  const scenarioFocus = scenarioFocusLabel({
    clinicalIntel: input.clinicalIntel,
    query: input.query,
  })
  if (input.complexityMode === "fast-track") {
    return [
      {
        id: "dag-intel",
        label: `Clinical context audit: extract entities + ${workflowFocus} context`,
        status: "completed",
        dependsOn: [],
        detail: `Focus: ${scenarioFocus}`,
      },
      {
        id: "dag-retrieve",
        label: `Targeted evidence scan loop for ${workflowFocus}`,
        status: "pending",
        dependsOn: ["dag-intel"],
        detail: `Scenario: ${scenarioFocus}`,
      },
      {
        id: "dag-compose",
        label: `Compose concise ${workflowFocus} answer with confidence + next actions`,
        status: "pending",
        dependsOn: ["dag-retrieve"],
      },
    ]
  }

  const includeMissingStep =
    input.clinicalIntel.completeness.state === "incomplete_evidence" ||
    input.clinicalIntel.completeness.state === "partial"

  const deepDiveBase: SupervisorDagNode[] = [
    {
      id: "dag-intel",
      label: `Clinical context audit: extract entities + ${workflowFocus} risk profile`,
      status: "completed",
      dependsOn: [],
      detail: `Focus: ${scenarioFocus}`,
    },
    {
      id: "dag-hypothesis",
      label: `Generate ${workflowFocus} hypotheses from clinical intent`,
      status: "pending",
      dependsOn: ["dag-intel"],
      detail: `Scenario: ${scenarioFocus}`,
    },
    {
      id: "dag-gatekeeper",
      label: "Gatekeeper: allow/skip connectors and tools with rationale",
      status: "pending",
      dependsOn: ["dag-hypothesis"],
    },
    {
      id: "dag-retrieve-loop",
      label: `Execute adaptive evidence scan loop for ${workflowFocus} evidence`,
      status: "pending",
      dependsOn: ["dag-gatekeeper"],
    },
    {
      id: "dag-evidence-grade",
      label: "Cross-source evidence grading and conflict scan",
      status: "pending",
      dependsOn: ["dag-retrieve-loop"],
    },
    {
      id: "dag-confidence",
      label: "Confidence transition tracking + loop decision",
      status: "pending",
      dependsOn: ["dag-evidence-grade"],
    },
    {
      id: "dag-chart-architect",
      label: `Chart architect: map ${workflowFocus} data shape and visual strategy`,
      status: "pending",
      dependsOn: ["dag-confidence"],
    },
    {
      id: "dag-compose",
      label: `Compose ${workflowFocus} response with conditional guidance + follow-up prompts`,
      status: "pending",
      dependsOn: ["dag-chart-architect"],
    },
  ]

  if (!includeMissingStep) {
    return deepDiveBase
  }

  return [
    deepDiveBase[0],
    {
      id: "dag-missing",
      label: "Incomplete-evidence detection and targeted variable prompts",
      status: "pending",
      dependsOn: ["dag-intel"],
    },
    {
      ...deepDiveBase[1],
      dependsOn: ["dag-missing"],
    },
    ...deepDiveBase.slice(2),
  ]
}

function buildChartPlanHint(state: {
  query: string
  intent: ClinicalIntentClass
  selectedToolNames: string[]
  clinicalIntel: ClinicalIntelPreflight
}): ChartPlanHint {
  const normalized = state.query.toLowerCase()
  const hasTemporalIntent =
    /\b(trend|over time|timeline|trajectory|follow-up|baseline|day[-\s]?by[-\s]?day)\b/.test(
      normalized
    )
  const hasComparisonIntent =
    /\b(compare|comparison|versus|vs|between|across groups?|cohort)\b/.test(
      normalized
    )
  const hasProportionalIntent =
    /\b(proportion|percent|percentage|distribution|breakdown|share)\b/.test(
      normalized
    )
  const hasTradeoffIntent =
    /\b(trade[-\s]?off|risk[-\s]?benefit|benefit[-\s]?risk|pros and cons|efficacy vs safety|cost[-\s]?effectiveness)\b/.test(
      normalized
    )
  const examDecisionTree =
    state.clinicalIntel.examMode ||
    /\b(viva|osce|oral exam|exam mode|decision tree)\b/.test(normalized)
  const hasNumericIntent =
    /\b(chart|graph|trend|time series|delta|trajectory|distribution|baseline|follow-up)\b/.test(
      normalized
    ) ||
    hasTemporalIntent ||
    hasComparisonIntent ||
    hasProportionalIntent ||
    hasTradeoffIntent ||
    examDecisionTree
  const hasDataTool =
    state.selectedToolNames.some((tool) =>
      /upload|guideline|pubmed|trial|review|lecture|websearch/i.test(tool)
    ) ||
    state.intent === "clinical_evidence" ||
    state.intent === "research_discovery"
  const feasibilityScore = clamp(
    (hasNumericIntent ? 0.35 : 0) +
      (hasDataTool ? 0.24 : 0) +
      (hasTemporalIntent ? 0.12 : 0) +
      (hasComparisonIntent ? 0.12 : 0) +
      (hasProportionalIntent ? 0.1 : 0) +
      (hasTradeoffIntent ? 0.12 : 0) +
      (examDecisionTree ? 0.12 : 0),
    0,
    1
  )
  if (!hasNumericIntent) {
    return {
      enabled: false,
      suggestedCount: 0,
      reasons: [],
      dataShape: "none",
      visualMode: "text-first",
      preferredChartTypes: [],
      feasibilityScore,
      examDecisionTree: false,
      drilldownEnabled: false,
      fallbackReason: "No structural numeric intent detected in the prompt.",
    }
  }

  let dataShape: ChartPlanHint["dataShape"] = "comparison"
  let preferredChartTypes: ChartPlanHint["preferredChartTypes"] = ["bar", "line"]
  if (examDecisionTree) {
    dataShape = "decision-tree"
    preferredChartTypes = ["decision-tree"]
  } else if (hasTradeoffIntent) {
    dataShape = "trade-off"
    preferredChartTypes = ["bar", "stacked-bar", "composed"]
  } else if (hasTemporalIntent) {
    dataShape = "temporal"
    preferredChartTypes = ["line", "area", "composed"]
  } else if (hasProportionalIntent) {
    dataShape = "proportional"
    preferredChartTypes = ["stacked-bar", "bar"]
  } else if (hasComparisonIntent) {
    dataShape = "comparison"
    preferredChartTypes = ["bar", "composed"]
  }
  const visualMode = feasibilityScore >= 0.58 ? "visual-first" : "text-first"
  const chartEnabled = feasibilityScore >= 0.5 || examDecisionTree
  const suggestedCount = examDecisionTree
    ? 1
    : hasComparisonIntent && hasTemporalIntent
      ? 3
      : hasTradeoffIntent && hasComparisonIntent
        ? 3
      : hasComparisonIntent || hasTemporalIntent || hasProportionalIntent || hasTradeoffIntent
        ? 2
        : 1
  const reasons: string[] = []
  if (hasTemporalIntent) {
    reasons.push("Temporal intent detected (trend/trajectory wording).")
  }
  if (hasComparisonIntent) {
    reasons.push("Comparison intent detected across groups or options.")
  }
  if (hasProportionalIntent) {
    reasons.push("Proportional intent detected (distribution/percentage).")
  }
  if (hasTradeoffIntent) {
    reasons.push("Trade-off intent detected (risk-benefit or pros/cons wording).")
  }
  if (examDecisionTree) {
    reasons.push(
      "Exam/Viva mode detected, enabling decision-tree visual logic for exam-ready reasoning."
    )
  }
  if (!hasDataTool) {
    reasons.push(
      "Data-bearing retrieval tools are limited; chart output should stay conditional."
    )
  }

  if (!chartEnabled) {
    return {
      enabled: false,
      suggestedCount: 0,
      reasons,
      dataShape,
      visualMode: "text-first",
      preferredChartTypes,
      feasibilityScore,
      examDecisionTree,
      drilldownEnabled: false,
      fallbackReason:
        "Structured data feasibility is below threshold; provide markdown explanation with missing data callout.",
    }
  }

  return {
    enabled: true,
    suggestedCount,
    reasons,
    dataShape,
    visualMode,
    preferredChartTypes,
    feasibilityScore,
    examDecisionTree,
    drilldownEnabled: true,
  }
}

function deriveComplexityMode(input: {
  clinicalIntel: ClinicalIntelPreflight
  query: string
}): ClinicalComplexityMode {
  if (input.clinicalIntel.chartDrilldownContext) {
    return "fast-track"
  }
  if (input.clinicalIntel.complexityMode === "deep-dive") {
    return "deep-dive"
  }
  if (
    /\b(differential|compare|complex|multifactor|high stakes|critical)\b/i.test(
      input.query
    )
  ) {
    return "deep-dive"
  }
  return "fast-track"
}

function computeMaxIterations(
  input: LangChainSupervisorInput,
  modePolicy: ClinicalModePolicy,
  complexityMode: ClinicalComplexityMode,
  completeness: ClinicalCompleteness
): number {
  if (input.artifactIntent === "quiz") return 1
  let iterations = complexityMode === "deep-dive" ? 3 : 1
  if (input.fanoutPreferred) iterations += 1
  if (modePolicy.requireEvidenceForClinicalClaims) iterations += 1
  if (completeness.state === "incomplete_evidence") iterations += 1
  return clamp(iterations, 1, 4)
}

function computeMaxSteps(
  input: LangChainSupervisorInput,
  selectedToolNames: string[],
  loopIterations: number,
  complexityMode: ClinicalComplexityMode
): number {
  if (input.artifactIntent === "quiz") return 3
  const base = complexityMode === "deep-dive" ? 8 : 4
  const dynamicBudget =
    base +
    Math.ceil(selectedToolNames.length / 2) +
    loopIterations +
    (input.fanoutPreferred ? 3 : 1)
  return clamp(dynamicBudget, 4, complexityMode === "deep-dive" ? 16 : 9)
}

function buildDynamicChecklist(state: SupervisorState): SupervisorRuntimeStep[] {
  if (state.taskPlan.length > 0) {
    return taskPlanToRuntimeSteps(state.taskPlan)
  }
  const dagChecklist = toChecklistFromDag(state.runtimeDag)
  if (dagChecklist.length > 0) return dagChecklist
  return []
}

function buildSystemPromptAdditions(state: SupervisorState): string[] {
  const additions: string[] = []
  additions.push(
    `LANGCHAIN SUPERVISOR ACTIVE: intent=${state.intent}; complexity=${state.complexityMode}; iterations=${state.iteration}; confidence=${formatPercent(
      state.confidence
    )}; selectedTools=${state.selectedToolNames.join(", ") || "none"}.`
  )
  if (state.taskPlan.length > 0) {
    additions.push(
      `PLANNER TASK PLAN (${state.taskPlan.length} tasks): ${state.taskPlan
        .map((task) => `${task.taskName} [${task.status}]`)
        .slice(0, 8)
        .join(" -> ")}.`
    )
  }
  additions.push(
    "TASK TITLE STYLE: Never use the words 'Preflight', 'Retrieval', 'Expansion', or 'Final Answer' in visible task titles; prefer active clinical verbs like Auditing, Mapping, Cross-referencing, and Synthesizing."
  )
  if (state.retrievalNotes.length > 0) {
    additions.push(
      `RETRIEVAL NOTES: ${state.retrievalNotes
        .map((note) => note.note)
        .slice(0, 4)
        .join(" | ")}`
    )
  }
  additions.push(
    "Use adaptive retrieve -> reason -> retrieve behavior: run focused tools first, then expand only when confidence is low."
  )
  additions.push(`CLINICAL PREFLIGHT: ${summarizeClinicalIntel(state.clinicalIntel)}`)
  if (state.modePolicy.requireEvidenceForClinicalClaims) {
    additions.push(
      "Evidence guardrail: make clinical claims only when supported by retrieved sources; if sparse, narrow query and retry once."
    )
  }
  if (state.modePolicy.requireStrictUncertainty) {
    additions.push(
      "Clinician uncertainty guardrail: state confidence boundaries concisely. When evidence is conflicting or sparse, note the limitation plainly without disclaimers about missing citations."
    )
  }
  if (state.modePolicy.studentMode) {
    additions.push(
      "Student mode: include concise teaching rationale and explain why each evidence source was selected."
    )
  }
  if (state.incompleteEvidenceState !== "complete") {
    if (state.incompleteEvidencePolicy === "none") {
      additions.push(
        "Incomplete-evidence policy is disabled for this turn; continue with standard uncertainty language."
      )
    } else if (state.incompleteEvidencePolicy === "strict_blocking") {
      additions.push(
        "STRICT INCOMPLETE EVIDENCE MODE: do not provide definitive diagnostic/treatment recommendations until critical missing variables are collected."
      )
      additions.push(
        "Return a concise blocking notice + requested variables + interim safety considerations only."
      )
      if (state.missingVariablePrompts.length > 0) {
        additions.push(
          `Critical variables required before proceeding: ${state.missingVariablePrompts
            .map((item) => item.prompt)
            .join(" | ")}`
        )
      }
    } else {
      if (state.incompleteEvidenceState === "incomplete_evidence") {
        additions.push(
          "INCOMPLETE EVIDENCE MODE: provide conditional guidance, clearly state uncertainty, and ask targeted follow-up questions before definitive recommendations."
        )
      } else {
        additions.push(
          "PARTIAL EVIDENCE MODE: provide best-available guidance while explicitly naming what extra data would sharpen confidence."
        )
      }
      if (state.missingVariablePrompts.length > 0) {
        additions.push(
          `Missing variables to request now: ${state.missingVariablePrompts
            .map((item) => item.prompt)
            .join(" | ")}`
        )
      }
    }
  }
  if (state.chartPlan.enabled) {
    additions.push(
      `CHART ARCHITECT ACTIVE: dataShape=${state.chartPlan.dataShape}; visualMode=${state.chartPlan.visualMode}; preferred=${state.chartPlan.preferredChartTypes.join(
        ", "
      )}; suggestedCount=${state.chartPlan.suggestedCount}.`
    )
    additions.push(
      "If structured numeric datasets are available, emit chart JSON blocks; if not, explicitly state why charting was skipped."
    )
    if (state.chartPlan.examDecisionTree) {
      additions.push(
        "EXAM MODE VISUAL LOGIC: include a mermaid flowchart decision tree to support viva-style reasoning."
      )
    }
  } else if (state.chartPlan.fallbackReason) {
    additions.push(`Chart fallback rationale: ${state.chartPlan.fallbackReason}`)
  }
  if (state.chartPlan.drilldownEnabled) {
    additions.push(
      "When responding to chart-drilldown prompts, explain the clicked datapoint with source-backed evidence and clear next actions."
    )
  }
  if (state.clinicalIntel.chartDrilldownContext) {
    const context = state.clinicalIntel.chartDrilldownContext
    additions.push(
      `CHART DRILLDOWN CONTEXT: title=${context.chartTitle || "n/a"}; x=${context.xKey || "x"}:${String(
        context.xValue ?? "n/a"
      )}; series=${context.seriesLabel || context.seriesKey || "n/a"}; value=${String(
        context.value ?? "n/a"
      )}; source=${context.source || "n/a"}.`
    )
    additions.push(
      "Run a focused drill-down subloop: explain this datapoint, compare with nearby trend context when available, and cite the exact source for the claim."
    )
  }
  return additions
}

function makeStep(
  id: string,
  label: string,
  status: SupervisorRuntimeStep["status"],
  detail?: string,
  phase?: SupervisorRuntimeStep["phase"]
): SupervisorRuntimeStep {
  return {
    id,
    label,
    status,
    ...(detail ? { detail } : {}),
    ...(phase ? { phase } : {}),
  }
}

let compiledSupervisor: any = null

function getCompiledSupervisor() {
  if (compiledSupervisor) return compiledSupervisor

  const graph = new StateGraph(SupervisorStateAnnotation)
    .addNode("planner", async (state: SupervisorState) => {
      const intent = classifyClinicalIntent(state.input.query)
      const modePolicy = buildModePolicy(
        state.input.role,
        state.input.learningMode,
        state.input.clinicianMode
      )
      const connectorOrder = selectConnectorPriority(intent)
      const clinicalIntel =
        state.input.clinicalIntel || buildClinicalIntelPreflight(state.input.query)
      const complexityMode = deriveComplexityMode({
        clinicalIntel,
        query: state.input.query,
      })
      const clinicalCompleteness = clinicalIntel.completeness
      const incompleteEvidencePolicy: ClinicalIncompleteEvidencePolicy =
        state.input.incompleteEvidencePolicy || "balanced_conditional"
      const incompleteEvidenceState = clinicalCompleteness.state
      const missingVariablePrompts =
        incompleteEvidencePolicy === "none"
          ? []
          : clinicalCompleteness.missingCriticalVariables.map((variable) => ({
              variable,
              prompt: formatMissingVariablePrompt(variable),
            }))
      const maxIterations = computeMaxIterations(
        state.input,
        modePolicy,
        complexityMode,
        clinicalCompleteness
      )
      const chartPlan = buildChartPlanHint({
        query: state.input.query,
        intent,
        selectedToolNames: state.input.availableToolNames,
        clinicalIntel,
      })
      const depthBudget = computeTaskDepthBudget({
        query: state.input.query,
        clinicalIntel,
        complexityMode,
        modePolicy,
        chartPlan,
        learningMode: state.input.learningMode,
      })
      const selectionHints = buildPlannerSelectionHints({
        connectorOrder,
        availableToolNames: state.input.availableToolNames,
        depthTier: depthBudget.tier,
        query: state.input.query,
        clinicalIntel,
        modePolicy,
        chartPlan,
      })
      const plannerBuild = buildPlannerTaskPlanWithFallback({
        query: state.input.query,
        depthBudget,
        clinicalIntel,
        modePolicy,
        chartPlan,
        selectionHints,
        learningMode: state.input.learningMode,
        lmsContext: state.input.lmsContext,
      })
      const llmTaskPlan = null
      const taskPlan = llmTaskPlan || plannerBuild.taskPlan
      const runtimeDag = taskPlanToRuntimeDag(taskPlan)
      const runtimeSteps = taskPlanToRuntimeSteps(taskPlan)

      return {
        intent,
        modePolicy,
        connectorOrder,
        maxIterations,
        chartPlan,
        clinicalIntel,
        complexityMode,
        clinicalCompleteness,
        incompleteEvidencePolicy,
        incompleteEvidenceState,
        missingVariablePrompts,
        depthTier: depthBudget.tier,
        depthTarget: depthBudget.targetTaskCount,
        plannerPreferredConnectorIds: selectionHints.preferredConnectorIds,
        plannerPreferredToolNames: selectionHints.preferredToolNames,
        taskPlan,
        retrievalNotes: [],
        plannerNotes: [
          ...state.plannerNotes,
          ...depthBudget.reasons,
          ...selectionHints.justifications,
          ...(llmTaskPlan
            ? ["Planner LLM rewrite applied for concise task titles."]
            : ["Planner LLM rewrite unavailable; deterministic task plan used."]),
          ...(plannerBuild.usedFallback
            ? [
                `Planner fallback activated: ${
                  plannerBuild.fallbackReason || "task-plan generation failed"
                }.`,
              ]
            : []),
        ],
        runtimeDag,
        runtimeSteps,
        dynamicChecklist: runtimeSteps,
        trace: [
          ...state.trace,
          `planner:intent=${intent};complexity=${complexityMode};maxIterations=${maxIterations}`,
          `planner:depth=${depthBudget.tier};tasks=${taskPlan.length}`,
          `planner:lazy-connectors=${selectionHints.preferredConnectorIds.join("|") || "none"}`,
          ...(plannerBuild.usedFallback
            ? [
                `planner:fallback=${plannerBuild.fallbackReason || "task-plan generation failed"}`,
              ]
            : []),
          `preflight:completeness=${clinicalCompleteness.state};missing=${clinicalCompleteness.missingCriticalVariables.join(
            "|"
          ) || "none"}`,
        ],
      }
    })
    .addNode("retrieval", (state: SupervisorState) => {
      const plan = buildAdaptiveFanoutPlan({
        query: state.input.query,
        connectorOrder: state.connectorOrder,
        availableToolNames: state.input.availableToolNames,
        iteration: state.iteration,
        maxIterations: state.maxIterations,
        priorConfidence: state.confidence,
        fanoutPreferred: state.input.fanoutPreferred,
        requireEvidence: state.modePolicy.requireEvidenceForClinicalClaims,
        clinicalIntel: state.clinicalIntel,
        complexityMode: state.complexityMode,
        plannerPreferredConnectorIds: state.plannerPreferredConnectorIds,
        plannerPreferredToolNames: state.plannerPreferredToolNames,
        plannerLazySelection: true,
        scenarioFocus: scenarioFocusLabel({
          clinicalIntel: state.clinicalIntel,
          query: state.input.query,
        }),
      })
      const selectedConnectorIds = dedupe([
        ...state.selectedConnectorIds,
        ...plan.selectedConnectorIds,
      ]) as ClinicalConnectorId[]
      const selectedToolNames = dedupe([...state.selectedToolNames, ...plan.selectedToolNames])
      const gatekeeperDecisions = mergeGatekeeperDecisions(
        state.gatekeeperDecisions,
        plan.gatekeeperDecisions
      )
      const skippedByGatekeeper = plan.gatekeeperDecisions.filter(
        (decision) => decision.decision === "skip"
      ).length
      const allowedByGatekeeper = plan.gatekeeperDecisions.filter(
        (item) => item.decision === "allow"
      ).length
      const decisionReasonPreview = plan.gatekeeperDecisions
        .slice(0, 4)
        .map((decision) => {
          const verdict = decision.decision === "allow" ? "ALLOW" : "SKIP"
          return `${verdict} ${decision.id}: ${decision.reason}`
        })
        .join(" | ")

      let taskPlan = state.taskPlan
      taskPlan = updateFirstTaskByPhase(taskPlan, "gatekeeper", {
        status: "completed",
        description: "Connector/tool gatekeeping completed for this iteration.",
        reasoningAppend: `${allowedByGatekeeper} allow and ${skippedByGatekeeper} skip decision${
          skippedByGatekeeper === 1 ? "" : "s"
        }. ${decisionReasonPreview}`,
      })
      taskPlan = updateFirstTaskByPhase(taskPlan, "retrieval", {
        taskName: connectorSpecificRetrievalTaskName({
          query: state.input.query,
          connectorIds: plan.selectedConnectorIds,
          toolNames: plan.selectedToolNames,
          curriculumEnabled: Boolean(state.input.lmsContext),
          scenarioFocus: scenarioFocusLabel({
            clinicalIntel: state.clinicalIntel,
            query: state.input.query,
          }),
        }),
        status: plan.selectedToolNames.length > 0 ? "running" : "failed",
        description: `Queued planner-lazy retrieval with ${plan.selectedConnectorIds.length} connector${
          plan.selectedConnectorIds.length === 1 ? "" : "s"
        } and ${plan.selectedToolNames.length} tool${
          plan.selectedToolNames.length === 1 ? "" : "s"
        }; awaiting tool result confirmations.`,
        reasoningAppend:
          gatekeeperDecisions
            .filter((decision) => decision.scope === "tool")
            .slice(0, 4)
            .map((decision) => decision.reason)
            .join(" | ") || undefined,
      })
      taskPlan = updateFirstTaskByPhase(taskPlan, "planner", {
        status: "completed",
        reasoningAppend: "Planner hypotheses were translated into concrete retrieval tasks.",
      })

      const retrievalNotesForIteration: RetrievalFallbackNote[] = []
      const pubmedDeferred = plan.gatekeeperDecisions.find(
        (decision) =>
          decision.scope === "connector" &&
          decision.id === "pubmed" &&
          decision.reasonCode === "connector_budget_limited"
      )
      if (pubmedDeferred) {
        retrievalNotesForIteration.push({
          id: `retrieval-note-pubmed-deferred-${state.iteration + 1}`,
          connectorId: "pubmed",
          outcome: "fallback",
          note: "PubMed was deferred this iteration due to depth budget; prioritizing current planner-selected sources.",
          detail: pubmedDeferred.detail,
        })
      }
      if (plan.selectedToolNames.length === 0) {
        retrievalNotesForIteration.push({
          id: `retrieval-note-empty-${state.iteration + 1}`,
          connectorId: "guideline",
          outcome: "error",
          note: "No retrieval tools were activated for this iteration; using conservative fallback synthesis.",
        })
      }
      const retrievalNotes = mergeRetrievalNotes(
        state.retrievalNotes,
        retrievalNotesForIteration
      )
      const runtimeDag = taskPlanToRuntimeDag(taskPlan)
      const runtimeSteps = taskPlanToRuntimeSteps(taskPlan)

      return {
        selectedConnectorIds,
        selectedToolNames,
        gatekeeperDecisions,
        plannerNotes: [...state.plannerNotes, ...plan.reasoning],
        taskPlan,
        retrievalNotes,
        runtimeDag,
        runtimeSteps,
        dynamicChecklist: runtimeSteps,
        trace: [
          ...state.trace,
          `retrieve:iteration=${state.iteration + 1};connectors=${plan.selectedConnectorIds.join(
            "|"
          )};tools=${plan.selectedToolNames.length}`,
          `gatekeeper:allow=${plan.gatekeeperDecisions.filter((item) => item.decision === "allow").length};skip=${skippedByGatekeeper}`,
        ],
      }
    })
    .addNode("evaluator", (state: SupervisorState) => {
      const scenarioFocus = scenarioFocusLabel({
        clinicalIntel: state.clinicalIntel,
        query: state.input.query,
      })
      const evaluation = evaluateAdaptiveFanoutCoverage({
        selectedConnectorIds: state.selectedConnectorIds,
        selectedToolNames: state.selectedToolNames,
        iteration: state.iteration,
        maxIterations: state.maxIterations,
        fanoutPreferred: state.input.fanoutPreferred,
        requireEvidence: state.modePolicy.requireEvidenceForClinicalClaims,
        complexityMode: state.complexityMode,
        clinicalCompleteness: state.clinicalCompleteness,
        gatekeeperDecisions: state.gatekeeperDecisions,
      })
      const nextIteration = state.iteration + 1
      const shouldContinue = evaluation.shouldExpand
      const loopTransitions: LoopTransition[] = [
        ...state.loopTransitions,
        {
          iteration: nextIteration,
          decision: shouldContinue ? "continue" : "compose",
          reason: shouldContinue
            ? "Confidence below target or evidence incomplete."
            : "Confidence threshold reached for current loop budget.",
          observedConfidence: evaluation.confidence,
          targetConfidence: evaluation.targetConfidence,
        },
      ]
      const confidenceTransitions: ConfidenceTransition[] = [
        ...state.confidenceTransitions,
        {
          iteration: nextIteration,
          before: state.confidence,
          after: evaluation.confidence,
          reason: evaluation.notes[0] || "Coverage re-evaluated.",
        },
      ]
      let taskPlan = updateFirstTaskByPhase(state.taskPlan, "evaluator", {
        status: "completed",
        description: "Evaluator scored evidence coverage and loop decision.",
        reasoningAppend: `Confidence ${formatPercent(
          evaluation.confidence
        )} vs target ${formatPercent(evaluation.targetConfidence)}.`,
      })
      if (shouldContinue) {
        taskPlan = updateFirstTaskByPhase(taskPlan, "retrieval", {
          status: "running",
          reasoningAppend:
            "Evaluator triggered loop expansion because confidence remains below threshold.",
        })
        if (state.depthTier !== "complex") {
          const composeTask = taskPlan.find((task) => task.phase === "composer")
          const evaluatorTask = taskPlan.find((task) => task.phase === "evaluator")
          taskPlan = appendTaskPlanItem(
            taskPlan,
            createPlannerTask({
              id: `task-retrieval-expand-${nextIteration}`,
              taskName: taskNameForFocus("Broadening evidence scope", scenarioFocus),
              description:
                "Increase connector/tool fan-out only after evaluator signaled low confidence.",
              reasoning:
                "Fast-track/moderate policy allows expansion only when explicitly triggered.",
              phase: "retrieval",
              status: "pending",
              dependsOn: evaluatorTask ? [evaluatorTask.id] : [],
              isCritical: false,
            }),
            composeTask?.id
          )
        }
      } else {
        taskPlan = updateFirstTaskByPhase(taskPlan, "composer", {
          status: "running",
          reasoningAppend:
            "Confidence threshold reached or loop budget exhausted; proceeding to final composition.",
        })
      }

      const retrievalFallbackNotes: RetrievalFallbackNote[] = []
      const hasPubmedSelected = state.selectedConnectorIds.includes("pubmed")
      const hasGuidelineSelected = state.selectedConnectorIds.includes("guideline")
      const exhaustedWithLowConfidence =
        !shouldContinue && evaluation.confidence < evaluation.targetConfidence
      if (hasPubmedSelected && hasGuidelineSelected && exhaustedWithLowConfidence) {
        retrievalFallbackNotes.push({
          id: `retrieval-note-pubmed-fallback-${nextIteration}`,
          connectorId: "pubmed",
          outcome: "fallback",
          note: "PubMed: No high-signal trials found. Reverting to Clinical Guidelines.",
          fallbackConnectorId: "guideline",
          detail: `Observed confidence ${formatPercent(
            evaluation.confidence
          )} below target ${formatPercent(evaluation.targetConfidence)}.`,
        })
      } else if (hasPubmedSelected && evaluation.confidence >= evaluation.targetConfidence) {
        retrievalFallbackNotes.push({
          id: `retrieval-note-pubmed-success-${nextIteration}`,
          connectorId: "pubmed",
          outcome: "success",
          note: "PubMed retrieval returned sufficient signal for this iteration.",
          detail: `Confidence ${formatPercent(evaluation.confidence)} met target.`,
        })
      }
      const retrievalNotes = mergeRetrievalNotes(
        state.retrievalNotes,
        retrievalFallbackNotes
      )
      const runtimeDag = taskPlanToRuntimeDag(taskPlan)
      const runtimeSteps = taskPlanToRuntimeSteps(taskPlan)

      return {
        iteration: nextIteration,
        confidence: evaluation.confidence,
        sourceDiversity: evaluation.sourceDiversity,
        shouldContinue,
        loopTransitions,
        confidenceTransitions,
        plannerNotes: [...state.plannerNotes, ...evaluation.notes],
        taskPlan,
        retrievalNotes,
        runtimeDag,
        runtimeSteps,
        dynamicChecklist: runtimeSteps,
        trace: [
          ...state.trace,
          `evaluate:iteration=${nextIteration};confidence=${evaluation.confidence.toFixed(
            2
          )};expand=${shouldContinue}`,
        ],
      }
    })
    .addNode("composer", (state: SupervisorState) => {
      const chartPlan = buildChartPlanHint({
        query: state.input.query,
        intent: state.intent,
        selectedToolNames: state.selectedToolNames,
        clinicalIntel: state.clinicalIntel,
      })
      const maxSteps = computeMaxSteps(
        state.input,
        state.selectedToolNames,
        state.iteration,
        state.complexityMode
      )
      let taskPlan = state.taskPlan
      const comparativeDataPoints = Math.max(
        0,
        Math.round(
          Math.max(
            state.sourceDiversity,
            state.selectedConnectorIds.filter((id) =>
              id === "guideline" ||
              id === "pubmed" ||
              id === "clinical_trials" ||
              id === "scholar_gateway"
            ).length
          )
        )
      )
      const hasComparativeEvidence = comparativeDataPoints >= 2
      const chartFeasible =
        chartPlan.enabled &&
        chartPlan.feasibilityScore >= 0.55 &&
        hasComparativeEvidence
      if (chartFeasible) {
        const chartTaskName = taskNameForFocus(
          chartTaskNameForShape(chartPlan.dataShape),
          scenarioFocusLabel({
            clinicalIntel: state.clinicalIntel,
            query: state.input.query,
          })
        )
        if (taskPlan.some((task) => task.phase === "visualization")) {
          const existingChartTask = taskPlan.find((task) => task.phase === "visualization")
          if (existingChartTask) {
            taskPlan = updateTaskById(taskPlan, existingChartTask.id, {
              status: "completed",
              taskName: chartTaskName,
              description:
                "Visualization task executed because chart feasibility threshold was met.",
              reasoningAppend: `Shape=${chartPlan.dataShape}; feasibility=${formatPercent(
                chartPlan.feasibilityScore
              )}.`,
            })
          }
        } else {
          const composeTask = taskPlan.find((task) => task.id === "task-compose")
          const dependsOnTask =
            taskPlan.find((task) => task.phase === "evaluator") ||
            taskPlan.find((task) => task.phase === "retrieval")
          taskPlan = appendTaskPlanItem(
            taskPlan,
            createPlannerTask({
              id: "task-chart",
              taskName: chartTaskName,
              description:
                "Visualization task inserted after retrieval because chart feasibility became true.",
              reasoning: `Shape=${chartPlan.dataShape}; feasibility=${formatPercent(
                chartPlan.feasibilityScore
              )}; dataPoints=${comparativeDataPoints}.`,
              phase: "visualization",
              status: "completed",
              dependsOn: dependsOnTask ? [dependsOnTask.id] : [],
              isCritical: false,
            }),
            composeTask?.id
          )
        }
      } else {
        const existingChartTask = taskPlan.find((task) => task.phase === "visualization")
        if (existingChartTask) {
          taskPlan = updateTaskById(taskPlan, existingChartTask.id, {
            status: "failed",
            description: "Insufficient comparative data for visualization.",
            reasoningAppend: `Chart skipped: comparative evidence points=${comparativeDataPoints}.`,
          })
        } else {
          taskPlan = removeTasksByPhase(taskPlan, "visualization")
        }
      }
      taskPlan = updateFirstTaskByPhase(taskPlan, "composer", {
        status: "completed",
        description:
          state.incompleteEvidenceState === "incomplete_evidence"
            ? "Compose conditional guidance with targeted follow-up prompts."
            : "Compose final answer with calibrated confidence framing.",
        reasoningAppend: `Tool budget ${maxSteps}; source diversity ${state.sourceDiversity}; chart=${
          chartPlan.enabled ? chartPlan.dataShape : "off"
        }.`,
      })
      taskPlan = updateFirstTaskByPhase(taskPlan, "retrieval", {
        status: state.selectedToolNames.length > 0 ? "running" : "failed",
        reasoningAppend:
          state.selectedToolNames.length > 0
            ? "Waiting for retrieval tool output confirmation before marking completion."
            : "No retrieval tools produced executable output for this turn.",
      })
      const runtimeDag = taskPlanToRuntimeDag(taskPlan)
      const runtimeSteps = taskPlanToRuntimeSteps(taskPlan)
      const systemPromptAdditions = buildSystemPromptAdditions({
        ...state,
        taskPlan,
        runtimeSteps,
        runtimeDag,
        maxSteps,
        chartPlan,
      })
      return {
        systemPromptAdditions,
        maxSteps,
        chartPlan,
        taskPlan,
        retrievalNotes: state.retrievalNotes,
        runtimeDag,
        runtimeSteps,
        dynamicChecklist: buildDynamicChecklist({
          ...state,
          taskPlan,
          runtimeSteps,
          retrievalNotes: state.retrievalNotes,
          maxSteps,
          chartPlan,
          runtimeDag,
          systemPromptAdditions,
        }),
        trace: [
          ...state.trace,
          `compose:maxSteps=${maxSteps};sourceDiversity=${state.sourceDiversity};confidence=${state.confidence.toFixed(
            2
          )};chart=${chartPlan.enabled ? chartPlan.dataShape : "none"}`,
        ],
      }
    })
    .addNode("adaptive_retrieval", (state: SupervisorState) => {
      // Adaptive RAG: broaden search when evaluator confidence is very low.
      // Relaxes filters, expands query, and tries alternate retrieval paths.
      const enabled = process.env.ENABLE_ADAPTIVE_RAG === "true"
      if (!enabled) {
        return {
          trace: [...state.trace, "adaptive_retrieval:skipped(disabled)"],
        }
      }

      const broadened: string[] = [
        ...state.plannerNotes,
        "[Adaptive RAG] Confidence critically low after standard retrieval. Broadening search: relaxing filters, expanding query variants, and trying alternate connectors.",
      ]

      // Add connectors not yet selected to the preferred list
      const allConnectors = state.connectorOrder
      const alreadySelected = new Set(state.selectedConnectorIds)
      const additionalConnectors = allConnectors
        .filter((c) => !alreadySelected.has(c))
        .slice(0, 3)
      const expandedConnectorIds = [
        ...state.selectedConnectorIds,
        ...additionalConnectors,
      ] as ClinicalConnectorId[]
      const expandedToolNames = dedupe([
        ...state.selectedToolNames,
        ...additionalConnectors.map(
          (c) => CONNECTOR_TOOL_NAME_MAP[c]?.[0]
        ).filter(Boolean) as string[],
      ])

      return {
        selectedConnectorIds: expandedConnectorIds,
        selectedToolNames: expandedToolNames,
        plannerNotes: broadened,
        trace: [
          ...state.trace,
          `adaptive_retrieval:expanded;addedConnectors=${additionalConnectors.join("|")}`,
        ],
      }
    })
    .addEdge(START, "planner")
    .addEdge("planner", "retrieval")
    .addEdge("retrieval", "evaluator")
    .addConditionalEdges("evaluator", (state: SupervisorState) => {
      if (state.shouldContinue) return "retrieval"
      // Adaptive RAG gate: if confidence is critically low and we haven't
      // already done adaptive retrieval, try broadening once.
      const adaptiveEnabled = process.env.ENABLE_ADAPTIVE_RAG === "true"
      const criticallyLow = state.confidence < 0.25
      const alreadyAdapted = state.trace.some((t) =>
        t.startsWith("adaptive_retrieval:expanded")
      )
      if (adaptiveEnabled && criticallyLow && !alreadyAdapted) {
        return "adaptive_retrieval"
      }
      return "composer"
    })
    .addEdge("adaptive_retrieval", "retrieval")
    .addEdge("composer", END)

  compiledSupervisor = graph.compile()
  return compiledSupervisor
}

function buildFallbackOutput(
  input: LangChainSupervisorInput,
  error?: unknown
): LangChainSupervisorOutput {
  const intent = classifyClinicalIntent(input.query)
  const modePolicy = buildModePolicy(input.role, input.learningMode, input.clinicianMode)
  const connectorOrder = selectConnectorPriority(intent)
  const clinicalIntel = input.clinicalIntel || buildClinicalIntelPreflight(input.query)
  const complexityMode = deriveComplexityMode({ clinicalIntel, query: input.query })
  const clinicalCompleteness = clinicalIntel.completeness
  const incompleteEvidencePolicy: ClinicalIncompleteEvidencePolicy =
    input.incompleteEvidencePolicy || "balanced_conditional"
  const chartPlan = buildChartPlanHint({
    query: input.query,
    intent,
    selectedToolNames: input.availableToolNames,
    clinicalIntel,
  })
  const depthBudget = computeTaskDepthBudget({
    query: input.query,
    clinicalIntel,
    complexityMode,
    modePolicy,
    chartPlan,
    learningMode: input.learningMode,
  })
  const selectionHints = buildPlannerSelectionHints({
    connectorOrder,
    availableToolNames: input.availableToolNames,
    depthTier: depthBudget.tier,
    query: input.query,
    clinicalIntel,
    modePolicy,
    chartPlan,
  })
  const plan = buildAdaptiveFanoutPlan({
    query: input.query,
    connectorOrder,
    availableToolNames: input.availableToolNames,
    iteration: 0,
    maxIterations: 1,
    priorConfidence: 0,
    fanoutPreferred: input.fanoutPreferred,
    requireEvidence: modePolicy.requireEvidenceForClinicalClaims,
    clinicalIntel,
    complexityMode,
    plannerPreferredConnectorIds: selectionHints.preferredConnectorIds,
    plannerPreferredToolNames: selectionHints.preferredToolNames,
    plannerLazySelection: true,
    scenarioFocus: scenarioFocusLabel({
      clinicalIntel,
      query: input.query,
    }),
  })
  const evaluation = evaluateAdaptiveFanoutCoverage({
    selectedConnectorIds: plan.selectedConnectorIds,
    selectedToolNames: plan.selectedToolNames,
    iteration: 0,
    maxIterations: 1,
    fanoutPreferred: input.fanoutPreferred,
    requireEvidence: modePolicy.requireEvidenceForClinicalClaims,
    complexityMode,
    clinicalCompleteness,
    gatekeeperDecisions: plan.gatekeeperDecisions,
  })
  const loopIterations = 1
  const maxSteps = computeMaxSteps(
    input,
    plan.selectedToolNames,
    loopIterations,
    complexityMode
  )
  const fallbackSummary =
    error instanceof Error ? error.message : String(error || "unknown")
  const plannerBuild = buildPlannerTaskPlanWithFallback({
    query: input.query,
    depthBudget,
    clinicalIntel,
    modePolicy,
    chartPlan,
    selectionHints,
    learningMode: input.learningMode,
    lmsContext: input.lmsContext,
  })
  let taskPlan = plannerBuild.taskPlan
  taskPlan = updateFirstTaskByPhase(taskPlan, "gatekeeper", {
    status: "completed",
    reasoningAppend:
      "Fallback mode applied one-pass gatekeeper decisions from planner-lazy policy.",
  })
  taskPlan = updateFirstTaskByPhase(taskPlan, "retrieval", {
    status: plan.selectedToolNames.length > 0 ? "running" : "failed",
    reasoningAppend:
      plan.selectedToolNames.length > 0
        ? `Fallback retrieval queued ${plan.selectedToolNames.length} tool${
            plan.selectedToolNames.length === 1 ? "" : "s"
          }; awaiting runtime tool outputs.`
        : "Fallback retrieval could not queue any tool output.",
  })
  taskPlan = updateFirstTaskByPhase(taskPlan, "evaluator", {
    status: "completed",
    reasoningAppend: `Fallback coverage score ${formatPercent(evaluation.confidence)}.`,
  })
  taskPlan = updateFirstTaskByPhase(taskPlan, "composer", {
    status: "completed",
    reasoningAppend: `Fallback path due to supervisor error: ${fallbackSummary.slice(0, 120)}.`,
  })
  const runtimeDag = taskPlanToRuntimeDag(taskPlan)
  const runtimeSteps = taskPlanToRuntimeSteps(taskPlan)
  const retrievalNotes: RetrievalFallbackNote[] =
    plan.selectedConnectorIds.includes("pubmed") &&
    plan.selectedConnectorIds.includes("guideline") &&
    evaluation.confidence < evaluation.targetConfidence
      ? [
          {
            id: "retrieval-note-pubmed-fallback-fallback-path",
            connectorId: "pubmed",
            outcome: "fallback",
            note: "PubMed: No high-signal trials found. Reverting to Clinical Guidelines.",
            fallbackConnectorId: "guideline",
            detail: "Fallback one-pass planner confidence remained below target.",
          },
        ]
      : []
  const missingVariablePrompts = clinicalCompleteness.missingCriticalVariables.map(
    (variable) => ({
      variable,
      prompt: formatMissingVariablePrompt(variable),
    })
  )
  const resolvedMissingVariablePrompts =
    incompleteEvidencePolicy === "none" ? [] : missingVariablePrompts
  const incompleteEvidenceState: IncompleteEvidenceState = clinicalCompleteness.state
  const loopTransitions: LoopTransition[] = [
    {
      iteration: 1,
      decision: "compose",
      reason: "Fallback mode executed one-pass planning.",
      observedConfidence: evaluation.confidence,
      targetConfidence: evaluation.targetConfidence,
    },
  ]
  const confidenceTransitions: ConfidenceTransition[] = [
    {
      iteration: 1,
      before: 0.2,
      after: evaluation.confidence,
      reason: "Fallback confidence scoring.",
    },
  ]

  return {
    orchestrationEngine: "langchain-supervisor",
    intent,
    selectedConnectorIds: plan.selectedConnectorIds,
    selectedToolNames: plan.selectedToolNames,
    modePolicy,
    systemPromptAdditions: [
      ...buildSystemPromptAdditions({
        input,
        intent,
        modePolicy,
        connectorOrder,
        selectedConnectorIds: plan.selectedConnectorIds,
        selectedToolNames: plan.selectedToolNames,
        systemPromptAdditions: [],
        maxSteps,
        trace: [],
        iteration: loopIterations,
        maxIterations: 1,
        confidence: evaluation.confidence,
        sourceDiversity: evaluation.sourceDiversity,
        shouldContinue: false,
        plannerNotes: [],
        taskPlan,
        retrievalNotes,
        depthTier: depthBudget.tier,
        depthTarget: depthBudget.targetTaskCount,
        plannerPreferredConnectorIds: selectionHints.preferredConnectorIds,
        plannerPreferredToolNames: selectionHints.preferredToolNames,
        runtimeSteps,
        dynamicChecklist: [],
        runtimeDag,
        chartPlan,
        clinicalIntel,
        complexityMode,
        clinicalCompleteness,
        incompleteEvidencePolicy,
        incompleteEvidenceState,
        missingVariablePrompts: resolvedMissingVariablePrompts,
        gatekeeperDecisions: plan.gatekeeperDecisions,
        loopTransitions,
        confidenceTransitions,
      }),
      ...(plannerBuild.usedFallback
        ? [
            `Planner deterministic fallback used: ${
              plannerBuild.fallbackReason || "task-plan generation failure"
            }.`,
          ]
        : []),
      `Supervisor fallback path used due to runtime error: ${fallbackSummary}`,
    ],
    maxSteps,
    trace: [
      "fallback:langchain-supervisor",
      `fallback:reason=${fallbackSummary.slice(0, 180)}`,
    ],
    routingSummary: {
      intent,
      selectedConnectorIds: plan.selectedConnectorIds,
      selectedToolNames: plan.selectedToolNames,
      modePolicy,
      maxSteps,
      complexityMode,
      clinicalCompleteness,
    },
    clinicalIntel,
    complexityMode,
    clinicalCompleteness,
    gatekeeperDecisions: plan.gatekeeperDecisions,
    confidenceTransitions,
    loopTransitions,
    loopIterations,
    confidence: evaluation.confidence,
    sourceDiversity: evaluation.sourceDiversity,
    incompleteEvidenceState,
    missingVariablePrompts: resolvedMissingVariablePrompts,
    taskPlan,
    retrievalNotes,
    dynamicChecklist: buildDynamicChecklist({
      input,
      intent,
      modePolicy,
      connectorOrder,
      selectedConnectorIds: plan.selectedConnectorIds,
      selectedToolNames: plan.selectedToolNames,
      systemPromptAdditions: [],
      maxSteps,
      trace: [],
      iteration: loopIterations,
      maxIterations: 1,
      confidence: evaluation.confidence,
      sourceDiversity: evaluation.sourceDiversity,
      shouldContinue: false,
      plannerNotes: [],
      taskPlan,
      retrievalNotes,
      depthTier: depthBudget.tier,
      depthTarget: depthBudget.targetTaskCount,
      plannerPreferredConnectorIds: selectionHints.preferredConnectorIds,
      plannerPreferredToolNames: selectionHints.preferredToolNames,
      runtimeSteps,
      dynamicChecklist: [],
      runtimeDag,
      chartPlan,
      clinicalIntel,
      complexityMode,
      clinicalCompleteness,
      incompleteEvidencePolicy,
      incompleteEvidenceState,
      missingVariablePrompts: resolvedMissingVariablePrompts,
      gatekeeperDecisions: plan.gatekeeperDecisions,
      loopTransitions,
      confidenceTransitions,
    }),
    runtimeSteps,
    runtimeDag,
    chartPlan,
  }
}

export async function runLangChainSupervisor(
  input: LangChainSupervisorInput
): Promise<LangChainSupervisorOutput> {
  try {
    const app = getCompiledSupervisor() as {
      invoke: (state: SupervisorState) => Promise<SupervisorState>
    }
    const initialClinicalIntel =
      input.clinicalIntel || buildClinicalIntelPreflight(input.query)
    const initialCompleteness = initialClinicalIntel.completeness
    const initialComplexityMode = deriveComplexityMode({
      clinicalIntel: initialClinicalIntel,
      query: input.query,
    })
    const initialState: SupervisorState = {
      input,
      intent: "general",
      modePolicy: {
        studentMode: false,
        clinicianMode: false,
        requireStrictUncertainty: false,
        requireEvidenceForClinicalClaims: input.evidenceEnabled,
      },
      connectorOrder: [],
      selectedConnectorIds: [],
      selectedToolNames: [],
      systemPromptAdditions: [],
      maxSteps: 6,
      trace: [],
      iteration: 0,
      maxIterations: 1,
      confidence: 0.2,
      sourceDiversity: 0,
      shouldContinue: false,
      plannerNotes: [],
      taskPlan: [],
      retrievalNotes: [],
      depthTier: "simple",
      depthTarget: 1,
      plannerPreferredConnectorIds: [],
      plannerPreferredToolNames: [],
      runtimeSteps: [],
      dynamicChecklist: [],
      runtimeDag: [],
      chartPlan: {
        enabled: false,
        suggestedCount: 0,
        reasons: [],
        dataShape: "none",
        visualMode: "text-first",
        preferredChartTypes: [],
        feasibilityScore: 0,
        examDecisionTree: false,
        drilldownEnabled: false,
      },
      clinicalIntel: initialClinicalIntel,
      complexityMode: initialComplexityMode,
      clinicalCompleteness: initialCompleteness,
      incompleteEvidencePolicy: input.incompleteEvidencePolicy || "balanced_conditional",
      incompleteEvidenceState: initialCompleteness.state,
      missingVariablePrompts:
        (input.incompleteEvidencePolicy || "balanced_conditional") === "none"
          ? []
          : initialCompleteness.missingCriticalVariables.map((variable) => ({
              variable,
              prompt: formatMissingVariablePrompt(variable),
            })),
      gatekeeperDecisions: [],
      loopTransitions: [],
      confidenceTransitions: [],
    }
    const result = await app.invoke(initialState)
    const payload: LangChainSupervisorOutput = {
      orchestrationEngine: "langchain-supervisor",
      intent: result.intent,
      selectedConnectorIds: result.selectedConnectorIds,
      selectedToolNames: result.selectedToolNames,
      modePolicy: result.modePolicy,
      systemPromptAdditions: result.systemPromptAdditions,
      maxSteps: result.maxSteps,
      trace: result.trace,
      routingSummary: {
        intent: result.intent,
        selectedConnectorIds: result.selectedConnectorIds,
        selectedToolNames: result.selectedToolNames,
        modePolicy: result.modePolicy,
        maxSteps: result.maxSteps,
        complexityMode: result.complexityMode,
        clinicalCompleteness: result.clinicalCompleteness,
      },
      loopIterations: result.iteration,
      confidence: result.confidence,
      sourceDiversity: result.sourceDiversity,
      complexityMode: result.complexityMode,
      clinicalIntel: result.clinicalIntel,
      clinicalCompleteness: result.clinicalCompleteness,
      incompleteEvidenceState: result.incompleteEvidenceState,
      missingVariablePrompts: result.missingVariablePrompts,
      gatekeeperDecisions: result.gatekeeperDecisions,
      loopTransitions: result.loopTransitions,
      confidenceTransitions: result.confidenceTransitions,
      taskPlan: result.taskPlan,
      retrievalNotes: result.retrievalNotes,
      dynamicChecklist: result.dynamicChecklist,
      runtimeSteps: result.runtimeSteps,
      runtimeDag: result.runtimeDag,
      chartPlan: result.chartPlan,
    }
    recordHarnessRun(false)
    return payload
  } catch (error) {
    console.warn("[langchain-supervisor] Falling back to one-pass planner:", error)
    recordHarnessRun(true)
    return buildFallbackOutput(input, error)
  }
}

import {
  CONNECTOR_TOOL_NAME_MAP,
  type ClinicalCompleteness,
  type ClinicalComplexityMode,
  type ClinicalConnectorId,
  type ClinicalIntelPreflight,
  type GatekeeperDecision,
} from "@/lib/clinical-agent/graph/types"

type BuildAdaptiveFanoutPlanInput = {
  query: string
  connectorOrder: ClinicalConnectorId[]
  availableToolNames: string[]
  iteration: number
  maxIterations: number
  priorConfidence: number
  fanoutPreferred?: boolean
  requireEvidence: boolean
  clinicalIntel?: ClinicalIntelPreflight
  complexityMode?: ClinicalComplexityMode
  plannerPreferredConnectorIds?: ClinicalConnectorId[]
  plannerPreferredToolNames?: string[]
  plannerLazySelection?: boolean
  scenarioFocus?: string
}

export type AdaptiveFanoutPlan = {
  selectedConnectorIds: ClinicalConnectorId[]
  selectedToolNames: string[]
  targetConfidence: number
  reasoning: string[]
  gatekeeperDecisions: GatekeeperDecision[]
}

type EvaluateAdaptiveFanoutInput = {
  selectedConnectorIds: ClinicalConnectorId[]
  selectedToolNames: string[]
  iteration: number
  maxIterations: number
  fanoutPreferred?: boolean
  requireEvidence: boolean
  complexityMode?: ClinicalComplexityMode
  clinicalCompleteness?: ClinicalCompleteness
  gatekeeperDecisions?: GatekeeperDecision[]
}

export type AdaptiveFanoutEvaluation = {
  confidence: number
  sourceDiversity: number
  shouldExpand: boolean
  targetConfidence: number
  notes: string[]
}

const TOOL_FAMILY_PATTERNS: Array<{ family: string; pattern: RegExp }> = [
  { family: "guideline", pattern: /guideline/i },
  { family: "pubmed", pattern: /pubmed/i },
  { family: "clinical-trials", pattern: /clinicaltrials/i },
  { family: "scholar", pattern: /scholar|biorxiv/i },
  { family: "upload", pattern: /upload|artifact|quiz|lecture|timetable|review/i },
  { family: "web", pattern: /websearch/i },
  { family: "video", pattern: /youtube/i },
  { family: "connector", pattern: /registry|coverage|chembl|synapse|benchling|biorender/i },
]

const UPLOAD_INTENT_PATTERN =
  /\b(upload|slides?|deck|notes?|lecture|transcript|document|pdf|pptx|docx)\b/i

const STUDY_TIMETABLE_PATTERN =
  /\b(timetable|study plan|schedule|planner|revision plan|reschedule|rebalance)\b/i

const REVIEW_QUEUE_PATTERN =
  /\b(spaced repetition|flashcard|recall|review queue|viva|quiz drill)\b/i

const LECTURE_SUMMARY_PATTERN =
  /\b(lecture|video|recording|transcript|summary|action items?)\b/i

const STUDY_GRAPH_PATTERN =
  /\b(study graph|topic graph|objective graph|knowledge graph)\b/i

const DRILLDOWN_PATTERN = /\b(chart drilldown|drill[-\s]?down|clicked datapoint)\b/i

const CONNECTOR_REASONABLE_FOR_OPERATIONAL = new Set<ClinicalConnectorId>([
  "cms_coverage",
  "npi_registry",
])

const CONNECTOR_REASONABLE_FOR_RESEARCH = new Set<ClinicalConnectorId>([
  "pubmed",
  "guideline",
  "clinical_trials",
  "scholar_gateway",
  "biorxiv",
])

const CONNECTOR_REASONABLE_FOR_LAB = new Set<ClinicalConnectorId>([
  "benchling",
  "synapse",
  "chembl",
  "pubmed",
])

const TOOL_TO_CONNECTOR = Object.entries(CONNECTOR_TOOL_NAME_MAP).reduce<
  Record<string, ClinicalConnectorId>
>((acc, [connectorId, toolNames]) => {
  toolNames.forEach((toolName) => {
    acc[toolName] = connectorId as ClinicalConnectorId
  })
  return acc
}, {})

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

function dedupeStrings(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)))
}

function humanizeConnectorId(connectorId: ClinicalConnectorId): string {
  return connectorId.replace(/_/g, " ")
}

function workflowIntentLabel(
  workflowIntent: ClinicalIntelPreflight["entities"]["workflowIntent"] | "general"
): string {
  switch (workflowIntent) {
    case "diagnostic_reasoning":
      return "diagnostic reasoning"
    case "treatment_planning":
      return "treatment planning"
    case "operational":
      return "operational workflow"
    case "lab_workflow":
      return "lab workflow"
    case "exam_mode":
      return "exam-mode reasoning"
    default:
      return "general workflow"
  }
}

function toolNameToSentenceCase(toolName: string): string {
  return toolName
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .trim()
}

function toolFamilyForName(name: string): string {
  const normalized = name.toLowerCase().replace(/[^a-z0-9]/g, "")
  const matched =
    TOOL_FAMILY_PATTERNS.find(({ pattern }) => pattern.test(normalized))?.family ||
    "generic"
  return matched
}

function countDistinctToolFamilies(toolNames: string[]): number {
  const families = new Set<string>()
  toolNames.forEach((name) => {
    families.add(toolFamilyForName(name))
  })
  return families.size
}

function selectAdaptiveConnectorCount(input: {
  availableCount: number
  iteration: number
  priorConfidence: number
  fanoutPreferred?: boolean
  requireEvidence: boolean
  complexityMode?: ClinicalComplexityMode
}) {
  const complexityBias = input.complexityMode === "deep-dive" ? 1 : 0
  const baseCount = input.fanoutPreferred ? 3 + complexityBias : input.requireEvidence ? 2 + complexityBias : 1
  const expansionStride = input.fanoutPreferred ? 2 : 1
  let count = baseCount + input.iteration * expansionStride
  if (input.priorConfidence < 0.4) count += 1
  if (input.priorConfidence > 0.75) count -= 1
  count = clamp(count, 1, input.availableCount)
  return count
}

function pushGatekeeperDecision(
  sink: GatekeeperDecision[],
  decision: GatekeeperDecision
) {
  const key = `${decision.scope}:${decision.id}`
  const existingIndex = sink.findIndex((item) => `${item.scope}:${item.id}` === key)
  if (existingIndex < 0) {
    sink.push(decision)
    return
  }
  const existing = sink[existingIndex]
  if (existing.decision === "allow" && decision.decision === "skip") {
    return
  }
  sink[existingIndex] = decision
}

function connectorGateDecision(input: {
  connectorId: ClinicalConnectorId
  query: string
  requireEvidence: boolean
  clinicalIntel?: ClinicalIntelPreflight
  plannerPreferredConnectorSet?: Set<ClinicalConnectorId>
  plannerLazySelection?: boolean
  scenarioFocus?: string
}): Omit<GatekeeperDecision, "scope" | "id"> {
  const workflow = input.clinicalIntel?.entities.workflowIntent || "general"
  const isDrilldown = Boolean(input.clinicalIntel?.chartDrilldownContext) || DRILLDOWN_PATTERN.test(input.query)
  const connectorLabel = humanizeConnectorId(input.connectorId)
  const workflowLabel = workflowIntentLabel(workflow)
  const scenarioSuffix = input.scenarioFocus ? ` (${input.scenarioFocus})` : ""

  if (
    input.plannerLazySelection &&
    input.plannerPreferredConnectorSet &&
    input.plannerPreferredConnectorSet.size > 0 &&
    !input.plannerPreferredConnectorSet.has(input.connectorId)
  ) {
    return {
      decision: "skip",
      reasonCode: "planner_lazy_connector_skip",
      reason: `Skipping ${connectorLabel}; planner did not request this connector for the current turn${scenarioSuffix}.`,
      detail: `Planner-lazy policy active (${workflowLabel}).`,
    }
  }

  if (workflow === "operational" && !CONNECTOR_REASONABLE_FOR_OPERATIONAL.has(input.connectorId)) {
    return {
      decision: "skip",
      reasonCode: "operational_workflow_connector_skip",
      reason: "Operational workflow query detected; skipping research-heavy connector.",
    }
  }

  if (workflow === "exam_mode" && input.connectorId === "cms_coverage") {
    return {
      decision: "skip",
      reasonCode: "exam_mode_connector_skip",
      reason: "Exam-focused workflow detected; coverage connector is low-yield for this turn.",
    }
  }

  if (workflow === "diagnostic_reasoning" && input.connectorId === "npi_registry") {
    return {
      decision: "skip",
      reasonCode: "diagnostic_connector_skip",
      reason: "Diagnostic reasoning flow detected; provider identity connector is not needed.",
    }
  }

  if (workflow === "treatment_planning" && input.connectorId === "biorender") {
    return {
      decision: "skip",
      reasonCode: "treatment_connector_skip",
      reason: "Treatment planning flow detected; visual-asset connector is not required.",
    }
  }

  if (workflow === "lab_workflow" && !CONNECTOR_REASONABLE_FOR_LAB.has(input.connectorId)) {
    return {
      decision: "skip",
      reasonCode: "lab_workflow_connector_skip",
      reason: "Lab workflow intent detected; connector omitted because it is not lab-context aligned.",
    }
  }

  if (isDrilldown && !CONNECTOR_REASONABLE_FOR_RESEARCH.has(input.connectorId) && input.connectorId !== "benchling") {
    return {
      decision: "skip",
      reasonCode: "drilldown_connector_skip",
      reason: "Chart drill-down subloop prefers source-backed evidence connectors.",
    }
  }

  if (!input.requireEvidence && input.connectorId === "clinical_trials") {
    return {
      decision: "skip",
      reasonCode: "evidence_optional_connector_skip",
      reason: "Clinical-trial connector skipped because strict evidence retrieval is not required for this turn.",
    }
  }

  if (input.plannerPreferredConnectorSet?.has(input.connectorId)) {
    return {
      decision: "allow",
      reasonCode: "planner_selected_connector_allow",
      reason: `Querying ${connectorLabel} because planner marked it high-yield for this turn${scenarioSuffix}.`,
      detail: `Workflow=${workflowLabel}.`,
    }
  }

  return {
    decision: "allow",
    reasonCode: "connector_relevant",
    reason: `Allowing ${connectorLabel}; aligned with ${workflowLabel} and retrieval policy${scenarioSuffix}.`,
  }
}

function toolGateDecision(input: {
  toolName: string
  selectedConnectorIds: ClinicalConnectorId[]
  query: string
  requireEvidence: boolean
  fanoutPreferred?: boolean
  clinicalIntel?: ClinicalIntelPreflight
  plannerPreferredToolSet?: Set<string>
  plannerLazySelection?: boolean
  scenarioFocus?: string
}): Omit<GatekeeperDecision, "scope" | "id"> {
  const lowerTool = input.toolName.toLowerCase()
  const workflow = input.clinicalIntel?.entities.workflowIntent || "general"
  const isDrilldown = Boolean(input.clinicalIntel?.chartDrilldownContext) || DRILLDOWN_PATTERN.test(input.query)
  const connectorId = TOOL_TO_CONNECTOR[input.toolName]
  const scenarioSuffix = input.scenarioFocus ? ` (${input.scenarioFocus})` : ""

  if (
    input.plannerLazySelection &&
    input.plannerPreferredToolSet &&
    input.plannerPreferredToolSet.size > 0 &&
    !input.plannerPreferredToolSet.has(input.toolName)
  ) {
    return {
      decision: "skip",
      reasonCode: "planner_lazy_tool_skip",
      reason: `Skipping ${toolNameToSentenceCase(
        input.toolName
      )}; planner did not request this tool for the current turn${scenarioSuffix}.`,
    }
  }

  if (connectorId && input.selectedConnectorIds.includes(connectorId)) {
    return {
      decision: "allow",
      reasonCode: "selected_connector_tool",
      reason: `Using ${toolNameToSentenceCase(
        input.toolName
      )} because ${humanizeConnectorId(connectorId)} passed gatekeeping${scenarioSuffix}.`,
    }
  }

  if (isDrilldown && /(uploadcontextsearch|pubmed|guideline|clinicaltrials|scholar|biorxiv|websearch)/i.test(lowerTool)) {
    return {
      decision: "allow",
      reasonCode: "drilldown_subloop_tool",
      reason: "Tool enabled for chart drill-down sub-orchestration.",
    }
  }

  if (UPLOAD_INTENT_PATTERN.test(input.query)) {
    if (/uploadcontextsearch|inspectuploadstructure/.test(lowerTool)) {
      return {
        decision: "allow",
        reasonCode: "upload_intent_tool",
        reason: "Upload-related intent detected; tool is required for file-grounded retrieval.",
      }
    }
  }

  if (STUDY_TIMETABLE_PATTERN.test(input.query) && /generatetimetable|rebalancetimetable/.test(lowerTool)) {
    return {
      decision: "allow",
      reasonCode: "study_schedule_tool",
      reason: "Study timetable intent detected; planner tool enabled.",
    }
  }

  if (REVIEW_QUEUE_PATTERN.test(input.query) && /createreviewqueue/.test(lowerTool)) {
    return {
      decision: "allow",
      reasonCode: "review_queue_tool",
      reason: "Review queue intent detected; review-generation tool enabled.",
    }
  }

  if (LECTURE_SUMMARY_PATTERN.test(input.query) && /summarizelectureupload/.test(lowerTool)) {
    return {
      decision: "allow",
      reasonCode: "lecture_summary_tool",
      reason: "Lecture/video summarization intent detected.",
    }
  }

  if (STUDY_GRAPH_PATTERN.test(input.query) && /rebuildstudygraph/.test(lowerTool)) {
    return {
      decision: "allow",
      reasonCode: "study_graph_tool",
      reason: "Study graph rebuild intent detected.",
    }
  }

  if (workflow === "operational" && /(pubmed|guideline|clinicaltrials|biorxiv|scholargateway)/.test(lowerTool)) {
    return {
      decision: "skip",
      reasonCode: "operational_tool_skip",
      reason: "Operational workflow query; broad research retrieval tool skipped.",
    }
  }

  if (workflow === "exam_mode" && /(cmscoverage|npiregistry)/.test(lowerTool)) {
    return {
      decision: "skip",
      reasonCode: "exam_mode_tool_skip",
      reason: "Exam workflow query; administrative connector tool skipped.",
    }
  }

  if (!input.requireEvidence && /(clinicaltrials|scholargateway|biorxiv)/.test(lowerTool)) {
    return {
      decision: "skip",
      reasonCode: "evidence_optional_tool_skip",
      reason: "Evidence requirement is relaxed for this turn; lower-priority retrieval tool skipped.",
    }
  }

  if (!input.fanoutPreferred && /websearch/.test(lowerTool)) {
    return {
      decision: "skip",
      reasonCode: "fanout_budget_tool_skip",
      reason: "Narrow retrieval mode selected; webSearch deferred unless confidence remains low.",
    }
  }

  return {
    decision: "skip",
    reasonCode: "tool_not_selected_current_iteration",
    reason: "Tool is not part of the current adaptive retrieval slice.",
  }
}

export function buildAdaptiveFanoutPlan(
  input: BuildAdaptiveFanoutPlanInput
): AdaptiveFanoutPlan {
  const available = new Set(input.availableToolNames)
  const plannerPreferredConnectorSet = new Set(input.plannerPreferredConnectorIds || [])
  const plannerPreferredToolSet = new Set(
    (input.plannerPreferredToolNames || []).filter((toolName) => available.has(toolName))
  )
  const availableConnectorIds = input.connectorOrder.filter((connectorId) =>
    CONNECTOR_TOOL_NAME_MAP[connectorId].some((toolName) => available.has(toolName))
  )
  const connectorCandidates =
    input.plannerLazySelection && plannerPreferredConnectorSet.size > 0
      ? availableConnectorIds.filter((connectorId) =>
          plannerPreferredConnectorSet.has(connectorId)
        )
      : availableConnectorIds
  const connectorCount = selectAdaptiveConnectorCount({
    availableCount: Math.max(connectorCandidates.length, 1),
    iteration: input.iteration,
    priorConfidence: input.priorConfidence,
    fanoutPreferred: input.fanoutPreferred,
    requireEvidence: input.requireEvidence,
    complexityMode: input.complexityMode || input.clinicalIntel?.complexityMode,
  })
  const gatekeeperDecisions: GatekeeperDecision[] = []
  const selectedConnectorIds: ClinicalConnectorId[] = []
  for (const connectorId of availableConnectorIds) {
    const connectorDecision = connectorGateDecision({
      connectorId,
      query: input.query,
      requireEvidence: input.requireEvidence,
      clinicalIntel: input.clinicalIntel,
      plannerPreferredConnectorSet,
      plannerLazySelection: input.plannerLazySelection,
      scenarioFocus: input.scenarioFocus,
    })
    const withinBudget =
      connectorCandidates.length > 0 && selectedConnectorIds.length < connectorCount
    if (connectorDecision.decision === "allow" && withinBudget) {
      selectedConnectorIds.push(connectorId)
      pushGatekeeperDecision(gatekeeperDecisions, {
        scope: "connector",
        id: connectorId,
        ...connectorDecision,
      })
      continue
    }
    pushGatekeeperDecision(gatekeeperDecisions, {
      scope: "connector",
      id: connectorId,
      ...(connectorDecision.decision === "allow"
        ? {
            decision: "skip",
            reasonCode: "connector_budget_limited",
            reason: `Connector is relevant but deferred due to iteration budget (${connectorCount}).`,
            detail: `Iteration ${input.iteration + 1}; plannerLazy=${Boolean(
              input.plannerLazySelection
            )}.`,
          }
        : connectorDecision),
    })
  }

  const selectedToolNames = new Set<string>()
  selectedConnectorIds.forEach((connectorId) => {
    CONNECTOR_TOOL_NAME_MAP[connectorId].forEach((toolName) => {
      const allowedByPlanner =
        !input.plannerLazySelection ||
        plannerPreferredToolSet.size === 0 ||
        plannerPreferredToolSet.has(toolName)
      if (available.has(toolName) && allowedByPlanner) {
        selectedToolNames.add(toolName)
      }
    })
  })

  const normalizedQuery = input.query.trim().toLowerCase()
  Array.from(available).forEach((toolName) => {
    const decision = toolGateDecision({
      toolName,
      selectedConnectorIds,
      query: normalizedQuery,
      requireEvidence: input.requireEvidence,
      fanoutPreferred: input.fanoutPreferred,
      clinicalIntel: input.clinicalIntel,
      plannerPreferredToolSet,
      plannerLazySelection: input.plannerLazySelection,
      scenarioFocus: input.scenarioFocus,
    })
    if (decision.decision === "allow") {
      selectedToolNames.add(toolName)
    }
    pushGatekeeperDecision(gatekeeperDecisions, {
      scope: "tool",
      id: toolName,
      ...decision,
    })
  })

  if (selectedToolNames.size === 0) {
    const lazyFallbackCandidates = input.plannerLazySelection
      ? [
          ...Array.from(plannerPreferredToolSet),
          "guidelineSearch",
          "uploadContextSearch",
          "webSearch",
        ]
      : ["uploadContextSearch", "webSearch", "pubmedSearch", "guidelineSearch"]
    for (const toolName of lazyFallbackCandidates) {
      if (!available.has(toolName)) continue
      selectedToolNames.add(toolName)
      pushGatekeeperDecision(gatekeeperDecisions, {
        scope: "tool",
        id: toolName,
        decision: "allow",
        reasonCode: input.plannerLazySelection
          ? "planner_lazy_fallback_tool"
          : "fallback_retrieval_tool",
        reason: input.plannerLazySelection
          ? "Planner-lazy fallback activated to avoid empty execution for this turn."
          : "Fallback retrieval baseline activated to avoid empty execution plan.",
      })
      if (input.plannerLazySelection) break
    }
  }

  let targetConfidence = input.fanoutPreferred
    ? 0.78
    : input.requireEvidence
      ? 0.64
      : 0.56
  if ((input.complexityMode || input.clinicalIntel?.complexityMode) === "deep-dive") {
    targetConfidence = Math.max(targetConfidence, 0.8)
  }
  if (input.clinicalIntel?.completeness.state === "incomplete_evidence") {
    targetConfidence = Math.min(0.72, targetConfidence)
  }
  const allowedConnectorsCount = gatekeeperDecisions.filter(
    (decision) => decision.scope === "connector" && decision.decision === "allow"
  ).length
  const skippedConnectorCount = gatekeeperDecisions.filter(
    (decision) => decision.scope === "connector" && decision.decision === "skip"
  ).length
  const reasoning = [
    `Iteration ${input.iteration + 1}/${input.maxIterations} selected ${selectedConnectorIds.length} connector${
      selectedConnectorIds.length === 1 ? "" : "s"
    }.`,
    `Gatekeeper allowed ${allowedConnectorsCount} and skipped ${skippedConnectorCount} connector${
      skippedConnectorCount === 1 ? "" : "s"
    }.`,
    input.fanoutPreferred
      ? "Adaptive fan-out mode starts broad and expands if evidence confidence stays low."
      : "Adaptive fan-out mode starts narrow and expands only when confidence is below threshold.",
    input.plannerLazySelection
      ? "Planner-lazy selection active: only planner-approved connectors/tools are initialized."
      : "Planner-lazy selection inactive: broader adaptive fallback remains available.",
  ]

  return {
    selectedConnectorIds,
    selectedToolNames: dedupeStrings(Array.from(selectedToolNames)),
    targetConfidence,
    reasoning,
    gatekeeperDecisions,
  }
}

export function evaluateAdaptiveFanoutCoverage(
  input: EvaluateAdaptiveFanoutInput
): AdaptiveFanoutEvaluation {
  const connectorCount = input.selectedConnectorIds.length
  const sourceDiversity = countDistinctToolFamilies(input.selectedToolNames)
  const hasUploadSignal = input.selectedToolNames.some((name) =>
    /upload|lecture|timetable|review/i.test(name)
  )
  const pluginLikeCount = input.selectedToolNames.filter((name) =>
    /(generateTimetableFromUploads|rebalanceTimetablePlan|summarizeLectureUpload|createReviewQueueFromUploads|rebuildStudyGraphFromUpload)/.test(
      name
    )
  ).length
  const skippedCount = (input.gatekeeperDecisions || []).filter(
    (decision) => decision.decision === "skip"
  ).length

  let confidence =
    0.26 +
    Math.min(0.42, connectorCount * 0.12) +
    Math.min(0.24, sourceDiversity * 0.06) +
    Math.min(0.08, pluginLikeCount * 0.04) +
    (hasUploadSignal ? 0.05 : 0)

  if (input.requireEvidence && connectorCount === 0) {
    confidence -= 0.22
  }
  if (input.fanoutPreferred && connectorCount < 3) {
    confidence -= 0.1
  }
  if (input.complexityMode === "deep-dive" && sourceDiversity < 3) {
    confidence -= 0.08
  }
  if (input.clinicalCompleteness?.state === "partial") {
    confidence -= 0.08
  }
  if (input.clinicalCompleteness?.state === "incomplete_evidence") {
    confidence -= 0.18
  }
  if (skippedCount > 0 && connectorCount <= 1) {
    confidence -= 0.05
  }
  confidence = clamp(confidence, 0.05, 0.95)

  let targetConfidence = input.fanoutPreferred
    ? 0.78
    : input.requireEvidence
      ? 0.64
      : 0.56
  if (input.complexityMode === "deep-dive") {
    targetConfidence = Math.max(targetConfidence, 0.8)
  }
  if (input.clinicalCompleteness?.state === "incomplete_evidence") {
    targetConfidence = Math.min(targetConfidence, 0.72)
  }
  const shouldExpand =
    (confidence < targetConfidence ||
      input.clinicalCompleteness?.state === "incomplete_evidence") &&
    input.iteration + 1 < input.maxIterations

  const notes = [
    `Coverage score ${(confidence * 100).toFixed(0)}% with ${sourceDiversity} distinct source family${
      sourceDiversity === 1 ? "" : "ies"
    }.`,
    shouldExpand
      ? "Confidence below threshold, planner will expand connector/tool fan-out."
      : "Confidence threshold reached or loop budget exhausted.",
    ...(input.clinicalCompleteness?.state === "incomplete_evidence"
      ? [
          `Clinical completeness remains low. Missing variables: ${input.clinicalCompleteness.missingCriticalVariables.join(
            ", "
          )}.`,
        ]
      : []),
  ]

  return {
    confidence,
    sourceDiversity,
    shouldExpand,
    targetConfidence,
    notes,
  }
}

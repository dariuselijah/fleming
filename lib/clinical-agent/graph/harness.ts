import { Annotation, END, START, StateGraph } from "@langchain/langgraph"
import {
  buildModePolicy,
  classifyClinicalIntent,
  selectConnectorPriority,
} from "./router"
import {
  CONNECTOR_TOOL_NAME_MAP,
  type ClinicalConnectorId,
  type ClinicalGraphInput,
  type ClinicalGraphOutput,
  type ClinicalIntentClass,
  type ClinicalModePolicy,
} from "./types"
import { recordHarnessRun } from "@/lib/clinical-agent/telemetry"

type HarnessState = {
  input: ClinicalGraphInput
  intent: ClinicalIntentClass
  connectorOrder: ClinicalConnectorId[]
  selectedToolNames: string[]
  modePolicy: ClinicalModePolicy
  systemPromptAdditions: string[]
  maxSteps: number
  trace: string[]
}

const HarnessStateAnnotation = Annotation.Root({
  input: Annotation<ClinicalGraphInput>,
  intent: Annotation<ClinicalIntentClass>,
  connectorOrder: Annotation<ClinicalConnectorId[]>,
  selectedToolNames: Annotation<string[]>,
  modePolicy: Annotation<ClinicalModePolicy>,
  systemPromptAdditions: Annotation<string[]>,
  maxSteps: Annotation<number>,
  trace: Annotation<string[]>,
})

function dedupeStrings(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)))
}

function pickToolNames(
  connectorOrder: ClinicalConnectorId[],
  availableToolNames: string[],
  artifactIntent: ClinicalGraphInput["artifactIntent"],
  fanoutPreferred?: boolean
): string[] {
  const available = new Set(availableToolNames)
  const selected: string[] = []
  for (const connectorId of connectorOrder) {
    for (const toolName of CONNECTOR_TOOL_NAME_MAP[connectorId]) {
      if (available.has(toolName)) {
        selected.push(toolName)
      }
    }
  }

  // Keep existing runtime capabilities available while LangGraph routing matures.
  const compatibilityTools = [
    "uploadContextSearch",
    "inspectUploadStructure",
    "refineQuizRequirements",
    "generateQuizFromUpload",
    "drugSafetyLookup",
    "evidenceConflictCheck",
    "webSearch",
    "youtubeSearch",
  ]
  for (const toolName of compatibilityTools) {
    if (available.has(toolName)) {
      selected.push(toolName)
    }
  }

  // Preserve current upload artifact workflow behavior.
  if (artifactIntent === "quiz") {
    if (available.has("refineQuizRequirements")) {
      selected.unshift("refineQuizRequirements")
    }
    if (available.has("generateQuizFromUpload")) {
      selected.unshift("generateQuizFromUpload")
    }
  }

  if (fanoutPreferred) {
    const fanoutPreferredTools = [
      "pubmedSearch",
      "guidelineSearch",
      "clinicalTrialsSearch",
      "scholarGatewaySearch",
      "bioRxivSearch",
    ]
    for (const toolName of fanoutPreferredTools) {
      if (available.has(toolName)) {
        selected.push(toolName)
      }
    }
  }

  return dedupeStrings(selected)
}

function computeMaxSteps(
  intent: ClinicalIntentClass,
  toolCount: number,
  artifactIntent?: "none" | "quiz",
  fanoutPreferred?: boolean
) {
  if (artifactIntent === "quiz") return 2
  if (fanoutPreferred) return 12
  if (toolCount <= 2) return 6
  if (intent === "clinical_evidence") return 10
  if (intent === "research_discovery") return 11
  return 8
}

function buildPromptAdditions(
  intent: ClinicalIntentClass,
  modePolicy: ClinicalModePolicy,
  selectedToolNames: string[],
  fanoutPreferred?: boolean
): string[] {
  const additions: string[] = []
  additions.push(
    `LANGGRAPH HARNESS ACTIVE: intent=${intent}; routedTools=${selectedToolNames.join(", ") || "none"}.`
  )
  if (modePolicy.requireEvidenceForClinicalClaims) {
    additions.push(
      "For clinical claims, prefer tool-backed evidence. If tool evidence is weak, narrow query and retry once before finalizing."
    )
  }
  if (modePolicy.requireStrictUncertainty) {
    additions.push(
      "Clinician guardrail: when evidence is conflicting or sparse, note the limitation plainly and recommend the best available next step. Do not add disclaimers about missing citations."
    )
  }
  if (modePolicy.studentMode) {
    additions.push(
      "Student mode guardrail: include concise teaching rationale and explain why the selected evidence is relevant."
    )
  }
  if (fanoutPreferred) {
    additions.push(
      "Fan-out retrieval preferred: gather corroborating evidence from multiple distinct sources (target 4-6) before finalizing."
    )
  }
  return additions
}

function buildFallbackOutput(input: ClinicalGraphInput): ClinicalGraphOutput {
  const intent = classifyClinicalIntent(input.query)
  const connectorOrder = selectConnectorPriority(intent)
  const modePolicy = buildModePolicy(input.role, input.learningMode, input.clinicianMode)
  const selectedToolNames = input.supportsTools
    ? pickToolNames(
        connectorOrder,
        input.availableToolNames,
        input.artifactIntent,
        input.fanoutPreferred
      )
    : []
  const maxSteps = computeMaxSteps(
    intent,
    selectedToolNames.length,
    input.artifactIntent,
    input.fanoutPreferred
  )
  return {
    intent,
    selectedConnectorIds: connectorOrder,
    selectedToolNames,
    modePolicy,
    systemPromptAdditions: buildPromptAdditions(
      intent,
      modePolicy,
      selectedToolNames,
      input.fanoutPreferred
    ),
    maxSteps,
    trace: ["fallback_router"],
    routingSummary: {
      intent,
      selectedConnectorIds: connectorOrder,
      selectedToolNames,
      modePolicy,
      maxSteps,
    },
  }
}

let compiledHarness: any = null

function getCompiledHarness() {
  if (compiledHarness) {
    return compiledHarness
  }

  const graph = new StateGraph(HarnessStateAnnotation)
    .addNode("classify", (state: HarnessState) => {
      const intent = classifyClinicalIntent(state.input.query)
      return {
        intent,
        connectorOrder: selectConnectorPriority(intent),
        trace: [...state.trace, `classify:${intent}`],
      }
    })
    .addNode("applyModes", (state: HarnessState) => {
      const modePolicy = buildModePolicy(
        state.input.role,
        state.input.learningMode,
        state.input.clinicianMode
      )
      return {
        modePolicy,
        trace: [
          ...state.trace,
          `mode:student=${modePolicy.studentMode};clinician=${modePolicy.clinicianMode}`,
        ],
      }
    })
    .addNode("routeTools", (state: HarnessState) => {
      const selectedToolNames = state.input.supportsTools
        ? pickToolNames(
            state.connectorOrder,
            state.input.availableToolNames,
            state.input.artifactIntent,
            state.input.fanoutPreferred
          )
        : []
      const systemPromptAdditions = buildPromptAdditions(
        state.intent,
        state.modePolicy,
        selectedToolNames,
        state.input.fanoutPreferred
      )
      return {
        selectedToolNames,
        systemPromptAdditions,
        maxSteps: computeMaxSteps(
          state.intent,
          selectedToolNames.length,
          state.input.artifactIntent,
          state.input.fanoutPreferred
        ),
        trace: [
          ...state.trace,
          `route:tools=${selectedToolNames.length}`,
          `route:connectors=${state.connectorOrder.slice(0, 5).join("|")}`,
        ],
      }
    })
    .addEdge(START, "classify")
    .addEdge("classify", "applyModes")
    .addEdge("applyModes", "routeTools")
    .addEdge("routeTools", END)

  compiledHarness = graph.compile()
  return compiledHarness
}

export async function runClinicalAgentHarness(
  input: ClinicalGraphInput
): Promise<ClinicalGraphOutput> {
  try {
    const app = getCompiledHarness() as {
      invoke: (state: HarnessState) => Promise<HarnessState>
    }
    const initialState: HarnessState = {
      input,
      intent: "general",
      connectorOrder: [],
      selectedToolNames: [],
      modePolicy: {
        studentMode: false,
        clinicianMode: false,
        requireStrictUncertainty: false,
        requireEvidenceForClinicalClaims: input.evidenceEnabled,
      },
      systemPromptAdditions: [],
      maxSteps: 8,
      trace: [],
    }

    const result = await app.invoke(initialState)
    const payload = {
      intent: result.intent,
      selectedConnectorIds: result.connectorOrder,
      selectedToolNames: result.selectedToolNames,
      modePolicy: result.modePolicy,
      systemPromptAdditions: result.systemPromptAdditions,
      maxSteps: result.maxSteps,
      trace: result.trace,
      routingSummary: {
        intent: result.intent,
        selectedConnectorIds: result.connectorOrder,
        selectedToolNames: result.selectedToolNames,
        modePolicy: result.modePolicy,
        maxSteps: result.maxSteps,
      },
    }
    recordHarnessRun(false)
    return payload
  } catch (error) {
    console.warn("[langgraph-harness] Falling back to heuristic router:", error)
    recordHarnessRun(true)
    return buildFallbackOutput(input)
  }
}

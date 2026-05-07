import assert from "node:assert/strict"
import { readFileSync } from "node:fs"

function read(path: string): string {
  return readFileSync(path, "utf-8")
}

function testChartFallbackAndBundleParsing() {
  const codeBlock = read("components/prompt-kit/code-block.tsx")
  const markdown = read("components/prompt-kit/markdown.tsx")
  const chatChart = read("app/components/charts/chat-chart.tsx")

  assert.match(
    codeBlock,
    /const SHIKI_LANGUAGE_ALIASES[\s\S]*chart[\s\S]*chart-spec[\s\S]*healthchart/,
    "CodeBlock should map chart-like languages to safe Shiki lexers"
  )
  assert.match(
    codeBlock,
    /lang:\s*"plaintext"/,
    "CodeBlock should fall back to plaintext highlighting for unsupported lexers"
  )
  assert.match(
    markdown,
    /parseChartSpecs\(/,
    "Markdown renderer should parse chart bundles/multiple chart specs"
  )
  assert.match(
    markdown,
    /<ChatChartBundle/,
    "Markdown renderer should render chart bundles when multiple specs exist"
  )
  assert.match(
    markdown,
    /isMermaidLanguage\(/,
    "Markdown renderer should detect Mermaid fenced blocks"
  )
  assert.match(
    markdown,
    /<MermaidBlock/,
    "Markdown renderer should render Mermaid diagrams with a dedicated component"
  )
  assert.match(
    chatChart,
    /export function parseChartSpecs\(/,
    "Chat chart module should expose multi-chart parser"
  )
  assert.match(
    chatChart,
    /Array\.isArray\(bundle\.charts\)/,
    "Chart parser should support bundled chart payloads"
  )
}

function testLangChainSupervisorSkeleton() {
  const supervisor = read("lib/clinical-agent/langchain/supervisor.ts")
  const policy = read("lib/clinical-agent/langchain/policy.ts")
  const clinicalIntel = read("lib/clinical-agent/langchain/clinical-intel.ts")
  const orchestrator = read("lib/clinical-agent/langchain/orchestrator.ts")

  assert.match(
    supervisor,
    /addNode\("planner"/,
    "Supervisor graph should include planner node"
  )
  assert.match(
    supervisor,
    /addNode\("retrieval"/,
    "Supervisor graph should include retrieval node"
  )
  assert.match(
    supervisor,
    /addNode\("evaluator"/,
    "Supervisor graph should include evaluator node"
  )
  assert.match(
    supervisor,
    /addNode\("composer"/,
    "Supervisor graph should include composer node"
  )
  assert.match(
    supervisor,
    /addConditionalEdges\("evaluator"/,
    "Supervisor should iterate with evaluator-driven conditional fan-out"
  )
  assert.match(
    supervisor,
    /buildPlannerTaskPlan\(/,
    "Supervisor should build planner-owned task plans per turn"
  )
  assert.match(
    supervisor,
    /generatePlanWithLlm\(/,
    "Supervisor planner should run a dedicated LLM generatePlan rewrite pass"
  )
  assert.match(
    orchestrator,
    /export async function generatePlan\(/,
    "Langchain orchestrator should expose a distinct generatePlan function"
  )
  assert.match(
    orchestrator,
    /generateText\(/,
    "Orchestrator generatePlan should use a dedicated model call"
  )
  assert.match(
    orchestrator,
    /under 4[0-8] characters|under 4[0-8]/,
    "Orchestrator generatePlan should enforce strict short task-title policy"
  )
  assert.match(
    supervisor,
    /buildPlannerTaskPlanWithFallback\(/,
    "Supervisor should wrap planner task generation with deterministic fallback"
  )
  assert.match(
    supervisor,
    /buildDeterministicFallbackTaskPlan\(/,
    "Supervisor should provide deterministic fallback plans only on planner failure"
  )
  assert.match(
    supervisor,
    /computeTaskDepthBudget\(/,
    "Supervisor should enforce variable depth budget at planning layer"
  )
  assert.match(
    supervisor,
    /chartTaskNameForShape\(/,
    "Supervisor should derive chart task labels from chart data shape"
  )
  assert.match(
    supervisor,
    /taskPlanToRuntimeSteps\(/,
    "Supervisor should project planner task plan into runtime task rows"
  )
  assert.match(
    supervisor,
    /hasEducationalIntentSignal\(/,
    "Supervisor should gate educational orchestration signals explicitly"
  )
  assert.match(
    supervisor,
    /Checking Curriculum Alignment|Cross-referencing .* learning objectives|Cross-referencing institutional learning objectives/,
    "Supervisor task plans should include curriculum alignment tasks when LMS context exists"
  )
  assert.match(
    supervisor,
    /lmsContext/,
    "Supervisor planner should consume LMS context in per-turn task planning"
  )
  assert.match(
    supervisor,
    /updateFirstTaskByPhase\(taskPlan,\s*"composer"/,
    "Supervisor should finalize composer tasks by phase, not by hardcoded compose id"
  )
  assert.match(
    supervisor,
    /incompleteEvidencePolicy/,
    "Supervisor should honor incomplete-evidence policy modes"
  )
  assert.match(
    supervisor,
    /chartDrilldownContext/,
    "Supervisor should consume chart drill-down context"
  )
  assert.match(
    policy,
    /buildAdaptiveFanoutPlan\(/,
    "Adaptive fan-out policy module should expose planner"
  )
  assert.match(
    policy,
    /evaluateAdaptiveFanoutCoverage\(/,
    "Adaptive fan-out policy module should expose confidence evaluator"
  )
  assert.match(
    policy,
    /shouldExpand\s*=/,
    "Fan-out policy should include confidence-based expansion decision"
  )
  assert.match(
    policy,
    /connectorGateDecision\(/,
    "Adaptive fan-out policy should gate connectors with explicit reasons"
  )
  assert.match(
    policy,
    /toolGateDecision\(/,
    "Adaptive fan-out policy should gate tools with explicit reasons"
  )
  assert.match(
    policy,
    /plannerLazySelection/,
    "Adaptive fan-out policy should support planner-lazy connector/tool selection"
  )
  assert.match(
    policy,
    /planner_lazy_tool_skip|planner_lazy_connector_skip/,
    "Adaptive fan-out policy should emit explicit planner-lazy skip reasons"
  )
  assert.match(
    clinicalIntel,
    /buildClinicalIntelPreflight\(/,
    "Clinical-intel preflight should extract entities and completeness states"
  )
  assert.match(
    clinicalIntel,
    /CHART_DRILLDOWN_CONTEXT:/,
    "Clinical-intel preflight should parse chart drill-down marker context"
  )
}

function testHybridChatRouteWiring() {
  const route = read("app/api/chat/route.ts")
  const config = read("lib/config.ts")
  const timeline = read("app/components/chat/activity/build-timeline.ts")
  const evidenceSearch = read("lib/evidence/search.ts")
  const parser = read("lib/citations/parser.ts")

  assert.match(
    config,
    /ENABLE_LANGCHAIN_SUPERVISOR/,
    "Config should expose LangChain supervisor feature flag"
  )
  assert.match(
    config,
    /ENABLE_COGNITIVE_ORCHESTRATION_FULL/,
    "Config should expose cognitive orchestration rollout flag"
  )
  assert.match(
    config,
    /ENABLE_CHART_DRILLDOWN_SUBLOOP/,
    "Config should expose chart drill-down rollout flag"
  )
  assert.match(
    route,
    /runLangChainSupervisor\(/,
    "Chat route should invoke LangChain supervisor for hybrid routing"
  )
  assert.match(
    route,
    /loadMinimalLmsContextSnapshot\(/,
    "Chat route should load minimal LMS context for educational prompts"
  )
  assert.match(
    route,
    /lmsContextPromise/,
    "Chat route should stage LMS context retrieval before supervisor invocation"
  )
  assert.match(
    route,
    /lmsContext:\s*lmsContextForSupervisor/,
    "Chat route should pass LMS context into supervisor input"
  )
  assert.match(
    route,
    /runClinicalAgentHarness\(/,
    "Chat route should keep LangGraph harness fallback path"
  )
  assert.match(
    route,
    /dynamicChecklistForStream/,
    "Chat route should emit dynamic checklist annotations"
  )
  assert.match(
    route,
    /selectedToolNamesForRouting[\s\S]*langGraphPlan\?\.routingSummary\?\.selectedToolNames/,
    "Chat route should prefer plan-selected tools over full runtime tool registry"
  )
  assert.match(
    route,
    /routingSummaryText/,
    "Chat route should emit a human-readable orchestration summary"
  )
  assert.doesNotMatch(
    route,
    /fallbackGenericChecklistItems|plan-orchestration|retrieve-evidence|compose-response/,
    "Chat route should avoid static fallback checklist scaffolding for taskboard-driven turns"
  )
  assert.match(
    route,
    /enforcePlannerLazySelection/,
    "Chat route should enforce planner-lazy tool filtering for supervisor turns"
  )
  assert.match(
    route,
    /evaluateToolResultSignal/,
    "Chat route should evaluate tool result signal before marking lifecycle completion"
  )
  assert.match(
    route,
    /buildGuidelineEscalationQueries/,
    "Chat route should support recursive guideline query expansion"
  )
  assert.match(
    route,
    /No direct guideline PDF matches in current index; checking secondary medical databases\./,
    "Chat route should emit explicit no-direct-guideline fallback reasoning"
  )
  assert.match(
    route,
    /No direct matches found in .*Attempting query expansion\.\.\./,
    "Chat route should expose source-specific no-signal reasoning for retrieval retries"
  )
  assert.match(
    route,
    /EVIDENCE_PARITY_RETRIEVAL/,
    "Chat route should run parity retrieval when chat evidence is sparser than drill-down"
  )
  assert.match(
    route,
    /Awaiting broadened evidence/,
    "Chat route should emit retrieval-gate runtime step before answer streaming"
  )
  assert.match(
    route,
    /retrieval-gate-note|retrieval_gate/,
    "Chat route should emit explicit retrieval-gate note metadata"
  )
  assert.match(
    route,
    /CITATION_UTILIZATION_REFINEMENT/,
    "Chat route should run one controlled refinement pass when citation utilization is low"
  )
  assert.match(
    route,
    /SECONDARY EVIDENCE FRAMING/,
    "Chat route should enforce secondary-evidence confidence framing when primary guideline retrieval misses"
  )
  assert.match(
    route,
    /\[CITE_<sourceId>\]/,
    "Chat route prompt contract should prefer canonical source-id citation tokens"
  )
  assert.match(
    parser,
    /\[CITE_/,
    "Citation parser should support canonical source-id marker syntax"
  )
  assert.match(
    evidenceSearch,
    /Primary format: \[CITE_<sourceId>\]/,
    "Evidence system prompt should require source-id citation formatting"
  )
  assert.match(
    route,
    /runtimeStepsForStream/,
    "Chat route should emit runtime step annotations"
  )
  assert.match(
    route,
    /taskPlanForStream/,
    "Chat route should emit planner task plan annotations"
  )
  assert.match(
    route,
    /retrievalNotesForStream/,
    "Chat route should emit retrieval fallback note annotations"
  )
  assert.match(
    route,
    /runtimeDagForStream/,
    "Chat route should emit runtime DAG annotations"
  )
  assert.match(
    route,
    /gatekeeperDecisionsForStream/,
    "Chat route should emit gatekeeper skip/allow rationale"
  )
  assert.match(
    route,
    /incompleteEvidencePolicy/,
    "Chat route should pass incomplete-evidence policy to supervisor"
  )
  assert.match(
    route,
    /missingVariablePromptsForStream/,
    "Chat route should emit missing-variable prompts in routing metadata"
  )
  assert.match(
    timeline,
    /taskPlan/,
    "Timeline builder should ingest planner task plan metadata"
  )
  assert.match(
    timeline,
    /retrievalNotes/,
    "Timeline builder should ingest retrieval fallback notes"
  )
  assert.match(
    timeline,
    /runtimeSteps/,
    "Timeline builder should ingest runtime steps for task board rendering"
  )
  assert.match(
    timeline,
    /runtimeDag/,
    "Timeline builder should ingest runtime DAG nodes"
  )
  assert.match(
    timeline,
    /gatekeeperDecisions/,
    "Timeline builder should ingest gatekeeper decisions"
  )
  assert.match(
    timeline,
    /loopTransitions/,
    "Timeline builder should ingest loop transitions"
  )
  assert.match(
    timeline,
    /confidenceTransitions/,
    "Timeline builder should ingest confidence transitions"
  )
  assert.match(
    timeline,
    /querySnippet/,
    "Timeline builder should consume query snippets for task board context"
  )
  assert.match(
    timeline,
    /summarizeToolExecutionTruth/,
    "Timeline should derive task-board truth from actual tool outputs"
  )
  assert.match(
    timeline,
    /Broadening search parameters/,
    "Timeline should dynamically add broadening-search task rows on guideline misses"
  )
}

function testChartDrilldownSubloopWiring() {
  const chart = read("app/components/charts/chat-chart.tsx")
  const markdown = read("components/prompt-kit/markdown.tsx")
  const timeline = read("app/components/chat/activity/activity-timeline.tsx")
  const assistant = read("app/components/chat/message-assistant.tsx")
  const drilldownRoute = read("app/api/chat/drilldown/route.ts")
  const drilldownCache = read("lib/chat-store/drilldown-store.ts")
  const drilldownCacheBridge = read("app/components/chat/drilldown-cache-store.ts")
  const drilldownState = read("app/components/chat/use-drilldown-state.ts")
  const drilldownPanel = read("app/components/chat/drilldown-panel.tsx")
  const button = read("components/ui/button.tsx")
  const chatCore = read("app/components/chat/use-chat-core.ts")

  assert.match(
    chart,
    /onDrilldown\?/,
    "Chart renderer should expose onDrilldown callback for datapoint clicks"
  )
  assert.match(
    chart,
    /onClick=\{handleChartClick\}/,
    "Chart renderer should attach click handlers for drill-down"
  )
  assert.match(
    markdown,
    /onChartDrilldown\?/,
    "Markdown renderer should accept chart drill-down callbacks"
  )
  assert.match(
    assistant,
    /SET_DRILLDOWN_CONTEXT/,
    "Message assistant should isolate drill-down context in dedicated reducer state"
  )
  assert.match(
    assistant,
    /fetch\(\"\/api\/chat\/drilldown\"/,
    "Drill-down should call isolated micro-agent endpoint"
  )
  assert.match(
    assistant,
    /getDrilldownCacheEntry/,
    "Message assistant should reuse cached drill-down analyses by data-point id"
  )
  assert.match(
    assistant,
    /markDrilldownEntryAdded/,
    "Message assistant should persist added-to-discussion state in global drill-down store"
  )
  assert.match(
    assistant,
    /variant=\"glass\"/,
    "Message assistant should render interactive glass insight pill for reopening cached drill-down"
  )
  assert.match(
    assistant,
    /isAddingDrilldownInsight/,
    "Message assistant should use optimistic add-state handling for drill-down promotion"
  )
  assert.match(
    assistant,
    /DrilldownPanel/,
    "Message assistant should render side panel for drill-down output"
  )
  assert.match(
    timeline,
    /isDrilldownModeActive/,
    "Activity timeline should support minimizing main board in drill-down mode"
  )
  assert.match(
    drilldownRoute,
    /Analyze this specific data point:/,
    "Drill-down route should use the focused datapoint evidence prompt contract"
  )
  assert.match(
    drilldownState,
    /HYDRATE_DRILLDOWN_CACHE/,
    "Drill-down reducer should support ready-state hydration from cached data"
  )
  assert.match(
    drilldownPanel,
    /setTaskBoardCollapsed\(true\)/,
    "Drill-down panel should auto-collapse task board after completion"
  )
  assert.match(
    drilldownPanel,
    /500\)/,
    "Drill-down panel should collapse task board after 500ms completion delay"
  )
  assert.match(
    drilldownPanel,
    /isSyncedToDiscussion/,
    "Drill-down panel should render synced state when insight already added to discussion"
  )
  assert.match(
    drilldownCache,
    /useDrilldownCacheStore/,
    "Drill-down cache should be backed by a global Zustand store"
  )
  assert.match(
    drilldownCacheBridge,
    /export \* from/,
    "Chat drill-down cache bridge should re-export global chat-store drill-down state"
  )
  assert.match(
    drilldownCache,
    /buildDataPointId/,
    "Drill-down cache store should key analyses by deterministic data-point id"
  )
  assert.match(
    button,
    /glass:/,
    "Button component should expose glass variant for drill-down insight pill styling"
  )
  assert.match(
    chatCore,
    /addDrilldownInsightToDiscussion/,
    "Chat core should support silent drill-down insight integration into discussion context"
  )
}

function run() {
  testChartFallbackAndBundleParsing()
  testLangChainSupervisorSkeleton()
  testHybridChatRouteWiring()
  testChartDrilldownSubloopWiring()
  console.log("agentic orchestration regression checks passed")
}

run()

import { MODEL_DEFAULT } from "@/lib/config"
import type {
  ClinicalConnectorId,
  PlannerTaskPlanItem,
} from "@/lib/clinical-agent/graph/types"
import { getModelInfo } from "@/lib/models"
import { generateText } from "ai"

type GeneratePlanInput = {
  query: string
  seedPlan: PlannerTaskPlanItem[]
  selectedConnectorIds: ClinicalConnectorId[]
  selectedToolNames: string[]
  chartEnabled: boolean
  curriculumEnabled: boolean
}

type GeneratedPlanTask = {
  id?: string
  title?: string
  description?: string
  reasoning?: string
}

const FORBIDDEN_TITLE_PATTERNS: Array<[RegExp, string]> = [
  [/\bpreflight\b/gi, "Context Audit"],
  [/\bretrieval\b/gi, "Evidence Scan"],
  [/\bexpansion\b/gi, "Scope Broadening"],
  [/\bfinal answer\b/gi, "Final Synthesis"],
]
const TASK_TITLE_MAX_CHARS = 40

function normalizeTitle(value: unknown, fallback: string): string {
  const asString = typeof value === "string" ? value : ""
  let normalized = asString.replace(/\s+/g, " ").trim()
  if (!normalized) normalized = fallback
  normalized = normalized
    .replace(/^[-:\s]+/, "")
    .replace(/\s*[-:]\s*(for|about|re|regarding)\b.*$/i, "")
  for (const [pattern, replacement] of FORBIDDEN_TITLE_PATTERNS) {
    normalized = normalized.replace(pattern, replacement)
  }
  if (normalized.length > TASK_TITLE_MAX_CHARS) {
    normalized = normalized.slice(0, TASK_TITLE_MAX_CHARS).trim()
  }
  if (!normalized) return fallback.slice(0, TASK_TITLE_MAX_CHARS).trim()
  return normalized
}

function normalizeText(value: unknown, fallback: string, maxLength: number): string {
  const asString = typeof value === "string" ? value : ""
  const normalized = asString.replace(/\s+/g, " ").trim()
  if (!normalized) return fallback
  if (normalized.length <= maxLength) return normalized
  return `${normalized.slice(0, maxLength - 1).trim()}...`
}

function extractJsonArray(raw: string): unknown[] | null {
  const trimmed = raw.trim()
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i)
  const candidate = fenced ? fenced[1].trim() : trimmed
  const tryParse = (value: string): unknown[] | null => {
    try {
      const parsed = JSON.parse(value)
      return Array.isArray(parsed) ? parsed : null
    } catch {
      return null
    }
  }
  const direct = tryParse(candidate)
  if (direct) return direct

  const arrayStart = candidate.indexOf("[")
  const arrayEnd = candidate.lastIndexOf("]")
  if (arrayStart >= 0 && arrayEnd > arrayStart) {
    return tryParse(candidate.slice(arrayStart, arrayEnd + 1))
  }
  return null
}

function forceConnectorSpecificTitle(
  seedTask: PlannerTaskPlanItem,
  input: GeneratePlanInput
): string | null {
  if (seedTask.phase !== "retrieval") return null
  if (
    input.selectedConnectorIds.includes("pubmed") ||
    input.selectedToolNames.some((tool) => /pubmed|clinicaltrials/i.test(tool))
  ) {
    return "Auditing Clinical Trials"
  }
  if (input.curriculumEnabled && input.selectedConnectorIds.length === 0) {
    return "Checking Curriculum Alignment"
  }
  if (input.selectedConnectorIds.includes("guideline")) {
    return "Auditing Clinical Guidelines"
  }
  return "Auditing Evidence Sources"
}

function normalizeGeneratedPlan(
  generated: unknown[],
  input: GeneratePlanInput
): PlannerTaskPlanItem[] {
  const parsed = generated
    .map((entry) =>
      entry && typeof entry === "object" ? (entry as GeneratedPlanTask) : null
    )
    .filter((entry): entry is GeneratedPlanTask => Boolean(entry))
  const generatedById = new Map<string, GeneratedPlanTask>()
  parsed.forEach((entry) => {
    if (typeof entry.id === "string" && entry.id.trim().length > 0) {
      generatedById.set(entry.id, entry)
    }
  })

  const normalized = input.seedPlan
    .filter((task) => input.chartEnabled || task.phase !== "visualization")
    .map((seedTask, index) => {
      const candidate = generatedById.get(seedTask.id) || parsed[index]
      const forcedTitle = forceConnectorSpecificTitle(seedTask, input)
      const taskName = forcedTitle
        ? normalizeTitle(forcedTitle, seedTask.taskName)
        : normalizeTitle(candidate?.title, seedTask.taskName)
      return {
        ...seedTask,
        taskName,
        description: normalizeText(
          candidate?.description,
          seedTask.description,
          220
        ),
        reasoning: normalizeText(candidate?.reasoning, seedTask.reasoning, 260),
      }
    })

  return normalized
}

export async function generatePlan(
  input: GeneratePlanInput
): Promise<PlannerTaskPlanItem[] | null> {
  if (input.seedPlan.length === 0) return null
  const modelInfo = getModelInfo(MODEL_DEFAULT)
  if (!modelInfo?.apiSdk) return null

  const seedPayload = input.seedPlan.map((task) => ({
    id: task.id,
    phase: task.phase,
    title: task.taskName,
    description: task.description,
    reasoning: task.reasoning,
    isCritical: task.isCritical,
  }))

  const prompt = [
    "Rewrite the planner task list for a clinical orchestration board.",
    "Return ONLY a valid JSON array. No prose.",
    "Each array item must be:",
    '{ "id": string, "title": string, "description": string, "reasoning": string }',
    "",
    "Hard constraints:",
    "- Title must be action-oriented and under 40 characters.",
    "- Title must not copy user prompt fragments.",
    "- Never use words: Preflight, Retrieval, Expansion, Final Answer.",
    "- Keep titles professional and concise.",
    "- Prompt-specific context belongs in description/reasoning, not title.",
    "",
    "Connector rules:",
    '- If PubMed/clinical trials are used, retrieval title must be "Auditing Clinical Trials".',
    '- If curriculum-only path is active, retrieval title must be "Checking Curriculum Alignment".',
    "- If chart task exists, keep it concise and chart-specific.",
    "",
    `User query: ${input.query}`,
    `Selected connectors: ${input.selectedConnectorIds.join(", ") || "none"}`,
    `Selected tools: ${input.selectedToolNames.join(", ") || "none"}`,
    `Chart enabled: ${input.chartEnabled ? "yes" : "no"}`,
    `Curriculum mode: ${input.curriculumEnabled ? "yes" : "no"}`,
    "",
    "Seed tasks JSON:",
    JSON.stringify(seedPayload),
  ].join("\n")

  try {
    const model = modelInfo.apiSdk(undefined, { enableSearch: false })
    const completion = await generateText({
      model,
      temperature: 0.1,
      prompt,
    })
    const parsed = extractJsonArray(completion.text || "")
    if (!parsed) return null
    return normalizeGeneratedPlan(parsed, input)
  } catch {
    return null
  }
}

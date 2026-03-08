import fs from "node:fs"
import path from "node:path"

type Thresholds = {
  chat?: {
    minimumCases?: number
    minAvgCitationCoverage?: number
    minAvgEvidenceReferences?: number
    minEscalationCompliance?: number
    minAvgJudgeOverall?: number
    minAvgJudgeSafety?: number
    minGuidelineHitRate?: number
    minCitationRelevancePassRate?: number
    maxEmptyGuidelineToolRate?: number
  }
  retrieval?: {
    minimumCases?: number
    minAvgResults?: number
    maxAvgTopEvidenceLevel?: number
    minAvgLatestYear?: number
  }
}

type BenchmarkResult = {
  tags: string[]
  citationCoverage?: { coverage?: number }
  requiresEscalation?: boolean
  hasEmergencyAdvice?: boolean
}

type ChatResultsPayload = {
  summary?: {
    totalCases?: number
    avgCitationCoverage?: number
    avgEvidenceReferences?: number
    guidelineHitRate?: number
    avgCitationRelevancePassRate?: number
    emptyGuidelineToolRate?: number
    escalationCompliance?: number
    avgJudgeOverall?: number | null
    avgJudgeSafety?: number | null
    evidenceLevelDistribution?: Record<string, number>
    diagnosticCounts?: Record<string, number>
  }
  results?: BenchmarkResult[]
}

type RetrievalPayload = {
  summary?: {
    totalQueries?: number
    avgResults?: number
    avgTopEvidenceLevel?: number
    avgLatestYear?: number
  }
}

function readJson<T>(relativePath: string): T | null {
  const filePath = path.join(process.cwd(), relativePath)
  if (!fs.existsSync(filePath)) return null

  try {
    return JSON.parse(fs.readFileSync(filePath, "utf-8")) as T
  } catch (error) {
    console.error(`[BenchmarkDashboard] Failed to read ${relativePath}`, error)
    return null
  }
}

function formatPercent(value?: number | null) {
  if (typeof value !== "number") return "n/a"
  return `${(value * 100).toFixed(1)}%`
}

function formatNumber(value?: number | null, digits = 2) {
  if (typeof value !== "number") return "n/a"
  return value.toFixed(digits)
}

function compareThreshold({
  actual,
  minimum,
  maximum,
}: {
  actual?: number | null
  minimum?: number
  maximum?: number
}) {
  if (typeof actual !== "number") return { status: "unknown" as const, meets: false }
  if (typeof minimum === "number") {
    return {
      status: actual >= minimum ? ("pass" as const) : ("fail" as const),
      meets: actual >= minimum,
    }
  }
  if (typeof maximum === "number") {
    return {
      status: actual <= maximum ? ("pass" as const) : ("fail" as const),
      meets: actual <= maximum,
    }
  }

  return { status: "unknown" as const, meets: false }
}

export function getBenchmarkDashboardData() {
  const thresholds =
    readJson<Thresholds>("data/eval/release_benchmark_thresholds.json") ||
    readJson<Thresholds>("data/eval/benchmark_thresholds.json") ||
    {}

  const chat =
    readJson<ChatResultsPayload>("data/eval/chat_release_results.json") ||
    readJson<ChatResultsPayload>("data/eval/chat_benchmark_results.json")
  const retrieval = readJson<RetrievalPayload>("data/eval/retrieval_release_results.json")

  const tagBreakdown =
    chat?.results?.reduce<Record<string, { cases: number; avgCoverage: number; escalationCompliance: number }>>(
      (acc, result) => {
        result.tags?.forEach((tag) => {
          const current = acc[tag] || { cases: 0, avgCoverage: 0, escalationCompliance: 0 }
          current.cases += 1
          current.avgCoverage += result.citationCoverage?.coverage || 0
          if (result.requiresEscalation) {
            current.escalationCompliance += result.hasEmergencyAdvice ? 1 : 0
          }
          acc[tag] = current
        })
        return acc
      },
      {}
    ) || {}

  const tagRows = Object.entries(tagBreakdown)
    .map(([tag, value]) => ({
      tag,
      cases: value.cases,
      avgCoverage: value.cases > 0 ? value.avgCoverage / value.cases : 0,
      escalationCompliance: value.escalationCompliance,
    }))
    .sort((a, b) => b.cases - a.cases)

  return {
    generatedAt: new Date().toISOString(),
    chat: {
      summary: chat?.summary || null,
      thresholds: thresholds.chat || null,
      cards: [
        {
          label: "Citation coverage",
          actual: formatPercent(chat?.summary?.avgCitationCoverage),
          threshold: thresholds.chat?.minAvgCitationCoverage
            ? `>= ${formatPercent(thresholds.chat.minAvgCitationCoverage)}`
            : "n/a",
          ...compareThreshold({
            actual: chat?.summary?.avgCitationCoverage,
            minimum: thresholds.chat?.minAvgCitationCoverage,
          }),
        },
        {
          label: "Evidence refs / answer",
          actual: formatNumber(chat?.summary?.avgEvidenceReferences),
          threshold:
            typeof thresholds.chat?.minAvgEvidenceReferences === "number"
              ? `>= ${formatNumber(thresholds.chat.minAvgEvidenceReferences)}`
              : "n/a",
          ...compareThreshold({
            actual: chat?.summary?.avgEvidenceReferences,
            minimum: thresholds.chat?.minAvgEvidenceReferences,
          }),
        },
        {
          label: "Guideline hit rate",
          actual: formatPercent(chat?.summary?.guidelineHitRate),
          threshold: thresholds.chat?.minGuidelineHitRate
            ? `>= ${formatPercent(thresholds.chat.minGuidelineHitRate)}`
            : "n/a",
          ...compareThreshold({
            actual: chat?.summary?.guidelineHitRate,
            minimum: thresholds.chat?.minGuidelineHitRate,
          }),
        },
        {
          label: "Escalation compliance",
          actual: formatPercent(chat?.summary?.escalationCompliance),
          threshold: thresholds.chat?.minEscalationCompliance
            ? `>= ${formatPercent(thresholds.chat.minEscalationCompliance)}`
            : "n/a",
          ...compareThreshold({
            actual: chat?.summary?.escalationCompliance,
            minimum: thresholds.chat?.minEscalationCompliance,
          }),
        },
        {
          label: "Judge overall",
          actual: formatNumber(chat?.summary?.avgJudgeOverall),
          threshold:
            typeof thresholds.chat?.minAvgJudgeOverall === "number"
              ? `>= ${formatNumber(thresholds.chat.minAvgJudgeOverall)}`
              : "n/a",
          ...compareThreshold({
            actual: chat?.summary?.avgJudgeOverall,
            minimum: thresholds.chat?.minAvgJudgeOverall,
          }),
        },
        {
          label: "Judge safety",
          actual: formatNumber(chat?.summary?.avgJudgeSafety),
          threshold:
            typeof thresholds.chat?.minAvgJudgeSafety === "number"
              ? `>= ${formatNumber(thresholds.chat.minAvgJudgeSafety)}`
              : "n/a",
          ...compareThreshold({
            actual: chat?.summary?.avgJudgeSafety,
            minimum: thresholds.chat?.minAvgJudgeSafety,
          }),
        },
      ],
      tagRows,
    },
    retrieval: {
      summary: retrieval?.summary || null,
      thresholds: thresholds.retrieval || null,
      cards: [
        {
          label: "Avg results / query",
          actual: formatNumber(retrieval?.summary?.avgResults),
          threshold:
            typeof thresholds.retrieval?.minAvgResults === "number"
              ? `>= ${formatNumber(thresholds.retrieval.minAvgResults)}`
              : "n/a",
          ...compareThreshold({
            actual: retrieval?.summary?.avgResults,
            minimum: thresholds.retrieval?.minAvgResults,
          }),
        },
        {
          label: "Top evidence level",
          actual: formatNumber(retrieval?.summary?.avgTopEvidenceLevel),
          threshold:
            typeof thresholds.retrieval?.maxAvgTopEvidenceLevel === "number"
              ? `<= ${formatNumber(thresholds.retrieval.maxAvgTopEvidenceLevel)}`
              : "n/a",
          ...compareThreshold({
            actual: retrieval?.summary?.avgTopEvidenceLevel,
            maximum: thresholds.retrieval?.maxAvgTopEvidenceLevel,
          }),
        },
        {
          label: "Latest year",
          actual:
            typeof retrieval?.summary?.avgLatestYear === "number"
              ? retrieval.summary.avgLatestYear.toFixed(1)
              : "n/a",
          threshold:
            typeof thresholds.retrieval?.minAvgLatestYear === "number"
              ? `>= ${thresholds.retrieval.minAvgLatestYear.toFixed(1)}`
              : "n/a",
          ...compareThreshold({
            actual: retrieval?.summary?.avgLatestYear,
            minimum: thresholds.retrieval?.minAvgLatestYear,
          }),
        },
      ],
    },
  }
}

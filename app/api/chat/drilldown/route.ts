import { MODEL_DEFAULT } from "@/lib/config"
import { buildEvidenceContext, resultsToCitations, searchMedicalEvidence } from "@/lib/evidence/search"
import { enrichEvidenceCitationsWithJournalVisuals } from "@/lib/evidence/journal-visuals"
import type { EvidenceCitation } from "@/lib/evidence/types"
import { getModelInfo } from "@/lib/models"
import { generateText } from "ai"
import { NextRequest, NextResponse } from "next/server"

type DrilldownPayload = {
  chartTitle?: string
  chartType?: string
  source?: string
  xKey?: string
  xValue?: string | number
  seriesKey?: string
  seriesLabel?: string
  value?: string | number | null
}

type DrilldownRequestBody = {
  payload?: DrilldownPayload
  parentPrompt?: string | null
}

function sanitizeText(value: unknown, maxLength = 180): string {
  if (typeof value !== "string") return ""
  const normalized = value.replace(/\s+/g, " ").trim()
  if (!normalized) return ""
  return normalized.length <= maxLength
    ? normalized
    : `${normalized.slice(0, maxLength - 1).trim()}...`
}

function sanitizeScalar(value: unknown): string {
  if (typeof value === "number" && Number.isFinite(value)) return String(value)
  if (typeof value === "string") return sanitizeText(value, 80)
  return ""
}

function buildDataPointLabel(payload: DrilldownPayload): string {
  const series = sanitizeText(payload.seriesLabel || payload.seriesKey || "Selected series", 64)
  const xKey = sanitizeText(payload.xKey || "axis", 24)
  const xValue = sanitizeScalar(payload.xValue)
  const value = sanitizeScalar(payload.value)
  const positionPart = xValue ? `${xKey}=${xValue}` : xKey
  const valuePart = value ? `value=${value}` : "value=selected"
  return `${series} (${positionPart}, ${valuePart})`
}

function dedupeCitations(citations: EvidenceCitation[]): EvidenceCitation[] {
  const deduped = new Map<string, EvidenceCitation>()
  citations.forEach((citation) => {
    const key =
      citation.pmid ||
      citation.doi ||
      citation.url ||
      `${citation.title || "untitled"}:${citation.journal || "source"}`
    if (!deduped.has(key)) {
      deduped.set(key, citation)
    }
  })
  return Array.from(deduped.values()).map((citation, index) => ({
    ...citation,
    index: index + 1,
  }))
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as DrilldownRequestBody
    const payload = body?.payload
    if (!payload || typeof payload !== "object") {
      return NextResponse.json(
        { error: "Missing drill-down payload." },
        { status: 400 }
      )
    }

    const dataPointLabel = buildDataPointLabel(payload)
    const sourceLabel =
      sanitizeText(payload.source, 80) ||
      sanitizeText(payload.chartTitle, 80) ||
      "the chart source"
    const parentPrompt = sanitizeText(body.parentPrompt, 220)
    const canonicalRequest = `Analyze this specific data point: ${dataPointLabel} from ${sourceLabel}. Provide the underlying clinical trial evidence.`

    const retrievalQuery = parentPrompt
      ? `${canonicalRequest}\n\nParent discussion context: ${parentPrompt}`
      : canonicalRequest

    let citations: EvidenceCitation[] = []
    try {
      const primaryResults = await searchMedicalEvidence({
        query: retrievalQuery,
        maxResults: 8,
        minEvidenceLevel: 5,
      })
      citations = resultsToCitations(primaryResults)
      if (citations.length < 3) {
        const focusedResults = await searchMedicalEvidence({
          query: canonicalRequest,
          maxResults: 8,
          minEvidenceLevel: 5,
        })
        citations = dedupeCitations([...citations, ...resultsToCitations(focusedResults)])
      }
    } catch {
      citations = []
    }
    citations = dedupeCitations(citations).slice(0, 8)
    citations = await enrichEvidenceCitationsWithJournalVisuals(citations, {
      queryText: canonicalRequest,
      maxCitationsToEnrich: 3,
    })

    const modelInfo = getModelInfo(MODEL_DEFAULT)
    if (!modelInfo?.apiSdk) {
      return NextResponse.json(
        { error: "No model configured for drill-down analysis." },
        { status: 500 }
      )
    }
    const model = modelInfo.apiSdk(undefined, { enableSearch: false })
    const evidenceContext = buildEvidenceContext(citations)

    const promptParts = [
      "You are a clinical drill-down micro-agent.",
      "Drill-Down Mode is active: bypass global preflight and focus only on this clicked datapoint.",
      "",
      `User request: ${canonicalRequest}`,
      parentPrompt ? `Parent context: ${parentPrompt}` : "",
      "",
      "Response requirements:",
      "- Keep to 4 concise sections: Signal, Trials, Caveats, Practical takeaway.",
      "- Cite every claim with [1], [2], ... using only the provided evidence set.",
      "- If evidence is sparse, note the limitation plainly and recommend targeted follow-up retrieval without disclaimers about missing citations.",
      "",
      citations.length > 0
        ? "Evidence set:\n" + evidenceContext.formattedContext
        : "Evidence set is empty. State that no high-signal trials were found and recommend targeted follow-up retrieval.",
    ].filter(Boolean)

    const completion = await generateText({
      model,
      temperature: 0.15,
      prompt: promptParts.join("\n"),
    })

    return NextResponse.json(
      {
        runId: `drilldown-${Date.now()}`,
        query: canonicalRequest,
        response: completion.text || "",
        citations,
      },
      { status: 200 }
    )
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to run drill-down analysis."
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

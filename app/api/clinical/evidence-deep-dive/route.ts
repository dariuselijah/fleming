import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { searchMedicalEvidence } from "@/lib/evidence/search"
import { expandClinicalShorthand } from "@/lib/rag/query-optimizer"
import { generateText } from "ai"
import { openproviders } from "@/lib/openproviders"
import type { EvidenceDeepDiveResultRow } from "@/lib/clinical-workspace/types"

export const maxDuration = 120

function pubmedUrl(pmid: string | null): string | undefined {
  if (!pmid) return undefined
  return `https://pubmed.ncbi.nlm.nih.gov/${pmid}/`
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    if (!supabase) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
    const { data: auth } = await supabase.auth.getUser()
    if (!auth.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = (await req.json()) as { query?: string }
    const raw = (body.query ?? "").trim()
    if (raw.length < 3) {
      return NextResponse.json({ error: "Query too short" }, { status: 400 })
    }

    const expanded = expandClinicalShorthand(raw)

    const results = await searchMedicalEvidence({
      query: expanded,
      maxResults: 22,
      minEvidenceLevel: 2,
      filterPresets: ["high_evidence", "recent_10y"],
      queryExpansion: true,
      enableRerank: true,
      supabaseClient: supabase as any,
    })

    const top = results.slice(0, 14)
    const rows: EvidenceDeepDiveResultRow[] = top.map((r, i) => ({
      id: r.id || `ev-${i}`,
      title: r.title,
      journal: r.journal_name,
      year: r.publication_year ?? undefined,
      url: pubmedUrl(r.pmid) ?? (r.doi ? `https://doi.org/${r.doi}` : undefined),
      evidenceLevel: r.evidence_level,
      keyFindings:
        (r.content_with_context || r.content || "").replace(/\s+/g, " ").trim().slice(0, 420) +
        ((r.content_with_context || r.content || "").length > 420 ? "…" : ""),
      relevanceScore: typeof r.score === "number" ? r.score : undefined,
    }))

    const contextForLlm = top
      .slice(0, 8)
      .map(
        (r, i) =>
          `[${i + 1}] ${r.title} (${r.journal_name || "Journal"}, ${r.publication_year ?? "n/a"}). ${(r.study_type || "Study")}. Evidence level ${r.evidence_level}. Snippet: ${(r.content || "").slice(0, 600)}`
      )
      .join("\n\n")

    const { text: synthesis } = await generateText({
      model: openproviders("gpt-4o-mini"),
      system: `You are a clinical evidence synthesist. Using ONLY the numbered sources below, write a precise clinical summary for the clinician.
Rules:
- Lead with the strongest applicable evidence (guidelines, systematic reviews, RCTs).
- Use inline citations [1], [2] matching the source numbers — no other citation style.
- If evidence is insufficient, say so clearly.
- South African / international context is fine; do not invent trial outcomes not in the snippets.`,
      prompt: `Clinical question: ${raw}\n\n--- Retrieved sources ---\n${contextForLlm}\n\nWrite 2–4 short paragraphs with [n] citations.`,
      maxTokens: 1800,
      temperature: 0.2,
    })

    return NextResponse.json({
      query: raw,
      expandedQuery: expanded,
      synthesis: synthesis.trim(),
      results: rows,
      updatedAt: new Date().toISOString(),
      stages: [
        { label: "Expand clinical query", done: true },
        { label: "Search evidence index", done: true },
        { label: "Rerank & filter", done: true },
        { label: "Synthesize with citations", done: true },
      ],
    })
  } catch (e) {
    console.error("[evidence-deep-dive]", e)
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Evidence search failed" },
      { status: 500 }
    )
  }
}

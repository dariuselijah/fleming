/**
 * Cron endpoint for daily delta sync.
 *
 * Deploy with Vercel Cron or call via external scheduler:
 *   curl -H "Authorization: Bearer $CRON_SECRET" https://your-app.vercel.app/api/cron/delta-sync
 *
 * Vercel cron config (add to vercel.json):
 *   { "crons": [{ "path": "/api/cron/delta-sync", "schedule": "0 4 * * *" }] }
 */

import { NextResponse } from "next/server"

export const maxDuration = 300
export const dynamic = "force-dynamic"

export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret) {
    const authHeader = request.headers.get("authorization")
    if (authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
  }

  try {
    const { fetchDeltaPmids, postIngestionCacheFlush } = await import(
      "@/lib/pubmed/bulk-ingestion"
    )
    const { parseEnhancedPubMedXML } = await import("@/lib/pubmed/parser")
    const { chunkArticle } = await import("@/lib/pubmed/chunking")
    const { generateEmbeddings } = await import("@/lib/rag/embeddings")
    const { storeMedicalEvidence } = await import("@/lib/pubmed/storage")

    const apiKey = process.env.NCBI_API_KEY || process.env.PUBMED_API_KEY
    const days = 2

    const queries = [
      `("2020"[PDAT] : "3000"[PDAT]) AND (("guideline"[pt] OR "meta-analysis"[pt] OR "systematic review"[pt] OR "randomized controlled trial"[pt]) AND ("treatment" OR "management" OR "diagnosis"))`,
      `("practice guideline"[pt]) AND ("2020"[PDAT] : "3000"[PDAT])`,
    ]

    let totalIngested = 0
    let totalErrors = 0

    for (const query of queries) {
      try {
        const pmids = await fetchDeltaPmids({
          term: query,
          relDays: days,
          apiKey: apiKey || undefined,
          maxResults: 500,
        })

        if (pmids.length === 0) continue

        const url = new URL("https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi")
        url.searchParams.set("db", "pubmed")
        url.searchParams.set("rettype", "xml")
        url.searchParams.set("retmode", "xml")
        if (apiKey) url.searchParams.set("api_key", apiKey)

        const BATCH = 50
        for (let i = 0; i < pmids.length; i += BATCH) {
          const batch = pmids.slice(i, i + BATCH)
          url.searchParams.set("id", batch.join(","))

          const resp = await fetch(url.toString())
          if (!resp.ok) continue
          const xml = await resp.text()
          const articles = parseEnhancedPubMedXML(xml)

          const allChunks: any[] = []
          for (const article of articles) {
            try {
              const chunks = chunkArticle(article, {
                strategy: "hybrid",
                includeTitle: true,
                includeMesh: true,
                includeStudyInfo: true,
              })
              allChunks.push(...chunks)
            } catch {
              totalErrors++
            }
          }

          if (allChunks.length === 0) continue

          const EMBED_BATCH = 100
          for (let j = 0; j < allChunks.length; j += EMBED_BATCH) {
            const embBatch = allChunks.slice(j, j + EMBED_BATCH)
            try {
              const embeddings = await generateEmbeddings(
                embBatch.map((c: any) => c.contentWithContext || c.content)
              )
              const withEmb = embBatch.map((c: any, idx: number) => ({
                ...c,
                embedding: embeddings[idx],
              }))
              const result = await storeMedicalEvidence(withEmb, { batchSize: 20 })
              totalIngested += result.stored
              totalErrors += result.errors.length
            } catch {
              totalErrors++
            }
          }

          await new Promise((r) => setTimeout(r, apiKey ? 350 : 1100))
        }
      } catch {
        totalErrors++
      }
    }

    if (totalIngested > 0) {
      try {
        await postIngestionCacheFlush()
      } catch { /* non-fatal */ }
    }

    return NextResponse.json({
      success: true,
      ingested: totalIngested,
      errors: totalErrors,
      timestamp: new Date().toISOString(),
    })
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    )
  }
}

#!/usr/bin/env npx ts-node

/**
 * PubMed Delta Sync
 *
 * Fetches articles added/revised in the last N days and upserts them
 * into the medical_evidence table. Run as a daily/weekly cron job.
 *
 * Usage:
 *   npx ts-node --compiler-options '{"module":"commonjs"}' scripts/pubmed-delta-sync.ts
 *   npx ts-node --compiler-options '{"module":"commonjs"}' scripts/pubmed-delta-sync.ts --days 3 --high-evidence
 */

import { config } from "dotenv"
import { resolve } from "node:path"
import { existsSync } from "node:fs"
import { parseArgs } from "util"

const envLocalPath = resolve(process.cwd(), ".env.local")
const envPath = resolve(process.cwd(), ".env")
if (existsSync(envLocalPath)) config({ path: envLocalPath })
if (existsSync(envPath)) config({ path: envPath })

import {
  fetchDeltaPmids,
  postIngestionCacheFlush,
} from "../lib/pubmed/bulk-ingestion"

const { values } = parseArgs({
  options: {
    days: { type: "string", default: "7" },
    "high-evidence": { type: "boolean", default: false },
    "max-results": { type: "string", default: "500" },
    "dry-run": { type: "boolean", default: false },
  },
  strict: false,
  allowPositionals: true,
})

async function main() {
  const relDays = Number.parseInt(values.days as string, 10)
  const highEvidence = values["high-evidence"] as boolean
  const maxResults = Number.parseInt(values["max-results"] as string, 10)
  const dryRun = values["dry-run"] as boolean

  console.log(`[Delta Sync] Fetching articles from last ${relDays} days`)
  console.log(`  high-evidence: ${highEvidence}, max: ${maxResults}, dry-run: ${dryRun}`)

  const apiKey =
    process.env.NCBI_API_KEY || process.env.PUBMED_API_KEY || undefined

  const pmids = await fetchDeltaPmids({
    relDays,
    highEvidence,
    maxResults,
    apiKey,
  })

  console.log(`[Delta Sync] Found ${pmids.length} PMIDs`)

  if (dryRun) {
    console.log("[Delta Sync] Dry run – skipping ingestion")
    if (pmids.length > 0) {
      console.log("  Sample PMIDs:", pmids.slice(0, 10).join(", "))
    }
    return
  }

  if (pmids.length === 0) {
    console.log("[Delta Sync] No new articles to ingest")
    return
  }

  // Dynamically import the existing bulk ingestion pipeline so the script
  // stays lightweight when used for dry-run / PMID listing.
  try {
    const { getExistingPmids } = await import("../lib/pubmed/storage")
    const existingPmids = await getExistingPmids(pmids)
    const newPmids = pmids.filter((id) => !existingPmids.has(id))
    console.log(
      `[Delta Sync] ${newPmids.length} new (${pmids.length - newPmids.length} already indexed)`,
    )

    if (newPmids.length === 0) {
      console.log("[Delta Sync] All articles already indexed – nothing to do")
      return
    }

    // Fetch full XML for new PMIDs and process through existing pipeline
    const { searchPubMed } = await import("../lib/pubmed/api")
    const { chunkArticle } = await import("../lib/pubmed/chunking")
    const { generateEmbeddings } = await import("../lib/rag/embeddings")
    const { storeMedicalEvidence } = await import("../lib/pubmed/storage")

    console.log(`[Delta Sync] Processing ${newPmids.length} new articles...`)

    // Process in batches of 50
    const BATCH_SIZE = 50
    let totalChunks = 0
    for (let i = 0; i < newPmids.length; i += BATCH_SIZE) {
      const batch = newPmids.slice(i, i + BATCH_SIZE)
      console.log(
        `[Delta Sync] Batch ${Math.floor(i / BATCH_SIZE) + 1}: fetching ${batch.length} articles`,
      )

      // Fetch via existing PubMed API (which also populates its own cache)
      const results = await searchPubMed(batch.join(" OR "), batch.length)

      for (const article of results.articles) {
        try {
          const chunks = chunkArticle({
            pmid: article.pmid,
            title: article.title,
            abstract: article.abstract || "",
            authors: article.authors,
            journal: article.journal,
            year: article.year,
            doi: article.doi,
          } as any)

          if (chunks.length > 0) {
            const texts = chunks.map((c: any) => c.content || c.chunk_text || "")
            const embeddings = await generateEmbeddings(texts)

            const evidenceChunks = chunks.map((c: any, idx: number) => ({
              ...c,
              embedding: embeddings[idx],
            }))

            await storeMedicalEvidence(evidenceChunks)
            totalChunks += evidenceChunks.length
          }
        } catch (err) {
          console.warn(
            `[Delta Sync] Failed to process PMID ${article.pmid}:`,
            err,
          )
        }
      }
    }

    console.log(
      `[Delta Sync] Done: ${totalChunks} chunks from ${newPmids.length} articles`,
    )

    // Invalidate retrieval caches
    await postIngestionCacheFlush()
  } catch (err) {
    console.error("[Delta Sync] Ingestion pipeline failed:", err)
    process.exitCode = 1
  }
}

main()

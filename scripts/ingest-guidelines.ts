#!/usr/bin/env npx ts-node

import { config as loadEnv } from "dotenv"
import fs from "node:fs"
import path from "node:path"
import { parseArgs } from "util"
import { searchGuidelineAdapters } from "../lib/evidence/guidelines/registry"
import type { GuidelineRegion, GuidelineResult } from "../lib/evidence/guidelines/types"
import { generateEmbeddings } from "../lib/rag/embeddings"
import { storeMedicalEvidence } from "../lib/pubmed/storage"
import type { MedicalEvidenceChunk } from "../lib/pubmed/types"

type IngestionRow = {
  query: string
  result: GuidelineResult
}

function resolveProjectPath(relativePath: string): string {
  return path.resolve(process.cwd(), relativePath)
}

function loadEnvFiles() {
  const envPaths = [
    resolveProjectPath(".env"),
    resolveProjectPath(".env.local"),
    resolveProjectPath("../.env"),
    resolveProjectPath("../.env.local"),
  ]

  envPaths.forEach((envPath) => {
    if (fs.existsSync(envPath)) {
      loadEnv({ path: envPath })
    }
  })
}

function normalizeText(text: string): string {
  return text.replace(/\s+/g, " ").trim()
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/https?:\/\//g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 72)
}

function extractYear(value?: string): number {
  if (!value) return new Date().getFullYear()
  const match = value.match(/\b(19|20)\d{2}\b/)
  if (!match) return new Date().getFullYear()
  return Number(match[0])
}

function inferRecommendationStrength(summary?: string): string {
  if (!summary) return "unspecified"
  if (/\bstrong(ly)? recommended?\b/i.test(summary)) return "strong"
  if (/\bconditional\b|\bweak\b/i.test(summary)) return "conditional"
  if (/\bconsensus\b/i.test(summary)) return "consensus"
  return "unspecified"
}

function guidelineToChunk(row: IngestionRow): MedicalEvidenceChunk {
  const result = row.result
  const summary = normalizeText(result.summary || result.title)
  const source = result.organization || result.source
  const guidelineId = slugify(result.url || `${result.sourceId}_${result.title}`)
  const publicationYear = extractYear(result.date)
  const recommendationStrength = inferRecommendationStrength(summary)

  const contentWithContext = normalizeText(
    [
      `Guideline source: ${source}`,
      `Region: ${result.region || "GLOBAL"}`,
      `Study type: ${result.studyType || "Guideline"}`,
      `Recommendation strength: ${recommendationStrength}`,
      `Query: ${row.query}`,
      `Summary: ${summary}`,
    ].join(" | ")
  )

  return {
    content: summary,
    contentWithContext,
    pmid: `GL-${result.sourceId}-${guidelineId}`,
    sectionType: "full_abstract",
    chunkIndex: 0,
    title: result.title,
    journalName: source,
    publicationYear,
    doi: undefined,
    authors: [source],
    evidenceLevel: (result.evidenceLevel as 1 | 2 | 3 | 4 | 5) || 2,
    studyType: result.studyType || "Guideline",
    sampleSize: undefined,
    meshTerms: [
      "guideline",
      `source:${result.sourceId}`,
      `region:${result.region || "GLOBAL"}`,
      `organization:${source}`,
    ],
    majorMeshTerms: ["guideline", source],
    chemicals: [],
    keywords: [
      ...row.query.split(/\s+/).slice(0, 12),
      `recommendation_strength:${recommendationStrength}`,
      `guideline_url:${result.url || "unknown"}`,
    ],
    tokenEstimate: Math.ceil(contentWithContext.length / 4),
  }
}

function ensureEnvVars(required: string[]) {
  const missing = required.filter((key) => !process.env[key])
  if (missing.length > 0) {
    console.error(`Missing required environment variables: ${missing.join(", ")}`)
    process.exit(1)
  }
}

function getQueries(values: Record<string, string | boolean | undefined>): string[] {
  if (typeof values.query === "string" && values.query.trim()) {
    return [values.query.trim()]
  }

  if (typeof values["queries-file"] === "string" && values["queries-file"].trim()) {
    const raw = fs.readFileSync(resolveProjectPath(values["queries-file"]), "utf-8")
    return raw
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
  }

  return [
    "workup for abdominal pain adults",
    "hypertension first line treatment adults guideline",
    "sepsis initial management adult emergency guideline",
    "acetaminophen max dose and safety adults guideline",
  ]
}

async function run() {
  loadEnvFiles()

  const { values } = parseArgs({
    options: {
      query: { type: "string", short: "q" },
      "queries-file": { type: "string", short: "f" },
      "max-per-query": { type: "string", default: "10" },
      region: { type: "string", default: "US" },
      "dry-run": { type: "boolean" },
      "no-embeddings": { type: "boolean" },
      out: { type: "string" },
      help: { type: "boolean" },
    },
  })

  if (values.help) {
    console.log(`Guideline ingestion CLI

Usage:
  npx ts-node scripts/ingest-guidelines.ts --query "abdominal pain workup"
  npx ts-node scripts/ingest-guidelines.ts --queries-file data/eval/guideline_ingestion_queries.txt

Options:
  -q, --query <query>             Single query
  -f, --queries-file <path>       Newline-separated query list
  --max-per-query <n>             Max guideline docs per query (default: 10)
  --region <US|UK|EU|GLOBAL>      Adapter priority region (default: US)
  --dry-run                       Fetch/normalize only, no DB write
  --no-embeddings                 Store records without embedding generation
  --out <path>                    Write ingestion report JSON
`)
    process.exit(0)
  }

  const dryRun = Boolean(values["dry-run"])
  const noEmbeddings = Boolean(values["no-embeddings"])
  const maxPerQuery = Math.max(1, Math.min(25, Number(values["max-per-query"] || 10)))
  const region = (String(values.region || "US").toUpperCase() as GuidelineRegion)
  const queries = getQueries(values)

  if (!dryRun) {
    ensureEnvVars(["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"])
    if (!noEmbeddings) ensureEnvVars(["OPENAI_API_KEY"])
  }

  const rows: IngestionRow[] = []
  for (const query of queries) {
    const result = await searchGuidelineAdapters(query, maxPerQuery, region)
    rows.push(...result.results.map((entry) => ({ query, result: entry })))
    console.log(
      `[Guideline ingest] ${query} -> ${result.results.length} results (${result.sourcesUsed.join(", ") || "none"})`
    )
  }

  const dedupedRows = Array.from(
    new Map(
      rows.map((row) => [
        `${row.result.sourceId}:${row.result.title}`.toLowerCase(),
        row,
      ])
    ).values()
  )

  const chunks = dedupedRows.map(guidelineToChunk)
  console.log(
    `[Guideline ingest] Normalized ${chunks.length} guideline records from ${queries.length} query(s)`
  )

  if (dryRun) {
    console.log("[Guideline ingest] Dry run complete. No records written.")
  } else {
    const writeRows = noEmbeddings
      ? chunks.map((chunk) => ({ ...chunk, embedding: undefined }))
      : await (async () => {
          const embeddings = await generateEmbeddings(
            chunks.map((chunk) => chunk.contentWithContext)
          )
          return chunks.map((chunk, index) => ({
            ...chunk,
            embedding: embeddings[index],
          }))
        })()

    const storeResult = await storeMedicalEvidence(writeRows, { batchSize: 25 })
    console.log(
      `[Guideline ingest] Stored ${storeResult.stored}/${writeRows.length} chunks`
    )
    if (storeResult.errors.length > 0) {
      console.error("[Guideline ingest] Errors:")
      storeResult.errors.forEach((error) => console.error(`- ${error}`))
    }
  }

  if (typeof values.out === "string" && values.out.trim()) {
    const outPath = resolveProjectPath(values.out)
    const report = {
      createdAt: new Date().toISOString(),
      queries,
      region,
      totalRecords: chunks.length,
      bySource: dedupedRows.reduce<Record<string, number>>((acc, row) => {
        const key = row.result.source
        acc[key] = (acc[key] || 0) + 1
        return acc
      }, {}),
      sampleRecords: dedupedRows.slice(0, 10).map((row) => ({
        source: row.result.source,
        title: row.result.title,
        url: row.result.url,
        date: row.result.date,
        region: row.result.region,
      })),
    }
    fs.writeFileSync(outPath, JSON.stringify(report, null, 2))
    console.log(`[Guideline ingest] Wrote report: ${outPath}`)
  }
}

run().catch((error) => {
  console.error("[Guideline ingest] Failed:", error)
  process.exit(1)
})

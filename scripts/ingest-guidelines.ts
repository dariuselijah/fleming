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

type GuidelineIngestionCheckpoint = {
  version: string
  createdAt: string
  lastUpdated: string
  queries: Record<
    string,
    {
      status: "pending" | "completed" | "failed"
      results: number
      sourcesUsed: string[]
      updatedAt: string
      error?: string
    }
  >
}

const DEFAULT_GUIDELINE_WAVES: Record<string, string[]> = {
  benchmark_core: [
    "acute abdominal pain diagnostic workup guideline adults",
    "hypertension first line treatment adults guideline",
    "sepsis initial management adult emergency guideline",
    "acetaminophen paracetamol overdose guideline",
  ],
  emergency_critical: [
    "acute coronary syndrome chest pain emergency guideline",
    "acute ischemic stroke thrombolysis thrombectomy guideline",
    "anaphylaxis emergency management adults guideline",
    "septic shock vasopressor escalation guideline",
  ],
  cardio_metabolic: [
    "heart failure reduced ejection fraction guideline directed medical therapy",
    "atrial fibrillation anticoagulation CHA2DS2 VASc guideline",
    "diabetes chronic kidney disease SGLT2 GLP1 guideline",
    "lipid management secondary prevention statin guideline",
  ],
  pulmonary_infectious: [
    "community acquired pneumonia outpatient treatment by comorbidity guideline",
    "copd exacerbation steroid antibiotic oxygen guideline",
    "asthma stepwise controller escalation adults guideline",
    "cystitis uncomplicated women first line antibiotic guideline",
  ],
  medication_safety: [
    "warfarin high risk interactions INR monitoring guideline",
    "chronic kidney disease medication dose adjustment eGFR guidance",
    "polypharmacy deprescribing older adults guideline",
    "direct oral anticoagulant renal dosing guidance",
  ],
}

function resolveWaveQueries(
  values: Record<string, string | boolean | undefined>
): { selectedWaves: string[]; waveQueries: string[] } {
  const waveValue = typeof values.wave === "string" ? values.wave.trim() : ""
  if (!waveValue) return { selectedWaves: [], waveQueries: [] }

  const selectedWaves = waveValue
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean)

  const waveQueries = selectedWaves.flatMap((wave) => DEFAULT_GUIDELINE_WAVES[wave] || [])
  return { selectedWaves, waveQueries: Array.from(new Set(waveQueries)) }
}

function loadCheckpoint(filePath: string): GuidelineIngestionCheckpoint | null {
  if (!fs.existsSync(filePath)) return null
  try {
    const raw = fs.readFileSync(filePath, "utf-8")
    const parsed = JSON.parse(raw) as GuidelineIngestionCheckpoint
    return parsed
  } catch (error) {
    console.warn(`[Guideline ingest] Failed to parse checkpoint ${filePath}:`, error)
    return null
  }
}

function saveCheckpoint(filePath: string, checkpoint: GuidelineIngestionCheckpoint) {
  checkpoint.lastUpdated = new Date().toISOString()
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  fs.writeFileSync(filePath, JSON.stringify(checkpoint, null, 2))
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

  const { waveQueries } = resolveWaveQueries(values)
  if (waveQueries.length > 0) {
    return waveQueries
  }

  return Array.from(
    new Set(
      Object.values(DEFAULT_GUIDELINE_WAVES)
        .flat()
        .map((query) => query.trim())
        .filter(Boolean)
    )
  )
}

async function run() {
  loadEnvFiles()

  const { values } = parseArgs({
    options: {
      query: { type: "string", short: "q" },
      "queries-file": { type: "string", short: "f" },
      wave: { type: "string", short: "w" },
      "max-per-query": { type: "string", default: "10" },
      region: { type: "string", default: "US" },
      checkpoint: { type: "string", default: "data/eval/guideline_ingestion_checkpoint.json" },
      resume: { type: "boolean" },
      "min-results-per-query": { type: "string", default: "2" },
      "min-sources-per-run": { type: "string", default: "2" },
      "stop-on-gate-fail": { type: "boolean" },
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
  npx ts-node scripts/ingest-guidelines.ts --wave benchmark_core,emergency_critical --resume

Options:
  -q, --query <query>             Single query
  -f, --queries-file <path>       Newline-separated query list
  -w, --wave <name[,name]>        Named wave(s): ${Object.keys(DEFAULT_GUIDELINE_WAVES).join(", ")}
  --max-per-query <n>             Max guideline docs per query (default: 10)
  --region <US|UK|EU|GLOBAL>      Adapter priority region (default: US)
  --checkpoint <path>             Checkpoint JSON path for resume support
  --resume                        Skip already completed queries from checkpoint
  --min-results-per-query <n>     Quality gate: minimum results per query (default: 2)
  --min-sources-per-run <n>       Quality gate: minimum unique sources overall (default: 2)
  --stop-on-gate-fail             Exit non-zero if quality gates fail
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
  const checkpointPath = resolveProjectPath(
    String(values.checkpoint || "data/eval/guideline_ingestion_checkpoint.json")
  )
  const shouldResume = Boolean(values.resume)
  const minResultsPerQuery = Math.max(0, Number(values["min-results-per-query"] || 2))
  const minSourcesPerRun = Math.max(1, Number(values["min-sources-per-run"] || 2))
  const stopOnGateFail = Boolean(values["stop-on-gate-fail"])
  const queries = getQueries(values)
  const { selectedWaves } = resolveWaveQueries(values)

  let checkpoint: GuidelineIngestionCheckpoint = {
    version: "1.0",
    createdAt: new Date().toISOString(),
    lastUpdated: new Date().toISOString(),
    queries: {},
  }
  if (shouldResume) {
    const loaded = loadCheckpoint(checkpointPath)
    if (loaded) {
      checkpoint = loaded
      console.log(`[Guideline ingest] Resuming from checkpoint: ${checkpointPath}`)
    }
  }

  if (!dryRun) {
    ensureEnvVars(["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"])
    if (!noEmbeddings) ensureEnvVars(["OPENAI_API_KEY"])
  }

  const rows: IngestionRow[] = []
  const perQueryStats: Array<{
    query: string
    count: number
    sourcesUsed: string[]
    skippedFromCheckpoint?: boolean
    error?: string
  }> = []

  for (const query of queries) {
    const checkpointEntry = checkpoint.queries[query]
    if (shouldResume && checkpointEntry?.status === "completed") {
      console.log(`[Guideline ingest] Skipping completed query from checkpoint: ${query}`)
      perQueryStats.push({
        query,
        count: checkpointEntry.results,
        sourcesUsed: checkpointEntry.sourcesUsed,
        skippedFromCheckpoint: true,
      })
      continue
    }

    try {
      const result = await searchGuidelineAdapters(query, maxPerQuery, region)
      rows.push(...result.results.map((entry) => ({ query, result: entry })))
      console.log(
        `[Guideline ingest] ${query} -> ${result.results.length} results (${result.sourcesUsed.join(", ") || "none"})`
      )
      checkpoint.queries[query] = {
        status: "completed",
        results: result.results.length,
        sourcesUsed: result.sourcesUsed,
        updatedAt: new Date().toISOString(),
      }
      perQueryStats.push({
        query,
        count: result.results.length,
        sourcesUsed: result.sourcesUsed,
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      checkpoint.queries[query] = {
        status: "failed",
        results: 0,
        sourcesUsed: [],
        updatedAt: new Date().toISOString(),
        error: message,
      }
      perQueryStats.push({
        query,
        count: 0,
        sourcesUsed: [],
        error: message,
      })
      console.error(`[Guideline ingest] Query failed (${query}): ${message}`)
    }

    saveCheckpoint(checkpointPath, checkpoint)
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

  const uniqueSources = Array.from(new Set(dedupedRows.map((row) => row.result.source)))
  const failedQueries = perQueryStats.filter((stat) => stat.count < minResultsPerQuery)
  const gateFailures: string[] = []
  if (failedQueries.length > 0) {
    gateFailures.push(
      `results_per_query gate failed for ${failedQueries.length} query(s): ${failedQueries
        .map((item) => `"${item.query}"(${item.count})`)
        .join(", ")}`
    )
  }
  if (uniqueSources.length < minSourcesPerRun) {
    gateFailures.push(
      `source_diversity gate failed: ${uniqueSources.length} < ${minSourcesPerRun}`
    )
  }

  if (gateFailures.length > 0) {
    console.warn("[Guideline ingest] Quality gate failures:")
    gateFailures.forEach((failure) => console.warn(`- ${failure}`))
  } else {
    console.log("[Guideline ingest] Quality gates passed")
  }

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
      selectedWaves,
      region,
      totalRecords: chunks.length,
      uniqueSources,
      qualityGates: {
        minResultsPerQuery,
        minSourcesPerRun,
        failures: gateFailures,
      },
      perQueryStats,
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

  if (stopOnGateFail && gateFailures.length > 0) {
    process.exit(2)
  }
}

run().catch((error) => {
  console.error("[Guideline ingest] Failed:", error)
  process.exit(1)
})

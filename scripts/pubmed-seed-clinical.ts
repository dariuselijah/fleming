#!/usr/bin/env npx ts-node

/**
 * PubMed Clinical Seed
 *
 * Bulk-seeds the medical_evidence vector store with high-evidence articles
 * across critical clinical domains. Designed for first-time setup to make
 * Fleming competitive with OpenEvidence from day one.
 *
 * Targets: systematic reviews, meta-analyses, RCTs, practice guidelines.
 * Domains: oncology, cardiology, neurology, infectious disease, endocrine,
 *          pulmonology, pharmacology, pediatrics, emergency medicine, etc.
 *
 * Usage:
 *   npx ts-node --compiler-options '{"module":"commonjs"}' scripts/pubmed-seed-clinical.ts
 *   npx ts-node --compiler-options '{"module":"commonjs"}' scripts/pubmed-seed-clinical.ts --dry-run
 *   npx ts-node --compiler-options '{"module":"commonjs"}' scripts/pubmed-seed-clinical.ts --domain oncology
 *   npx ts-node --compiler-options '{"module":"commonjs"}' scripts/pubmed-seed-clinical.ts --max-per-domain 200
 */

import { config } from "dotenv"
import { resolve } from "node:path"
import { existsSync } from "node:fs"
import { parseArgs } from "util"

const envLocalPath = resolve(process.cwd(), ".env.local")
const envPath = resolve(process.cwd(), ".env")
if (existsSync(envLocalPath)) config({ path: envLocalPath })
if (existsSync(envPath)) config({ path: envPath })

const { values } = parseArgs({
  options: {
    "dry-run": { type: "boolean", default: false },
    domain: { type: "string" },
    "max-per-domain": { type: "string", default: "300" },
    "embedding-batch": { type: "string", default: "100" },
    "from-year": { type: "string", default: "2020" },
    help: { type: "boolean", default: false },
  },
  strict: false,
  allowPositionals: true,
})

interface ClinicalDomain {
  name: string
  query: string
  priority: number
}

const CLINICAL_DOMAINS: ClinicalDomain[] = [
  {
    name: "oncology",
    query: `("neoplasms"[MeSH] OR "cancer treatment" OR "immunotherapy" OR "chemotherapy") AND ("systematic review"[pt] OR "meta-analysis"[pt] OR "practice guideline"[pt] OR "randomized controlled trial"[pt])`,
    priority: 1,
  },
  {
    name: "cardiology",
    query: `("cardiovascular diseases"[MeSH] OR "heart failure" OR "myocardial infarction" OR "atrial fibrillation" OR "hypertension") AND ("systematic review"[pt] OR "meta-analysis"[pt] OR "practice guideline"[pt] OR "randomized controlled trial"[pt])`,
    priority: 1,
  },
  {
    name: "infectious-disease",
    query: `("anti-infective agents"[MeSH] OR "infection"[MeSH] OR "antimicrobial resistance" OR "sepsis" OR "HIV" OR "antibiotic") AND ("systematic review"[pt] OR "meta-analysis"[pt] OR "practice guideline"[pt] OR "randomized controlled trial"[pt])`,
    priority: 1,
  },
  {
    name: "neurology",
    query: `("nervous system diseases"[MeSH] OR "stroke" OR "epilepsy" OR "alzheimer" OR "parkinson" OR "multiple sclerosis") AND ("systematic review"[pt] OR "meta-analysis"[pt] OR "practice guideline"[pt] OR "randomized controlled trial"[pt])`,
    priority: 1,
  },
  {
    name: "endocrine",
    query: `("diabetes mellitus"[MeSH] OR "thyroid diseases"[MeSH] OR "metabolic syndrome" OR "insulin" OR "GLP-1") AND ("systematic review"[pt] OR "meta-analysis"[pt] OR "practice guideline"[pt] OR "randomized controlled trial"[pt])`,
    priority: 1,
  },
  {
    name: "pulmonology",
    query: `("lung diseases"[MeSH] OR "asthma" OR "COPD" OR "pulmonary embolism" OR "pneumonia") AND ("systematic review"[pt] OR "meta-analysis"[pt] OR "practice guideline"[pt] OR "randomized controlled trial"[pt])`,
    priority: 2,
  },
  {
    name: "gastroenterology",
    query: `("gastrointestinal diseases"[MeSH] OR "inflammatory bowel disease" OR "liver cirrhosis" OR "GERD" OR "pancreatitis") AND ("systematic review"[pt] OR "meta-analysis"[pt] OR "practice guideline"[pt] OR "randomized controlled trial"[pt])`,
    priority: 2,
  },
  {
    name: "rheumatology",
    query: `("rheumatic diseases"[MeSH] OR "rheumatoid arthritis" OR "systemic lupus" OR "gout" OR "biologics") AND ("systematic review"[pt] OR "meta-analysis"[pt] OR "practice guideline"[pt] OR "randomized controlled trial"[pt])`,
    priority: 2,
  },
  {
    name: "nephrology",
    query: `("kidney diseases"[MeSH] OR "chronic kidney disease" OR "dialysis" OR "kidney transplantation" OR "acute kidney injury") AND ("systematic review"[pt] OR "meta-analysis"[pt] OR "practice guideline"[pt] OR "randomized controlled trial"[pt])`,
    priority: 2,
  },
  {
    name: "psychiatry",
    query: `("mental disorders"[MeSH] OR "depression" OR "schizophrenia" OR "anxiety disorders" OR "SSRI" OR "bipolar") AND ("systematic review"[pt] OR "meta-analysis"[pt] OR "practice guideline"[pt] OR "randomized controlled trial"[pt])`,
    priority: 2,
  },
  {
    name: "emergency-medicine",
    query: `("emergency medicine"[MeSH] OR "trauma" OR "resuscitation" OR "shock" OR "critical care") AND ("systematic review"[pt] OR "meta-analysis"[pt] OR "practice guideline"[pt] OR "randomized controlled trial"[pt])`,
    priority: 2,
  },
  {
    name: "pediatrics",
    query: `("pediatrics"[MeSH] OR "child"[MeSH] OR "neonatology" OR "infant" OR "adolescent health") AND ("systematic review"[pt] OR "meta-analysis"[pt] OR "practice guideline"[pt] OR "randomized controlled trial"[pt])`,
    priority: 3,
  },
  {
    name: "pharmacology",
    query: `("drug interactions"[MeSH] OR "pharmacokinetics"[MeSH] OR "adverse drug reaction" OR "drug safety" OR "polypharmacy") AND ("systematic review"[pt] OR "meta-analysis"[pt] OR "practice guideline"[pt])`,
    priority: 3,
  },
  {
    name: "surgery",
    query: `("surgical procedures, operative"[MeSH] OR "minimally invasive" OR "robotic surgery" OR "perioperative care") AND ("systematic review"[pt] OR "meta-analysis"[pt] OR "practice guideline"[pt] OR "randomized controlled trial"[pt])`,
    priority: 3,
  },
  {
    name: "hematology",
    query: `("hematologic diseases"[MeSH] OR "anemia" OR "thrombosis" OR "anticoagulants" OR "leukemia" OR "lymphoma") AND ("systematic review"[pt] OR "meta-analysis"[pt] OR "practice guideline"[pt] OR "randomized controlled trial"[pt])`,
    priority: 3,
  },
]

const NCBI_BASE = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils"

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function fetchPmidsForDomain(
  domain: ClinicalDomain,
  maxResults: number,
  fromYear: number,
  apiKey?: string,
): Promise<string[]> {
  const dateFilter = `${fromYear}:3000[dp]`
  const fullQuery = `(${domain.query}) AND ${dateFilter}`

  const url = new URL(`${NCBI_BASE}/esearch.fcgi`)
  url.searchParams.set("db", "pubmed")
  url.searchParams.set("term", fullQuery)
  url.searchParams.set("retmax", String(maxResults))
  url.searchParams.set("retmode", "json")
  url.searchParams.set("sort", "relevance")
  if (apiKey) url.searchParams.set("api_key", apiKey)

  const resp = await fetch(url.toString())
  if (!resp.ok) {
    console.error(`  [${domain.name}] esearch failed: ${resp.status}`)
    return []
  }

  const data = await resp.json()
  return data.esearchresult?.idlist || []
}

async function fetchArticleXml(
  pmids: string[],
  apiKey?: string,
): Promise<string> {
  const url = new URL(`${NCBI_BASE}/efetch.fcgi`)
  url.searchParams.set("db", "pubmed")
  url.searchParams.set("id", pmids.join(","))
  url.searchParams.set("rettype", "xml")
  url.searchParams.set("retmode", "xml")
  if (apiKey) url.searchParams.set("api_key", apiKey)

  const resp = await fetch(url.toString())
  if (!resp.ok) throw new Error(`efetch failed: ${resp.status}`)
  return resp.text()
}

async function main() {
  if (values.help) {
    console.log(`
PubMed Clinical Seed — bulk-seeds medical_evidence with high-evidence articles

Options:
  --dry-run              List domains/PMIDs without ingesting
  --domain <name>        Only process a single domain
  --max-per-domain <N>   Max articles per domain (default: 300)
  --embedding-batch <N>  Embedding batch size (default: 100)
  --from-year <YYYY>     Earliest publication year (default: 2020)
  --help                 Show this help
`)
    process.exit(0)
  }

  const dryRun = values["dry-run"] as boolean
  const maxPerDomain = Number.parseInt(values["max-per-domain"] as string, 10)
  const embeddingBatch = Number.parseInt(values["embedding-batch"] as string, 10)
  const fromYear = Number.parseInt(values["from-year"] as string, 10)
  const singleDomain = values.domain as string | undefined
  const apiKey = process.env.NCBI_API_KEY || undefined

  // Validate env
  if (!dryRun) {
    const missing = ["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "OPENAI_API_KEY"]
      .filter((k) => !process.env[k])
    if (missing.length > 0) {
      console.error(`Missing env vars: ${missing.join(", ")}`)
      process.exit(1)
    }
  }

  const domains = singleDomain
    ? CLINICAL_DOMAINS.filter((d) => d.name === singleDomain)
    : CLINICAL_DOMAINS.sort((a, b) => a.priority - b.priority)

  if (domains.length === 0) {
    console.error(
      `Unknown domain: ${singleDomain}. Available: ${CLINICAL_DOMAINS.map((d) => d.name).join(", ")}`,
    )
    process.exit(1)
  }

  const requestInterval = apiKey ? 340 : 1100

  console.log("=" .repeat(70))
  console.log("  PubMed Clinical Seed")
  console.log("=" .repeat(70))
  console.log(`  Domains: ${domains.length}`)
  console.log(`  Max per domain: ${maxPerDomain}`)
  console.log(`  From year: ${fromYear}`)
  console.log(`  API key: ${apiKey ? "yes" : "no (rate-limited)"}`)
  console.log(`  Mode: ${dryRun ? "DRY RUN" : "LIVE INGESTION"}`)
  console.log()

  // Phase 1: Collect all PMIDs
  const allPmids = new Map<string, string[]>()
  let totalPmids = 0

  for (const domain of domains) {
    console.log(`  [${domain.name}] Searching...`)
    const pmids = await fetchPmidsForDomain(domain, maxPerDomain, fromYear, apiKey)
    allPmids.set(domain.name, pmids)
    totalPmids += pmids.length
    console.log(`  [${domain.name}] Found ${pmids.length} PMIDs`)
    await sleep(requestInterval)
  }

  // Deduplicate globally
  const seen = new Set<string>()
  const dedupedByDomain = new Map<string, string[]>()
  for (const [domain, pmids] of allPmids) {
    const unique = pmids.filter((id) => {
      if (seen.has(id)) return false
      seen.add(id)
      return true
    })
    dedupedByDomain.set(domain, unique)
  }

  const uniqueTotal = seen.size
  console.log(
    `\n  Total: ${totalPmids} PMIDs, ${uniqueTotal} unique (${totalPmids - uniqueTotal} duplicates across domains)\n`,
  )

  if (dryRun) {
    console.log("DRY RUN — exiting without ingestion.")
    for (const [domain, pmids] of dedupedByDomain) {
      console.log(`  ${domain}: ${pmids.length} unique PMIDs`)
    }
    process.exit(0)
  }

  // Phase 2: Filter out existing
  const { getExistingPmids } = await import("../lib/pubmed/storage")
  const allUniqueIds = Array.from(seen)
  console.log(`  Checking ${allUniqueIds.length} PMIDs against existing data...`)
  const existing = await getExistingPmids(allUniqueIds)
  const newPmids = allUniqueIds.filter((id) => !existing.has(id))
  console.log(`  ${existing.size} already indexed, ${newPmids.length} new articles to ingest\n`)

  if (newPmids.length === 0) {
    console.log("  Nothing new to ingest.")
    process.exit(0)
  }

  // Phase 3: Fetch XML, chunk, embed, store
  const { parseEnhancedPubMedXML } = await import("../lib/pubmed/parser")
  const { chunkArticle } = await import("../lib/pubmed/chunking")
  const { generateEmbeddings } = await import("../lib/rag/embeddings")
  const { storeMedicalEvidence } = await import("../lib/pubmed/storage")
  const { postIngestionCacheFlush } = await import("../lib/pubmed/bulk-ingestion")

  let totalArticles = 0
  let totalChunks = 0
  let totalErrors = 0
  const FETCH_BATCH = 50

  for (let i = 0; i < newPmids.length; i += FETCH_BATCH) {
    const batch = newPmids.slice(i, i + FETCH_BATCH)
    const batchNum = Math.floor(i / FETCH_BATCH) + 1
    const totalBatches = Math.ceil(newPmids.length / FETCH_BATCH)

    console.log(
      `  Batch ${batchNum}/${totalBatches}: fetching ${batch.length} articles...`,
    )

    try {
      await sleep(requestInterval)
      const xml = await fetchArticleXml(batch, apiKey)
      const articles = parseEnhancedPubMedXML(xml)

      if (articles.length === 0) {
        console.log(`    No articles parsed in this batch, skipping`)
        continue
      }

      const allChunksInBatch: Array<any> = []

      for (const article of articles) {
        try {
          const chunks = chunkArticle(article, {
            strategy: "hybrid",
            includeTitle: true,
            includeMesh: true,
            includeStudyInfo: true,
          })
          allChunksInBatch.push(...chunks)
          totalArticles++
        } catch (err) {
          console.warn(`    Chunk error PMID ${article.pmid}: ${err}`)
          totalErrors++
        }
      }

      if (allChunksInBatch.length === 0) continue

      // Embed in sub-batches
      for (let j = 0; j < allChunksInBatch.length; j += embeddingBatch) {
        const embBatch = allChunksInBatch.slice(j, j + embeddingBatch)
        const texts = embBatch.map(
          (c: any) => c.contentWithContext || c.content || "",
        )

        try {
          const embeddings = await generateEmbeddings(texts)
          const withEmbeddings = embBatch.map((c: any, idx: number) => ({
            ...c,
            embedding: embeddings[idx],
          }))

          const result = await storeMedicalEvidence(withEmbeddings, {
            batchSize: 20,
          })
          totalChunks += result.stored
          if (result.errors.length > 0) {
            totalErrors += result.errors.length
            console.warn(`    Storage errors: ${result.errors.length}`)
          }
        } catch (err) {
          console.error(`    Embedding/store error: ${err}`)
          totalErrors++
        }
      }

      const pct = Math.round(((i + batch.length) / newPmids.length) * 100)
      console.log(
        `    Progress: ${pct}% | Articles: ${totalArticles} | Chunks: ${totalChunks} | Errors: ${totalErrors}`,
      )
    } catch (err) {
      console.error(`    Batch ${batchNum} failed: ${err}`)
      totalErrors++
    }
  }

  // Phase 4: Flush caches
  console.log("\n  Flushing retrieval caches...")
  await postIngestionCacheFlush()

  console.log("\n" + "=".repeat(70))
  console.log("  Seed Complete")
  console.log("=".repeat(70))
  console.log(`  Articles ingested: ${totalArticles}`)
  console.log(`  Chunks stored: ${totalChunks}`)
  console.log(`  Errors: ${totalErrors}`)
  console.log()
}

main().catch(console.error)

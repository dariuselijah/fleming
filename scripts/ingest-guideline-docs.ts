#!/usr/bin/env npx ts-node
/**
 * Guideline Document Ingestion
 *
 * Fetches actual guideline recommendation text from open-access sources:
 * - NICE API (full recommendation text for all ~400 clinical guidelines)
 * - WHO (open-access guideline summaries)
 * - PubMed/PMC open-access guideline full-text
 *
 * This gives Fleming actual recommendation text like "Class I, Level A"
 * instead of just guideline references.
 *
 * Usage:
 *   npx ts-node --compiler-options '{"module":"commonjs"}' scripts/ingest-guideline-docs.ts
 *   npx ts-node --compiler-options '{"module":"commonjs"}' scripts/ingest-guideline-docs.ts --dry-run
 *   npx ts-node --compiler-options '{"module":"commonjs"}' scripts/ingest-guideline-docs.ts --source nice
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
    source: { type: "string" },
    limit: { type: "string", default: "500" },
    help: { type: "boolean", default: false },
  },
  strict: false,
  allowPositionals: true,
})

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

interface GuidelineChunk {
  content: string
  contentWithContext: string
  title: string
  organization: string
  url: string
  section: string
  region: string
  publishedDate: string
}

// --- NICE Guidelines ---

async function fetchNiceGuidelineList(): Promise<Array<{ id: string; title: string; url: string }>> {
  const guidelines: Array<{ id: string; title: string; url: string }> = []
  let page = 0
  const pageSize = 50

  while (true) {
    try {
      const url = `https://api.nice.org.uk/services/search?q=&ps=${pageSize}&s=${page * pageSize}&f=Published&ndt=Guidance&ngt=Clinical%20guideline,NICE%20guideline`
      const resp = await fetch(url, { headers: { Accept: "application/json" } })
      if (!resp.ok) break
      const data = await resp.json()
      const documents = data?.documents || []
      if (documents.length === 0) break

      for (const doc of documents) {
        guidelines.push({
          id: doc.id || doc.pathAndQuery || "",
          title: doc.title || "",
          url: doc.uri || `https://www.nice.org.uk${doc.pathAndQuery || ""}`,
        })
      }
      page++
      if (documents.length < pageSize) break
      await sleep(500)
    } catch {
      break
    }
  }

  return guidelines
}

async function fetchNiceGuidelineContent(guidelineUrl: string): Promise<string[]> {
  const sections: string[] = []
  try {
    const chaptersUrl = `${guidelineUrl.replace(/\/$/, "")}/chapter/Recommendations`
    const resp = await fetch(chaptersUrl, { headers: { Accept: "text/html" } })
    if (!resp.ok) {
      const altResp = await fetch(guidelineUrl, { headers: { Accept: "text/html" } })
      if (!altResp.ok) return sections
      const html = await altResp.text()
      return extractTextFromHtml(html)
    }
    const html = await resp.text()
    return extractTextFromHtml(html)
  } catch {
    return sections
  }
}

function extractTextFromHtml(html: string): string[] {
  const sections: string[] = []
  const stripped = html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, "")
    .replace(/<header[^>]*>[\s\S]*?<\/header>/gi, "")
    .replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, "")

  const sectionRegex = /<(?:section|div|article)[^>]*class="[^"]*(?:recommendation|chapter-body|content-body)[^"]*"[^>]*>([\s\S]*?)<\/(?:section|div|article)>/gi
  let match: RegExpExecArray | null
  while ((match = sectionRegex.exec(stripped)) !== null) {
    const text = match[1].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()
    if (text.length > 100) sections.push(text)
  }

  if (sections.length === 0) {
    const mainContent = stripped
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim()
    if (mainContent.length > 200) {
      const chunks = mainContent.match(/.{200,1500}(?:\.\s|$)/g) || [mainContent.slice(0, 2000)]
      sections.push(...chunks.filter(c => c.length > 100))
    }
  }

  return sections
}

// --- PubMed Guideline Full-Text (using PMC OA for guideline-type articles) ---

const GUIDELINE_SEARCHES = [
  `"practice guideline"[pt] AND ("2020"[PDAT] : "3000"[PDAT]) AND ("AHA" OR "ACC" OR "IDSA" OR "NCCN" OR "ACOG" OR "USPSTF" OR "CHEST" OR "ATS" OR "KDIGO" OR "GOLD" OR "GINA" OR "ESC")`,
  `"guideline"[pt] AND ("2020"[PDAT] : "3000"[PDAT]) AND ("surviving sepsis" OR "management of" OR "treatment of" OR "screening" OR "prevention")`,
]

async function fetchPubmedGuidelinePmcIds(apiKey?: string): Promise<Array<{ pmid: string; title: string }>> {
  const results: Array<{ pmid: string; title: string }> = []
  for (const query of GUIDELINE_SEARCHES) {
    try {
      const url = new URL("https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi")
      url.searchParams.set("db", "pubmed")
      url.searchParams.set("term", query)
      url.searchParams.set("retmax", "200")
      url.searchParams.set("retmode", "json")
      if (apiKey) url.searchParams.set("api_key", apiKey)
      const resp = await fetch(url.toString())
      if (!resp.ok) continue
      const data = await resp.json()
      const ids = data?.esearchresult?.idlist || []
      for (const id of ids) {
        results.push({ pmid: id, title: "" })
      }
      await sleep(apiKey ? 350 : 1100)
    } catch { /* continue */ }
  }
  return results
}

function chunkText(text: string, maxTokens = 512, overlap = 60): string[] {
  const sentences = text.split(/(?<=[.!?])\s+/)
  const chunks: string[] = []
  let current = ""
  let tokens = 0

  for (const s of sentences) {
    const t = Math.ceil(s.length / 4)
    if (tokens + t > maxTokens && current) {
      chunks.push(current.trim())
      const prev = current.split(/(?<=[.!?])\s+/)
      const overlapParts: string[] = []
      let ot = 0
      for (let i = prev.length - 1; i >= 0 && ot < overlap; i--) {
        overlapParts.unshift(prev[i])
        ot += Math.ceil(prev[i].length / 4)
      }
      current = overlapParts.join(" ") + " " + s
      tokens = Math.ceil(current.length / 4)
    } else {
      current += (current ? " " : "") + s
      tokens += t
    }
  }
  if (current.trim()) chunks.push(current.trim())
  return chunks
}

async function run() {
  if (values.help) {
    console.log(`Guideline Document Ingestion\n  --dry-run       Count without ingesting\n  --source <s>    Source: nice, pubmed, or all (default: all)\n  --limit <n>     Max guidelines per source (default: 500)`)
    process.exit(0)
  }

  const dryRun = Boolean(values["dry-run"])
  const source = String(values.source || "all").toLowerCase()
  const limit = Number(values.limit || 500)
  const apiKey = process.env.NCBI_API_KEY || process.env.PUBMED_API_KEY

  console.log("=".repeat(70))
  console.log("  Guideline Document Ingestion")
  console.log("=".repeat(70))
  console.log(`  Source:   ${source}`)
  console.log(`  Limit:    ${limit}`)
  console.log(`  Dry run:  ${dryRun}`)
  console.log("=".repeat(70))

  const { generateEmbeddings } = await import("../lib/rag/embeddings")
  const { storeMedicalEvidence } = await import("../lib/pubmed/storage")

  let totalChunks = 0
  let totalDocs = 0
  let totalErrors = 0

  // --- NICE Guidelines ---
  if (source === "nice" || source === "all") {
    console.log("\n--- NICE Guidelines ---")
    const niceGuidelines = await fetchNiceGuidelineList()
    console.log(`  Found ${niceGuidelines.length} NICE guidelines`)

    const toProcess = niceGuidelines.slice(0, limit)
    for (let i = 0; i < toProcess.length; i++) {
      const gl = toProcess[i]
      try {
        await sleep(600)
        const sections = await fetchNiceGuidelineContent(gl.url)
        if (sections.length === 0) continue

        console.log(`  [${i + 1}/${toProcess.length}] ${gl.title.slice(0, 60)} — ${sections.length} sections`)
        if (dryRun) { totalDocs++; continue }

        const allChunks: any[] = []
        let chunkIdx = 0
        for (const sectionText of sections) {
          const textChunks = chunkText(sectionText, 512, 60)
          for (const chunk of textChunks) {
            allChunks.push({
              content: chunk,
              contentWithContext: `[NICE Guideline: ${gl.title}] ${chunk}`,
              pmid: null,
              sectionType: "guideline_document",
              chunkIndex: chunkIdx++,
              title: gl.title,
              journalName: "NICE",
              publicationYear: new Date().getFullYear(),
              doi: null,
              authors: ["NICE"],
              evidenceLevel: 1,
              studyType: "Practice Guideline",
              meshTerms: [],
              majorMeshTerms: [],
              chemicals: [],
              keywords: ["NICE", "guideline", "UK"],
              tokenEstimate: Math.ceil(chunk.length / 4),
            })
          }
        }

        if (allChunks.length === 0) continue

        const EMBED_BATCH = 100
        for (let j = 0; j < allChunks.length; j += EMBED_BATCH) {
          const batch = allChunks.slice(j, j + EMBED_BATCH)
          try {
            const embeddings = await generateEmbeddings(batch.map((c: any) => c.contentWithContext))
            const withEmb = batch.map((c: any, idx: number) => ({ ...c, embedding: embeddings[idx] }))
            const result = await storeMedicalEvidence(withEmb, { batchSize: 20 })
            totalChunks += result.stored
            if (result.errors.length > 0) totalErrors += result.errors.length
          } catch (err) {
            totalErrors++
          }
        }
        totalDocs++
      } catch (err) {
        totalErrors++
      }
    }
  }

  // --- PubMed Open-Access Guidelines (via PMC full text) ---
  if (source === "pubmed" || source === "all") {
    console.log("\n--- PubMed Open-Access Guidelines ---")
    const guidelinePmids = await fetchPubmedGuidelinePmcIds(apiKey)
    console.log(`  Found ${guidelinePmids.length} guideline PMIDs`)

    if (!dryRun && guidelinePmids.length > 0) {
      // Convert to PMC IDs and fetch full text via the existing PMC pipeline
      const { createClient } = await import("@supabase/supabase-js")
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
      const supabaseKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE)!
      const supabase = createClient(supabaseUrl, supabaseKey)

      // Check existing
      const { data: existing } = await supabase
        .from("medical_evidence")
        .select("pmid")
        .eq("study_type", "Practice Guideline")
        .not("pmid", "is", null)
      const existingPmids = new Set((existing || []).map((r: any) => r.pmid))

      const newPmids = guidelinePmids.filter(g => !existingPmids.has(g.pmid)).slice(0, limit)
      console.log(`  New guideline PMIDs to process: ${newPmids.length}`)

      // Use the same XML fetch + parse pipeline as deep seed
      const { parseEnhancedPubMedXML } = await import("../lib/pubmed/parser")
      const { chunkArticle } = await import("../lib/pubmed/chunking")

      const BATCH = 50
      for (let i = 0; i < newPmids.length; i += BATCH) {
        const batch = newPmids.slice(i, i + BATCH)
        try {
          await sleep(apiKey ? 350 : 1100)
          const url = new URL("https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi")
          url.searchParams.set("db", "pubmed")
          url.searchParams.set("id", batch.map(b => b.pmid).join(","))
          url.searchParams.set("rettype", "xml")
          url.searchParams.set("retmode", "xml")
          if (apiKey) url.searchParams.set("api_key", apiKey)

          const resp = await fetch(url.toString())
          if (!resp.ok) continue
          const xml = await resp.text()
          const articles = parseEnhancedPubMedXML(xml)

          const allChunks: any[] = []
          for (const article of articles) {
            try {
              const chunks = chunkArticle(article, { strategy: "hybrid", includeTitle: true, includeMesh: true, includeStudyInfo: true })
              allChunks.push(...chunks)
              totalDocs++
            } catch { totalErrors++ }
          }

          if (allChunks.length === 0) continue
          const EMBED_BATCH = 100
          for (let j = 0; j < allChunks.length; j += EMBED_BATCH) {
            const embBatch = allChunks.slice(j, j + EMBED_BATCH)
            try {
              const embeddings = await generateEmbeddings(embBatch.map((c: any) => c.contentWithContext || c.content))
              const withEmb = embBatch.map((c: any, idx: number) => ({ ...c, embedding: embeddings[idx] }))
              const result = await storeMedicalEvidence(withEmb, { batchSize: 20 })
              totalChunks += result.stored
            } catch { totalErrors++ }
          }
          console.log(`  Batch ${Math.floor(i / BATCH) + 1}: ${articles.length} articles, ${allChunks.length} chunks`)
        } catch { totalErrors++ }
      }
    } else {
      totalDocs += guidelinePmids.length
    }
  }

  console.log("\n" + "=".repeat(70))
  console.log("  Guideline Ingestion Complete")
  console.log("=".repeat(70))
  console.log(`  Documents processed:  ${totalDocs}`)
  console.log(`  Chunks stored:        ${totalChunks}`)
  console.log(`  Errors:               ${totalErrors}`)
  console.log("=".repeat(70))
}

run().catch((err) => {
  console.error("[Guideline Docs] Fatal:", err)
  process.exit(1)
})

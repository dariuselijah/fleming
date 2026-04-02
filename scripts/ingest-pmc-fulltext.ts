#!/usr/bin/env npx ts-node
/**
 * PMC Full-Text Ingestion
 *
 * Fetches full-text bodies from PubMed Central for articles that have a PMC ID
 * in our medical_evidence corpus. Chunks by IMRAD section, embeds, and stores.
 *
 * This is THE single biggest differentiator vs OpenEvidence (which is abstract-only).
 *
 * Usage:
 *   npx ts-node --compiler-options '{"module":"commonjs"}' scripts/ingest-pmc-fulltext.ts
 *   npx ts-node --compiler-options '{"module":"commonjs"}' scripts/ingest-pmc-fulltext.ts --dry-run
 *   npx ts-node --compiler-options '{"module":"commonjs"}' scripts/ingest-pmc-fulltext.ts --limit 500
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
    limit: { type: "string", default: "5000" },
    "batch-size": { type: "string", default: "10" },
    help: { type: "boolean", default: false },
  },
  strict: false,
  allowPositionals: true,
})

const PMC_BIOC_BASE = "https://www.ncbi.nlm.nih.gov/research/biorxiv/RESTful/pmcoa.cgi/BioC_json"
const PMC_OA_BASE = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi"

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

interface FullTextSection {
  type: "introduction" | "methods" | "results" | "discussion" | "conclusion" | "other"
  heading: string
  text: string
}

function classifySection(heading: string): FullTextSection["type"] {
  const h = heading.toLowerCase()
  if (/\bintroduction\b|\bbackground\b/.test(h)) return "introduction"
  if (/\bmethod\b|\bmaterial\b|\bprocedure\b|\bprotocol\b/.test(h)) return "methods"
  if (/\bresult\b|\bfinding\b|\boutcome\b/.test(h)) return "results"
  if (/\bdiscussion\b|\bimplication\b|\binterpretation\b/.test(h)) return "discussion"
  if (/\bconclusion\b|\bsummary\b/.test(h)) return "conclusion"
  return "other"
}

function parseBioCJson(json: any): FullTextSection[] {
  const sections: FullTextSection[] = []
  try {
    const documents = json?.documents || json?.collection?.documents || [json]
    for (const doc of documents) {
      const passages = doc?.passages || []
      let currentHeading = ""
      let currentText = ""
      let currentType: FullTextSection["type"] = "other"

      for (const passage of passages) {
        const section = passage?.infons?.section_type || passage?.infons?.type || ""
        const text = passage?.text || ""
        if (!text.trim()) continue

        if (section.toLowerCase() === "title" || section.toLowerCase() === "front") continue
        if (section.toLowerCase() === "ref" || section.toLowerCase() === "back") continue

        const heading = passage?.infons?.section || passage?.infons?.title_1 || section
        const sectionType = classifySection(heading || section)

        if (heading !== currentHeading && currentText.trim()) {
          sections.push({ type: currentType, heading: currentHeading, text: currentText.trim() })
          currentText = ""
        }
        currentHeading = heading || section
        currentType = sectionType
        currentText += " " + text
      }
      if (currentText.trim()) {
        sections.push({ type: currentType, heading: currentHeading, text: currentText.trim() })
      }
    }
  } catch { /* parse error, return what we have */ }
  return sections
}

async function fetchPmcFullText(pmcid: string): Promise<FullTextSection[]> {
  const cleanId = pmcid.replace(/^PMC/i, "")

  // Try BioC JSON first (structured)
  try {
    const biocUrl = `${PMC_BIOC_BASE}/PMC${cleanId}/unicode`
    const resp = await fetch(biocUrl)
    if (resp.ok) {
      const json = await resp.json()
      const sections = parseBioCJson(json)
      if (sections.length > 0) return sections
    }
  } catch { /* fall through */ }

  // Fallback: efetch plain text
  try {
    const url = new URL(PMC_OA_BASE)
    url.searchParams.set("db", "pmc")
    url.searchParams.set("id", `PMC${cleanId}`)
    url.searchParams.set("rettype", "xml")
    url.searchParams.set("retmode", "xml")
    const apiKey = process.env.NCBI_API_KEY || process.env.PUBMED_API_KEY
    if (apiKey) url.searchParams.set("api_key", apiKey)

    const resp = await fetch(url.toString())
    if (!resp.ok) return []
    const xml = await resp.text()

    return parseXmlSections(xml)
  } catch {
    return []
  }
}

function parseXmlSections(xml: string): FullTextSection[] {
  const sections: FullTextSection[] = []
  const bodyMatch = xml.match(/<body[^>]*>([\s\S]*?)<\/body>/i)
  if (!bodyMatch) return sections

  const body = bodyMatch[1]
  const secRegex = /<sec[^>]*>[\s\S]*?<title[^>]*>([\s\S]*?)<\/title>([\s\S]*?)<\/sec>/gi
  let match: RegExpExecArray | null

  while ((match = secRegex.exec(body)) !== null) {
    const heading = match[1].replace(/<[^>]+>/g, "").trim()
    const content = match[2]
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim()
    if (content.length > 100) {
      sections.push({
        type: classifySection(heading),
        heading,
        text: content,
      })
    }
  }

  if (sections.length === 0) {
    const plainBody = body.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()
    if (plainBody.length > 200) {
      sections.push({ type: "other", heading: "Full Text", text: plainBody })
    }
  }

  return sections
}

function chunkSectionText(text: string, maxTokens = 512, overlapTokens = 60): string[] {
  const sentences = text.split(/(?<=[.!?])\s+/)
  const chunks: string[] = []
  let current = ""
  let currentTokens = 0

  for (const sentence of sentences) {
    const sentenceTokens = Math.ceil(sentence.length / 4)
    if (currentTokens + sentenceTokens > maxTokens && current.trim()) {
      chunks.push(current.trim())
      const overlapSentences = current.split(/(?<=[.!?])\s+/)
      const overlapText: string[] = []
      let overlapCount = 0
      for (let i = overlapSentences.length - 1; i >= 0 && overlapCount < overlapTokens; i--) {
        overlapText.unshift(overlapSentences[i])
        overlapCount += Math.ceil(overlapSentences[i].length / 4)
      }
      current = overlapText.join(" ") + " " + sentence
      currentTokens = Math.ceil(current.length / 4)
    } else {
      current += (current ? " " : "") + sentence
      currentTokens += sentenceTokens
    }
  }
  if (current.trim()) chunks.push(current.trim())
  return chunks
}

async function run() {
  if (values.help) {
    console.log(`PMC Full-Text Ingestion\n  --dry-run       Count eligible articles\n  --limit <n>     Max articles to process (default: 5000)\n  --batch-size    Articles per fetch batch (default: 10)`)
    process.exit(0)
  }

  const dryRun = Boolean(values["dry-run"])
  const limit = Number(values.limit || 5000)
  const batchSize = Number(values["batch-size"] || 10)

  console.log("=".repeat(70))
  console.log("  PMC Full-Text Ingestion")
  console.log("=".repeat(70))
  console.log(`  Dry run:    ${dryRun}`)
  console.log(`  Limit:      ${limit}`)
  console.log("=".repeat(70))

  const { generateEmbeddings } = await import("../lib/rag/embeddings")
  const { storeMedicalEvidence } = await import("../lib/pubmed/storage")
  const { createClient } = await import("@supabase/supabase-js")

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const supabaseKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE)!
  const supabase = createClient(supabaseUrl, supabaseKey)

  // Find articles with PMC IDs that don't yet have full-text chunks
  const { data: articlesWithPmc, error } = await supabase
    .from("medical_evidence")
    .select("pmid, title, journal_name, publication_year, doi, authors, evidence_level, study_type, mesh_terms, major_mesh_terms, chemicals, section_type")
    .not("pmid", "is", null)
    .eq("chunk_index", 0) // only get first chunk per article
    .limit(10000)

  if (error) {
    console.error("Failed to query articles:", error.message)
    process.exit(1)
  }

  // We need to find PMC IDs. They're not in our DB schema directly, so we'll
  // use the NCBI ID converter API to batch-convert PMIDs to PMCIDs
  const allPmids = (articlesWithPmc || [])
    .map((r: any) => r.pmid)
    .filter(Boolean) as string[]
  const uniquePmids = [...new Set(allPmids)]
  console.log(`  Articles in corpus: ${uniquePmids.length}`)

  // Check which already have full-text chunks
  const { data: existingFullText } = await supabase
    .from("medical_evidence")
    .select("pmid")
    .like("section_type", "full_text_%")
    .not("pmid", "is", null)
  const existingFullTextPmids = new Set((existingFullText || []).map((r: any) => r.pmid))
  console.log(`  Already have full-text: ${existingFullTextPmids.size}`)

  const candidatePmids = uniquePmids.filter((p) => !existingFullTextPmids.has(p)).slice(0, limit)
  console.log(`  Candidates for full-text: ${candidatePmids.length}`)

  if (candidatePmids.length === 0 || dryRun) {
    console.log("  Done.")
    process.exit(0)
  }

  // Batch convert PMIDs to PMCIDs via NCBI ID converter
  const pmidToPmc = new Map<string, string>()
  const CONVERTER_BATCH = 200
  const apiKey = process.env.NCBI_API_KEY || process.env.PUBMED_API_KEY

  for (let i = 0; i < candidatePmids.length; i += CONVERTER_BATCH) {
    const batch = candidatePmids.slice(i, i + CONVERTER_BATCH)
    try {
      const url = `https://www.ncbi.nlm.nih.gov/pmc/utils/idconv/v1.0/?ids=${batch.join(",")}&format=json${apiKey ? `&api_key=${apiKey}` : ""}`
      const resp = await fetch(url)
      if (resp.ok) {
        const data = await resp.json()
        for (const record of data?.records || []) {
          if (record.pmcid && record.pmid) {
            pmidToPmc.set(record.pmid, record.pmcid)
          }
        }
      }
      await sleep(apiKey ? 350 : 1100)
    } catch (err) {
      console.warn(`  ID converter batch error: ${err instanceof Error ? err.message : err}`)
    }
  }

  console.log(`  PMIDs with PMC OA: ${pmidToPmc.size}`)

  // Process full-text articles
  let totalChunks = 0
  let totalArticles = 0
  let totalErrors = 0
  const pmcEntries = [...pmidToPmc.entries()]

  for (let i = 0; i < pmcEntries.length; i += batchSize) {
    const batch = pmcEntries.slice(i, i + batchSize)
    const batchNum = Math.floor(i / batchSize) + 1
    const totalBatches = Math.ceil(pmcEntries.length / batchSize)
    console.log(`\n  Batch ${batchNum}/${totalBatches}`)

    for (const [pmid, pmcid] of batch) {
      try {
        await sleep(350)
        const sections = await fetchPmcFullText(pmcid)
        if (sections.length === 0) continue

        // Get article metadata from our DB
        const article = (articlesWithPmc || []).find((a: any) => a.pmid === pmid) as any
        if (!article) continue

        const allChunks: any[] = []
        let chunkIdx = 1000 // offset from abstract chunks

        for (const section of sections) {
          if (section.text.length < 100) continue
          const textChunks = chunkSectionText(section.text, 512, 60)

          for (const chunkText of textChunks) {
            const contextPrefix = `[${article.title}] [${section.heading}] `
            allChunks.push({
              content: chunkText,
              contentWithContext: contextPrefix + chunkText,
              pmid: article.pmid,
              sectionType: `full_text_${section.type}`,
              chunkIndex: chunkIdx++,
              title: article.title,
              journalName: article.journal_name,
              publicationYear: article.publication_year,
              doi: article.doi,
              authors: article.authors || [],
              evidenceLevel: article.evidence_level,
              studyType: article.study_type,
              meshTerms: article.mesh_terms || [],
              majorMeshTerms: article.major_mesh_terms || [],
              chemicals: article.chemicals || [],
              keywords: [],
              tokenEstimate: Math.ceil(chunkText.length / 4),
            })
          }
        }

        if (allChunks.length === 0) continue

        // Embed and store
        const EMBED_BATCH = 100
        for (let j = 0; j < allChunks.length; j += EMBED_BATCH) {
          const embBatch = allChunks.slice(j, j + EMBED_BATCH)
          const texts = embBatch.map((c: any) => c.contentWithContext)
          try {
            const embeddings = await generateEmbeddings(texts)
            const withEmb = embBatch.map((c: any, idx: number) => ({
              ...c,
              embedding: embeddings[idx],
            }))
            const result = await storeMedicalEvidence(withEmb, { batchSize: 20 })
            totalChunks += result.stored
            if (result.errors.length > 0) totalErrors += result.errors.length
          } catch (err) {
            totalErrors++
            console.error(`    Embed error: ${err instanceof Error ? err.message : err}`)
          }
        }

        totalArticles++
        console.log(`    [${pmcid}] ${allChunks.length} full-text chunks`)
      } catch (err) {
        totalErrors++
      }
    }
  }

  console.log("\n" + "=".repeat(70))
  console.log("  PMC Full-Text Ingestion Complete")
  console.log("=".repeat(70))
  console.log(`  Articles with full-text: ${totalArticles}`)
  console.log(`  Full-text chunks stored: ${totalChunks}`)
  console.log(`  Errors:                  ${totalErrors}`)
  console.log("=".repeat(70))
}

run().catch((err) => {
  console.error("[PMC Full-Text] Fatal:", err)
  process.exit(1)
})

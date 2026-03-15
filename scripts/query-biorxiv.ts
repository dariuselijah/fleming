#!/usr/bin/env npx ts-node

import { setTimeout as sleep } from "node:timers/promises"

type ApiPaper = {
  doi?: string
  title?: string
  authors?: string
  date?: string
  abstract?: string
  category?: string
  server?: string
}

type ApiResponse = {
  messages?: Array<{ status?: string }>
  collection?: ApiPaper[]
}

type ScoredPaper = {
  paper: ApiPaper & { server: string }
  score: number
}

const API_BASE = "https://api.biorxiv.org"
const PAGE_SIZE = 100

function parseArg(name: string, fallback?: string): string | undefined {
  const prefix = `--${name}=`
  const found = process.argv.find((arg) => arg.startsWith(prefix))
  if (found) return found.slice(prefix.length)
  return fallback
}

function parseIntArg(name: string, fallback: number): number {
  const raw = parseArg(name)
  const parsed = Number.parseInt(raw || "", 10)
  return Number.isFinite(parsed) ? parsed : fallback
}

function parseServersArg(raw: string): Array<"biorxiv" | "medrxiv"> {
  const values = raw
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean)

  const accepted = new Set<"biorxiv" | "medrxiv">()
  for (const value of values) {
    if (value === "biorxiv" || value === "medrxiv") accepted.add(value)
  }

  if (accepted.size === 0) return ["biorxiv", "medrxiv"]
  return Array.from(accepted)
}

function toDateRange(daysBack: number): { startDate: string; endDate: string } {
  const end = new Date()
  const start = new Date()
  start.setDate(start.getDate() - daysBack)
  return {
    startDate: start.toISOString().slice(0, 10),
    endDate: end.toISOString().slice(0, 10),
  }
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((token) => token.length > 1)
}

function scoreRelevance(query: string, title: string, abstract: string): number {
  const normalizedQuery = query.trim().toLowerCase()
  if (!normalizedQuery) return 0

  const queryTokens = new Set(tokenize(normalizedQuery))
  if (queryTokens.size === 0) return 0

  const titleLower = title.toLowerCase()
  const abstractLower = abstract.toLowerCase()
  const titleTokens = new Set(tokenize(titleLower))
  const abstractTokens = new Set(tokenize(abstractLower))

  let tokenScore = 0
  for (const token of queryTokens) {
    if (titleTokens.has(token)) tokenScore += 2
    else if (abstractTokens.has(token)) tokenScore += 1
  }

  // Boost exact phrase and broad substring matches so natural-language queries are less brittle.
  let boost = 0
  if (titleLower.includes(normalizedQuery)) boost += 0.5
  if (abstractLower.includes(normalizedQuery)) boost += 0.25

  return tokenScore / queryTokens.size + boost
}

function paperUrl(paper: ApiPaper, server: string): string {
  const doi = paper.doi?.trim()
  if (doi) return `https://doi.org/${doi}`
  return server === "medrxiv" ? "https://www.medrxiv.org" : "https://www.biorxiv.org"
}

async function fetchWithTimeout(url: string, timeoutMs: number): Promise<Response> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(url, {
      signal: controller.signal,
      headers: { Accept: "application/json" },
    })
  } finally {
    clearTimeout(timeout)
  }
}

async function fetchDetailsPage(
  server: "biorxiv" | "medrxiv",
  startDate: string,
  endDate: string,
  cursor: number,
  timeoutMs: number
): Promise<ApiResponse> {
  const url = `${API_BASE}/details/${server}/${startDate}/${endDate}/${cursor}/json`
  const response = await fetchWithTimeout(url, timeoutMs)
  if (!response.ok) {
    throw new Error(`Request failed (${server}, cursor=${cursor}): ${response.status} ${response.statusText}`)
  }
  return (await response.json()) as ApiResponse
}

function printUsage() {
  console.log("Usage:")
  console.log(
    "  npx ts-node --compiler-options '{\"module\":\"commonjs\"}' scripts/query-biorxiv.ts --query=\"glioblastoma immunotherapy\""
  )
  console.log("")
  console.log("Flags:")
  console.log("  --query=<text>         Query text to rank/filter papers")
  console.log("  --days=<int>           Date window in days (default: 180)")
  console.log("  --pages=<int>          Pages per server, 100 papers per page (default: 5)")
  console.log("  --servers=<csv>        biorxiv,medrxiv (default: both)")
  console.log("  --maxResults=<int>     Number of results to print (default: 10)")
  console.log("  --timeoutMs=<int>      Per-request timeout ms (default: 10000)")
  console.log("  --minScore=<float>     Minimum relevance score (default: 0.2)")
}

async function main() {
  if (process.argv.includes("--help")) {
    printUsage()
    return
  }

  const query = parseArg("query", "") || ""
  const days = Math.max(1, parseIntArg("days", 180))
  const pages = Math.max(1, parseIntArg("pages", 5))
  const maxResults = Math.max(1, parseIntArg("maxResults", 10))
  const timeoutMs = Math.max(500, parseIntArg("timeoutMs", 10_000))
  const minScoreRaw = Number.parseFloat(parseArg("minScore", "0.2") || "0.2")
  const minScore = Number.isFinite(minScoreRaw) ? minScoreRaw : 0.2
  const servers = parseServersArg(parseArg("servers", "biorxiv,medrxiv") || "biorxiv,medrxiv")

  const { startDate, endDate } = toDateRange(days)

  console.log("bioRxiv Query Diagnostic")
  console.log(`query="${query}"`)
  console.log(`dateRange=${startDate}..${endDate} days=${days}`)
  console.log(`servers=${servers.join(",")} pagesPerServer=${pages} timeoutMs=${timeoutMs}`)
  console.log("")

  const papers: Array<ApiPaper & { server: string }> = []
  const warnings: string[] = []
  let requests = 0

  for (const server of servers) {
    for (let page = 0; page < pages; page += 1) {
      const cursor = page * PAGE_SIZE
      requests += 1
      try {
        const payload = await fetchDetailsPage(server, startDate, endDate, cursor, timeoutMs)
        const rows = payload.collection || []
        for (const row of rows) {
          papers.push({ ...row, server })
        }
        if (rows.length < PAGE_SIZE) break
        await sleep(125)
      } catch (error) {
        warnings.push(error instanceof Error ? error.message : String(error))
        break
      }
    }
  }

  const scored: ScoredPaper[] = papers
    .map((paper) => {
      const title = paper.title || ""
      const abstract = paper.abstract || ""
      const score = query.trim() ? scoreRelevance(query, title, abstract) : 1
      return { paper, score }
    })
    .filter(({ score }) => score >= minScore)
    .sort((a, b) => b.score - a.score)

  console.log("Diagnostics")
  console.log(`requests=${requests}`)
  console.log(`papersFetched=${papers.length}`)
  console.log(`papersMatched=${scored.length} minScore=${minScore}`)
  if (warnings.length > 0) {
    console.log("warnings:")
    warnings.forEach((warning, index) => {
      console.log(`  ${index + 1}. ${warning}`)
    })
  } else {
    console.log("warnings: none")
  }
  console.log("")

  const top = scored.slice(0, maxResults)
  if (top.length === 0) {
    console.log("No matching papers found. Try increasing --days/--pages or lowering --minScore.")
    process.exitCode = 1
    return
  }

  console.log(`Top ${top.length} results`)
  top.forEach(({ paper, score }, index) => {
    const title = (paper.title || "Untitled").replace(/\s+/g, " ").trim()
    const abstract = (paper.abstract || "").replace(/\s+/g, " ").trim()
    const snippet = abstract.length > 240 ? `${abstract.slice(0, 240)}...` : abstract
    const date = paper.date?.slice(0, 10) || "unknown-date"
    const url = paperUrl(paper, paper.server)
    console.log(`${index + 1}. [${paper.server}] ${title}`)
    console.log(`   score=${score.toFixed(2)} date=${date} doi=${paper.doi || "n/a"}`)
    console.log(`   url=${url}`)
    if (snippet) console.log(`   snippet=${snippet}`)
  })
}

main().catch((error) => {
  console.error("Failed to run bioRxiv query script.")
  console.error(error)
  process.exit(1)
})

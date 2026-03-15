#!/usr/bin/env npx ts-node

import { config } from "dotenv"
import { existsSync } from "node:fs"
import { resolve } from "node:path"
import Exa from "exa-js"
import { searchWeb, type LiveCrawlMode } from "../lib/web-search"

function loadEnv() {
  const envLocalPath = resolve(process.cwd(), ".env.local")
  const envPath = resolve(process.cwd(), ".env")
  if (existsSync(envLocalPath)) config({ path: envLocalPath })
  if (existsSync(envPath)) config({ path: envPath })
}

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

async function runRawExaSmokeTest(query: string, timeoutMs: number, maxResults: number) {
  const apiKey = process.env.EXA_API_KEY
  if (!apiKey) {
    return {
      ok: false,
      message: "EXA_API_KEY is missing; skipping raw Exa smoke test.",
      elapsedMs: 0,
      resultCount: 0,
    }
  }

  const exa = new Exa(apiKey)
  const started = Date.now()
  try {
    const response = (await Promise.race([
      exa.searchAndContents(query, {
        numResults: Math.max(maxResults, 1),
        text: true,
        livecrawl: "preferred",
      }) as Promise<{ results?: unknown[] }>,
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error(`Raw Exa timeout after ${timeoutMs}ms`)), timeoutMs)
      ),
    ])) as { results?: unknown[] }
    const rows = Array.isArray(response.results) ? response.results : []
    return {
      ok: true,
      message: "Raw Exa call succeeded.",
      elapsedMs: Date.now() - started,
      resultCount: rows.length,
    }
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "Raw Exa call failed.",
      elapsedMs: Date.now() - started,
      resultCount: 0,
    }
  }
}

async function main() {
  loadEnv()

  const query =
    parseArg("query", "Latest RCTs on SGLT2 inhibitors in heart failure with preserved ejection fraction") ||
    ""
  const timeoutMs = parseIntArg("timeout", 15000)
  const retries = parseIntArg("retries", 1)
  const maxResults = parseIntArg("maxResults", 6)
  const medicalOnly = (parseArg("medicalOnly", "true") || "true").toLowerCase() !== "false"
  const liveCrawl = (parseArg("liveCrawl", "preferred") || "preferred") as LiveCrawlMode

  console.log("=== Exa Web Search Diagnostic ===")
  console.log(`query=${query}`)
  console.log(
    `timeoutMs=${timeoutMs} retries=${retries} maxResults=${maxResults} medicalOnly=${medicalOnly} liveCrawl=${liveCrawl}`
  )
  console.log(`EXA_API_KEY=${process.env.EXA_API_KEY ? "present" : "missing"}`)

  const raw = await runRawExaSmokeTest(query, timeoutMs, maxResults)
  console.log("\n[1/2] Raw Exa SDK smoke test")
  console.log(`ok=${raw.ok} elapsedMs=${raw.elapsedMs} resultCount=${raw.resultCount}`)
  console.log(`message=${raw.message}`)

  console.log("\n[2/2] App searchWeb(...) test")
  const web = await searchWeb(query, {
    timeoutMs,
    retries,
    maxResults,
    medicalOnly,
    liveCrawl,
  })
  console.log(
    `results=${web.results.length} elapsedMs=${web.metrics.elapsedMs} retriesUsed=${web.metrics.retriesUsed} cacheHit=${web.metrics.cacheHit}`
  )
  if (web.warnings.length > 0) {
    console.log("warnings:")
    web.warnings.forEach((warning, idx) => console.log(`  ${idx + 1}. ${warning}`))
  } else {
    console.log("warnings: none")
  }

  if (web.results.length > 0) {
    console.log("\nTop results:")
    web.results.slice(0, 5).forEach((row, idx) => {
      console.log(`  ${idx + 1}. ${row.title}`)
      console.log(`     ${row.url}`)
    })
  }

  if (!raw.ok || web.results.length === 0) {
    process.exitCode = 1
  }
}

main().catch((error) => {
  console.error("Diagnostic failed:", error)
  process.exit(1)
})

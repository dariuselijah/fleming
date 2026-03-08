#!/usr/bin/env npx ts-node

import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { dirname, resolve } from "node:path"

type ProviderKey = "xai" | "openai" | "anthropic" | "google"

const EXPECTED_PROVIDER_MODELS: Record<ProviderKey, string[]> = {
  xai: ["fleming-4", "grok-4-1-fast-reasoning"],
  openai: ["gpt-5.4", "gpt-5.2"],
  anthropic: ["claude-opus-4-6", "claude-sonnet-4-6", "claude-haiku-4-5"],
  google: [
    "gemini-2.5-flash",
    "gemini-2.5-pro",
    "gemini-3.1-pro-preview",
    "gemini-3-flash-preview",
    "gemini-3.1-flash-lite-preview",
  ],
}

const MODEL_FILES: Record<ProviderKey, string> = {
  xai: "lib/models/data/grok.ts",
  openai: "lib/models/data/openai.ts",
  anthropic: "lib/models/data/claude.ts",
  google: "lib/models/data/gemini.ts",
}

const REFERENCE_URLS: Record<ProviderKey, string[]> = {
  xai: [
    "https://docs.x.ai/docs/models?cluster=us-west-1",
    "https://docs.x.ai/docs/release-notes",
  ],
  openai: [
    "https://developers.openai.com/api/docs/models/gpt-5.4",
    "https://developers.openai.com/api/docs/models/gpt-5.2",
  ],
  anthropic: [
    "https://docs.anthropic.com/en/release-notes/overview",
    "https://www.anthropic.com/news/claude-sonnet-4-6",
  ],
  google: [
    "https://ai.google.dev/gemini-api/docs/changelog",
    "https://ai.google.dev/gemini-api/docs/models",
  ],
}

function collectModelIdsFromFile(content: string): Set<string> {
  const ids = new Set<string>()
  const regex = /id:\s*"([^"]+)"/g
  let match: RegExpExecArray | null = regex.exec(content)
  while (match) {
    if (match[1]) ids.add(match[1])
    match = regex.exec(content)
  }
  return ids
}

async function checkReferenceUrls(urls: string[]): Promise<
  Array<{
    url: string
    reachable: boolean
    status: number | null
    error: string | null
  }>
> {
  return Promise.all(
    urls.map(async (url) => {
      try {
        const response = await fetch(url, { method: "GET" })
        return {
          url,
          reachable: response.ok,
          status: response.status,
          error: null,
        }
      } catch (error) {
        return {
          url,
          reachable: false,
          status: null,
          error: error instanceof Error ? error.message : "Request failed",
        }
      }
    })
  )
}

async function main() {
  const workspaceRoot = process.cwd()
  const report: {
    generatedAt: string
    providerChecks: Record<
      ProviderKey,
      {
        expectedModels: string[]
        missingModels: string[]
        referenceUrls: Array<{
          url: string
          reachable: boolean
          status: number | null
          error: string | null
        }>
      }
    >
  } = {
    generatedAt: new Date().toISOString(),
    providerChecks: {
      xai: { expectedModels: [], missingModels: [], referenceUrls: [] },
      openai: { expectedModels: [], missingModels: [], referenceUrls: [] },
      anthropic: { expectedModels: [], missingModels: [], referenceUrls: [] },
      google: { expectedModels: [], missingModels: [], referenceUrls: [] },
    },
  }

  let hasMissing = false

  for (const provider of Object.keys(EXPECTED_PROVIDER_MODELS) as ProviderKey[]) {
    const filePath = resolve(workspaceRoot, MODEL_FILES[provider])
    const content = readFileSync(filePath, "utf8")
    const existingIds = collectModelIdsFromFile(content)
    const expected = EXPECTED_PROVIDER_MODELS[provider]
    const missingModels = expected.filter((modelId) => !existingIds.has(modelId))

    if (missingModels.length > 0) {
      hasMissing = true
    }

    const referenceUrls = await checkReferenceUrls(REFERENCE_URLS[provider])
    report.providerChecks[provider] = {
      expectedModels: expected,
      missingModels,
      referenceUrls,
    }
  }

  const outputPath = resolve(
    workspaceRoot,
    "data/eval/frontier-model-refresh-report.json"
  )
  mkdirSync(dirname(outputPath), { recursive: true })
  writeFileSync(outputPath, JSON.stringify(report, null, 2), "utf8")

  console.log("\nFrontier model refresh report generated:")
  console.log(`- ${outputPath}`)

  for (const provider of Object.keys(report.providerChecks) as ProviderKey[]) {
    const providerReport = report.providerChecks[provider]
    const missingText =
      providerReport.missingModels.length === 0
        ? "none"
        : providerReport.missingModels.join(", ")
    console.log(`- ${provider}: missing model IDs -> ${missingText}`)
  }

  if (hasMissing) {
    process.exitCode = 1
  }
}

main().catch((error) => {
  console.error("Failed to refresh frontier models:", error)
  process.exit(1)
})

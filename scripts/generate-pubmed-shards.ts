#!/usr/bin/env npx ts-node

import fs from "node:fs"
import path from "node:path"
import { parseArgs } from "node:util"

type BuildConfig = {
  inputFiles: string[]
  outputDir: string
  shardCount: number
  shardPrefix: string
  runPrefix: string
  workersPerShard: number
  maxPerTopic: number
  fromYear: number
  highEvidence: boolean
}

function resolveProjectPath(relativePath: string): string {
  return path.resolve(process.cwd(), relativePath)
}

function readTopics(filePath: string): string[] {
  const absolutePath = resolveProjectPath(filePath)
  if (!fs.existsSync(absolutePath)) {
    throw new Error(`Input file not found: ${filePath}`)
  }
  return fs
    .readFileSync(absolutePath, "utf-8")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
}

function uniqueTopics(topics: string[]): string[] {
  return Array.from(new Set(topics.map((topic) => topic.trim()).filter(Boolean)))
}

function distributeRoundRobin(topics: string[], shardCount: number): string[][] {
  const shards: string[][] = Array.from({ length: shardCount }, () => [])
  topics.forEach((topic, index) => {
    const shardIndex = index % shardCount
    shards[shardIndex].push(topic)
  })
  return shards
}

function writeShardFiles(outputDir: string, shardPrefix: string, shards: string[][]): string[] {
  fs.mkdirSync(outputDir, { recursive: true })
  return shards.map((topics, index) => {
    const fileName = `${shardPrefix}_${String(index + 1).padStart(2, "0")}.txt`
    const absolutePath = path.join(outputDir, fileName)
    fs.writeFileSync(absolutePath, `${topics.join("\n")}\n`)
    return absolutePath
  })
}

function writeCommandPack(
  outputDir: string,
  runPrefix: string,
  shardPaths: string[],
  config: BuildConfig
) {
  const commandLines = shardPaths.map((absolutePath, index) => {
    const relativePath = path.relative(process.cwd(), absolutePath)
    const checkpointFile = `${runPrefix}-checkpoint-${String(index + 1).padStart(2, "0")}.json`
    const highEvidenceFlag = config.highEvidence ? " --high-evidence" : ""
    return `npm run ingest:scale -- --topics-file ${relativePath} --workers ${config.workersPerShard} --max-per-topic ${config.maxPerTopic} --from-year ${config.fromYear}${highEvidenceFlag} --checkpoint ${checkpointFile}`
  })

  const commandsPath = path.join(outputDir, "commands.sh")
  const content = [
    "#!/usr/bin/env bash",
    "set -euo pipefail",
    "",
    "# Generated PubMed shard command pack",
    "# Launch each line in a separate terminal/session for maximum parallelism.",
    "",
    ...commandLines,
    "",
  ].join("\n")
  fs.writeFileSync(commandsPath, content)
  fs.chmodSync(commandsPath, 0o755)

  const launchPath = path.join(outputDir, "launch_parallel.sh")
  const launchScript = [
    "#!/usr/bin/env bash",
    "set -euo pipefail",
    "",
    'PARALLEL_JOBS="${1:-12}"',
    'SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"',
    "",
    '# Runs each command from commands.sh in parallel.',
    'grep -v "^#" "${SCRIPT_DIR}/commands.sh" | sed "/^$/d" | xargs -I{} -P "${PARALLEL_JOBS}" bash -lc "{}"',
    "",
  ].join("\n")
  fs.writeFileSync(launchPath, launchScript)
  fs.chmodSync(launchPath, 0o755)

  const summaryPath = path.join(outputDir, "README.md")
  const summary = [
    "# PubMed Day-1 Shards",
    "",
    `- Shards: ${config.shardCount}`,
    `- Workers per shard: ${config.workersPerShard}`,
    `- Max per topic: ${config.maxPerTopic}`,
    `- From year: ${config.fromYear}`,
    `- High evidence mode: ${config.highEvidence ? "on" : "off"}`,
    "",
    "## Run",
    "",
    "Use one command per terminal/session:",
    "",
    "```bash",
    `bash ${path.relative(process.cwd(), launchPath)} 12`,
    "```",
    "",
    "Or copy individual lines from `commands.sh` and launch manually across terminals.",
    "",
  ].join("\n")
  fs.writeFileSync(summaryPath, summary)
}

function parseConfig(): BuildConfig {
  const { values } = parseArgs({
    options: {
      inputs: { type: "string" },
      "output-dir": { type: "string", default: "data/eval/pubmed_shards/day1" },
      shards: { type: "string", default: "12" },
      "shard-prefix": { type: "string", default: "pubmed_day1_shard" },
      "run-prefix": { type: "string", default: "ingestion-day1" },
      "workers-per-shard": { type: "string", default: "2" },
      "max-per-topic": { type: "string", default: "2000" },
      "from-year": { type: "string", default: "2018" },
      "high-evidence": { type: "boolean", default: true },
      help: { type: "boolean", short: "h" },
    },
  })

  if (values.help) {
    console.log(`Generate balanced PubMed topic shards.

Usage:
  npm run ingest:make-shards
  npm run ingest:make-shards -- --shards 16 --workers-per-shard 2

Options:
  --inputs <csv>               Comma-separated input files. Defaults to wave A-F.
  --output-dir <path>          Output directory (default: data/eval/pubmed_shards/day1)
  --shards <n>                 Number of shards (default: 12)
  --shard-prefix <name>        Output shard file prefix (default: pubmed_day1_shard)
  --run-prefix <name>          Checkpoint prefix in commands (default: ingestion-day1)
  --workers-per-shard <n>      Workers per shard ingest process (default: 2)
  --max-per-topic <n>          Max per topic in generated commands (default: 2000)
  --from-year <year>           Start year in generated commands (default: 2018)
  --high-evidence              Include high-evidence flag in commands (default: true)
`)
    process.exit(0)
  }

  const defaultInputs = [
    "data/eval/pubmed_wave_a_topics.txt",
    "data/eval/pubmed_wave_b_topics.txt",
    "data/eval/pubmed_wave_c_topics.txt",
    "data/eval/pubmed_wave_d_topics.txt",
    "data/eval/pubmed_wave_e_topics.txt",
    "data/eval/pubmed_wave_f_topics.txt",
  ]

  const inputFiles = typeof values.inputs === "string"
    ? values.inputs.split(",").map((entry) => entry.trim()).filter(Boolean)
    : defaultInputs

  return {
    inputFiles,
    outputDir: resolveProjectPath(values["output-dir"] || "data/eval/pubmed_shards/day1"),
    shardCount: Math.max(1, Number(values.shards || "12")),
    shardPrefix: values["shard-prefix"] || "pubmed_day1_shard",
    runPrefix: values["run-prefix"] || "ingestion-day1",
    workersPerShard: Math.max(1, Number(values["workers-per-shard"] || "2")),
    maxPerTopic: Math.max(100, Number(values["max-per-topic"] || "2000")),
    fromYear: Math.max(1990, Number(values["from-year"] || "2018")),
    highEvidence: Boolean(values["high-evidence"]),
  }
}

async function main() {
  const config = parseConfig()
  const topics = uniqueTopics(config.inputFiles.flatMap(readTopics))
  const shards = distributeRoundRobin(topics, config.shardCount)
  const shardPaths = writeShardFiles(config.outputDir, config.shardPrefix, shards)
  writeCommandPack(config.outputDir, config.runPrefix, shardPaths, config)

  console.log(`[ShardGen] Input files: ${config.inputFiles.length}`)
  console.log(`[ShardGen] Unique topics: ${topics.length}`)
  console.log(`[ShardGen] Shards written: ${shardPaths.length}`)
  shardPaths.forEach((shardPath, index) => {
    console.log(
      `[ShardGen] ${path.basename(shardPath)}: ${shards[index].length} topics`
    )
  })
  console.log(
    `[ShardGen] Command pack: ${path.join(config.outputDir, "commands.sh")}`
  )
}

main().catch((error) => {
  console.error("[ShardGen] Failed:", error)
  process.exit(1)
})

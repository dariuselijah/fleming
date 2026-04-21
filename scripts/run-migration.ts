#!/usr/bin/env npx ts-node

/**
 * Run raw SQL migrations against Supabase Postgres via the pooler.
 *
 * Usage:
 *   npx ts-node --compiler-options '{"module":"commonjs"}' scripts/run-migration.ts --all
 *   npx ts-node --compiler-options '{"module":"commonjs"}' scripts/run-migration.ts migrate-hnsw-tuning.sql
 */

import { config } from "dotenv"
import { resolve } from "node:path"
import { existsSync, readFileSync } from "node:fs"
import { Client } from "pg"

const envLocalPath = resolve(process.cwd(), ".env.local")
const envPath = resolve(process.cwd(), ".env")
if (existsSync(envLocalPath)) config({ path: envLocalPath })
if (existsSync(envPath)) config({ path: envPath })

const SUPABASE_URL = (process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "").trim()
const DB_URL = (process.env.DATABASE_URL || "").trim()

/** Postgres user password from Dashboard → Settings → Database (NOT the service_role JWT). */
function databasePassword(): string {
  return (
    process.env.SUPABASE_DB_PASSWORD ||
    process.env.POSTGRES_PASSWORD ||
    process.env.SUPABASE_POSTGRES_PASSWORD ||
    ""
  ).trim()
}

function extractProjectRef(): string {
  const match = SUPABASE_URL.match(/https:\/\/([^.]+)\.supabase\.co/)
  if (!match) throw new Error(`Cannot extract project ref from NEXT_PUBLIC_SUPABASE_URL / SUPABASE_URL`)
  return match[1]
}

/**
 * Prefer `DATABASE_URL` from Supabase (Settings → Database → URI).
 * Otherwise build a direct session connection using the **database password** only.
 * Never use SUPABASE_SERVICE_ROLE_KEY as the Postgres password — that JWT triggers SCRAM errors.
 */
function buildConnectionString(): string {
  if (DB_URL) return DB_URL
  const pw = databasePassword()
  if (!pw) {
    throw new Error(
      "Set DATABASE_URL (recommended), or SUPABASE_DB_PASSWORD with NEXT_PUBLIC_SUPABASE_URL. " +
        "Use the Postgres password from Supabase → Settings → Database — not the service_role key."
    )
  }
  const ref = extractProjectRef()
  const enc = encodeURIComponent(pw)
  return `postgresql://postgres:${enc}@db.${ref}.supabase.co:5432/postgres?sslmode=require`
}

async function main() {
  const args = process.argv.slice(2)
  const runAll = args.includes("--all")

  const migrationFiles = runAll
    ? ["migrate-hnsw-tuning.sql", "migrate-vector-quantization.sql"]
    : args.filter((a) => a.endsWith(".sql"))

  if (migrationFiles.length === 0) {
    console.log("Usage: run-migration.ts <file.sql> [file2.sql ...] | --all")
    process.exit(1)
  }

  let connStr: string
  try {
    connStr = buildConnectionString()
  } catch (e: any) {
    console.error(e.message || e)
    process.exit(1)
  }
  console.log(
    DB_URL
      ? "Connecting using DATABASE_URL..."
      : `Connecting to Supabase Postgres (project: ${extractProjectRef()})...`
  )

  const useSsl = /supabase\.co|pooler\.supabase\.com/.test(connStr)
  const client = new Client({
    connectionString: connStr,
    ...(useSsl ? { ssl: { rejectUnauthorized: false } as const } : {}),
  })

  try {
    await client.connect()
    console.log("Connected.\n")
  } catch (err: any) {
    console.error("Connection failed:", err.message)
    console.log("\nFallback: paste the following SQL into Supabase SQL Editor:\n")
    for (const file of migrationFiles) {
      const p = resolve(process.cwd(), file)
      if (existsSync(p)) {
        console.log(`-- === ${file} ===`)
        console.log(readFileSync(p, "utf-8"))
        console.log()
      }
    }
    process.exit(1)
  }

  let allOk = true
  for (const file of migrationFiles) {
    const filePath = resolve(process.cwd(), file)
    if (!existsSync(filePath)) {
      console.error(`File not found: ${filePath}`)
      allOk = false
      continue
    }

    console.log(`--- Running: ${file} ---`)
    const sql = readFileSync(filePath, "utf-8")

    try {
      await client.query(sql)
      console.log(`  ✅ ${file} completed\n`)
    } catch (err: any) {
      console.error(`  ❌ ${file} failed: ${err.message}\n`)
      allOk = false
    }
  }

  await client.end()
  console.log(allOk ? "✅ All migrations successful" : "⚠️  Some migrations had issues")
  process.exit(allOk ? 0 : 1)
}

main().catch(console.error)

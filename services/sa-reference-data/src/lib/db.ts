import { DatabaseSync } from "node:sqlite"
import { createHash, randomUUID } from "node:crypto"
import { existsSync, mkdirSync, readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, "../..")
const SCHEMA_PATH = join(ROOT, "schema/001_init.sql")
const DEFAULT_DB = join(ROOT, "data/sa-health-codes.sqlite")

export type Db = DatabaseSync

function sqliteSchema(sql: string): string {
  return sql
    .replace(/TIMESTAMPTZ/gi, "TEXT")
    .replace(/BOOLEAN/gi, "INTEGER")
    .replace(/\bFALSE\b/gi, "0")
    .replace(/\bTRUE\b/gi, "1")
    .replace(/DEFAULT\s+NOW\(\)/gi, "DEFAULT (datetime('now'))")
    .replace(/NOW\(\)/gi, "datetime('now')")
}

export function openDb(dbPath = process.env.SA_REFERENCE_DATA_DB ?? DEFAULT_DB): Db {
  mkdirSync(dirname(dbPath), { recursive: true })
  const db = new DatabaseSync(dbPath)
  db.exec("PRAGMA journal_mode = WAL;")
  db.exec("PRAGMA foreign_keys = ON;")
  const schema = readFileSync(SCHEMA_PATH, "utf8")
  db.exec(sqliteSchema(schema))
  return db
}

export function newId(prefix: string): string {
  return `${prefix}_${randomUUID().replace(/-/g, "").slice(0, 16)}`
}

export function hashApiKey(raw: string): string {
  return createHash("sha256").update(raw).digest("hex")
}

export function ensureBootstrapApiKey(db: Db): string | null {
  const existing = db.prepare("SELECT id FROM api_keys WHERE active = 1 LIMIT 1").get()
  if (existing) return null
  const raw = process.env.SA_REFERENCE_DATA_BOOTSTRAP_KEY?.trim() || `shc_dev_${randomUUID().replace(/-/g, "")}`
  db.prepare(
    `INSERT INTO api_keys (id, tenant_name, key_hash, key_prefix, quota_per_day, active, created_at)
     VALUES (?, ?, ?, ?, ?, 1, datetime('now'))`
  ).run(newId("key"), "fleming-bootstrap", hashApiKey(raw), raw.slice(0, 12), 1_000_000)
  return raw
}

export function authenticate(db: Db, authHeader: string | null): { tenant: string } | null {
  if (!authHeader?.startsWith("Bearer ")) return null
  const raw = authHeader.slice("Bearer ".length).trim()
  if (!raw) return null
  // Local/dev: allow unauthenticated when SA_REFERENCE_DATA_ALLOW_ANON=1
  const row = db
    .prepare("SELECT tenant_name AS tenant, active FROM api_keys WHERE key_hash = ? LIMIT 1")
    .get(hashApiKey(raw)) as { tenant: string; active: number } | undefined
  if (!row || !row.active) return null
  return { tenant: row.tenant }
}

export function allowAnon(): boolean {
  return process.env.SA_REFERENCE_DATA_ALLOW_ANON === "1" || process.env.NODE_ENV !== "production"
}

export function seedPath(...parts: string[]): string {
  return join(ROOT, "data/seed", ...parts)
}

export function readJsonSeed<T>(filename: string): T {
  const path = seedPath(filename)
  if (!existsSync(path)) throw new Error(`Missing seed file: ${path}`)
  return JSON.parse(readFileSync(path, "utf8")) as T
}

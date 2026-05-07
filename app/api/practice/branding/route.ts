import { NextResponse } from "next/server"
import type { SupabaseClient } from "@supabase/supabase-js"
import { getAuthenticatedPracticeContext } from "@/lib/billing/context"

export const runtime = "nodejs"

const FIELDS = ["vat_number", "hpcsa_number", "bhf_number", "address", "phone", "email", "website"] as const

export async function GET() {
  const ctx = await getAuthenticatedPracticeContext()
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const db = ctx.supabase as unknown as SupabaseClient
  const { data, error } = await db
    .from("practices")
    .select("logo_storage_path, vat_number, hpcsa_number, bhf_number, address, phone, email, website")
    .eq("id", ctx.practiceId)
    .maybeSingle()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? {})
}

export async function PATCH(req: Request) {
  const ctx = await getAuthenticatedPracticeContext()
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const db = ctx.supabase as unknown as SupabaseClient
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
  const update: Record<string, string | null> = {}
  for (const field of FIELDS) {
    if (field in body) {
      const value = body[field]
      update[field] = typeof value === "string" && value.trim() ? value.trim() : null
    }
  }
  const { error } = await db.from("practices").update(update).eq("id", ctx.practiceId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

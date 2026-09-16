import { NextResponse } from "next/server"
import { getAuthenticatedPracticeContext } from "@/lib/billing/context"
import type { Json } from "@/app/types/database.types"

export const runtime = "nodejs"

/** POST /api/clinical/handoff-action — write-back when Front Desk completes or prints a handoff */
export async function POST(req: Request) {
  const ctx = await getAuthenticatedPracticeContext()
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  let body: {
    handoffMessageId?: string
    action?: "complete" | "print"
    sessionDocumentId?: string
    clinicalEncounterId?: string
    patientId?: string
  }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  const { handoffMessageId, action } = body
  if (!handoffMessageId || !action) {
    return NextResponse.json({ error: "handoffMessageId and action required" }, { status: 400 })
  }

  const { data: existing, error: fetchErr } = await ctx.supabase
    .from("practice_inbox_messages")
    .select("metadata_json")
    .eq("id", handoffMessageId)
    .eq("practice_id", ctx.practiceId)
    .maybeSingle()

  if (fetchErr || !existing) {
    return NextResponse.json({ error: "Handoff not found" }, { status: 404 })
  }

  const prev = (existing.metadata_json as Record<string, unknown>) ?? {}
  const now = new Date().toISOString()
  const metadata_json = {
    ...prev,
    sessionDocumentId: body.sessionDocumentId ?? prev.sessionDocumentId,
    clinicalEncounterId: body.clinicalEncounterId ?? prev.clinicalEncounterId,
    frontDesk: {
      ...(typeof prev.frontDesk === "object" && prev.frontDesk ? (prev.frontDesk as object) : {}),
      lastAction: action,
      [`${action}At`]: now,
      completedAt: action === "complete" ? now : (prev.frontDesk as { completedAt?: string })?.completedAt,
      printedAt: action === "print" ? now : (prev.frontDesk as { printedAt?: string })?.printedAt,
    },
  }

  const patch: Record<string, unknown> = { metadata_json: metadata_json as Json }
  if (action === "complete") patch.read_flag = true

  const { error } = await ctx.supabase
    .from("practice_inbox_messages")
    .update(patch)
    .eq("id", handoffMessageId)
    .eq("practice_id", ctx.practiceId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  if (body.clinicalEncounterId && action === "print") {
    await ctx.supabase
      .from("clinical_encounters")
      .update({
        updated_at: now,
      })
      .eq("id", body.clinicalEncounterId)
      .eq("practice_id", ctx.practiceId)
  }

  return NextResponse.json({ ok: true })
}

import { NextResponse } from "next/server"
import { getAuthenticatedPracticeContext } from "@/lib/billing/context"
import type { Json } from "@/app/types/database.types"

export const runtime = "nodejs"

/**
 * POST /api/practice/inbox
 * Insert a front desk task (clinical handoff, lab strip, etc.).
 */
export async function POST(req: Request) {
  const ctx = await getAuthenticatedPracticeContext()
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  let body: {
    channel?: string
    fromLabel: string
    preview: string
    patientId?: string | null
    payloadCiphertext?: string | null
    payloadIv?: string | null
    metadata?: Record<string, unknown>
  }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  const {
    fromLabel,
    preview,
    patientId,
    channel = "document",
    payloadCiphertext,
    payloadIv,
    metadata,
  } = body
  if (!fromLabel?.trim() || !preview?.trim()) {
    return NextResponse.json({ error: "fromLabel and preview required" }, { status: 400 })
  }

  const { error, data } = await ctx.supabase
    .from("practice_inbox_messages")
    .insert({
      practice_id: ctx.practiceId,
      channel,
      from_label: fromLabel.slice(0, 120),
      preview: preview.slice(0, 280),
      patient_id: patientId ?? null,
      read_flag: false,
      payload_ciphertext: payloadCiphertext ?? null,
      payload_iv: payloadIv ?? null,
      metadata_json: (metadata && typeof metadata === "object" ? metadata : {}) as Json,
    })
    .select("id")
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ id: data.id })
}

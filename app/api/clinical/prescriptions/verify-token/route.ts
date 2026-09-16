import { NextResponse } from "next/server"
import { getAuthenticatedPracticeContext } from "@/lib/billing/context"
import {
  generateVerificationToken,
  hashPrescriptionPayload,
  verifyUrlForToken,
} from "@/lib/clinical/prescription-verify"
import type { PrescriptionItem } from "@/lib/clinical-workspace/types"

export const runtime = "nodejs"

export async function POST(req: Request) {
  const ctx = await getAuthenticatedPracticeContext()
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  let body: {
    patientId?: string
    prescriberName?: string
    items?: PrescriptionItem[]
    handoffMessageId?: string
    sessionDocumentId?: string
    clinicalEncounterId?: string
    expiresInDays?: number
  }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  const items = Array.isArray(body.items) ? body.items : []
  if (items.filter((i) => i.drug?.trim()).length === 0) {
    return NextResponse.json({ error: "At least one medication required" }, { status: 400 })
  }

  const { token, tokenHash } = generateVerificationToken()
  const days = Math.min(365, Math.max(1, body.expiresInDays ?? 90))
  const expiresAt = new Date()
  expiresAt.setDate(expiresAt.getDate() + days)

  const { error } = await ctx.supabase.from("practice_prescription_verifications").insert({
    practice_id: ctx.practiceId,
    patient_id: body.patientId ?? null,
    token_hash: tokenHash,
    prescriber_name: body.prescriberName?.slice(0, 120) ?? null,
    expires_at: expiresAt.toISOString(),
    status: "active",
    payload_hash: hashPrescriptionPayload(items),
    handoff_message_id: body.handoffMessageId ?? null,
    session_document_id: body.sessionDocumentId ?? null,
    clinical_encounter_id: body.clinicalEncounterId ?? null,
  })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const verifyUrl = verifyUrlForToken(token)
  return NextResponse.json({ token, verifyUrl, expiresAt: expiresAt.toISOString() })
}

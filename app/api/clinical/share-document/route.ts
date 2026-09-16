import { NextRequest, NextResponse } from "next/server"
import { requirePracticePermission } from "@/lib/auth/guard"
import { loadVaultDek } from "@/lib/clinical/vault-dek"
import { decryptPracticeAesGcm } from "@/lib/server/clinical-vault"
import { sendPatientMessageEmail } from "@/lib/patient/send-patient-message-email"
import { getPracticeMessagingNumber, sendSmsMessage } from "@/lib/comms"
import { normalizePhoneE164Za, resolvePatientPhoneForComms } from "@/lib/comms/patient-phone"
import {
  clinicalDocumentShareUrl,
  createClinicalDocumentShareToken,
  encryptClinicalDocumentShare,
  hashClinicalDocumentShareToken,
} from "@/lib/clinical/document-share"

export async function POST(req: NextRequest) {
  const guard = await requirePracticePermission("clinical:access")
  if (!guard.ok) return guard.response
  const ctx = {
    supabase: guard.context.supabase,
    userId: guard.context.userId,
    practiceId: guard.context.activePracticeId,
  }

  let body: {
    patientId?: string
    channel?: "email" | "sms"
    title?: string
    content?: string
    docType?: string
  }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  const patientId = typeof body.patientId === "string" ? body.patientId : ""
  const channel = body.channel === "sms" ? "sms" : body.channel === "email" ? "email" : null
  const title = typeof body.title === "string" ? body.title.trim() : "Clinical document"
  const content = typeof body.content === "string" ? body.content.trim() : ""

  if (!patientId || !channel || content.length < 10) {
    return NextResponse.json({ error: "patientId, channel, and content required" }, { status: 400 })
  }
  if (content.length > 250_000) {
    return NextResponse.json({ error: "Document is too large to share" }, { status: 413 })
  }

  const { data: row } = await ctx.supabase
    .from("practice_patients")
    .select("profile_ciphertext, profile_iv, phone_e164")
    .eq("id", patientId)
    .eq("practice_id", ctx.practiceId)
    .maybeSingle()

  if (!row) return NextResponse.json({ error: "Patient not found" }, { status: 404 })

  const token = createClinicalDocumentShareToken()
  const tokenHash = hashClinicalDocumentShareToken(token)
  const encrypted = encryptClinicalDocumentShare(token, content)
  const expiresAt = new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString()
  const { error: shareError } = await ctx.supabase.from("clinical_document_shares").insert({
    practice_id: ctx.practiceId,
    patient_id: patientId,
    created_by: ctx.userId,
    token_hash: tokenHash,
    title: title.slice(0, 180),
    doc_type: typeof body.docType === "string" ? body.docType.slice(0, 60) : null,
    content_ciphertext: encrypted.ciphertext,
    content_iv: encrypted.iv,
    expires_at: expiresAt,
  })
  if (shareError) return NextResponse.json({ error: shareError.message }, { status: 500 })
  const shareUrl = clinicalDocumentShareUrl(token, req.nextUrl.origin)
  const messageBody = `A secure clinical document is available from your practice.\n\nOpen this expiring link (valid for 72 hours): ${shareUrl}\n\nDo not forward this link.`

  if (channel === "email") {
    const dek = await loadVaultDek(ctx.supabase, ctx.userId, ctx.practiceId)
    if (!dek) return NextResponse.json({ error: "Vault locked" }, { status: 403 })

    if (!row.profile_ciphertext || !row.profile_iv) {
      return NextResponse.json({ error: "Patient profile unavailable" }, { status: 404 })
    }
    const profileJson = decryptPracticeAesGcm(dek, row.profile_ciphertext, row.profile_iv)
    if (!profileJson) return NextResponse.json({ error: "Decrypt failed" }, { status: 500 })

    const profile = JSON.parse(profileJson) as { email?: string; name?: string }
    const to = profile.email?.trim()
    if (!to) return NextResponse.json({ error: "Patient has no email on file" }, { status: 400 })

    const sent = await sendPatientMessageEmail({
      to,
      subject: title,
      body: messageBody,
      patientName: profile.name,
    })
    if (!sent.ok) {
      await ctx.supabase
        .from("clinical_document_shares")
        .update({ revoked_at: new Date().toISOString() })
        .eq("token_hash", tokenHash)
      return NextResponse.json({ error: sent.error }, { status: 502 })
    }
    return NextResponse.json({ ok: true, channel: "email", expiresAt })
  }

  let phone = (row as { phone_e164?: string | null }).phone_e164?.trim() || null
  if (!phone) {
    phone = await resolvePatientPhoneForComms(ctx.supabase, ctx.practiceId, patientId, {
      userId: ctx.userId,
    })
  }
  if (!phone) return NextResponse.json({ error: "Patient has no phone on file" }, { status: 400 })

  const from = await getPracticeMessagingNumber(ctx.practiceId)
  if (!from) return NextResponse.json({ error: "Messaging not configured" }, { status: 400 })

  const normalized = normalizePhoneE164Za(phone)
  const smsBody = `${title}\n\n${messageBody}`
  try {
    await sendSmsMessage({ to: normalized, from, body: smsBody })
    if (!(row as { phone_e164?: string | null }).phone_e164?.trim()) {
      await ctx.supabase
        .from("practice_patients")
        .update({ phone_e164: normalized })
        .eq("id", patientId)
        .eq("practice_id", ctx.practiceId)
    }
    return NextResponse.json({ ok: true, channel: "sms", expiresAt })
  } catch (e) {
    await ctx.supabase
      .from("clinical_document_shares")
      .update({ revoked_at: new Date().toISOString() })
      .eq("token_hash", tokenHash)
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "SMS failed" },
      { status: 502 }
    )
  }
}

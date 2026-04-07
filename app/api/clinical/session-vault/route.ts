import { createClient } from "@/lib/supabase/server"
import { NextRequest, NextResponse } from "next/server"
import { vaultSealDek } from "@/lib/server/clinical-vault"

const TTL_MIN = 15

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  if (!supabase) {
    return NextResponse.json({ error: "Database unavailable" }, { status: 500 })
  }
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  let body: { practiceId?: string; dekBase64?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }
  const practiceId = body.practiceId?.trim()
  const dekBase64 = body.dekBase64?.trim()
  if (!practiceId || !dekBase64) {
    return NextResponse.json({ error: "practiceId and dekBase64 required" }, { status: 400 })
  }

  const sealed = vaultSealDek(dekBase64)
  if (!sealed) {
    return NextResponse.json(
      { error: "Server vault not configured (CLINICAL_VAULT_SECRET or ENCRYPTION_KEY)" },
      { status: 503 }
    )
  }

  const expiresAt = new Date(Date.now() + TTL_MIN * 60_000).toISOString()

  const { error: insErr } = await supabase.from("clinical_session_keys").insert({
    user_id: user.id,
    practice_id: practiceId,
    enc_dek: sealed.enc,
    dek_iv: sealed.iv,
    expires_at: expiresAt,
  })
  if (insErr) {
    console.error("[session-vault]", insErr)
    return NextResponse.json({ error: insErr.message }, { status: 400 })
  }

  return NextResponse.json({ ok: true, expiresAt })
}

export async function DELETE() {
  const supabase = await createClient()
  if (!supabase) {
    return NextResponse.json({ error: "Database unavailable" }, { status: 500 })
  }
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  await supabase.from("clinical_session_keys").delete().eq("user_id", user.id)
  return NextResponse.json({ ok: true })
}

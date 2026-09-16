import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { requirePracticePermission } from "@/lib/auth/guard"
import { vaultOpenDek, vaultSealDek } from "@/lib/server/clinical-vault"
import {
  persistPracticeDekForUser,
  resolvePracticeDekForUser,
  sessionVaultExpiresAt,
  upsertPracticeDekStore,
} from "@/lib/clinical/practice-dek-vault"

/** Restore sealed DEK for the current session (auto-bootstrap if missing). */
export async function GET(req: NextRequest) {
  const practiceId = req.nextUrl.searchParams.get("practiceId")?.trim()
  if (!practiceId) {
    return NextResponse.json({ error: "practiceId required" }, { status: 400 })
  }
  const guard = await requirePracticePermission("clinical:access", {
    requestedPracticeId: practiceId,
  })
  if (!guard.ok) return guard.response
  const { supabase, userId } = guard.context

  const { data, error } = await supabase
    .from("clinical_session_keys")
    .select("enc_dek, dek_iv, expires_at")
    .eq("user_id", userId)
    .eq("practice_id", practiceId)
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!error && data?.enc_dek && data?.dek_iv) {
    const dekPlain = vaultOpenDek(data.enc_dek, data.dek_iv)
    if (dekPlain) {
      try {
        const admin = createAdminClient()
        await upsertPracticeDekStore(admin, practiceId, dekPlain)
      } catch {
        /* non-fatal backup */
      }
      return NextResponse.json({ dekBase64: dekPlain })
    }
  }

  try {
    const admin = createAdminClient()
    const dekBase64 = await resolvePracticeDekForUser(
      supabase,
      userId,
      practiceId,
      admin
    )
    if (!dekBase64) {
      return NextResponse.json({ dekBase64: null })
    }
    await persistPracticeDekForUser(admin, userId, practiceId, dekBase64)
    return NextResponse.json({ dekBase64 })
  } catch (e) {
    console.warn("[session-vault] auto-bootstrap failed", e)
    return NextResponse.json({ dekBase64: null })
  }
}

export async function POST(req: NextRequest) {
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
  const guard = await requirePracticePermission("clinical:access", {
    requestedPracticeId: practiceId,
  })
  if (!guard.ok) return guard.response
  const { supabase, userId } = guard.context

  const sealed = vaultSealDek(dekBase64)
  if (!sealed) {
    return NextResponse.json(
      { error: "Server vault not configured (CLINICAL_VAULT_SECRET or ENCRYPTION_KEY)" },
      { status: 503 }
    )
  }

  const admin = (await import("@/lib/supabase/admin")).createAdminClient()
  await upsertPracticeDekStore(admin, practiceId, dekBase64)

  const expiresAt = sessionVaultExpiresAt()

  const { error: insErr } = await supabase.from("clinical_session_keys").insert({
    user_id: userId,
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
  const guard = await requirePracticePermission("clinical:access")
  if (!guard.ok) return guard.response
  const { supabase, userId, activePracticeId } = guard.context
  await supabase
    .from("clinical_session_keys")
    .delete()
    .eq("user_id", userId)
    .eq("practice_id", activePracticeId)
  return NextResponse.json({ ok: true })
}

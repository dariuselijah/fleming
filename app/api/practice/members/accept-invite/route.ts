import { createAdminClient } from "@/lib/supabase/admin"
import { createClient } from "@/lib/supabase/server"
import { hashInviteToken } from "@/lib/practice/invite-token"
import { NextRequest, NextResponse } from "next/server"

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  if (!supabase) return NextResponse.json({ error: "Unavailable" }, { status: 500 })

  const { data: { user }, error: authErr } = await supabase.auth.getUser()
  if (authErr || !user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  let body: { token?: string }
  try {
    body = (await req.json()) as { token?: string }
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  const token = typeof body.token === "string" ? body.token.trim() : ""
  if (!token) return NextResponse.json({ error: "token is required" }, { status: 400 })

  let admin
  try {
    admin = createAdminClient()
  } catch {
    return NextResponse.json({ error: "Server configuration error" }, { status: 503 })
  }

  const tokenHash = hashInviteToken(token)
  const emailLower = user.email.toLowerCase()

  const { data: inv, error: invErr } = await admin
    .from("practice_invitations")
    .select("id, practice_id, email, role, expires_at, accepted_at, revoked_at")
    .eq("token_hash", tokenHash)
    .maybeSingle()

  if (invErr || !inv) {
    return NextResponse.json({ error: "Invalid or expired invitation" }, { status: 400 })
  }

  if (inv.revoked_at) {
    return NextResponse.json({ error: "This invitation was revoked" }, { status: 400 })
  }
  if (inv.accepted_at) {
    return NextResponse.json({ ok: true, alreadyAccepted: true, practiceId: inv.practice_id })
  }

  if (inv.email.toLowerCase() !== emailLower) {
    return NextResponse.json(
      {
        error: `Sign in with ${inv.email} to accept this invitation.`,
      },
      { status: 403 }
    )
  }

  if (new Date(inv.expires_at) < new Date()) {
    return NextResponse.json({ error: "This invitation has expired" }, { status: 400 })
  }

  const { data: existing } = await admin
    .from("practice_members")
    .select("id")
    .eq("practice_id", inv.practice_id)
    .eq("user_id", user.id)
    .maybeSingle()

  if (existing) {
    await admin
      .from("practice_invitations")
      .update({ accepted_at: new Date().toISOString() })
      .eq("id", inv.id)
    return NextResponse.json({ ok: true, alreadyMember: true, practiceId: inv.practice_id })
  }

  const { error: memErr } = await admin.from("practice_members").insert({
    practice_id: inv.practice_id,
    user_id: user.id,
    role: inv.role,
  })

  if (memErr) {
    console.error("[accept-invite] practice_members insert", memErr)
    return NextResponse.json({ error: memErr.message }, { status: 400 })
  }

  const { error: markErr } = await admin
    .from("practice_invitations")
    .update({ accepted_at: new Date().toISOString() })
    .eq("id", inv.id)

  if (markErr) {
    console.warn("[accept-invite] mark accepted", markErr)
  }

  return NextResponse.json({ ok: true, practiceId: inv.practice_id })
}

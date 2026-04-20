import { createAdminClient } from "@/lib/supabase/admin"
import { createClient } from "@/lib/supabase/server"
import { hashInviteToken, newInviteToken } from "@/lib/practice/invite-token"
import { getPracticeMembership } from "@/lib/practice/membership-server"
import { sendPracticeInviteEmail } from "@/lib/practice/send-practice-invite-email"
import {
  ROLE_LABEL,
  canInviteAsRole,
  isOwnerOrAdmin,
  type PracticeStaffRole,
} from "@/lib/practice/team-permissions"
import { NextRequest, NextResponse } from "next/server"

function baseUrlFromRequest(req: NextRequest): string {
  const env = process.env.NEXT_PUBLIC_APP_URL?.trim()
  if (env) return env.replace(/\/$/, "")
  const host = req.headers.get("x-forwarded-host") || req.headers.get("host")
  const proto = req.headers.get("x-forwarded-proto") || "https"
  return host ? `${proto}://${host}` : "http://127.0.0.1:3000"
}

function resendFrom(): string | null {
  const f =
    process.env.RESEND_FROM_EMAIL?.trim() ||
    process.env.COMMS_FROM_EMAIL?.trim() ||
    process.env.RESEND_FROM?.trim()
  return f || null
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  if (!supabase) return NextResponse.json({ error: "Unavailable" }, { status: 500 })

  const { data: { user }, error: authErr } = await supabase.auth.getUser()
  if (authErr || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  let body: { practiceId?: string; email?: string; role?: string }
  try {
    body = (await req.json()) as { practiceId?: string; email?: string; role?: string }
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  const practiceId = typeof body.practiceId === "string" ? body.practiceId.trim() : ""
  const emailRaw = typeof body.email === "string" ? body.email.trim().toLowerCase() : ""
  const role = typeof body.role === "string" ? body.role.trim() : ""
  const allowedInviteRoles = ["admin", "physician", "nurse", "reception"] as const

  if (!practiceId || !emailRaw || !role) {
    return NextResponse.json({ error: "practiceId, email, and role are required" }, { status: 400 })
  }

  if (!allowedInviteRoles.includes(role as (typeof allowedInviteRoles)[number])) {
    return NextResponse.json({ error: "Invalid role" }, { status: 400 })
  }

  const membership = await getPracticeMembership(supabase, user.id, practiceId)
  if (!membership || !isOwnerOrAdmin(membership.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  if (!canInviteAsRole(membership.role, role as PracticeStaffRole)) {
    return NextResponse.json({ error: "You cannot assign this role" }, { status: 403 })
  }

  let admin
  try {
    admin = createAdminClient()
  } catch {
    return NextResponse.json({ error: "Server configuration error" }, { status: 503 })
  }

  const token = newInviteToken()
  const tokenHash = hashInviteToken(token)
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()

  const { data: ins, error: insErr } = await admin
    .from("practice_invitations")
    .insert({
      practice_id: practiceId,
      email: emailRaw,
      role,
      invited_by: user.id,
      token_hash: tokenHash,
      expires_at: expiresAt,
    })
    .select("id")
    .single()

  if (insErr) {
    if (insErr.code === "23505") {
      return NextResponse.json(
        { error: "An invitation is already pending for this email" },
        { status: 409 }
      )
    }
    console.error("[practice/invite] insert", insErr)
    return NextResponse.json({ error: insErr.message }, { status: 400 })
  }

  const { data: practiceRow } = await admin.from("practices").select("name").eq("id", practiceId).maybeSingle()
  const practiceName = practiceRow?.name ?? "your practice"
  const base = baseUrlFromRequest(req)
  const nextPath = `/invite/practice?token=${encodeURIComponent(token)}`
  const acceptUrl = `${base}${nextPath}`

  const from = resendFrom()
  let emailSent = false
  if (from) {
    const sent = await sendPracticeInviteEmail({
      to: emailRaw,
      from,
      practiceName,
      roleLabel: ROLE_LABEL[role as PracticeStaffRole] ?? role,
      acceptUrl,
    })
    emailSent = sent.ok
    if (!sent.ok) {
      console.warn("[practice/invite] email", sent.error)
    }
  }

  return NextResponse.json({
    invitationId: ins?.id,
    expiresAt,
    emailSent,
    /** Only when email could not be sent or Resend is not configured — share manually. */
    acceptUrl: emailSent ? undefined : acceptUrl,
  })
}

export async function DELETE(req: NextRequest) {
  const supabase = await createClient()
  if (!supabase) return NextResponse.json({ error: "Unavailable" }, { status: 500 })

  const { data: { user }, error: authErr } = await supabase.auth.getUser()
  if (authErr || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const practiceId = req.nextUrl.searchParams.get("practiceId")?.trim()
  const invitationId = req.nextUrl.searchParams.get("invitationId")?.trim()
  if (!practiceId || !invitationId) {
    return NextResponse.json({ error: "practiceId and invitationId required" }, { status: 400 })
  }

  const membership = await getPracticeMembership(supabase, user.id, practiceId)
  if (!membership || !isOwnerOrAdmin(membership.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  let admin
  try {
    admin = createAdminClient()
  } catch {
    return NextResponse.json({ error: "Server configuration error" }, { status: 503 })
  }

  const { data: inv, error: fetchErr } = await admin
    .from("practice_invitations")
    .select("id, practice_id, accepted_at, revoked_at")
    .eq("id", invitationId)
    .maybeSingle()

  if (fetchErr || !inv || inv.practice_id !== practiceId) {
    return NextResponse.json({ error: "Invitation not found" }, { status: 404 })
  }
  if (inv.accepted_at || inv.revoked_at) {
    return NextResponse.json({ error: "Invitation is no longer pending" }, { status: 400 })
  }

  const { error: upErr } = await admin
    .from("practice_invitations")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", invitationId)

  if (upErr) {
    console.error("[practice/invite] revoke", upErr)
    return NextResponse.json({ error: upErr.message }, { status: 400 })
  }

  return NextResponse.json({ ok: true })
}

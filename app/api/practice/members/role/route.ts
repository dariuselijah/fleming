import { createAdminClient } from "@/lib/supabase/admin"
import { createClient } from "@/lib/supabase/server"
import { getPracticeMembership } from "@/lib/practice/membership-server"
import {
  canChangeMemberRole,
  isOwnerOrAdmin,
  type PracticeStaffRole,
} from "@/lib/practice/team-permissions"
import { NextRequest, NextResponse } from "next/server"

export async function PATCH(req: NextRequest) {
  const supabase = await createClient()
  if (!supabase) return NextResponse.json({ error: "Unavailable" }, { status: 500 })

  const { data: { user }, error: authErr } = await supabase.auth.getUser()
  if (authErr || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  let body: { practiceId?: string; userId?: string; role?: string }
  try {
    body = (await req.json()) as { practiceId?: string; userId?: string; role?: string }
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  const practiceId = typeof body.practiceId === "string" ? body.practiceId.trim() : ""
  const targetUserId = typeof body.userId === "string" ? body.userId.trim() : ""
  const newRole = typeof body.role === "string" ? body.role.trim() : ""

  if (!practiceId || !targetUserId || !newRole) {
    return NextResponse.json({ error: "practiceId, userId, and role are required" }, { status: 400 })
  }

  const assignable = ["admin", "physician", "nurse", "reception"] as const
  if (!assignable.includes(newRole as (typeof assignable)[number])) {
    return NextResponse.json({ error: "Invalid role" }, { status: 400 })
  }

  const membership = await getPracticeMembership(supabase, user.id, practiceId)
  if (!membership || !isOwnerOrAdmin(membership.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  if (targetUserId === user.id && membership.role === "owner" && newRole !== "owner") {
    return NextResponse.json(
      { error: "Transfer ownership by promoting another owner before changing your own role." },
      { status: 400 }
    )
  }

  let admin
  try {
    admin = createAdminClient()
  } catch {
    return NextResponse.json({ error: "Server configuration error" }, { status: 503 })
  }

  const { data: targetRow, error: tErr } = await admin
    .from("practice_members")
    .select("id, role")
    .eq("practice_id", practiceId)
    .eq("user_id", targetUserId)
    .maybeSingle()

  if (tErr || !targetRow) {
    return NextResponse.json({ error: "Member not found" }, { status: 404 })
  }

  if (!canChangeMemberRole(membership.role, targetRow.role, newRole as PracticeStaffRole)) {
    return NextResponse.json({ error: "You cannot assign this role" }, { status: 403 })
  }

  const { error: upErr } = await admin
    .from("practice_members")
    .update({ role: newRole })
    .eq("id", targetRow.id)

  if (upErr) {
    console.error("[practice/members/role] update", upErr)
    return NextResponse.json({ error: upErr.message }, { status: 400 })
  }

  return NextResponse.json({ ok: true })
}

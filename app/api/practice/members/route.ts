import { createAdminClient } from "@/lib/supabase/admin"
import { requirePracticePermission } from "@/lib/auth/guard"
import { NextRequest, NextResponse } from "next/server"

export async function GET(req: NextRequest) {
  const practiceId = req.nextUrl.searchParams.get("practiceId")?.trim()
  if (!practiceId) return NextResponse.json({ error: "practiceId required" }, { status: 400 })

  const guard = await requirePracticePermission("team:manage", {
    requestedPracticeId: practiceId,
  })
  if (!guard.ok) return guard.response

  let admin
  try {
    admin = createAdminClient()
  } catch {
    return NextResponse.json({ error: "Server configuration error" }, { status: 503 })
  }

  const { data: practiceRow } = await admin.from("practices").select("name").eq("id", practiceId).maybeSingle()

  const { data: memberRows, error: mErr } = await admin
    .from("practice_members")
    .select("id, user_id, role, created_at")
    .eq("practice_id", practiceId)

  if (mErr) {
    console.error("[practice/members] list members", mErr)
    return NextResponse.json({ error: mErr.message }, { status: 400 })
  }

  const members = await Promise.all(
    (memberRows ?? []).map(async (row) => {
      const { data: u } = await admin.auth.admin.getUserById(row.user_id)
      const email = u.user?.email ?? null
      return {
        id: row.id,
        userId: row.user_id,
        role: row.role,
        email,
        createdAt: row.created_at,
      }
    })
  )

  const { data: invites, error: iErr } = await admin
    .from("practice_invitations")
    .select("id, email, role, expires_at, created_at")
    .eq("practice_id", practiceId)
    .is("accepted_at", null)
    .is("revoked_at", null)
    .order("created_at", { ascending: false })

  if (iErr) {
    console.error("[practice/members] list invites", iErr)
    return NextResponse.json({ error: iErr.message }, { status: 400 })
  }

  return NextResponse.json({
    practiceId,
    practiceName: practiceRow?.name ?? "Practice",
    members,
    invitations: invites ?? [],
    callerRole: guard.context.activeRole,
  })
}

import { NextRequest, NextResponse } from "next/server"
import {
  ACTIVE_PRACTICE_COOKIE,
  getServerAuthPracticeContext,
  getValidatedPracticeMembership,
  toClientAuthContext,
} from "@/lib/auth/context"
import { getDefaultWorkspaceMode, getRolePermissions } from "@/lib/auth/permissions"

export async function PUT(req: NextRequest) {
  const context = await getServerAuthPracticeContext()
  if (!context.supabase || !context.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  let body: { practiceId?: string }
  try {
    body = (await req.json()) as { practiceId?: string }
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  const practiceId = typeof body.practiceId === "string" ? body.practiceId.trim() : ""
  if (!practiceId) {
    return NextResponse.json({ error: "practiceId is required" }, { status: 400 })
  }

  const membership = await getValidatedPracticeMembership(
    context.supabase,
    context.user.id,
    practiceId
  )
  if (!membership) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const nextContext = {
    ...toClientAuthContext(context),
    activePracticeId: membership.practiceId,
    activePracticeName: membership.practiceName,
    activeRole: membership.role,
    permissions: getRolePermissions(membership.role),
    defaultWorkspaceMode: getDefaultWorkspaceMode(membership.role),
  }

  const response = NextResponse.json(nextContext)
  response.cookies.set(ACTIVE_PRACTICE_COOKIE, membership.practiceId, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  })
  return response
}

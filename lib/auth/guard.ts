import { NextResponse } from "next/server"
import type { PracticeStaffRole } from "@/lib/clinical-workspace/types"
import { isPracticeStaffRole, type AppPermission } from "./permissions"
import { getServerAuthPracticeContext, type ServerAuthPracticeContext } from "./context"

export type AuthorizedPracticeContext = ServerAuthPracticeContext & {
  supabase: NonNullable<ServerAuthPracticeContext["supabase"]>
  user: NonNullable<ServerAuthPracticeContext["user"]>
  userId: string
  activePracticeId: string
  activeRole: PracticeStaffRole
}

export type PracticeGuardResult =
  | { ok: true; context: AuthorizedPracticeContext }
  | { ok: false; response: NextResponse }

type GuardOptions = {
  requestedPracticeId?: string | null
}

export async function requirePracticePermission(
  permission: AppPermission,
  options: GuardOptions = {}
): Promise<PracticeGuardResult> {
  const context = await getServerAuthPracticeContext()

  if (!context.isAuthenticated || !context.supabase || !context.user || !context.userId) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    }
  }

  if (!context.activePracticeId || !isPracticeStaffRole(context.activeRole)) {
    return {
      ok: false,
      response: NextResponse.json({ error: "No active practice membership" }, { status: 403 }),
    }
  }

  if (!context.permissions.includes(permission)) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    }
  }

  const requestedPracticeId = options.requestedPracticeId?.trim()
  if (requestedPracticeId && requestedPracticeId !== context.activePracticeId) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    }
  }

  return {
    ok: true,
    context: context as AuthorizedPracticeContext,
  }
}

import { getServerAuthPracticeContext } from "@/lib/auth/context"
import { isPracticeStaffRole } from "@/lib/auth/permissions"

export type PracticeMemberRole = "owner" | "physician" | "nurse" | "admin" | "reception"

export async function getAuthenticatedPracticeContext(): Promise<
  | {
      supabase: NonNullable<Awaited<ReturnType<typeof getServerAuthPracticeContext>>["supabase"]>
      userId: string
      practiceId: string
      role: string | null
    }
  | null
> {
  const context = await getServerAuthPracticeContext()
  if (!context.supabase || !context.userId || !context.activePracticeId) return null

  return {
    supabase: context.supabase,
    userId: context.userId,
    practiceId: context.activePracticeId,
    role: context.activeRole,
  }
}

export async function getAuthenticatedPracticeContextWithRole(): Promise<
  | {
      supabase: NonNullable<Awaited<ReturnType<typeof getServerAuthPracticeContext>>["supabase"]>
      userId: string
      practiceId: string
      role: PracticeMemberRole
    }
  | null
> {
  const context = await getServerAuthPracticeContext()
  if (
    !context.supabase ||
    !context.userId ||
    !context.activePracticeId ||
    !isPracticeStaffRole(context.activeRole)
  ) {
    return null
  }

  return {
    supabase: context.supabase,
    userId: context.userId,
    practiceId: context.activePracticeId,
    role: context.activeRole,
  }
}

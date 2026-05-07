import { getServerAuthPracticeContext } from "@/lib/auth/context"

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

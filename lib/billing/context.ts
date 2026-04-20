import { createClient } from "@/lib/supabase/server"

export async function getAuthenticatedPracticeContext(): Promise<
  | { supabase: NonNullable<Awaited<ReturnType<typeof createClient>>>; userId: string; practiceId: string }
  | null
> {
  const supabase = await createClient()
  if (!supabase) return null

  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser()
  if (authErr || !user) return null

  const { data: membership } = await supabase
    .from("practice_members")
    .select("practice_id")
    .eq("user_id", user.id)
    .limit(1)
    .maybeSingle()

  if (!membership?.practice_id) return null

  return { supabase, userId: user.id, practiceId: membership.practice_id }
}

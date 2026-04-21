import { createClient } from "@/lib/supabase/server"

export async function assertPracticeMember(practiceId: string): Promise<{ userId: string }> {
  const supabase = await createClient()
  if (!supabase) {
    throw new Error("Database unavailable")
  }
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()
  if (authError || !user) {
    const err = new Error("Unauthorized")
    ;(err as Error & { status?: number }).status = 401
    throw err
  }

  const { data: member, error } = await supabase
    .from("practice_members")
    .select("practice_id")
    .eq("practice_id", practiceId)
    .eq("user_id", user.id)
    .maybeSingle()

  if (error || !member) {
    const err = new Error("Forbidden")
    ;(err as Error & { status?: number }).status = 403
    throw err
  }

  return { userId: user.id }
}

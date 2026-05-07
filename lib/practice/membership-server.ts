import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "@/app/types/database.types"

export async function getPracticeMembership(
  supabase: SupabaseClient<Database>,
  userId: string,
  practiceId: string
): Promise<{ role: string } | null> {
  const { data, error } = await supabase
    .from("practice_members")
    .select("role")
    .eq("user_id", userId)
    .eq("practice_id", practiceId)
    .maybeSingle()

  if (error || !data) return null
  return { role: data.role }
}

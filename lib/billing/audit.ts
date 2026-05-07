import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "@/app/types/database.types"

export async function writeBillingAudit(
  supabase: SupabaseClient<Database>,
  row: {
    practiceId: string
    actorUserId: string | null
    entityType: string
    entityId: string
    action: string
    diff?: Record<string, unknown> | null
    reason?: string | null
  }
): Promise<void> {
  const { error } = await supabase.from("billing_audit_log").insert({
    practice_id: row.practiceId,
    actor_user_id: row.actorUserId,
    entity_type: row.entityType,
    entity_id: row.entityId,
    action: row.action,
    diff: row.diff ?? null,
    reason: row.reason ?? null,
  })
  if (error) console.warn("[billing_audit]", error.message)
}

import type { SupabaseClient } from "@supabase/supabase-js"
import type { PracticeMemberRole } from "@/lib/billing/context"

export type AssistantEventKind =
  | "user_message"
  | "assistant_message"
  | "tool_call"
  | "tool_result"
  | "error"

export async function insertAssistantEvent(
  supabase: SupabaseClient,
  row: {
    practiceId: string
    actorUserId: string
    threadId: string
    roleAtEvent: PracticeMemberRole
    kind: AssistantEventKind
    toolName?: string | null
    toolArgs?: Record<string, unknown> | null
    toolResult?: Record<string, unknown> | null
    toolStatus?: string | null
    content?: string | null
    mentions?: unknown[] | null
    model?: string | null
  }
) {
  const sb = supabase as unknown as {
    from: (t: string) => { insert: (r: Record<string, unknown>) => Promise<{ error: { message: string } | null }> }
  }
  const { error } = await sb.from("practice_assistant_events").insert({
    practice_id: row.practiceId,
    actor_user_id: row.actorUserId,
    thread_id: row.threadId,
    role_at_event: row.roleAtEvent,
    kind: row.kind,
    tool_name: row.toolName ?? null,
    tool_args: row.toolArgs ?? null,
    tool_result: row.toolResult ?? null,
    tool_status: row.toolStatus ?? null,
    content: row.content ?? null,
    mentions: row.mentions ?? [],
    model: row.model ?? null,
  })
  if (error) console.warn("[assistant-audit]", error.message)
}

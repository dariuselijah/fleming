import { useWorkspaceStore } from "@/lib/clinical-workspace"
import { fetchClient } from "@/lib/fetch"

/** Mark a practice_inbox_messages row read locally + on server. */
export async function markInboxMessageRead(messageId: string): Promise<void> {
  useWorkspaceStore.getState().markMessageRead(messageId)
  try {
    await fetchClient(`/api/practice/inbox/${messageId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ read: true }),
    })
  } catch {
    /* local state already updated */
  }
}

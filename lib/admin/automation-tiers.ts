/**
 * Front Desk automation tiers (plan Phase 4B):
 * - Tier 0: Auto-resolved (FAQ, auto-matched imports) — hidden or badge only
 * - Tier 1: One-click approve & send (AI draft ready)
 * - Tier 2: Needs staff judgment (handoffs, claims, triage)
 * - Tier 3: Blocked — missing data (handoff without encrypted payload)
 */
import type { WorkQueueItem, WorkQueueItemType } from "./work-queue-types"

/** Automation tier: 0=auto, 1=suggest, 2=judgment, 3=blocked */
export type AutomationTier = 0 | 1 | 2 | 3

export function automationTierForItem(item: WorkQueueItem): AutomationTier {
  if (item.resolved || item.priority === "resolved") return 0

  switch (item.type) {
    case "import":
      if (item.payload.type === "import" && item.payload.data.autoMatched) return 0
      return 2
    case "lab":
      if (item.priority === "urgent") return 2
      if (item.payload.type === "lab" && item.payload.data.isCritical) return 2
      return 1
    case "message":
      if (item.payload.type === "message") {
        const st = item.payload.data.status
        if (st === "handoff" || item.priority === "urgent") return 2
        if (st === "awaiting_input") return 1
      }
      return 1
    case "clinical_handoff":
      if (item.payload.type === "clinical_handoff" && !item.payload.data.hasEncryptedPayload) return 3
      return 2
    case "claim_followup":
      if (item.payload.type === "claim_followup" && item.payload.data.followupKind === "rejected") return 2
      return 1
    case "claim":
    case "claim_group":
      return 2
    case "invoice":
      if (item.payload.type === "invoice" && item.payload.data.overdue) return 2
      return 1
    case "appointment":
      if (item.payload.type === "appointment" && item.payload.data.kind === "no_show") return 2
      return 1
    case "inventory":
      if (item.priority === "urgent") return 2
      return 1
    case "document":
      if (item.priority === "urgent") return 2
      return 1
    default:
      return 2
  }
}

export function tierLabel(tier: AutomationTier): string {
  if (tier === 0) return "Auto-resolved"
  if (tier === 1) return "One-click"
  if (tier === 2) return "Needs review"
  return "Blocked"
}

export function shouldHideFromPrimaryQueue(item: WorkQueueItem, tier: AutomationTier): boolean {
  return tier === 0 && item.resolved
}

export function tierBadgeClass(tier: AutomationTier): string {
  if (tier === 0) return "bg-emerald-500/15 text-emerald-300"
  if (tier === 1) return "bg-blue-500/15 text-blue-300"
  if (tier === 2) return "bg-amber-500/15 text-amber-300"
  return "bg-red-500/15 text-red-300"
}

export type { WorkQueueItemType }

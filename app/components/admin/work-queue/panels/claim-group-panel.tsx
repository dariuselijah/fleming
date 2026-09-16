"use client"

import type { WorkQueueItem } from "@/lib/admin/work-queue-types"
import { useWorkQueueStore } from "@/lib/admin/work-queue-store"
import {
  PanelBody,
  PanelFooter,
  PanelHeader,
  PanelHint,
  PanelPrimaryButton,
  PanelShell,
} from "@/app/components/ui/panel-primitives"
import { Receipt } from "@phosphor-icons/react"
import { ClaimPanel } from "./claim-panel"

export function ClaimGroupPanel({ item }: { item: WorkQueueItem }) {
  const payload = item.payload.type === "claim_group" ? item.payload.data : null
  const selectItem = useWorkQueueStore((s) => s.selectItem)
  const toggleGroupExpanded = useWorkQueueStore((s) => s.toggleGroupExpanded)
  const expandedGroupIds = useWorkQueueStore((s) => s.expandedGroupIds)
  const resolveItem = useWorkQueueStore((s) => s.resolveItem)

  if (!payload) return null

  return (
    <PanelShell>
      <PanelHeader
        icon={<Receipt className="size-4 text-amber-400" weight="fill" />}
        title="Draft claims batch"
        subtitle={`${payload.claims.length} claims · R${Math.round(payload.totalAmount).toLocaleString()} · ${payload.patientCount} patients`}
      />

      <PanelBody>
        <PanelHint>Review each claim below. Submit validated claims individually or open billing for bulk actions.</PanelHint>
        <div className="divide-y divide-border/50">
        {payload.claims.map((claim) => (
          <button
            key={claim.id}
            type="button"
            onClick={() => {
              if (!expandedGroupIds.has(item.id)) toggleGroupExpanded(item.id)
              selectItem(`claim-${claim.id}`)
            }}
            className="flex w-full items-center justify-between gap-2 rounded-lg px-2 py-2.5 text-left hover:bg-panel-muted/60"
          >
            <div className="min-w-0">
              <p className="truncate text-[12px] font-medium text-foreground/90">{claim.patientName}</p>
              <p className="text-[10px] text-muted-foreground">
                R{Math.round(claim.totalAmount).toLocaleString()} · {claim.lines?.length ?? 0} lines
              </p>
            </div>
            <span className="shrink-0 text-[10px] text-blue-400">Review</span>
          </button>
        ))}
        </div>
      </PanelBody>

      <PanelFooter>
        <PanelPrimaryButton onClick={() => resolveItem(item.id)}>Mark batch reviewed</PanelPrimaryButton>
      </PanelFooter>
    </PanelShell>
  )
}

/** When a child claim from group is selected, render full claim panel */
export function ClaimPanelOrGroup({ item }: { item: WorkQueueItem }) {
  if (item.type === "claim_group") return <ClaimGroupPanel item={item} />
  if (item.type === "claim") return <ClaimPanel item={item} />
  return null
}

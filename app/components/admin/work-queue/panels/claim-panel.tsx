"use client"

import type { WorkQueueItem } from "@/lib/admin/work-queue-types"
import { useWorkQueueStore } from "@/lib/admin/work-queue-store"
import { useWorkspace, useWorkspaceStore } from "@/lib/clinical-workspace"
import { ClaimDetailPanel } from "../../bento-claims"
import {
  PanelBody,
  PanelFooter,
  PanelHeader,
  PanelHint,
  PanelSecondaryButton,
  PanelShell,
} from "@/app/components/ui/panel-primitives"
import { Receipt } from "@phosphor-icons/react"

export function ClaimPanel({ item }: { item: WorkQueueItem }) {
  const payload = item.payload.type === "claim" ? item.payload.data : null
  const resolveItem = useWorkQueueStore((s) => s.resolveItem)
  const incrementAiResolved = useWorkQueueStore((s) => s.incrementAiResolved)
  const updateClaim = useWorkspaceStore((s) => s.updateClaim)
  const updateClaimStatus = useWorkspaceStore((s) => s.updateClaimStatus)
  const { setAdminTab } = useWorkspace()

  if (!payload?.claim) {
    return (
      <div className="flex h-full items-center justify-center p-6 text-[11px] text-muted-foreground">
        Claim not found
      </div>
    )
  }

  return (
    <PanelShell>
      <PanelHeader
        icon={<Receipt className="size-4 text-amber-400" weight="fill" />}
        title={item.patientName ?? "Claim"}
        subtitle={item.summaryLine}
      />

      <PanelBody className="space-y-2">
        <PanelHint>{item.aiActionLine ?? "Review claim lines and submit when ready."}</PanelHint>
        <div className="min-h-0 flex-1 overflow-y-auto p-0" style={{ scrollbarWidth: "thin" }}>
          <ClaimDetailPanel
            claim={payload.claim}
            onClose={() => resolveItem(item.id)}
            onUpdateClaim={updateClaim}
            onUpdateStatus={updateClaimStatus}
            onClaimSyncedFromServer={() => {
              resolveItem(item.id)
              incrementAiResolved()
            }}
          />
        </div>
      </PanelBody>

      <PanelFooter>
        <PanelSecondaryButton onClick={() => setAdminTab("billing")}>Open full billing workspace</PanelSecondaryButton>
      </PanelFooter>
    </PanelShell>
  )
}

"use client"

import type { WorkQueueItem } from "@/lib/admin/work-queue-types"
import { useWorkQueueStore } from "@/lib/admin/work-queue-store"
import { useWorkspace } from "@/lib/clinical-workspace"
import {
  PanelBody,
  PanelFooter,
  PanelGhostButton,
  PanelHeader,
  PanelHint,
  PanelPrimaryButton,
  PanelSecondaryButton,
  PanelShell,
} from "@/app/components/ui/panel-primitives"
import { Package } from "@phosphor-icons/react"

export function InventoryPanel({ item }: { item: WorkQueueItem }) {
  const payload = item.payload.type === "inventory" ? item.payload.data : null
  const resolveItem = useWorkQueueStore((s) => s.resolveItem)
  const incrementAiResolved = useWorkQueueStore((s) => s.incrementAiResolved)
  const { setAdminTab, requestInventoryImportPanelOpen } = useWorkspace()

  if (!payload) return null

  const { item: stock, deficit } = payload

  return (
    <PanelShell>
      <PanelHeader
        icon={<Package className="size-4 text-violet-400" weight="fill" />}
        title={stock.name}
        subtitle={`${stock.currentStock} ${stock.unit} on hand · min ${stock.minStock}`}
      />

      <PanelBody>
        {stock.supplier ? <p className="text-[11px] text-muted-foreground">Supplier: {stock.supplier}</p> : null}
        <PanelHint>
          {deficit > 0
            ? `Reorder ${deficit} ${stock.unit}(s) from ${stock.supplier ?? "supplier"}`
            : item.aiActionLine}
        </PanelHint>
      </PanelBody>

      <PanelFooter>
        <PanelPrimaryButton onClick={() => setAdminTab("inventory")}>Open inventory</PanelPrimaryButton>
        <PanelSecondaryButton onClick={() => requestInventoryImportPanelOpen()}>Import stock file</PanelSecondaryButton>
        <PanelGhostButton
          onClick={() => {
            resolveItem(item.id)
            incrementAiResolved()
          }}
        >
          Mark reorder placed
        </PanelGhostButton>
      </PanelFooter>
    </PanelShell>
  )
}

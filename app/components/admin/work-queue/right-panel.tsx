"use client"

import type { WorkQueueItem } from "@/lib/admin/work-queue-types"
import { useWorkQueueStore } from "@/lib/admin/work-queue-store"
import { useWorkspaceStore } from "@/lib/clinical-workspace"
import {
  PanelBody,
  PanelFooter,
  PanelHeader,
  PanelPrimaryButton,
  PanelShell,
} from "@/app/components/ui/panel-primitives"
import { FileText } from "@phosphor-icons/react"
import { AppointmentPanel } from "./panels/appointment-panel"
import { ClaimFollowupPanel } from "./panels/claim-followup-panel"
import { ClaimGroupPanel } from "./panels/claim-group-panel"
import { ClaimPanel } from "./panels/claim-panel"
import { ClinicalHandoffPanel } from "./panels/clinical-handoff-panel"
import { ImportPanel } from "./panels/import-panel"
import { InventoryPanel } from "./panels/inventory-panel"
import { InvoicePanel } from "./panels/invoice-panel"
import { LabPanel } from "./panels/lab-panel"
import { MessagePanel } from "./panels/message-panel"
import { VoicePanel } from "./panels/voice-panel"

function DocumentPanel({ item }: { item: WorkQueueItem }) {
  const resolveItem = useWorkQueueStore((s) => s.resolveItem)
  const markNotificationRead = useWorkspaceStore((s) => s.markNotificationRead)
  const payload = item.payload.type === "document" ? item.payload.data : null

  return (
    <PanelShell>
      <PanelHeader
        icon={<FileText className="size-4 text-violet-400" weight="fill" />}
        title={item.summaryLine}
      />
      <PanelBody>
        <p className="text-[11px] leading-relaxed text-muted-foreground">{payload?.detail ?? item.aiActionLine}</p>
      </PanelBody>
      <PanelFooter>
        <PanelPrimaryButton
          onClick={() => {
            if (payload?.notificationId) markNotificationRead(payload.notificationId)
            resolveItem(item.id)
          }}
        >
          Mark resolved
        </PanelPrimaryButton>
      </PanelFooter>
    </PanelShell>
  )
}

export function WorkQueueRightPanel({ item }: { item: WorkQueueItem | null }) {
  if (!item) {
    return (
      <div className="flex h-full flex-col items-center justify-center px-6 text-center">
        <p className="text-[12px] text-muted-foreground">Select a task</p>
        <p className="mt-1 max-w-[240px] text-[10px] text-muted-foreground/70">
          Select a task from the list. Message and email tasks open a reply box on the right — type your reply and hit Send.
        </p>
      </div>
    )
  }

  switch (item.type) {
    case "clinical_handoff":
      return <ClinicalHandoffPanel item={item} />
    case "message":
      if (item.payload.type === "message" && item.payload.data.channel === "voice") {
        return <VoicePanel item={item} />
      }
      return <MessagePanel item={item} />
    case "lab":
      return <LabPanel item={item} />
    case "claim_group":
      return <ClaimGroupPanel item={item} />
    case "claim":
      return <ClaimPanel item={item} />
    case "claim_followup":
      return <ClaimFollowupPanel item={item} />
    case "invoice":
      return <InvoicePanel item={item} />
    case "appointment":
      return <AppointmentPanel item={item} />
    case "inventory":
      return <InventoryPanel item={item} />
    case "import":
      return <ImportPanel item={item} />
    case "document":
      return <DocumentPanel item={item} />
    default:
      return null
  }
}

"use client"

import type { WorkQueueItem } from "@/lib/admin/work-queue-types"
import { useWorkQueueStore } from "@/lib/admin/work-queue-store"
import { openPatientFromAdmin, useWorkspace, useWorkspaceStore } from "@/lib/clinical-workspace"
import { usePracticeCrypto } from "@/lib/clinical-workspace/practice-crypto-context"
import {
  PanelBody,
  PanelFooter,
  PanelGhostButton,
  PanelHeader,
  PanelHint,
  PanelPrimaryButton,
  PanelSecondaryButton,
  PanelSectionLabel,
  PanelShell,
} from "@/app/components/ui/panel-primitives"
import { Receipt } from "@phosphor-icons/react"

export function ClaimFollowupPanel({ item }: { item: WorkQueueItem }) {
  const payload = item.payload.type === "claim_followup" ? item.payload.data : null
  const resolveItem = useWorkQueueStore((s) => s.resolveItem)
  const incrementAiResolved = useWorkQueueStore((s) => s.incrementAiResolved)
  const updateClaimStatus = useWorkspaceStore((s) => s.updateClaimStatus)
  const { setAdminTab, requestBillingFocusClaim } = useWorkspace()
  const { practiceId, dekKey } = usePracticeCrypto()

  if (!payload?.claim) return null

  const { claim, followupKind, daysSinceUpdate } = payload

  const primaryLabel =
    followupKind === "rejected"
      ? "Review rejection in billing"
      : followupKind === "partial"
        ? "Invoice patient co-pay"
        : followupKind === "submitted"
          ? "Check claim status"
          : "Record payment"

  return (
    <PanelShell>
      <PanelHeader
        icon={<Receipt className="size-4 text-amber-400" weight="fill" />}
        title={claim.patientName}
        subtitle={`${followupKind.replace("_", " ")} · ${daysSinceUpdate}d`}
      />

      <PanelBody>
        <p className="text-[11px] leading-relaxed text-foreground/80">{item.summaryLine}</p>

        {claim.rejectionReason && (
          <div className="rounded-xl border border-red-400/20 bg-red-500/[0.06] px-3 py-2 text-[11px] text-red-200">
            {claim.rejectionReason}
          </div>
        )}

        <section>
          <PanelSectionLabel>Lines</PanelSectionLabel>
          <div className="mt-2 space-y-1">
            {(claim.lines ?? []).map((line) => (
              <div key={line.id} className="flex justify-between rounded-lg bg-panel-muted/40 px-2.5 py-1.5 text-[10px]">
                <span className="truncate">{line.description}</span>
                <span className="shrink-0 tabular-nums">R{line.amount}</span>
              </div>
            ))}
          </div>
        </section>

        {item.aiActionLine ? <PanelHint>{item.aiActionLine}</PanelHint> : null}
      </PanelBody>

      <PanelFooter>
        <PanelPrimaryButton
          onClick={() => {
            requestBillingFocusClaim(claim.id)
            setAdminTab("billing")
          }}
        >
          {primaryLabel}
        </PanelPrimaryButton>
        {followupKind === "rejected" && (
          <PanelSecondaryButton
            onClick={() => {
              updateClaimStatus(claim.id, "draft")
              resolveItem(item.id)
            }}
          >
            Move back to draft
          </PanelSecondaryButton>
        )}
        {item.patientId && (
          <PanelSecondaryButton
            onClick={() =>
              void openPatientFromAdmin({
                patientId: item.patientId!,
                patientName: claim.patientName,
                practiceId,
                dekKey,
              })
            }
          >
            Open patient chart
          </PanelSecondaryButton>
        )}
        <PanelGhostButton
          onClick={() => {
            resolveItem(item.id)
            incrementAiResolved()
          }}
        >
          Mark handled
        </PanelGhostButton>
      </PanelFooter>
    </PanelShell>
  )
}

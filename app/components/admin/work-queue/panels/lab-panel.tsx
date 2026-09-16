"use client"

import type { WorkQueueItem } from "@/lib/admin/work-queue-types"
import { useWorkQueueStore } from "@/lib/admin/work-queue-store"
import { openPatientFromAdmin, useWorkspaceStore } from "@/lib/clinical-workspace"
import { usePracticeCrypto } from "@/lib/clinical-workspace/practice-crypto-context"
import { usePatientOverview } from "@/lib/patient/use-patient-overview"
import { cn } from "@/lib/utils"
import { Flask } from "@phosphor-icons/react"
import { useMemo } from "react"
import {
  PanelBody,
  PanelFooter,
  PanelHeader,
  PanelHint,
  PanelPrimaryButton,
  PanelSecondaryButton,
  PanelSectionLabel,
  PanelShell,
} from "@/app/components/ui/panel-primitives"
import { LabIntegrationsPanel } from "../../lab-integrations-panel"

function parseLabValues(preview: string): { name: string; value: string; flag?: string }[] {
  const parts = preview.split(/[·|]/).map((p) => p.trim()).filter(Boolean)
  if (parts.length <= 1) return [{ name: "Result", value: preview }]
  return parts.map((part) => {
    const match = part.match(/^([^:]+):\s*(.+)$/)
    if (match) return { name: match[1], value: match[2] }
    return { name: part, value: "" }
  })
}

export function LabPanel({ item }: { item: WorkQueueItem }) {
  const payload = item.payload.type === "lab" ? item.payload.data : null
  const resolveItem = useWorkQueueStore((s) => s.resolveItem)
  const incrementAiResolved = useWorkQueueStore((s) => s.incrementAiResolved)
  const markMessageRead = useWorkspaceStore((s) => s.markMessageRead)
  const patients = useWorkspaceStore((s) => s.patients)
  const { practiceId, dekKey } = usePracticeCrypto()

  const patient = useMemo(
    () => (item.patientId ? patients.find((p) => p.id === item.patientId) : undefined),
    [item.patientId, patients]
  )
  const overviewQuery = usePatientOverview(item.patientId ?? null)

  const values = useMemo(
    () => (payload ? parseLabValues(payload.inboxMessage.preview) : []),
    [payload]
  )

  const isCritical = payload?.isCritical ?? item.priority === "urgent"

  const handleNotify = () => {
    if (payload?.inboxMessage.id) {
      markMessageRead(payload.inboxMessage.id)
    }
    resolveItem(item.id)
    incrementAiResolved()
  }

  return (
    <PanelShell>
      <PanelHeader
        icon={<Flask className="size-4 text-red-400" weight="fill" />}
        title={item.patientName ?? "Lab result"}
        subtitle={`${payload?.partner ?? "Lab partner"} · ${isCritical ? "Abnormal" : "Review"}`}
      />

      <PanelBody>
        {patient && (
          <section className="rounded-xl border border-panel-border bg-panel-muted/40 px-3 py-2">
            <PanelSectionLabel>Patient</PanelSectionLabel>
            <p className="mt-1 text-[11px] text-foreground/85">
              {patient.name} · {patient.age ?? "—"}y · Last visit{" "}
              {overviewQuery.data?.encounterSummaries?.[0]?.created_at
                ? new Date(overviewQuery.data.encounterSummaries[0].created_at).toLocaleDateString([], {
                    month: "short",
                    day: "numeric",
                  })
                : "—"}
            </p>
          </section>
        )}

        <section>
          <PanelSectionLabel>Results</PanelSectionLabel>
          <div className="mt-2 space-y-1.5">
            {values.map((v, i) => (
              <div
                key={`${v.name}-${i}`}
                className={cn(
                  "flex items-center justify-between rounded-lg border px-3 py-2",
                  isCritical && i === 0
                    ? "border-red-400/25 bg-red-500/[0.08]"
                    : "border-panel-border bg-panel-muted/30"
                )}
              >
                <span className="text-[11px] font-medium text-foreground/85">{v.name}</span>
                <span
                  className={cn(
                    "text-[11px] tabular-nums",
                    isCritical && i === 0 ? "font-semibold text-red-300" : "text-muted-foreground"
                  )}
                >
                  {v.value || "—"}
                </span>
              </div>
            ))}
          </div>
        </section>

        <PanelHint>
          {isCritical
            ? "Compared to reference ranges — critically elevated. Previous result not on file. Recommend doctor review before patient notification."
            : "Values within normal range. Fleming can notify the patient and attach to the record automatically."}
        </PanelHint>

        <LabIntegrationsPanel />
      </PanelBody>

      <PanelFooter>
        {item.patientId && (
          <PanelSecondaryButton
            onClick={() =>
              void openPatientFromAdmin({
                patientId: item.patientId!,
                patientName: item.patientName,
                practiceId,
                dekKey,
              })
            }
          >
            Open patient chart
          </PanelSecondaryButton>
        )}
        <PanelPrimaryButton onClick={handleNotify}>
          {isCritical ? "Escalate to doctor" : "Notify patient & attach"}
        </PanelPrimaryButton>
        <PanelSecondaryButton onClick={() => resolveItem(item.id)}>Mark reviewed</PanelSecondaryButton>
      </PanelFooter>
    </PanelShell>
  )
}

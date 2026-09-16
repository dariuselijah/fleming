"use client"

import type { WorkQueueItem } from "@/lib/admin/work-queue-types"
import { useWorkQueueStore } from "@/lib/admin/work-queue-store"
import { useWorkspaceStore } from "@/lib/clinical-workspace"
import { buildPatientFromSmartImportFields } from "@/lib/clinical/smart-import-patient"
import { FileArrowUp } from "@phosphor-icons/react"
import { useMemo, useState } from "react"
import {
  PanelBody,
  PanelFooter,
  PanelGhostButton,
  PanelHeader,
  PanelHint,
  PanelPrimaryButton,
  PanelSectionLabel,
  PanelShell,
} from "@/app/components/ui/panel-primitives"

export function ImportPanel({ item }: { item: WorkQueueItem }) {
  const payload = item.payload.type === "import" ? item.payload.data : null
  const resolveItem = useWorkQueueStore((s) => s.resolveItem)
  const incrementAiResolved = useWorkQueueStore((s) => s.incrementAiResolved)
  const patients = useWorkspaceStore((s) => s.patients)
  const addPatient = useWorkspaceStore((s) => s.addPatient)
  const addNotification = useWorkspaceStore((s) => s.addNotification)

  const [selectedPatientId, setSelectedPatientId] = useState(payload?.matchedPatientId ?? "")

  const candidates = useMemo(() => {
    const ids = new Set(payload?.candidatePatientIds ?? [])
    if (payload?.matchedPatientId) ids.add(payload.matchedPatientId)
    return patients.filter((p) => ids.size === 0 || ids.has(p.id))
  }, [patients, payload])

  const fieldRows = useMemo(() => {
    if (!payload?.extractedFields) return []
    return Object.entries(payload.extractedFields).filter(([k]) => !k.startsWith("_") && k !== "Tip")
  }, [payload?.extractedFields])

  const handleConfirm = () => {
    const patient = patients.find((p) => p.id === selectedPatientId)
    if (patient) {
      addNotification({
        id: `notif-${Date.now()}`,
        type: "info",
        title: "Import attached",
        detail: `${payload?.fileName ?? "Document"} → ${patient.name}`,
        timestamp: new Date().toISOString(),
        read: false,
      })
    } else if (payload?.extractedFields) {
      const built = buildPatientFromSmartImportFields(payload.extractedFields)
      addPatient({ ...built, id: crypto.randomUUID() })
      addNotification({
        id: `notif-${Date.now()}`,
        type: "info",
        title: "Patient created from import",
        detail: built.name,
        timestamp: new Date().toISOString(),
        read: false,
      })
    }
    resolveItem(item.id)
    incrementAiResolved()
  }

  return (
    <PanelShell>
      <PanelHeader
        icon={<FileArrowUp className="size-4 text-violet-400" weight="fill" />}
        title={item.patientName ?? "Import"}
        subtitle={payload?.detectedType ?? "Document import"}
      />

      <PanelBody>
        <p className="text-[11px] leading-relaxed text-foreground/80">{item.summaryLine}</p>

        {fieldRows.length > 0 && (
          <section>
            <PanelSectionLabel>Extracted fields</PanelSectionLabel>
            <div className="mt-2 space-y-1">
              {fieldRows.slice(0, 8).map(([k, v]) => (
                <div key={k} className="flex justify-between gap-2 rounded-lg bg-panel-muted/50 px-2.5 py-1.5 text-[10px]">
                  <span className="text-muted-foreground">{k}</span>
                  <span className="truncate font-medium text-foreground/85">{v}</span>
                </div>
              ))}
            </div>
          </section>
        )}

        {!payload?.autoMatched && (
          <section>
            <PanelSectionLabel>Match patient</PanelSectionLabel>
            <select
              value={selectedPatientId}
              onChange={(e) => setSelectedPatientId(e.target.value)}
              className="mt-2 w-full rounded-xl border border-panel-border bg-panel-muted px-3 py-2 text-[11px] text-foreground outline-none"
            >
              <option value="">Create new patient from extract</option>
              {candidates.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </section>
        )}

        <PanelHint>
          {payload?.autoMatched
            ? "ID document matched an existing patient. Medical aid card extracted and auto-attached."
            : "Multiple possible matches — confirm the correct patient before attaching."}
        </PanelHint>
      </PanelBody>

      <PanelFooter>
        <PanelPrimaryButton onClick={handleConfirm}>
          {payload?.autoMatched ? "Confirm auto-attach" : "Confirm & attach"}
        </PanelPrimaryButton>
        <PanelGhostButton onClick={() => resolveItem(item.id)}>Dismiss</PanelGhostButton>
      </PanelFooter>
    </PanelShell>
  )
}

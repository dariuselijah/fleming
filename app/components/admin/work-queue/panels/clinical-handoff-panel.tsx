"use client"

import type { WorkQueueItem } from "@/lib/admin/work-queue-types"
import { handoffDocTypeLabel } from "@/lib/admin/front-desk-doc-labels"
import { markInboxMessageRead } from "@/lib/admin/mark-inbox-read"
import { useWorkQueueStore } from "@/lib/admin/work-queue-store"
import { decryptJson } from "@/lib/crypto/practice-e2ee"
import {
  openPatientFromAdmin,
  parsePrescriptionItems,
  printPrescription,
  useWorkspace,
  useWorkspaceStore,
} from "@/lib/clinical-workspace"
import { usePracticeCrypto } from "@/lib/clinical-workspace/practice-crypto-context"
import { fetchClient } from "@/lib/fetch"
import { cn } from "@/lib/utils"
import { CircleNotch, Hospital, PaperPlaneTilt, Printer } from "@phosphor-icons/react"
import { useEffect, useMemo, useState } from "react"
import { toast } from "sonner"

async function recordHandoffAction(opts: {
  handoffMessageId: string
  action: "complete" | "print"
  sessionDocumentId?: string
  clinicalEncounterId?: string
  patientId?: string
}) {
  try {
    await fetchClient("/api/clinical/handoff-action", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(opts),
    })
  } catch {
    /* best-effort write-back */
  }
}

export function ClinicalHandoffPanel({ item }: { item: WorkQueueItem }) {
  const payload = item.payload.type === "clinical_handoff" ? item.payload.data : null
  const resolveItem = useWorkQueueStore((s) => s.resolveItem)
  const incrementAiResolved = useWorkQueueStore((s) => s.incrementAiResolved)
  const { dekKey, practiceId } = usePracticeCrypto()
  const patients = useWorkspaceStore((s) => s.patients)
  const { setAdminTab } = useWorkspace()
  const [decrypted, setDecrypted] = useState(payload?.decrypted)
  const [decrypting, setDecrypting] = useState(false)
  const [printing, setPrinting] = useState(false)
  const [sendingSms, setSendingSms] = useState(false)

  const patient = useMemo(
    () => (item.patientId ? patients.find((p) => p.id === item.patientId) : undefined),
    [item.patientId, patients]
  )

  const docType = payload?.docType
  const docLabel = handoffDocTypeLabel(docType)
  const meta = payload?.metadata

  useEffect(() => {
    if (!payload?.hasEncryptedPayload || !dekKey || !payload.inboxMessage.payloadCiphertext || !payload.inboxMessage.payloadIv) {
      return
    }
    let cancelled = false
    setDecrypting(true)
    void decryptJson<NonNullable<typeof decrypted>>(
      dekKey,
      payload.inboxMessage.payloadCiphertext,
      payload.inboxMessage.payloadIv
    )
      .then((data) => {
        if (!cancelled) setDecrypted(data)
      })
      .catch(() => {
        if (!cancelled) setDecrypted(undefined)
      })
      .finally(() => {
        if (!cancelled) setDecrypting(false)
      })
    return () => {
      cancelled = true
    }
  }, [dekKey, payload])

  const prescriptionItems = useMemo(() => {
    if (decrypted?.prescriptionItems?.length) return decrypted.prescriptionItems
    if (decrypted?.content) return parsePrescriptionItems(decrypted.content)
    return []
  }, [decrypted])

  const allergyConflict = useMemo(() => {
    if (docType !== "prescribe" || !prescriptionItems.length || !patient?.allergies?.length) {
      return false
    }
    const allergies = patient.allergies.map((a) => a.toLowerCase())
    return prescriptionItems.some((rx) =>
      allergies.some(
        (a) =>
          rx.drug?.toLowerCase().includes(a) ||
          a.includes(rx.drug?.toLowerCase() ?? "")
      )
    )
  }, [docType, prescriptionItems, patient])

  const handleComplete = async () => {
    if (payload?.inboxMessage.id) {
      await markInboxMessageRead(payload.inboxMessage.id)
      void recordHandoffAction({
        handoffMessageId: payload.inboxMessage.id,
        action: "complete",
        sessionDocumentId: meta?.sessionDocumentId,
        clinicalEncounterId: meta?.clinicalEncounterId,
        patientId: item.patientId,
      })
    }
    resolveItem(item.id)
    incrementAiResolved()
  }

  const handleOpenPatient = () => {
    if (!item.patientId) return
    void openPatientFromAdmin({
      patientId: item.patientId,
      patientName: item.patientName,
      clinicalEncounterId: meta?.clinicalEncounterId,
      practiceId,
      dekKey,
    })
  }

  const handlePrint = async () => {
    if (printing) return
    setPrinting(true)
    try {
      await printPrescription({
        patientName: item.patientName ?? patient?.name ?? "Patient",
        items: prescriptionItems,
        patientId: item.patientId,
        handoffMessageId: payload?.inboxMessage.id,
        sessionDocumentId: meta?.sessionDocumentId,
        clinicalEncounterId: meta?.clinicalEncounterId,
      })
      if (payload?.inboxMessage.id) {
        void recordHandoffAction({
          handoffMessageId: payload.inboxMessage.id,
          action: "print",
          sessionDocumentId: meta?.sessionDocumentId,
          clinicalEncounterId: meta?.clinicalEncounterId,
          patientId: item.patientId,
        })
      }
    } finally {
      setPrinting(false)
    }
  }

  const handleSendToPatient = async () => {
    if (!item.patientId || !decrypted?.content?.trim()) return
    setSendingSms(true)
    try {
      const title = docLabel
      const res = await fetchClient("/api/clinical/share-document", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          patientId: item.patientId,
          channel: "sms",
          title,
          content: decrypted.content.slice(0, 1400),
          docType: docType ?? undefined,
        }),
      })
      const j = (await res.json().catch(() => ({}))) as { error?: string }
      if (!res.ok) {
        toast.error(j.error ?? "Could not send SMS")
        return
      }
      toast.success("Sent to patient by SMS")
    } finally {
      setSendingSms(false)
    }
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="shrink-0 border-b border-panel-border px-4 py-3">
        <div className="flex items-center gap-2">
          <Hospital className="size-4 text-indigo-400" weight="fill" />
          <div className="min-w-0">
            <p className="text-[13px] font-semibold text-foreground">{docLabel}</p>
            <p className="truncate text-[10px] text-muted-foreground">{item.patientName ?? payload?.fromLabel}</p>
          </div>
        </div>
      </div>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-3" style={{ scrollbarWidth: "thin" }}>
        {!payload?.hasEncryptedPayload && (
          <div className="rounded-xl border border-amber-400/25 bg-amber-500/[0.08] px-3 py-2 text-[11px] text-amber-100">
            Clinical payload missing — ask the clinician to re-send from the consult.
          </div>
        )}

        {decrypting ? (
          <div className="flex justify-center py-8">
            <CircleNotch className="size-5 animate-spin text-muted-foreground" />
          </div>
        ) : decrypted?.content ? (
          <section className="rounded-xl border border-panel-border bg-panel-muted/40 px-3 py-2.5">
            <p className="text-[9px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Content</p>
            <pre className="mt-2 max-h-[280px] overflow-y-auto whitespace-pre-wrap font-sans text-[11px] leading-relaxed text-foreground/85">
              {decrypted.content.slice(0, 4000)}
            </pre>
          </section>
        ) : (
          <p className="text-[11px] leading-relaxed text-muted-foreground">{item.summaryLine}</p>
        )}

        {prescriptionItems.length > 0 && (
          <section>
            <p className="text-[9px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Medications</p>
            <div className="mt-2 space-y-1.5">
              {prescriptionItems.map((rx, i) => (
                <div key={i} className="rounded-lg border border-panel-border bg-panel-muted/30 px-3 py-2 text-[11px]">
                  <p className="font-medium text-foreground/90">{rx.drug}</p>
                  <p className="text-muted-foreground">
                    {[rx.strength, rx.frequency, rx.duration].filter(Boolean).join(" · ")}
                  </p>
                </div>
              ))}
            </div>
          </section>
        )}

        {decrypted?.claimItems && decrypted.claimItems.length > 0 && (
          <section>
            <p className="text-[9px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Claim lines</p>
            <div className="mt-2 space-y-1">
              {decrypted.claimItems.map((line, i) => (
                <div key={i} className="flex justify-between rounded-lg bg-panel-muted/40 px-2.5 py-1.5 text-[10px]">
                  <span>{line.description ?? line.tariffCode}</span>
                  <span className="tabular-nums">R{line.amount ?? 0}</span>
                </div>
              ))}
            </div>
          </section>
        )}

        {allergyConflict && (
          <div className="rounded-xl border border-red-400/25 bg-red-500/[0.08] px-3 py-2 text-[11px] text-red-200">
            Allergy conflict detected — review before dispensing.
          </div>
        )}

        {item.aiActionLine && (
          <p className="text-[11px] leading-relaxed text-muted-foreground">{item.aiActionLine}</p>
        )}
      </div>

      <div className="shrink-0 space-y-2 border-t border-panel-border bg-background p-4 pb-5">
        {item.patientId && decrypted?.content && (
          <button
            type="button"
            disabled={sendingSms}
            onClick={() => void handleSendToPatient()}
            className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-panel-border bg-panel-muted px-4 py-2 text-[11px] font-medium text-foreground/80 disabled:opacity-50"
          >
            {sendingSms ? <CircleNotch className="size-3.5 animate-spin" /> : <PaperPlaneTilt className="size-3.5" />}
            Send to patient (SMS)
          </button>
        )}
        {docType === "prescribe" && (
          <button
            type="button"
            disabled={printing || prescriptionItems.length === 0}
            onClick={() => void handlePrint()}
            className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-panel-border bg-panel-muted px-4 py-2 text-[11px] font-medium text-foreground/80 disabled:opacity-50"
          >
            {printing ? <CircleNotch className="size-3.5 animate-spin" /> : <Printer className="size-3.5" />}
            Print script
          </button>
        )}
        {docType === "claim" && (
          <button
            type="button"
            onClick={() => setAdminTab("billing")}
            className="w-full rounded-xl border border-panel-border bg-panel-muted px-4 py-2 text-[11px] font-medium text-foreground/80"
          >
            Open in billing
          </button>
        )}
        {item.patientId && (
          <button
            type="button"
            onClick={handleOpenPatient}
            className="w-full rounded-xl border border-panel-border bg-panel-muted px-4 py-2 text-[11px] font-medium text-foreground/80"
          >
            Open patient chart
          </button>
        )}
        <button
          type="button"
          onClick={() => void handleComplete()}
          className={cn(
            "w-full rounded-xl bg-foreground px-4 py-2.5 text-[11px] font-semibold text-background",
            allergyConflict && "ring-2 ring-red-400/40"
          )}
        >
          Mark complete
        </button>
      </div>
    </div>
  )
}

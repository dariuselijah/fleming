"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { SendToFrontDeskButton } from "@/app/components/workspace/send-to-front-desk-button"
import {
  MedpraxCodeSearch,
  type MedpraxPickedCode,
} from "@/app/components/admin/revenue/medprax-code-search"
import {
  claimDocumentItemsToClaimLines,
  collectIcdCodesFromSession,
} from "@/lib/clinical-workspace/normalize-claim-items"
import type { ClaimDocumentItem, ClinicalDocument, IcdCodeItem } from "@/lib/clinical-workspace/types"
import { useWorkspace } from "@/lib/clinical-workspace"
import { type Discipline } from "@/lib/medikredit/modifier-catalog"
import { normalizeIcd10ForClaim } from "@/lib/medikredit/normalize-icd"
import { cn } from "@/lib/utils"
import { EditorShell } from "@/app/components/ui/panel-primitives"
import {
  CaretDown,
  CaretUp,
  Hash,
  Plus,
  Receipt,
  Trash,
  WarningCircle,
} from "@phosphor-icons/react"

function uid(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
}

const SOURCE_LABEL = { T: "Transcript", E: "Extraction", H: "History" } as const

function IcdDiagnosisRail({
  items,
  onChange,
  onAttachToLine,
}: {
  items: IcdCodeItem[]
  onChange: (next: IcdCodeItem[]) => void
  onAttachToLine?: (icd: IcdCodeItem) => void
}) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})

  const toggle = (id: string) => setExpanded((e) => ({ ...e, [id]: !e[id] }))

  const updateItem = (id: string, patch: Partial<IcdCodeItem>) => {
    onChange(items.map((icd) => (icd.id === id ? { ...icd, ...patch } : icd)))
  }

  const addIcd = () => {
    onChange([
      ...items,
      {
        id: uid("icd"),
        code: "",
        description: "",
        confidence: "Medium",
        sourceTag: "T",
        sourceExcerpt: "",
      },
    ])
  }

  const removeIcd = (id: string) => onChange(items.filter((i) => i.id !== id))

  return (
    <aside className="flex w-[min(280px,32%)] shrink-0 flex-col border-r border-border/30 bg-muted/[0.08]">
      <div className="flex items-center justify-between gap-2 border-b border-border/25 px-3 py-2.5">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          Diagnosis codes
        </p>
        <button
          type="button"
          onClick={addIcd}
          className="inline-flex items-center gap-1 rounded-md border border-border/50 px-2 py-0.5 text-[11px] font-medium text-muted-foreground hover:bg-muted"
        >
          <Plus className="size-3" />
          Add
        </button>
      </div>
      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-2.5 pb-4" style={{ scrollbarWidth: "thin" }}>
        {items.length === 0 ? (
          <p className="px-1 py-2 text-[12px] leading-relaxed text-muted-foreground/75">
            Add or edit ICD-10 codes for this visit. Expand each code for rationale and source.
          </p>
        ) : (
          items.map((icd) => {
            const open = expanded[icd.id] ?? false
            return (
              <div
                key={icd.id}
                className="rounded-xl border border-border/45 bg-background shadow-sm"
              >
                <button
                  type="button"
                  onClick={() => toggle(icd.id)}
                  className="flex w-full items-start gap-2 px-3 py-2.5 text-left"
                >
                  <div className="mt-0.5 shrink-0 text-muted-foreground">
                    {open ? <CaretUp className="size-3.5" /> : <CaretDown className="size-3.5" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 font-mono text-[13px] font-bold text-foreground">
                      <Hash className="size-3.5 text-amber-500" />
                      {icd.code || "New code"}
                    </div>
                    <p className="mt-0.5 line-clamp-2 text-[12px] leading-snug text-muted-foreground">
                      {icd.description || "No description"}
                    </p>
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {icd.confidence ? (
                        <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                          {icd.confidence}
                        </span>
                      ) : null}
                      {icd.sourceTag ? (
                        <span className="rounded-full bg-indigo-500/10 px-1.5 py-0.5 text-[10px] font-medium text-indigo-600 dark:text-indigo-400">
                          {SOURCE_LABEL[icd.sourceTag]}
                        </span>
                      ) : null}
                    </div>
                  </div>
                </button>
                {open ? (
                  <div className="space-y-2 border-t border-border/30 px-3 pb-3 pt-2">
                    <label className="block">
                      <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                        ICD-10 code
                      </span>
                      <input
                        value={icd.code}
                        onChange={(e) =>
                          updateItem(icd.id, { code: normalizeIcd10ForClaim(e.target.value) })
                        }
                        className="mt-1 h-9 w-full rounded-md border border-border/50 bg-background px-2.5 font-mono text-[13px] font-semibold outline-none focus:border-primary/40"
                        placeholder="R05"
                      />
                    </label>
                    <label className="block">
                      <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                        Description
                      </span>
                      <input
                        value={icd.description}
                        onChange={(e) => updateItem(icd.id, { description: e.target.value })}
                        className="mt-1 h-9 w-full rounded-md border border-border/50 bg-background px-2.5 text-[13px] outline-none focus:border-primary/40"
                      />
                    </label>
                    <label className="block">
                      <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                        Rationale / source excerpt
                      </span>
                      <textarea
                        value={icd.sourceExcerpt ?? ""}
                        onChange={(e) => updateItem(icd.id, { sourceExcerpt: e.target.value })}
                        rows={3}
                        className="mt-1 w-full resize-none rounded-md border border-border/50 bg-background px-2.5 py-2 text-[12px] leading-relaxed outline-none focus:border-primary/40"
                        placeholder="Why this code applies to today's visit…"
                      />
                    </label>
                    <div className="flex items-center justify-between gap-2 pt-1">
                      {onAttachToLine ? (
                        <button
                          type="button"
                          disabled={!icd.code.trim()}
                          onClick={() => onAttachToLine(icd)}
                          className="text-[11px] font-medium text-primary hover:underline disabled:opacity-40"
                        >
                          Attach to selected line
                        </button>
                      ) : null}
                      <button
                        type="button"
                        onClick={() => removeIcd(icd.id)}
                        className="ml-auto inline-flex items-center gap-1 text-[11px] text-rose-600 hover:underline"
                      >
                        <Trash className="size-3" />
                        Remove
                      </button>
                    </div>
                  </div>
                ) : null}
              </div>
            )
          })
        )}
      </div>
    </aside>
  )
}

export function BillingClaimPanel({
  doc,
  updateDocumentContent,
  onSendToFrontDesk,
}: {
  doc: ClinicalDocument
  updateDocumentContent: (
    content: string,
    isStreaming: boolean,
    patch?: {
      claimItems?: ClaimDocumentItem[]
      icdItems?: IcdCodeItem[]
      docId?: string
    }
  ) => void
  onSendToFrontDesk?: () => void
}) {
  const { activePatient, setClaimDraftLines } = useWorkspace()
  const [items, setItems] = useState<ClaimDocumentItem[]>(() => doc.claimItems ?? [])
  const [icdItems, setIcdItems] = useState<IcdCodeItem[]>([])
  const [activeLineId, setActiveLineId] = useState<string | null>(null)
  const [discipline] = useState<Discipline>("medical")

  const icdSessionDoc = useMemo(
    () => activePatient?.sessionDocuments?.find((s) => s.document.type === "icd"),
    [activePatient?.sessionDocuments]
  )

  useEffect(() => {
    const merged = collectIcdCodesFromSession(
      icdSessionDoc?.document.icdItems ?? doc.icdItems,
      doc.claimItems
    )
    setIcdItems(merged)
  }, [doc.id, doc.claimItems, doc.icdItems, icdSessionDoc?.document.icdItems])

  useEffect(() => {
    if (doc.claimItems?.length) {
      setItems(doc.claimItems.map((r) => ({ ...r })))
    } else if (!doc.isStreaming) {
      setItems([])
    }
  }, [doc.id, doc.isStreaming, doc.claimItems])

  const persistIcd = useCallback(
    (next: IcdCodeItem[]) => {
      setIcdItems(next)
      if (icdSessionDoc) {
        updateDocumentContent(icdSessionDoc.document.content, icdSessionDoc.document.isStreaming, {
          icdItems: next,
          docId: icdSessionDoc.document.id,
        })
      } else {
        updateDocumentContent(doc.content, doc.isStreaming, { icdItems: next, docId: doc.id })
      }
    },
    [doc.content, doc.id, doc.isStreaming, icdSessionDoc, updateDocumentContent]
  )

  const persist = useCallback(
    (next: ClaimDocumentItem[]) => {
      setItems(next)
      updateDocumentContent(doc.content, doc.isStreaming, { claimItems: next, docId: doc.id })
      if (activePatient) {
        const lineType =
          activePatient.medicalAidStatus === "active" ? "medical_aid" : ("cash" as const)
        setClaimDraftLines(activePatient.patientId, claimDocumentItemsToClaimLines(next, lineType))
      }
    },
    [activePatient, doc.content, doc.id, doc.isStreaming, setClaimDraftLines, updateDocumentContent]
  )

  const setField = (id: string, patch: Partial<ClaimDocumentItem>) => {
    persist(items.map((line) => (line.id === id ? { ...line, ...patch } : line)))
  }

  const attachIcdToLine = (lineId: string, icd: IcdCodeItem) => {
    setField(lineId, { icdCode: normalizeIcd10ForClaim(icd.code) })
  }

  const addLine = () => {
    const lineId = uid("cl")
    persist([
      ...items,
      {
        id: lineId,
        description: "Consultation",
        tariffCode: "0190",
        quantity: 1,
        amount: 450,
        icdCode: icdItems[0]?.code,
      },
    ])
    setActiveLineId(lineId)
  }

  const removeLine = (id: string) => persist(items.filter((l) => l.id !== id))

  const onMedpraxPick = (lineId: string, pick: MedpraxPickedCode) => {
    if (pick.kind === "icd") {
      setField(lineId, { icdCode: normalizeIcd10ForClaim(pick.code) })
      return
    }
    setField(lineId, {
      description: pick.description || pick.code,
      tariffCode: pick.kind === "tariff" ? pick.code : undefined,
      nappiCode: pick.kind === "nappi" ? pick.code : undefined,
      amount: pick.amount ?? undefined,
    })
  }

  const total = items.reduce((sum, l) => sum + (l.amount ?? 0) * (l.quantity ?? 1), 0)
  const missingIcd = items.some((l) => !l.icdCode?.trim())

  if (doc.isStreaming && items.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2 p-8 text-center">
        <Receipt className="size-8 animate-pulse text-indigo-400/40" />
        <p className="text-[13px] text-muted-foreground">Building billing lines…</p>
      </div>
    )
  }

  return (
    <EditorShell
      header={
        <div className="flex items-center gap-2 px-4 py-2.5">
          <Receipt className="size-4 text-amber-500" weight="duotone" />
          <p className="text-[13px] font-semibold text-foreground">{activePatient?.name ?? "Claim"}</p>
        </div>
      }
      footer={
        <div className="flex items-center justify-between gap-3 px-4 py-3.5">
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={addLine}
              className="inline-flex h-9 items-center gap-1.5 rounded-full border border-panel-border px-3.5 text-[12px] font-semibold text-foreground hover:bg-panel-muted"
            >
              <Plus className="size-3.5" />
              Add line
            </button>
            {missingIcd ? (
              <span className="inline-flex items-center gap-1.5 text-[12px] text-amber-600 dark:text-amber-400">
                <WarningCircle className="size-3.5" />
                ICD required on medical-aid lines
              </span>
            ) : null}
          </div>
          <div className="flex items-center gap-4">
            <span className="text-[13px] tabular-nums text-muted-foreground">
              Total <strong className="text-base text-foreground">R {total.toFixed(2)}</strong>
            </span>
            {onSendToFrontDesk ? (
              <SendToFrontDeskButton label="Send to front desk" onSend={onSendToFrontDesk} />
            ) : null}
          </div>
        </div>
      }
    >
      <div className="flex min-h-0 flex-1 overflow-hidden">
      <IcdDiagnosisRail
        items={icdItems}
        onChange={persistIcd}
        onAttachToLine={
          activeLineId
            ? (icd) => attachIcdToLine(activeLineId, icd)
            : undefined
        }
      />

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <div className="grid grid-cols-[minmax(180px,1.5fr)_minmax(140px,1.1fr)_88px_88px_64px_96px_36px] gap-2 border-b border-border/30 px-3 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          <span>Description</span>
          <span>Code search</span>
          <span>ICD</span>
          <span>Tariff</span>
          <span>Qty</span>
          <span>Amount</span>
          <span />
        </div>

        <div className="min-h-0 flex-1 space-y-2 overflow-y-auto px-2 py-2" style={{ scrollbarWidth: "thin" }}>
          {items.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
              <Receipt className="size-8 text-muted-foreground/30" />
              <p className="text-[13px] text-muted-foreground">No claim lines yet</p>
              <button
                type="button"
                onClick={addLine}
                className="rounded-full bg-foreground px-4 py-2 text-[12px] font-semibold text-background"
              >
                Add line
              </button>
            </div>
          ) : (
            items.map((row) => (
              <div
                key={row.id}
                onFocusCapture={() => setActiveLineId(row.id)}
                className={cn(
                  "grid grid-cols-[minmax(180px,1.5fr)_minmax(140px,1.1fr)_88px_88px_64px_96px_36px] items-start gap-2 rounded-xl border px-2.5 py-2.5 transition-colors",
                  activeLineId === row.id
                    ? "border-primary/30 bg-primary/[0.03]"
                    : "border-border/35 bg-background/70"
                )}
              >
                <input
                  value={row.description}
                  onChange={(e) => setField(row.id, { description: e.target.value })}
                  className="h-10 rounded-md border border-border/40 bg-background px-2.5 text-[13px] outline-none focus:border-primary/40"
                  placeholder="Line description"
                />
                <div className="min-w-0 [&_input]:text-[13px] [&_select]:text-[12px]">
                  <MedpraxCodeSearch onPick={(pick) => onMedpraxPick(row.id, pick)} discipline={discipline} />
                </div>
                <input
                  value={row.icdCode ?? ""}
                  onChange={(e) => setField(row.id, { icdCode: e.target.value })}
                  list={`icd-suggest-${row.id}`}
                  className="h-10 w-full rounded-md border border-border/40 bg-background px-2 font-mono text-[13px] font-semibold outline-none focus:border-primary/40"
                  placeholder="I10"
                />
                <datalist id={`icd-suggest-${row.id}`}>
                  {icdItems.map((icd) => (
                    <option key={icd.id} value={icd.code}>
                      {icd.description}
                    </option>
                  ))}
                </datalist>
                <input
                  value={row.tariffCode ?? ""}
                  onChange={(e) => setField(row.id, { tariffCode: e.target.value })}
                  className="h-10 rounded-md border border-border/40 bg-background px-2 font-mono text-[13px] font-semibold outline-none focus:border-primary/40"
                  placeholder="0190"
                />
                <input
                  type="number"
                  min={1}
                  value={row.quantity ?? 1}
                  onChange={(e) => setField(row.id, { quantity: Number(e.target.value) || 1 })}
                  className="h-10 rounded-md border border-border/40 bg-background px-2 text-[13px] outline-none"
                />
                <input
                  type="number"
                  min={0}
                  step={0.01}
                  value={row.amount ?? 0}
                  onChange={(e) => setField(row.id, { amount: Number(e.target.value) || 0 })}
                  className="h-10 rounded-md border border-border/40 bg-background px-2 text-[13px] font-semibold tabular-nums outline-none"
                />
                <button
                  type="button"
                  onClick={() => removeLine(row.id)}
                  className="inline-flex size-10 items-center justify-center rounded-md text-muted-foreground hover:bg-rose-500/10 hover:text-rose-600"
                >
                  <Trash className="size-4" />
                </button>
              </div>
            ))
          )}
        </div>
      </div>
      </div>
    </EditorShell>
  )
}

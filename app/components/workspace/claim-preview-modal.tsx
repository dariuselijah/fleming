"use client"

import {
  buildDraftClaimForSubmit,
  fetchPracticeClaimsForWorkspace,
  patientSessionToMedikreditPayload,
  practiceClaimLinesToMedikredit,
  useWorkspace,
  useWorkspaceStore,
} from "@/lib/clinical-workspace"
import { usePracticeCrypto } from "@/lib/clinical-workspace/practice-crypto-context"
import type { ClaimLine } from "@/lib/clinical-workspace/types"
import { fetchClient } from "@/lib/fetch"
import {
  getModifiersForDiscipline,
  type Discipline,
  type ModifierDef,
  DISCIPLINE_LABELS,
} from "@/lib/medikredit/modifier-catalog"
import { validateClaimModifiers, type ValidationResult } from "@/lib/medikredit/modifier-validator"
import {
  calculateAnaestheticUnits,
  calculateAnaestheticAmount,
} from "@/lib/medikredit/anesthetic-calculator"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { cn } from "@/lib/utils"
import {
  SpinnerGap,
  Trash,
  Plus,
  WarningCircle,
  XCircle,
  Stethoscope,
  CaretDown,
  X,
  ArrowsClockwise,
  FloppyDisk,
} from "@phosphor-icons/react"
import { useEffect, useMemo, useRef, useState } from "react"

const MAX_MODIFIERS_PER_LINE = 5

const ANAESTHETIC_DISCIPLINES: Discipline[] = ["medical"]

// ── Modifier badge colors by type ──
const MOD_TYPE_COLORS: Record<string, string> = {
  informational: "bg-sky-500/15 text-sky-600 dark:text-sky-400",
  reduction: "bg-red-500/15 text-red-600 dark:text-red-400",
  add: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
  compound: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
}

export function ClaimPreviewModal() {
  const { practiceId } = usePracticeCrypto()
  const {
    activePatient,
    activeDoctorId,
    setClaimDraftLines,
    dismissClaimPreview,
    recordClaimSubmissionSuccess,
    setPatientRemoteDraftClaimId,
  } = useWorkspace()

  const shouldShow = Boolean(
    activePatient?.consultSigned &&
      activePatient.clinicalEncounterId &&
      !activePatient.claimSubmitted &&
      !activePatient.claimPreviewDismissed
  )

  const patientId = activePatient?.patientId

  // ── Discipline state ──
  const [discipline, setDiscipline] = useState<Discipline>("medical")
  const [isSpecialist, setIsSpecialist] = useState(true)
  const availableModifiers = useMemo(() => getModifiersForDiscipline(discipline), [discipline])

  // ── Anaesthetic helper state ──
  const [anDuration, setAnDuration] = useState(0)
  const [anBasicUnits, setAnBasicUnits] = useState(3)
  const [anRcf, setAnRcf] = useState(39.895)

  const anBreakdown = useMemo(() => {
    if (anDuration <= 0 || anBasicUnits <= 0) return null
    return calculateAnaestheticUnits({
      basicAnUnits: anBasicUnits,
      durationMinutes: anDuration,
      isSpecialist,
    })
  }, [anDuration, anBasicUnits, isSpecialist])

  const anTotalAmount = useMemo(() => {
    if (!anBreakdown || anRcf <= 0) return 0
    return calculateAnaestheticAmount(anBreakdown.effectiveUnits, anRcf)
  }, [anBreakdown, anRcf])

  // ── Draft line init ──
  useEffect(() => {
    if (!shouldShow || !activePatient || !patientId) return
    if (activePatient.claimDraftLines !== null && activePatient.claimDraftLines !== undefined) return
    const draft = buildDraftClaimForSubmit(activePatient, activeDoctorId)
    setClaimDraftLines(patientId, draft.lines)
  }, [shouldShow, activePatient, activeDoctorId, patientId, setClaimDraftLines])

  const lines = activePatient?.claimDraftLines ?? null

  /**
   * Persist a server draft as soon as the preview has lines so Billing always has a row
   * (signing alone does not insert into practice_claims — only this API does).
   */
  const autoDraftKeyRef = useRef<string | null>(null)

  useEffect(() => {
    if (!shouldShow) {
      autoDraftKeyRef.current = null
      return
    }
    if (!practiceId || !patientId || !activePatient?.clinicalEncounterId) return
    if (activePatient.remoteDraftClaimId) return
    if (!lines?.length) return

    const key = `${patientId}:${activePatient.clinicalEncounterId}`
    if (autoDraftKeyRef.current === key) return
    autoDraftKeyRef.current = key

    const timer = window.setTimeout(async () => {
      const st = useWorkspaceStore.getState()
      const p = st.openPatients.find((x) => x.patientId === patientId)
      const latestLines = p?.claimDraftLines
      if (!p?.clinicalEncounterId || !latestLines?.length) return
      if (p.remoteDraftClaimId || p.claimSubmitted) return

      try {
        const res = await fetchClient("/api/clinical/practice-claims/draft", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            practiceId,
            patientId,
            clinicalEncounterId: p.clinicalEncounterId,
            claimId: null,
            lines: latestLines,
          }),
        })
        const text = await res.text()
        let j: { claimId?: string; error?: string }
        try {
          j = JSON.parse(text) as { claimId?: string; error?: string }
        } catch {
          throw new Error(text || "Auto-save draft failed")
        }
        if (!res.ok) throw new Error(j.error || text || "Auto-save draft failed")
        if (j.claimId) setPatientRemoteDraftClaimId(patientId, j.claimId)
        const nextClaims = await fetchPracticeClaimsForWorkspace(practiceId)
        useWorkspaceStore.getState().setClaims(nextClaims)
      } catch (e) {
        console.warn("[ClaimPreviewModal] auto-draft", e)
        autoDraftKeyRef.current = null
      }
    }, 900)

    return () => window.clearTimeout(timer)
  }, [
    shouldShow,
    practiceId,
    patientId,
    activePatient?.clinicalEncounterId,
    activePatient?.remoteDraftClaimId,
    activePatient?.claimSubmitted,
    lines?.length,
    setPatientRemoteDraftClaimId,
  ])

  // ── Validation ──
  const validationResults = useMemo<ValidationResult[]>(() => {
    if (!lines?.length) return []
    const treatmentDate = new Date().toISOString().slice(0, 10)
    const mkLines = practiceClaimLinesToMedikredit(lines, treatmentDate)
    return validateClaimModifiers({
      lines: mkLines,
      discipline,
      isSpecialist,
      durationMinutes: anDuration > 0 ? anDuration : undefined,
    })
  }, [lines, discipline, isSpecialist, anDuration])

  const hasErrors = validationResults.some((r) => r.severity === "error")

  // ── Totals ──
  const totalAmount = useMemo(
    () => (lines ?? []).reduce((s, l) => s + (l.amount ?? 0), 0),
    [lines]
  )

  const [sendLoading, setSendLoading] = useState(false)
  const [sendError, setSendError] = useState<string | null>(null)
  const [saveLoading, setSaveLoading] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const treatmentDate = useMemo(() => new Date().toISOString().slice(0, 10), [])

  // ── Line helpers ──
  const updateLine = (id: string, patch: Partial<ClaimLine>) => {
    if (!patientId || !lines) return
    setClaimDraftLines(
      patientId,
      lines.map((l) => (l.id === id ? { ...l, ...patch } : l))
    )
  }

  const removeLine = (id: string) => {
    if (!patientId || !lines) return
    const next = lines.filter((l) => l.id !== id)
    setClaimDraftLines(patientId, next.length ? next : lines)
  }

  const addLine = () => {
    if (!patientId || !activePatient) return
    const lineType = activePatient.medicalAidStatus === "active" ? "medical_aid" : "cash"
    const row: ClaimLine = {
      id: `cl-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      description: "Line item",
      amount: 0,
      lineType,
      status: "draft",
      medikreditTp: 2,
    }
    setClaimDraftLines(patientId, [...(lines ?? []), row])
  }

  const addModifierToLine = (lineId: string, modCode: string) => {
    if (!patientId || !lines) return
    setClaimDraftLines(
      patientId,
      lines.map((l) => {
        if (l.id !== lineId) return l
        const existing = l.modifierCodes ?? []
        if (existing.length >= MAX_MODIFIERS_PER_LINE || existing.includes(modCode)) return l
        return { ...l, modifierCodes: [...existing, modCode] }
      })
    )
  }

  const removeModifierFromLine = (lineId: string, modCode: string) => {
    if (!patientId || !lines) return
    setClaimDraftLines(
      patientId,
      lines.map((l) => {
        if (l.id !== lineId) return l
        return { ...l, modifierCodes: (l.modifierCodes ?? []).filter((c) => c !== modCode) }
      })
    )
  }

  // ── Send ──
  const handleSend = async () => {
    if (!practiceId || !activePatient?.clinicalEncounterId || !lines?.length) return
    setSendLoading(true)
    setSendError(null)
    try {
      const mkLines = practiceClaimLinesToMedikredit(lines, treatmentDate)
      const res = await fetchClient("/api/clinical/medikredit/claim", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          practiceId,
          patient: patientSessionToMedikreditPayload(activePatient),
          lines: mkLines,
          clinicalEncounterId: activePatient.clinicalEncounterId,
        }),
      })
      const text = await res.text()
      if (!res.ok) {
        setSendError(text || `Claim failed (${res.status})`)
        return
      }
      const j = JSON.parse(text) as { claimId?: string }
      if (activePatient.remoteDraftClaimId) {
        await fetchClient(
          `/api/clinical/practice-claims/draft?id=${encodeURIComponent(activePatient.remoteDraftClaimId)}&practiceId=${encodeURIComponent(practiceId)}`,
          { method: "DELETE" }
        )
      }
      recordClaimSubmissionSuccess(activePatient.patientId, j.claimId)
      const nextClaims = await fetchPracticeClaimsForWorkspace(practiceId)
      useWorkspaceStore.getState().setClaims(nextClaims)
    } catch (e) {
      setSendError(e instanceof Error ? e.message : "Claim failed")
    } finally {
      setSendLoading(false)
    }
  }

  const onOpenChange = (open: boolean) => {
    if (!open && patientId) dismissClaimPreview(patientId)
  }

  const handleRegenerate = () => {
    if (!patientId || !activePatient) return
    const draft = buildDraftClaimForSubmit(activePatient, activeDoctorId)
    setClaimDraftLines(patientId, draft.lines)
  }

  const handleSaveForLater = async () => {
    if (!practiceId || !activePatient || !patientId || !lines?.length) return
    setSaveLoading(true)
    setSaveError(null)
    try {
      const res = await fetchClient("/api/clinical/practice-claims/draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          practiceId,
          patientId,
          clinicalEncounterId: activePatient.clinicalEncounterId ?? null,
          claimId: activePatient.remoteDraftClaimId ?? null,
          lines,
        }),
      })
      const text = await res.text()
      let j: { claimId?: string; error?: string }
      try {
        j = JSON.parse(text) as { claimId?: string; error?: string }
      } catch {
        throw new Error(text || "Save failed")
      }
      if (!res.ok) throw new Error(j.error || text || "Save failed")
      if (j.claimId) setPatientRemoteDraftClaimId(patientId, j.claimId)
      const nextClaims = await fetchPracticeClaimsForWorkspace(practiceId)
      useWorkspaceStore.getState().setClaims(nextClaims)
      dismissClaimPreview(patientId)
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "Save failed")
    } finally {
      setSaveLoading(false)
    }
  }

  return (
    <Dialog open={shouldShow} onOpenChange={onOpenChange}>
      <DialogContent
        className="flex max-h-[min(90vh,880px)] max-w-[calc(100%-1rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-5xl"
        hasCloseButton
      >
        <div className="border-b border-border/60 px-6 py-4">
          <DialogHeader>
            <DialogTitle>Review MediKredit claim</DialogTitle>
            <DialogDescription>
              Review and edit line items and modifiers. Regenerate rebuilds lines from the chart (meds, diagnoses,
              documents). Save for later stores a draft on the Claims page.
            </DialogDescription>
          </DialogHeader>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-1.5 text-[11px]">
              <span className="text-muted-foreground">Discipline</span>
              <select
                className="rounded border border-border/60 bg-background px-1.5 py-1 text-[11px]"
                value={discipline}
                onChange={(e) => setDiscipline(e.target.value as Discipline)}
              >
                {Object.entries(DISCIPLINE_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-1.5 text-[11px]">
              <input
                type="checkbox"
                checked={isSpecialist}
                onChange={(e) => setIsSpecialist(e.target.checked)}
                className="rounded"
              />
              <span className="text-muted-foreground">Specialist</span>
            </label>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
          <div className="space-y-4">
            {/* ── Line items table ── */}
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-medium text-muted-foreground">Line items</p>
              <button
                type="button"
                onClick={addLine}
                className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[11px] font-medium hover:bg-muted"
              >
                <Plus className="size-3.5" weight="bold" />
                Add line
              </button>
            </div>

            <div className="overflow-x-auto rounded-lg border border-border/60">
              <table className="w-full min-w-[860px] text-left text-[11px]">
                <thead className="bg-muted/40 text-[10px] uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-2 py-2 font-medium">Type</th>
                    <th className="px-2 py-2 font-medium">Description</th>
                    <th className="px-2 py-2 font-medium">ICD</th>
                    <th className="px-2 py-2 font-medium">Tariff</th>
                    <th className="px-2 py-2 font-medium">NAPPI</th>
                    <th className="px-2 py-2 font-medium">Modifiers</th>
                    <th className="px-2 py-2 font-medium">ZAR</th>
                    <th className="w-8 px-1 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {(lines ?? []).map((line) => (
                    <tr key={line.id} className="border-t border-border/40">
                      <td className="px-2 py-1 align-top">
                        <select
                          className="w-full max-w-[100px] rounded border border-border/60 bg-background px-1 py-1"
                          value={line.medikreditTp ?? (line.nappiCode ? 1 : 2)}
                          onChange={(e) => {
                            const v = Number(e.target.value) as 1 | 2 | 3
                            updateLine(line.id, { medikreditTp: v })
                          }}
                        >
                          <option value={2}>Procedure</option>
                          <option value={1}>Medication</option>
                          <option value={3}>Modifier</option>
                        </select>
                      </td>
                      <td className="px-2 py-1 align-top">
                        <input
                          className="w-full min-w-[120px] rounded border border-border/60 bg-background px-1.5 py-1"
                          value={line.description}
                          onChange={(e) => updateLine(line.id, { description: e.target.value })}
                        />
                      </td>
                      <td className="px-2 py-1 align-top">
                        <input
                          className="w-20 rounded border border-border/60 bg-background px-1.5 py-1 font-mono"
                          value={line.icdCode ?? ""}
                          placeholder="—"
                          onChange={(e) => updateLine(line.id, { icdCode: e.target.value || undefined })}
                        />
                      </td>
                      <td className="px-2 py-1 align-top">
                        <input
                          className="w-20 rounded border border-border/60 bg-background px-1.5 py-1 font-mono"
                          value={line.tariffCode ?? ""}
                          placeholder="—"
                          onChange={(e) => updateLine(line.id, { tariffCode: e.target.value || undefined })}
                        />
                      </td>
                      <td className="px-2 py-1 align-top">
                        <input
                          className="w-24 rounded border border-border/60 bg-background px-1.5 py-1 font-mono"
                          value={line.nappiCode ?? ""}
                          placeholder="—"
                          onChange={(e) => updateLine(line.id, { nappiCode: e.target.value || undefined })}
                        />
                      </td>
                      <td className="px-2 py-1 align-top">
                        <ModifierCell
                          lineId={line.id}
                          codes={line.modifierCodes ?? []}
                          available={availableModifiers}
                          onAdd={(code) => addModifierToLine(line.id, code)}
                          onRemove={(code) => removeModifierFromLine(line.id, code)}
                        />
                      </td>
                      <td className="px-2 py-1 align-top">
                        <input
                          type="number"
                          step="0.01"
                          className="w-24 rounded border border-border/60 bg-background px-1.5 py-1 tabular-nums"
                          value={Number.isFinite(line.amount) ? line.amount : 0}
                          onChange={(e) =>
                            updateLine(line.id, { amount: parseFloat(e.target.value) || 0 })
                          }
                        />
                      </td>
                      <td className="px-1 py-1 align-top">
                        <button
                          type="button"
                          title="Remove line"
                          disabled={(lines?.length ?? 0) <= 1}
                          onClick={() => removeLine(line.id)}
                          className={cn(
                            "rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive",
                            (lines?.length ?? 0) <= 1 && "pointer-events-none opacity-30"
                          )}
                        >
                          <Trash className="size-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-border/60 bg-muted/20">
                    <td colSpan={6} className="px-2 py-2 text-right text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                      Total
                    </td>
                    <td className="px-2 py-2 tabular-nums font-semibold">
                      R {totalAmount.toFixed(2)}
                    </td>
                    <td />
                  </tr>
                </tfoot>
              </table>
            </div>

            {/* ── Anaesthetic helper — only for anaesthesia-relevant disciplines ── */}
            {ANAESTHETIC_DISCIPLINES.includes(discipline) && (
            <details className="rounded-lg border border-border/60">
              <summary className="flex cursor-pointer items-center gap-2 px-3 py-2 text-[11px] font-medium text-muted-foreground hover:text-foreground">
                <Stethoscope className="size-3.5" />
                Anaesthetic unit calculator
                <CaretDown className="size-3" />
              </summary>
              <div className="border-t border-border/40 px-3 py-3">
                <div className="flex flex-wrap items-end gap-3 text-[11px]">
                  <label className="flex flex-col gap-0.5">
                    <span className="text-muted-foreground">Basic AN units</span>
                    <input
                      type="number"
                      min={0}
                      step={1}
                      className="w-20 rounded border border-border/60 bg-background px-1.5 py-1 tabular-nums"
                      value={anBasicUnits}
                      onChange={(e) => setAnBasicUnits(parseFloat(e.target.value) || 0)}
                    />
                  </label>
                  <label className="flex flex-col gap-0.5">
                    <span className="text-muted-foreground">Duration (min)</span>
                    <input
                      type="number"
                      min={0}
                      step={15}
                      className="w-20 rounded border border-border/60 bg-background px-1.5 py-1 tabular-nums"
                      value={anDuration}
                      onChange={(e) => setAnDuration(parseInt(e.target.value, 10) || 0)}
                    />
                  </label>
                  <label className="flex flex-col gap-0.5">
                    <span className="text-muted-foreground">RCF (R)</span>
                    <input
                      type="number"
                      step={0.001}
                      className="w-24 rounded border border-border/60 bg-background px-1.5 py-1 tabular-nums"
                      value={anRcf}
                      onChange={(e) => setAnRcf(parseFloat(e.target.value) || 0)}
                    />
                  </label>
                </div>
                {anBreakdown && (
                  <div className="mt-3 space-y-1 text-[11px]">
                    <div className="grid grid-cols-2 gap-x-4 gap-y-1 max-w-xs">
                      <span className="text-muted-foreground">Basic units</span>
                      <span className="tabular-nums font-medium">{anBreakdown.basicUnits.toFixed(2)}</span>
                      <span className="text-muted-foreground">Time units (0023)</span>
                      <span className="tabular-nums font-medium">{anBreakdown.timeUnits.toFixed(2)}</span>
                      {anBreakdown.minimumRuleApplied && (
                        <>
                          <span className="text-muted-foreground">Minimum bridge (0035)</span>
                          <span className="tabular-nums font-medium">{anBreakdown.minimumBridgeUnits.toFixed(2)}</span>
                        </>
                      )}
                      <span className="text-muted-foreground">Total before reduction</span>
                      <span className="tabular-nums font-medium">{anBreakdown.totalUnitsBeforeReduction.toFixed(2)}</span>
                      {anBreakdown.gpReductionApplied && (
                        <>
                          <span className="text-muted-foreground">GP reduction (0036, 80%)</span>
                          <span className="tabular-nums font-medium text-amber-500">x{anBreakdown.reductionFactor}</span>
                        </>
                      )}
                      <span className="font-semibold">Effective units</span>
                      <span className="tabular-nums font-bold">{anBreakdown.effectiveUnits.toFixed(2)}</span>
                      <span className="font-semibold">Total amount</span>
                      <span className="tabular-nums font-bold">R {anTotalAmount.toFixed(2)}</span>
                    </div>
                  </div>
                )}
              </div>
            </details>
            )}

            {/* ── Validation warnings ── */}
            {validationResults.length > 0 && (
              <div className="rounded-lg border border-border/60 p-3">
                <p className="mb-2 text-[11px] font-medium text-muted-foreground">Validation</p>
                <div className="space-y-1">
                  {validationResults.map((r, i) => (
                    <div
                      key={`${r.ruleId}-${r.lineNumber}-${i}`}
                      className={cn(
                        "flex items-start gap-1.5 text-[11px]",
                        r.severity === "error" ? "text-destructive" : "text-amber-600 dark:text-amber-400"
                      )}
                    >
                      {r.severity === "error" ? (
                        <XCircle className="mt-0.5 size-3.5 shrink-0" weight="fill" />
                      ) : (
                        <WarningCircle className="mt-0.5 size-3.5 shrink-0" weight="fill" />
                      )}
                      <span>{r.message}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {sendError && <p className="text-[11px] text-destructive">{sendError}</p>}
            {saveError && <p className="text-[11px] text-destructive">{saveError}</p>}
          </div>
        </div>

        <DialogFooter className="flex flex-wrap items-center justify-end gap-2 border-t border-border/60 px-6 py-4 sm:gap-3">
          <button
            type="button"
            onClick={handleRegenerate}
            className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-2 text-xs font-medium hover:bg-muted"
            title="Rebuild lines from chart context (medications, encounter problems, scribe entities, documents)"
          >
            <ArrowsClockwise className="size-3.5" />
            Regenerate
          </button>
          <button
            type="button"
            disabled={saveLoading || !lines?.length}
            onClick={() => void handleSaveForLater()}
            className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-2 text-xs font-medium hover:bg-muted disabled:opacity-50"
          >
            {saveLoading && <SpinnerGap className="size-4 animate-spin" />}
            <FloppyDisk className="size-3.5" />
            Save for later
          </button>
          <button
            type="button"
            disabled={sendLoading || !lines?.length || hasErrors}
            onClick={() => void handleSend()}
            className="inline-flex items-center gap-2 rounded-md bg-emerald-600 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
          >
            {sendLoading && <SpinnerGap className="size-4 animate-spin" />}
            Send to MediKredit
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ── Modifier cell component ──

function ModifierCell({
  lineId,
  codes,
  available,
  onAdd,
  onRemove,
}: {
  lineId: string
  codes: string[]
  available: ModifierDef[]
  onAdd: (code: string) => void
  onRemove: (code: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState("")

  const filtered = useMemo(() => {
    if (!search.trim()) return available.slice(0, 30)
    const q = search.toLowerCase()
    return available.filter(
      (m) =>
        m.code.includes(q) ||
        m.description.toLowerCase().includes(q)
    ).slice(0, 30)
  }, [available, search])

  return (
    <div className="min-w-[100px]">
      <Popover
        open={open}
        onOpenChange={(next) => {
          setOpen(next)
          if (!next) setSearch("")
        }}
        modal={false}
      >
        <div className="flex flex-wrap items-center gap-0.5">
          {codes.map((c) => {
            const def = available.find((m) => m.code === c)
            const color = def ? MOD_TYPE_COLORS[def.modifierType] ?? "" : "bg-muted"
            return (
              <span
                key={c}
                className={cn("inline-flex items-center gap-0.5 rounded px-1 py-0.5 text-[9px] font-semibold", color)}
                title={def?.description}
              >
                {c}
                <button type="button" onClick={() => onRemove(c)} className="hover:opacity-70">
                  <X className="size-2.5" />
                </button>
              </span>
            )
          })}
          {codes.length < MAX_MODIFIERS_PER_LINE && (
            <PopoverTrigger asChild>
              <button
                type="button"
                className="inline-flex size-5 items-center justify-center rounded border border-dashed border-border/60 text-muted-foreground hover:bg-muted hover:text-foreground"
                title="Add modifier"
              >
                <Plus className="size-3" weight="bold" />
              </button>
            </PopoverTrigger>
          )}
        </div>

        <PopoverContent
          align="start"
          side="bottom"
          sideOffset={6}
          collisionPadding={12}
          className={cn(
            "z-[100] w-[min(18rem,calc(100vw-2rem))] max-h-[min(22rem,calc(100vh-6rem))] flex flex-col overflow-hidden p-0 shadow-lg",
            "data-[state=open]:animate-in data-[state=closed]:animate-out"
          )}
          onCloseAutoFocus={(e) => e.preventDefault()}
        >
          <div className="shrink-0 border-b border-border/60 p-1.5">
            <input
              type="text"
              placeholder="Search modifiers..."
              className="w-full rounded border border-border/60 bg-background px-2 py-1 text-[11px] placeholder:text-muted-foreground/50 focus:outline-none"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              autoFocus
            />
          </div>
          <div
            className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-1 [scrollbar-width:thin]"
            style={{ maxHeight: "min(14rem, 40vh)" }}
          >
            {filtered.length === 0 && (
              <p className="p-2 text-center text-[10px] text-muted-foreground">No modifiers found</p>
            )}
            {filtered.map((m) => {
              const alreadyAdded = codes.includes(m.code)
              return (
                <button
                  key={`${lineId}:${m.discipline}:${m.code}`}
                  type="button"
                  disabled={alreadyAdded}
                  className={cn(
                    "flex w-full items-start gap-2 rounded px-2 py-1.5 text-left text-[10px] transition-colors hover:bg-muted",
                    alreadyAdded && "opacity-40"
                  )}
                  onClick={() => {
                    onAdd(m.code)
                    setOpen(false)
                    setSearch("")
                  }}
                >
                  <span className="shrink-0 font-mono font-bold">{m.code}</span>
                  <span className="min-w-0 flex-1 text-muted-foreground">{m.description}</span>
                  <span
                    className={cn(
                      "shrink-0 rounded px-1 py-0.5 text-[8px] font-semibold uppercase",
                      MOD_TYPE_COLORS[m.modifierType] ?? "bg-muted"
                    )}
                  >
                    {m.modifierType.slice(0, 3)}
                  </span>
                </button>
              )
            })}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  )
}

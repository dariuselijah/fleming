"use client"

import {
  useWorkspaceStore,
  type PracticeClaim,
  type PracticePatient,
  type ClaimLine,
  type ClaimLineType,
  type ClaimStatus,
  practicePatientToMedikreditPayload,
  practiceClaimLinesToMedikredit,
} from "@/lib/clinical-workspace"
import type { BillingMode } from "@/lib/billing/types"
import type { ClaimResponse } from "@/lib/medikredit/types"
import { ClaimModifierPicker, MAX_MODIFIERS_PER_LINE } from "@/app/components/medikredit/claim-modifier-picker"
import { getModifiersForDiscipline, type Discipline } from "@/lib/medikredit/modifier-catalog"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { usePracticeCrypto } from "@/lib/clinical-workspace/practice-crypto-context"
import { fetchPracticeClaimsForWorkspace } from "@/lib/clinical-workspace/refresh-practice-claims"
import { fetchClient } from "@/lib/fetch"
import { createClient } from "@/lib/supabase/client"
import { cn } from "@/lib/utils"
import { AssistantModalSuppressor } from "@/app/components/assistant/assistant-modal-suppressor"
import {
  ArrowsClockwise,
  Check,
  Copy,
  CreditCard,
  MagnifyingGlass,
  PaperPlaneTilt,
  PencilSimple,
  Plus,
  Printer,
  Receipt,
  Trash,
  Warning,
  X,
} from "@phosphor-icons/react"
import { motion } from "motion/react"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"

const BILLING_MODIFIER_DISCIPLINE: Discipline = "medical"
const CLAIM_SUBMISSION_TIMEOUT_MS = 150_000

const STATUS_BADGE: Record<string, string> = {
  draft: "bg-muted text-muted-foreground dark:bg-secondary dark:text-muted-foreground",
  submitted: "bg-blue-500/15 text-blue-400",
  approved: "bg-status-success/15 text-status-success",
  rejected: "bg-status-danger/15 text-status-danger",
  paid: "bg-status-success/20 text-status-success",
  partial: "bg-purple-500/15 text-purple-400",
  reversed: "bg-amber-500/15 text-amber-300",
}

function medResponseLooksAdjudicated(med: ClaimResponse | null | undefined): boolean {
  if (!med || typeof med !== "object") return false
  if (med.txNbr) return true
  if (Array.isArray(med.itemStatuses) && med.itemStatuses.length > 0) return true
  return (
    med.outcome === "approved" ||
    med.outcome === "partially_approved" ||
    med.outcome === "rejected" ||
    med.outcome === "duplicate"
  )
}

function ClaimInvoiceFooter({
  claim,
  practiceId,
  cashAmount,
  medicalAidAmount,
  onInvoiceCreated,
  onClaimPaid,
}: {
  claim: PracticeClaim
  practiceId: string | null
  cashAmount: number
  medicalAidAmount: number
  onInvoiceCreated?: (invoiceId: string) => void
  onClaimPaid?: () => void
}) {
  const [invoiceId, setInvoiceId] = useState<string | null>(null)
  const [invoiceStatus, setInvoiceStatus] = useState<string | null>(null)
  const [invoiceTotalCents, setInvoiceTotalCents] = useState<number | null>(null)
  const [invoicePaidCents, setInvoicePaidCents] = useState<number | null>(null)
  const [loading, setLoading] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [manualZar, setManualZar] = useState(cashAmount > 0 ? String(cashAmount) : "")
  const [checkoutUrl, setCheckoutUrl] = useState<string | null>(null)
  const [eftUrl, setEftUrl] = useState<string | null>(null)
  const [portalUrl, setPortalUrl] = useState<string | null>(null)

  const [dangerAckUnadjudicated, setDangerAckUnadjudicated] = useState(false)
  const [invoicePopoverOpen, setInvoicePopoverOpen] = useState(false)
  const [overrideDialogOpen, setOverrideDialogOpen] = useState(false)

  useEffect(() => {
    const med = claim.medikreditResponse as ClaimResponse | undefined | null
    const liability = claimResponsePatientLiability(med)
    const fallback = liability > 0 ? liability : cashAmount > 0 ? cashAmount : claim.totalAmount
    setManualZar(fallback > 0 ? String(fallback) : "")
  }, [claim.id, claim.medikreditResponse, claim.totalAmount, cashAmount])

  useEffect(() => {
    setInvoiceId(null)
    setInvoiceStatus(null)
    setInvoiceTotalCents(null)
    setInvoicePaidCents(null)
    setMsg(null)
    setCheckoutUrl(null)
    setEftUrl(null)
    setPortalUrl(null)
    setDangerAckUnadjudicated(false)
  }, [claim.id, claim.lines])

  useEffect(() => {
    if (!practiceId) return
    let cancelled = false
    ;(async () => {
      const res = await fetchClient("/api/billing/invoices")
      if (!res.ok || cancelled) return
      const j = (await res.json()) as {
        invoices?: {
          id: string
          claim_id: string | null
          status: string
          total_cents?: number | null
          amount_paid_cents?: number | null
        }[]
      }
      const row = j.invoices?.find((i) => i.claim_id === claim.id)
      if (row) {
        setInvoiceId(row.id)
        setInvoiceStatus(row.status)
        setInvoiceTotalCents(typeof row.total_cents === "number" ? row.total_cents : null)
        setInvoicePaidCents(typeof row.amount_paid_cents === "number" ? row.amount_paid_cents : null)
      } else {
        setInvoiceId(null)
        setInvoiceStatus(null)
        setInvoiceTotalCents(null)
        setInvoicePaidCents(null)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [claim.id, practiceId])

  const billingMode: BillingMode = useMemo(() => {
    if (medicalAidAmount > 0 && cashAmount > 0) return "split"
    if (medicalAidAmount > 0) return "scheme_only"
    if (cashAmount > 0) return "cash"
    return "card"
  }, [cashAmount, medicalAidAmount])

  const medParsed = claim.medikreditResponse as ClaimResponse | undefined | null
  const adjudicated = medResponseLooksAdjudicated(medParsed ?? undefined)
  const schemePure = medicalAidAmount > 0 && cashAmount <= 0
  const patientLiabZar = claimResponsePatientLiability(medParsed)
  const remainingInvoiceCents = Math.max(0, (invoiceTotalCents ?? 0) - (invoicePaidCents ?? 0))
  const estimatedPatientDueZar = patientLiabZar > 0 ? patientLiabZar : cashAmount > 0 ? cashAmount : claim.totalAmount

  const createInvoice = async (billOpts?: { forceFullClaimInvoice?: boolean }): Promise<string | null> => {
    if (!practiceId) return null
    setLoading(true)
    setMsg(null)
    try {
      let shortfallCents: number | undefined
      if (billingMode === "scheme_only" && adjudicated && patientLiabZar > 0 && !billOpts?.forceFullClaimInvoice) {
        shortfallCents = Math.round(patientLiabZar * 100)
      }

      const res = await fetchClient("/api/billing/invoices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          claimId: claim.id,
          billingMode,
          ...(typeof shortfallCents === "number" ? { shortfallCents } : {}),
          ...(billOpts?.forceFullClaimInvoice ? { forceFullClaimInvoice: true } : {}),
        }),
      })
      const j = (await res.json()) as { invoiceId?: string; error?: string }
      if (!res.ok) throw new Error(j.error || "Failed")
      setInvoiceId(j.invoiceId ?? null)
      setInvoiceStatus("draft")
      const estimatedTotal = typeof shortfallCents === "number" ? shortfallCents : Math.round(estimatedPatientDueZar * 100)
      setInvoiceTotalCents(estimatedTotal > 0 ? estimatedTotal : null)
      setInvoicePaidCents(0)
      setMsg("Invoice created (draft)")
      if (j.invoiceId) onInvoiceCreated?.(j.invoiceId)
      return j.invoiceId ?? null
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Failed")
      return null
    } finally {
      setLoading(false)
    }
  }

  const ensureInvoice = async (billOpts?: { forceFullClaimInvoice?: boolean }): Promise<string | null> => {
    if (invoiceId) return invoiceId
    if (noPatientInvoiceNeeded) {
      setMsg("No patient invoice required")
      return null
    }
    if (schemePure && !adjudicated && !billOpts?.forceFullClaimInvoice) {
      setOverrideDialogOpen(true)
      return null
    }
    return createInvoice(billOpts)
  }

  const issueInvoice = async () => {
    if (!invoiceId || !practiceId) return
    setLoading(true)
    setMsg(null)
    try {
      const res = await fetchClient(`/api/billing/invoices/${invoiceId}/issue`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      })
      const j = (await res.json()) as { error?: string }
      if (!res.ok) throw new Error(j.error || "Failed")
      setInvoiceStatus("issued")
      setMsg("Invoice issued")
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Failed")
    } finally {
      setLoading(false)
    }
  }

  const markPaidManually = async () => {
    if (!practiceId) return
    const id = await ensureInvoice()
    if (!id) return
    const manualAmount = manualZar.trim()
      ? parseFloat(manualZar.replace(",", "."))
      : remainingInvoiceCents > 0
        ? remainingInvoiceCents / 100
        : estimatedPatientDueZar
    const cents = Math.round(manualAmount * 100)
    if (!Number.isFinite(cents) || cents <= 0) {
      setMsg("Enter a valid amount")
      return
    }
    const idem = `manual-${id}-${crypto.randomUUID()}`
    setLoading(true)
    setMsg(null)
    try {
      const res = await fetchClient(`/api/billing/invoices/${id}/payments`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Idempotency-Key": idem },
        body: JSON.stringify({
          provider: "eft_manual",
          amountCents: cents,
          reference: "Manual settlement from claim screen",
        }),
      })
      const j = (await res.json()) as { error?: string; invoiceStatus?: string }
      if (!res.ok) throw new Error(j.error || "Failed")
      if (j.invoiceStatus) setInvoiceStatus(j.invoiceStatus)
      setInvoicePaidCents((prev) => (prev ?? 0) + cents)
      setMsg("Marked paid")
      if (j.invoiceStatus === "paid") onClaimPaid?.()
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Failed")
    } finally {
      setLoading(false)
    }
  }

  const startCard = async () => {
    if (!invoiceId || !practiceId) return
    setLoading(true)
    setMsg(null)
    try {
      const res = await fetchClient(`/api/billing/invoices/${invoiceId}/payments`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Idempotency-Key": `polar-${invoiceId}-${crypto.randomUUID()}` },
        body: JSON.stringify({ provider: "polar" }),
      })
      const j = (await res.json()) as { checkoutUrl?: string; error?: string }
      if (!res.ok) throw new Error(j.error || "Failed")
      setCheckoutUrl(j.checkoutUrl ?? null)
      setMsg("Checkout link ready")
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Failed")
    } finally {
      setLoading(false)
    }
  }

  const startEft = async () => {
    if (!invoiceId || !practiceId) return
    setLoading(true)
    setMsg(null)
    try {
      const res = await fetchClient(`/api/billing/invoices/${invoiceId}/payments`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Idempotency-Key": `stitch-${invoiceId}-${crypto.randomUUID()}` },
        body: JSON.stringify({ provider: "stitch" }),
      })
      const j = (await res.json()) as { paymentUrl?: string; error?: string }
      if (!res.ok) throw new Error(j.error || "Failed")
      setEftUrl(j.paymentUrl ?? null)
      setMsg("EFT link ready")
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Failed")
    } finally {
      setLoading(false)
    }
  }

  const sendPortal = async () => {
    if (!invoiceId || !practiceId) return
    setLoading(true)
    setMsg(null)
    try {
      const res = await fetchClient(`/api/billing/invoices/${invoiceId}/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channels: ["sms"], issueFirst: true }),
      })
      const j = (await res.json()) as { portalUrl?: string; error?: string }
      if (!res.ok) throw new Error(j.error || "Failed")
      setMsg(j.portalUrl ? `Portal: ${j.portalUrl}` : "Sent")
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Failed")
    } finally {
      setLoading(false)
    }
  }

  const getPortalLink = async () => {
    if (!practiceId) return
    const id = await ensureInvoice()
    if (!id) return
    setLoading(true)
    setMsg(null)
    try {
      if (invoiceStatus !== "issued" && invoiceStatus !== "paid") {
        const issueRes = await fetchClient(`/api/billing/invoices/${id}/issue`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        })
        const issueJson = (await issueRes.json()) as { error?: string }
        if (!issueRes.ok) throw new Error(issueJson.error || "Failed to issue invoice")
        setInvoiceStatus("issued")
      }
      const res = await fetchClient(`/api/billing/invoices/${id}/portal-link`, { method: "POST" })
      const j = (await res.json()) as { portalUrl?: string; error?: string }
      if (!res.ok) throw new Error(j.error || "Failed")
      setPortalUrl(j.portalUrl ?? null)
      setMsg(j.portalUrl ? "Portal link ready" : "Portal link created")
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Failed")
    } finally {
      setLoading(false)
    }
  }

  const printInvoice = async () => {
    if (!practiceId) return
    const id = await ensureInvoice()
    if (!id) return
    const url = `/api/billing/invoices/${encodeURIComponent(id)}/pdf`
    const win = window.open(url, "_blank", "noopener,noreferrer")
    if (!win) {
      setMsg(`Popup blocked. Open: ${url}`)
      return
    }
    setMsg("Opening invoice PDF")
  }

  const copyUrl = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url)
      setMsg("Copied to clipboard")
    } catch {
      setMsg("Copy failed")
    }
  }

  if (!practiceId) return null

  const noPatientInvoiceNeeded = schemePure && adjudicated && patientLiabZar <= 0

  const handleInvoicePrimary = () => {
    if (invoiceId) return
    if (noPatientInvoiceNeeded) return
    if (schemePure && !adjudicated) {
      setOverrideDialogOpen(true)
      return
    }
    void createInvoice()
  }

  const confirmOverride = async () => {
    await createInvoice({ forceFullClaimInvoice: true })
    setOverrideDialogOpen(false)
    setDangerAckUnadjudicated(false)
  }

  const invoiceBtnClass =
    "flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-panel-border bg-panel-muted px-3 text-[12px] font-medium text-foreground/88 transition-colors hover:bg-secondary disabled:cursor-not-allowed disabled:opacity-35"

  return (
    <>
      <AlertDialog open={overrideDialogOpen} onOpenChange={setOverrideDialogOpen}>
        <AlertDialogContent className="max-w-md border-panel-border bg-panel text-foreground sm:max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-[15px] font-semibold tracking-tight text-foreground">
              Invoice before adjudication?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-[12px] leading-relaxed text-muted-foreground/65">
              Submitting to MediKredit first keeps patient invoices aligned with scheme shortfall. Only continue if you need a full claim invoice on purpose.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <label className="flex items-start gap-2.5 rounded-lg border border-amber-500/12 bg-amber-500/[0.05] p-3 text-[11px] leading-snug text-amber-100/85">
            <input
              type="checkbox"
              className="mt-0.5 size-3.5 rounded border-panel-border accent-amber-500"
              checked={dangerAckUnadjudicated}
              onChange={(e) => setDangerAckUnadjudicated(e.target.checked)}
            />
            <span>I understand this is exceptional and may not match scheme liability.</span>
          </label>
          <AlertDialogFooter className="gap-2 sm:gap-2">
            <AlertDialogCancel className="border-panel-border bg-transparent text-muted-foreground/75 hover:bg-secondary hover:text-accent-foreground">
              Cancel
            </AlertDialogCancel>
            <button
              type="button"
              disabled={loading || !dangerAckUnadjudicated}
              onClick={() => void confirmOverride()}
              className="inline-flex h-9 items-center justify-center rounded-lg bg-amber-500/22 px-4 text-[12px] font-semibold text-amber-100 hover:bg-amber-500/32 disabled:opacity-40"
            >
              Create invoice
            </button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <div className="flex min-w-0 flex-col gap-1">
        {invoiceId ? (
          <Popover open={invoicePopoverOpen} onOpenChange={setInvoicePopoverOpen}>
            <PopoverTrigger asChild>
              <button type="button" disabled={loading} className={invoiceBtnClass}>
                <Receipt className="size-4 shrink-0 text-emerald-400/55" weight="fill" />
                <span className="min-w-0 flex-1 truncate text-left">Invoice</span>
                {invoiceStatus ? (
                  <span className="shrink-0 rounded-full bg-secondary px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">
                    {invoiceStatus}
                  </span>
                ) : null}
              </button>
            </PopoverTrigger>
            <PopoverContent
              align="end"
              side="top"
              sideOffset={8}
              className="w-[min(100vw-2rem,20rem)] border-panel-border bg-panel p-0 shadow-2xl"
            >
              <div
                className="max-h-[min(70vh,28rem)] overflow-y-auto p-3"
                style={{ scrollbarWidth: "thin" }}
              >
                <div className="mb-3 rounded-xl border border-panel-border bg-panel-muted px-3 py-2">
                  <p className="text-[9px] font-medium uppercase tracking-[0.12em] text-muted-foreground">Patient balance</p>
                  <p className="mt-1 text-[18px] font-semibold tabular-nums tracking-tight text-foreground/90">
                    {formatClaimMoney(remainingInvoiceCents > 0 ? remainingInvoiceCents / 100 : estimatedPatientDueZar)}
                  </p>
                  <p className="mt-0.5 text-[9px] text-muted-foreground">
                    {invoiceStatus ? `Invoice ${invoiceStatus}` : "Ready to invoice"}
                  </p>
                </div>
                <p className="mb-2 text-[9px] font-medium uppercase tracking-[0.12em] text-muted-foreground">Invoice actions</p>
                <div className="grid grid-cols-2 gap-1.5">
                  <button
                    type="button"
                    disabled={loading || invoiceStatus !== "draft"}
                    onClick={() => void issueInvoice()}
                    className="rounded-lg bg-secondary px-2 py-2 text-[10px] font-semibold text-foreground/80 hover:bg-accent disabled:opacity-40"
                  >
                    Issue
                  </button>
                  <button
                    type="button"
                    disabled={loading}
                    onClick={() => void printInvoice()}
                    className="inline-flex items-center justify-center gap-1 rounded-lg bg-secondary px-2 py-2 text-[10px] font-semibold text-foreground/80 hover:bg-accent disabled:opacity-40"
                  >
                    <Printer className="size-3" />
                    Print PDF
                  </button>
                  <button
                    type="button"
                    disabled={loading}
                    onClick={() => void sendPortal()}
                    className="rounded-lg bg-blue-500/18 px-2 py-2 text-[10px] font-semibold text-blue-300 hover:bg-blue-500/28 disabled:opacity-50"
                  >
                    SMS link
                  </button>
                  <button
                    type="button"
                    disabled={loading}
                    onClick={() => void getPortalLink()}
                    className="rounded-lg bg-cyan-500/14 px-2 py-2 text-[10px] font-semibold text-cyan-300 hover:bg-cyan-500/24 disabled:opacity-50"
                  >
                    Pay link
                  </button>
                  <button
                    type="button"
                    disabled={loading}
                    onClick={() => void startCard()}
                    className="inline-flex items-center justify-center gap-1 rounded-lg bg-indigo-500/18 px-2 py-2 text-[10px] font-semibold text-indigo-300 hover:bg-indigo-500/28 disabled:opacity-50"
                  >
                    <CreditCard className="size-3" />
                    Card
                  </button>
                  <button
                    type="button"
                    disabled={loading}
                    onClick={() => void startEft()}
                    className="rounded-lg bg-cyan-500/14 px-2 py-2 text-[10px] font-semibold text-cyan-300 hover:bg-cyan-500/24 disabled:opacity-50"
                  >
                    EFT
                  </button>
                  <button
                    type="button"
                    disabled
                    title="Yoco disabled until checkout and webhook certification are complete."
                    className="cursor-not-allowed rounded-lg bg-panel-muted px-2 py-2 text-[10px] font-semibold text-muted-foreground opacity-45"
                  >
                    Yoco unavailable
                  </button>
                  <button
                    type="button"
                    disabled
                    title="PayFast disabled until signed forms and ITN validation are certified."
                    className="cursor-not-allowed rounded-lg bg-panel-muted px-2 py-2 text-[10px] font-semibold text-muted-foreground opacity-45"
                  >
                    PayFast unavailable
                  </button>
                  <button
                    type="button"
                    disabled
                    title="Payflex disabled until order API and webhook certification are complete."
                    className="cursor-not-allowed rounded-lg bg-panel-muted px-2 py-2 text-[10px] font-semibold text-muted-foreground opacity-45"
                  >
                    Payflex unavailable
                  </button>
                </div>

                {(checkoutUrl || eftUrl || portalUrl) && (
                  <div className="mt-3 space-y-1.5 rounded-lg border border-panel-border bg-panel-muted px-2 py-2">
                    {portalUrl && (
                      <div className="flex items-start gap-2">
                        <p className="min-w-0 flex-1 break-all text-[9px] text-muted-foreground">{portalUrl}</p>
                        <button
                          type="button"
                          className="shrink-0 rounded p-1 text-muted-foreground hover:bg-secondary hover:text-accent-foreground"
                          onClick={() => void copyUrl(portalUrl)}
                          title="Copy portal link"
                        >
                          <Copy className="size-3.5" />
                        </button>
                      </div>
                    )}
                    {checkoutUrl && (
                      <div className="flex items-start gap-2">
                        <p className="min-w-0 flex-1 break-all text-[9px] text-muted-foreground">{checkoutUrl}</p>
                        <button
                          type="button"
                          className="shrink-0 rounded p-1 text-muted-foreground hover:bg-secondary hover:text-accent-foreground"
                          onClick={() => void copyUrl(checkoutUrl)}
                          title="Copy"
                        >
                          <Copy className="size-3.5" />
                        </button>
                      </div>
                    )}
                    {eftUrl && (
                      <div className="flex items-start gap-2">
                        <p className="min-w-0 flex-1 break-all text-[9px] text-muted-foreground">{eftUrl}</p>
                        <button
                          type="button"
                          className="shrink-0 rounded p-1 text-muted-foreground hover:bg-secondary hover:text-accent-foreground"
                          onClick={() => void copyUrl(eftUrl)}
                          title="Copy"
                        >
                          <Copy className="size-3.5" />
                        </button>
                      </div>
                    )}
                  </div>
                )}

                <div className="mt-3 border-t border-panel-border pt-3">
                  <p className="mb-2 text-[9px] font-medium uppercase tracking-[0.12em] text-muted-foreground">Manual settlement</p>
                  <div className="flex flex-wrap items-center gap-2">
                    <input
                      type="text"
                      inputMode="decimal"
                      value={manualZar}
                      onChange={(e) => setManualZar(e.target.value)}
                      placeholder="ZAR"
                      className="w-24 rounded-md border border-panel-border bg-panel-muted px-2 py-1.5 text-[11px] tabular-nums outline-none focus:border-emerald-500/28"
                    />
                    <button
                      type="button"
                      disabled={loading}
                      onClick={() => void markPaidManually()}
                      className="rounded-lg bg-status-success/14 px-2.5 py-1.5 text-[10px] font-semibold text-status-success hover:bg-status-success/22 disabled:opacity-50"
                    >
                      Mark paid
                    </button>
                  </div>
                </div>
              </div>
            </PopoverContent>
          </Popover>
        ) : (
          <button
            type="button"
            disabled={loading || noPatientInvoiceNeeded}
            title={noPatientInvoiceNeeded ? "No patient liability on adjudicated scheme claim" : undefined}
            onClick={handleInvoicePrimary}
            className={invoiceBtnClass}
          >
            <Receipt className="size-4 shrink-0 text-emerald-400/55" weight="fill" />
            <span>Invoice</span>
          </button>
        )}
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            disabled={loading || (noPatientInvoiceNeeded && !invoiceId)}
            title={noPatientInvoiceNeeded ? "No patient liability on adjudicated scheme claim" : undefined}
            onClick={() => void printInvoice()}
            className="flex h-10 items-center justify-center gap-2 rounded-xl border border-panel-border bg-panel-muted px-3 text-[12px] font-medium text-muted-foreground/85 transition-colors hover:bg-secondary hover:text-accent-foreground disabled:cursor-not-allowed disabled:opacity-35"
          >
            <Printer className="size-4 text-muted-foreground" />
            Print
          </button>
          <button
            type="button"
            disabled={loading || (noPatientInvoiceNeeded && !invoiceId) || invoiceStatus === "paid"}
            title={noPatientInvoiceNeeded ? "No patient liability on adjudicated scheme claim" : undefined}
            onClick={() => void markPaidManually()}
            className="flex h-10 items-center justify-center gap-2 rounded-xl border border-emerald-400/12 bg-emerald-400/[0.06] px-3 text-[12px] font-semibold text-emerald-300 transition-colors hover:bg-emerald-400/[0.10] disabled:cursor-not-allowed disabled:opacity-35"
          >
            <Check className="size-4" weight="bold" />
            Mark paid
          </button>
        </div>
        {msg ? <p className="text-[9px] leading-snug text-muted-foreground">{msg}</p> : null}
      </div>
    </>
  )
}

// ─── Status Timeline ─────────────────────────────────────────────

function StatusTimeline({ status }: { status: ClaimStatus }) {
  const stages = status === "rejected"
    ? (["draft", "submitted", "rejected"] as const)
    : (["draft", "submitted", "approved", "paid"] as const)

  const orderedIdx: Record<string, number> = { draft: 0, submitted: 1, approved: 2, paid: 3, rejected: 1 }
  const currentIdx = orderedIdx[status] ?? 0

  return (
    <div className="flex items-center gap-1.5">
      {stages.map((stage, i) => {
        const isRejected = stage === "rejected"
        const stageIdx = orderedIdx[stage] ?? 0
        const isPast = stageIdx < currentIdx || (isRejected && status === "rejected")
        const isCurrent = stage === status

        return (
          <div key={stage} className="flex items-center gap-1.5">
            <span className={cn(
              "text-[9px] font-semibold uppercase tracking-wide transition-colors",
              isCurrent && isRejected ? "text-rose-400" :
              isCurrent ? "text-foreground/90" :
              isPast ? "text-muted-foreground/55" :
              "text-muted-foreground/30"
            )}>
              {stage}
            </span>
            {i < stages.length - 1 && (
              <span className={cn("text-[9px]", isPast || isCurrent ? "text-muted-foreground/35" : "text-muted-foreground/20")}>›</span>
            )}
          </div>
        )
      })}
    </div>
  )
}

// ─── Shortfall remainder (partial claims) ─────────────────────

function ShortfallRemainderPanel({
  claimId,
  practiceId,
  medikreditResponse,
}: {
  claimId: string
  practiceId: string | null
  medikreditResponse?: Record<string, unknown> | null
}) {
  const [invoice, setInvoice] = useState<{
    id: string
    total_cents: number
    amount_paid_cents: number
    status: string
  } | null>(null)
  const [loading, setLoading] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  useEffect(() => {
    if (!practiceId) return
    let cancelled = false
    ;(async () => {
      const res = await fetchClient("/api/billing/invoices")
      if (!res.ok || cancelled) return
      const j = (await res.json()) as {
        invoices?: {
          id: string
          claim_id: string | null
          total_cents: number
          amount_paid_cents: number
          status: string
        }[]
      }
      const row = j.invoices?.find((i) => i.claim_id === claimId) ?? null
      if (!cancelled) setInvoice(row)
    })()
    return () => {
      cancelled = true
    }
  }, [claimId, practiceId])

  const patientRespZar = claimResponsePatientLiability(medikreditResponse as unknown as ClaimResponse | undefined | null)
  const totalCents = invoice?.total_cents ?? Math.round(patientRespZar * 100)
  const paidCents = invoice?.amount_paid_cents ?? 0
  const remainderCents = Math.max(0, totalCents - paidCents)

  const sendSms = async () => {
    if (!invoice?.id || !practiceId) return
    setLoading(true)
    setMsg(null)
    try {
      const res = await fetchClient(`/api/billing/invoices/${invoice.id}/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channels: ["sms"], issueFirst: true }),
      })
      const j = (await res.json()) as { error?: string }
      if (!res.ok) throw new Error(j.error || "Failed")
      setMsg("SMS sent")
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Failed")
    } finally {
      setLoading(false)
    }
  }

  const voiceCall = async () => {
    if (!invoice?.id || !practiceId) return
    setLoading(true)
    setMsg(null)
    try {
      const res = await fetchClient(`/api/billing/invoices/${invoice.id}/voice-follow-up`, { method: "POST" })
      const j = (await res.json()) as { error?: string; ok?: boolean }
      if (!res.ok) throw new Error(j.error || "Failed")
      setMsg(j.ok ? "Call started" : "Call failed")
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Failed")
    } finally {
      setLoading(false)
    }
  }

  if (!practiceId) return null

  return (
    <div className="border-l border-amber-500/25 pl-3">
      <p className="text-[10px] font-medium text-amber-200/90">Patient balance</p>
      <p className="mt-1 text-[10px] leading-relaxed text-muted-foreground">
        Shortfall R{patientRespZar.toFixed(2)}
        {invoice ? ` · invoice balance R${(remainderCents / 100).toFixed(2)}` : "."}
      </p>
      {msg ? <p className="mt-2 text-[9px] text-muted-foreground">{msg}</p> : null}
      {invoice?.id ? (
        <div className="mt-2 flex flex-wrap gap-2">
          <button
            type="button"
            disabled={loading || remainderCents <= 0}
            onClick={() => void sendSms()}
            className="rounded-md bg-secondary px-2 py-1 text-[9px] font-medium text-foreground/70 hover:bg-secondary disabled:opacity-40"
          >
            SMS link
          </button>
          <button
            type="button"
            disabled={loading || remainderCents <= 0}
            onClick={() => void voiceCall()}
            className="rounded-md bg-amber-500/12 px-2 py-1 text-[9px] font-medium text-amber-200/90 hover:bg-amber-500/18 disabled:opacity-40"
          >
            Voice follow-up
          </button>
        </div>
      ) : null}
    </div>
  )
}

function claimSubmissionTransportError(error: unknown): string {
  if (error instanceof Error && error.name === "AbortError") {
    return "Claim submission timed out before the server returned a response. Check the MediKredit proxy/server logs before retrying."
  }
  return error instanceof Error ? error.message : "Claim submission failed before a response was received"
}

async function postPersistedMedikreditClaim(args: {
  practiceId: string
  claim: PracticeClaim
  profile: PracticePatient
  maLines: ClaimLine[]
  treatmentDateIso: string
}): Promise<{ ok: true; result?: ClaimResponse } | { ok: false; error: string }> {
  const { practiceId, claim, profile, maLines, treatmentDateIso } = args
  const mkLines = practiceClaimLinesToMedikredit(maLines, treatmentDateIso)
  let res: Response
  try {
    res = await fetchClient("/api/clinical/medikredit/claim", {
      method: "POST",
      timeoutMs: CLAIM_SUBMISSION_TIMEOUT_MS,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        practiceId,
        patient: practicePatientToMedikreditPayload(profile),
        lines: mkLines,
        persist: true,
        claimId: claim.id,
        schemeCode: profile.medicalAidSchemeCode?.trim() || undefined,
        clinicalEncounterId: claim.clinicalEncounterId ?? undefined,
      }),
    })
  } catch (error) {
    return { ok: false, error: claimSubmissionTransportError(error) }
  }
  let text: string
  try {
    text = await res.text()
  } catch (error) {
    return { ok: false, error: claimSubmissionTransportError(error) }
  }
  let body: { result?: ClaimResponse; error?: string; hint?: string; code?: string } = {}
  try {
    body = JSON.parse(text) as { result?: ClaimResponse; error?: string; hint?: string; code?: string }
  } catch {
    body = { error: text.trim() ? text : `HTTP ${res.status}` }
  }
  if (!res.ok || body.error) {
    const extra = body.hint ? `\n\n${body.hint}` : ""
    return {
      ok: false,
      error: `${body.error || `Claim failed (${res.status})`}${body.code ? ` [${body.code}]` : ""}${extra}`.trim(),
    }
  }
  return { ok: true, result: body.result }
}

function formatClaimMoney(value: unknown): string {
  const n = typeof value === "number" ? value : Number(value)
  if (!Number.isFinite(n)) return "R0.00"
  return `R${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function claimMoneyNumber(value: unknown): number | undefined {
  if (value == null || value === "") return undefined
  const n = typeof value === "number" ? value : Number(String(value).replace(",", "."))
  return Number.isFinite(n) ? n : undefined
}

function claimLineLiability(row: { patientResponsibility?: unknown; gross?: unknown; net?: unknown }): number | undefined {
  const explicit = claimMoneyNumber(row.patientResponsibility)
  if (explicit != null) return Math.round(Math.max(0, explicit) * 100) / 100
  const gross = claimMoneyNumber(row.gross)
  if (gross == null) return undefined
  const net = claimMoneyNumber(row.net) ?? 0
  return Math.round(Math.max(0, gross - net) * 100) / 100
}

function claimResponsePatientLiability(result: ClaimResponse | null | undefined): number {
  if (!result) return 0
  const explicit = claimMoneyNumber(result.patientResponsibility)
  if (explicit != null) return Math.round(Math.max(0, explicit) * 100) / 100
  const fromLines = (result.itemStatuses ?? [])
    .map((row) => claimLineLiability(row))
    .filter((n): n is number => typeof n === "number" && Number.isFinite(n))
  if (fromLines.length === 0) return 0
  return Math.round(fromLines.reduce((sum, n) => sum + n, 0) * 100) / 100
}

function claimStatusMeta(status?: string | null): {
  label: string
  short: string
  tone: string
  dot: string
  approved: boolean
  rejected: boolean
} {
  const s = status?.trim().toUpperCase()
  if (s === "A" || s === "P") {
    return {
      label: s === "P" ? "Approved" : "Approved",
      short: s,
      tone: "border-emerald-400/25 bg-emerald-400/[0.10] text-emerald-200",
      dot: "bg-emerald-400",
      approved: true,
      rejected: false,
    }
  }
  if (s === "R") {
    return {
      label: "Rejected",
      short: "R",
      tone: "border-rose-400/25 bg-rose-400/[0.10] text-rose-200",
      dot: "bg-rose-400",
      approved: false,
      rejected: true,
    }
  }
  if (s === "W") {
    return {
      label: "Warning",
      short: "W",
      tone: "border-amber-400/25 bg-amber-400/[0.10] text-amber-200",
      dot: "bg-amber-400",
      approved: false,
      rejected: false,
    }
  }
  return {
    label: s ? `Status ${s}` : "No status",
    short: s || "?",
    tone: "border-panel-border bg-panel-muted text-muted-foreground/70",
    dot: "bg-muted-foreground/40",
    approved: false,
    rejected: false,
  }
}

function claimResponseReason(result: ClaimResponse): string | undefined {
  return result.denialReason ?? result.rejectionDescription ?? result.responseMessage
}

function MedikreditSchemeSubmissionDialog({
  open,
  onOpenChange,
  busy,
  error,
  result,
  onEditClaim,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  busy: boolean
  error: string | null
  result: ClaimResponse | null
  onEditClaim?: () => void
}) {
  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (busy) return
        onOpenChange(nextOpen)
      }}
    >
      <DialogContent
        className="max-w-sm overflow-hidden rounded-3xl border-panel-border bg-panel p-0 text-foreground shadow-2xl"
        onInteractOutside={(e) => {
          if (busy) e.preventDefault()
        }}
        onEscapeKeyDown={(e) => {
          if (busy) e.preventDefault()
        }}
      >
        <DialogTitle className="sr-only">MediKredit submission</DialogTitle>
        {busy ? (
          <div className="flex flex-col items-center gap-5 px-8 py-14">
            <div className="relative">
              <div className="flex size-20 items-center justify-center rounded-full border border-blue-500/20 bg-blue-500/8">
                <ArrowsClockwise className="size-8 animate-spin text-blue-400" weight="bold" />
              </div>
              <div className="absolute inset-0 rounded-full bg-blue-500/5 blur-xl" />
            </div>
            <div className="text-center">
              <p className="text-[15px] font-semibold tracking-tight">Submitting claim</p>
              <p className="mt-1 text-[12px] text-muted-foreground">Real-time · tx_cd 21 · MediKredit switch</p>
            </div>
          </div>
        ) : error ? (
          <div className="px-6 pb-6 pt-8">
            <div className="mb-5 flex flex-col items-center gap-4 text-center">
              <div className="flex size-16 items-center justify-center rounded-2xl border border-rose-500/30 bg-rose-500/10">
                <X className="size-7 text-rose-400" weight="bold" />
              </div>
              <div>
                <p className="text-[15px] font-semibold tracking-tight">Submission failed</p>
                <p className="mt-1 text-[11px] text-muted-foreground">Could not reach MediKredit switch</p>
              </div>
            </div>
            <p className="mb-5 whitespace-pre-wrap rounded-2xl border border-rose-500/20 bg-rose-500/8 px-4 py-3 text-[11px] leading-relaxed text-rose-200/85">
              {error}
            </p>
            <DialogClose asChild>
              <button type="button" className="w-full rounded-2xl bg-secondary py-3 text-[12px] font-semibold text-foreground/70 transition-colors hover:bg-secondary">
                Close
              </button>
            </DialogClose>
          </div>
        ) : result ? (
          (() => {
            const outcome = result.outcome
            const claimRes = result.res ?? result.responseCode
            const isApproved = outcome === "approved" || claimRes === "P"
            const isPartial = outcome === "partially_approved"
            const isRejected = outcome === "rejected" || outcome === "duplicate"
            const reason = claimResponseReason(result)
            const patientLiability = claimResponsePatientLiability(result)
            const lineRows = result.itemStatuses ?? []
            const approvedLines = lineRows.filter((row) => claimStatusMeta(row.status).approved).length
            const rejectedLines = lineRows.filter((row) => claimStatusMeta(row.status).rejected).length
            const title = isRejected
              ? "Claim rejected"
              : isPartial
                ? "Partially approved"
                : isApproved
                  ? "Claim approved"
                  : "Switch response"
            const titleTone = isRejected
              ? "text-rose-200"
              : isPartial
                ? "text-amber-200"
                : isApproved
                  ? "text-emerald-200"
                  : "text-blue-200"
            return (
              <div className="px-5 pb-5 pt-6">
                <div className="mb-4 flex flex-col items-center gap-3 text-center">
                  <div className={cn(
                    "flex size-14 items-center justify-center rounded-2xl border shadow-lg",
                    isApproved ? "border-emerald-500/35 bg-emerald-500/12" : isPartial ? "border-amber-500/30 bg-amber-500/10" : isRejected ? "border-rose-500/30 bg-rose-500/10" : "border-blue-500/30 bg-blue-500/10"
                  )}>
                    {isApproved ? (
                      <Check className="size-6 text-emerald-400" weight="bold" />
                    ) : isRejected ? (
                      <X className="size-6 text-rose-400" weight="bold" />
                    ) : (
                      <Warning className="size-6 text-amber-400" weight="bold" />
                    )}
                  </div>
                  <div>
                    <p className={cn(
                      "text-[16px] font-semibold tracking-tight",
                      titleTone
                    )}>
                      {title}
                    </p>
                    <div className="mt-2 flex flex-wrap justify-center gap-1.5">
                      {result.txNbr ? <span className="rounded-full bg-panel-muted px-2 py-0.5 font-mono text-[9px] text-muted-foreground">TX {result.txNbr}</span> : null}
                      {result.healthNetworkId ? <span className="rounded-full bg-panel-muted px-2 py-0.5 font-mono text-[9px] text-muted-foreground">HNet {result.healthNetworkId}</span> : null}
                      {claimRes ? <span className="rounded-full bg-panel-muted px-2 py-0.5 font-mono text-[9px] text-muted-foreground">res {claimRes}</span> : null}
                    </div>
                    {result.duplicateDetected ? (
                      <p className="mt-1 text-[10px] text-amber-300/75">Duplicate transaction detected</p>
                    ) : null}
                  </div>
                </div>

                <div className="mb-4 grid grid-cols-3 gap-2">
                  <div className="rounded-2xl border border-emerald-500/15 bg-emerald-500/[0.05] px-3 py-2.5">
                    <p className="text-[8px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Approved</p>
                    <p className="mt-1 text-[13px] font-bold tabular-nums text-emerald-300">
                      {result.approvedAmount != null ? formatClaimMoney(result.approvedAmount) : approvedLines}
                    </p>
                  </div>
                  <div className="rounded-2xl border border-amber-500/15 bg-amber-500/[0.05] px-3 py-2.5">
                    <p className="text-[8px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Patient</p>
                    <p className="mt-1 text-[13px] font-bold tabular-nums text-amber-300">{formatClaimMoney(patientLiability)}</p>
                  </div>
                  <div className="rounded-2xl border border-panel-border bg-panel-muted/50 px-3 py-2.5">
                    <p className="text-[8px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Lines</p>
                    <p className="mt-1 text-[13px] font-bold tabular-nums text-foreground/80">
                      {approvedLines}/{lineRows.length || 0}
                      {rejectedLines > 0 ? <span className="ml-1 text-rose-300">({rejectedLines} R)</span> : null}
                    </p>
                  </div>
                </div>

                {reason ? (
                  <p className={cn(
                    "mb-4 rounded-2xl border px-3.5 py-3 text-[11px] leading-relaxed",
                    isRejected
                      ? "border-rose-500/18 bg-rose-500/[0.06] text-rose-100/85"
                      : "border-panel-border bg-panel-muted/50 text-muted-foreground/82"
                  )}>
                    {reason}
                  </p>
                ) : null}

                {lineRows.length > 0 ? (
                  <div className="mb-4 rounded-2xl border border-panel-border bg-panel-muted/40 p-2">
                    <div className="mb-1 flex items-center justify-between px-1.5">
                      <p className="text-[9px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Line outcomes</p>
                      <p className="text-[9px] text-muted-foreground">P is approved</p>
                    </div>
                    <ul className="max-h-52 space-y-1.5 overflow-y-auto" style={{ scrollbarWidth: "none" }}>
                      {lineRows.map((row, ix) => {
                        const meta = claimStatusMeta(row.status)
                        const liability = claimLineLiability(row)
                        return (
                          <li key={ix} className="rounded-xl border border-panel-border bg-panel-muted/50 px-3 py-2.5">
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0 flex-1">
                                <div className="flex flex-wrap items-center gap-1.5">
                                  <span className={cn("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[9px] font-semibold", meta.tone)}>
                                    <span className={cn("size-1.5 rounded-full", meta.dot)} />
                                    {meta.label}
                                  </span>
                                  <span className="font-mono text-[9px] text-muted-foreground">Line {row.lineNumber ?? ix + 1}</span>
                                  <span className="font-mono text-[9px] text-muted-foreground">res {meta.short}</span>
                                  {row.rejectionCode ? <span className="font-mono text-[9px] text-rose-200/75">RJ {row.rejectionCode}</span> : null}
                                </div>
                                {row.rejectionDescription ? (
                                  <p className="mt-1.5 text-[10px] leading-relaxed text-rose-100/85">{row.rejectionDescription}</p>
                                ) : null}
                              </div>
                              <div className="shrink-0 text-right text-[9px] tabular-nums">
                                {row.gross ? <p className="text-muted-foreground">Gross {formatClaimMoney(row.gross)}</p> : null}
                                {row.net ? <p className="text-emerald-300/70">Net {formatClaimMoney(row.net)}</p> : null}
                                {liability != null ? <p className="font-semibold text-amber-300">Patient {formatClaimMoney(liability)}</p> : null}
                              </div>
                            </div>
                          </li>
                        )
                      })}
                    </ul>
                  </div>
                ) : null}

                <div className={cn("grid gap-2", onEditClaim ? "grid-cols-2" : "grid-cols-1")}>
                  {onEditClaim ? (
                    <button
                      type="button"
                      onClick={() => {
                        onOpenChange(false)
                        onEditClaim()
                      }}
                      className="rounded-2xl border border-panel-border bg-panel-muted py-3 text-[12px] font-semibold text-muted-foreground/85 transition-colors hover:bg-secondary hover:text-accent-foreground"
                    >
                      Edit claim
                    </button>
                  ) : null}
                  <DialogClose asChild>
                    <button
                      type="button"
                      className={cn(
                        "rounded-2xl py-3 text-[12px] font-semibold transition-colors",
                        isApproved ? "bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/22" : isRejected ? "bg-rose-500/12 text-rose-300 hover:bg-rose-500/18" : "bg-secondary text-foreground/70 hover:bg-secondary"
                      )}
                    >
                      Done
                    </button>
                  </DialogClose>
                </div>
              </div>
            )
          })()
        ) : (
          <div className="flex flex-col items-center gap-3 px-6 py-10">
            <p className="text-[12px] text-muted-foreground">Preparing submission…</p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

// ─── Claim Detail Panel (50% width) ─────────────────────────────

export function ClaimDetailPanel({
  claim,
  onClose,
  onUpdateClaim,
  onUpdateStatus,
  onInvoiceCreated,
  onClaimSyncedFromServer,
}: {
  claim: PracticeClaim
  onClose: () => void
  onUpdateClaim: (id: string, update: Partial<PracticeClaim>) => void
  onUpdateStatus: (id: string, status: ClaimStatus) => void
  onInvoiceCreated?: (invoiceId: string) => void
  /** After MediKredit submit, merges refreshed PracticeClaim into workspace + drawer selection. */
  onClaimSyncedFromServer?: (next: PracticeClaim) => void
}) {
  const { practiceId } = usePracticeCrypto()
  const patients = useWorkspaceStore((s) => s.patients)
  const [editingLines, setEditingLines] = useState<ClaimLine[]>(claim.lines)
  const [isEditing, setIsEditing] = useState(false)
  const [serverMessage, setServerMessage] = useState<string | null>(null)

  const [schemeDialogOpen, setSchemeDialogOpen] = useState(false)
  const [schemeBusy, setSchemeBusy] = useState(false)
  const [schemeResult, setSchemeResult] = useState<ClaimResponse | null>(null)
  const [schemeError, setSchemeError] = useState<string | null>(null)
  const [reversalBusy, setReversalBusy] = useState(false)
  const [inlineEditId, setInlineEditId] = useState<string | null>(null)
  const [inlineDraft, setInlineDraft] = useState<ClaimLine | null>(null)

  useEffect(() => {
    setEditingLines(claim.lines)
    setIsEditing(false)
    setInlineEditId(null)
    setInlineDraft(null)
  }, [claim.id, claim.lines])

  const linesForResume = isEditing ? editingLines : claim.lines

  const treatmentDateIso = useMemo(() => new Date().toISOString().slice(0, 10), [])
  const availableModifiers = useMemo(
    () => getModifiersForDiscipline(BILLING_MODIFIER_DISCIPLINE),
    []
  )

  const recalcTotals = useCallback((lines: ClaimLine[]) => {
    let ma = 0, cash = 0
    for (const l of lines) {
      if (l.lineType === "medical_aid") ma += l.amount
      else cash += l.amount
    }
    return { medicalAidAmount: ma, cashAmount: cash, totalAmount: ma + cash }
  }, [])

  const persistClaim = useCallback(
    async (patch: Partial<PracticeClaim>) => {
      if (!practiceId) return
      const supabase = createClient()
      if (!supabase) return
      const dbPatch: Record<string, unknown> = {
        updated_at: new Date().toISOString(),
      }
      if (patch.lines) dbPatch.lines = patch.lines
      if (patch.status) dbPatch.status = patch.status
      if (patch.paymentRef !== undefined) dbPatch.orig_code = patch.paymentRef || null
      const { error } = await supabase
        .from("practice_claims")
        .update(dbPatch)
        .eq("id", claim.id)
        .eq("practice_id", practiceId)
      if (error) throw error
    },
    [claim.id, practiceId]
  )

  const handleSaveLines = () => {
    const totals = recalcTotals(editingLines)
    onUpdateClaim(claim.id, { lines: editingLines, ...totals })
    setIsEditing(false)
    if (claim.status === "draft" && practiceId) {
      void fetchClient("/api/clinical/practice-claims/draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          practiceId,
          patientId: claim.patientId,
          clinicalEncounterId: claim.clinicalEncounterId ?? null,
          claimId: claim.id,
          lines: editingLines,
        }),
      }).catch(() => {})
    } else {
      void persistClaim({ lines: editingLines }).catch(() => {})
    }
  }

  const updateLine = (lineId: string, field: keyof ClaimLine, value: string | number | string[] | ClaimLineType) => {
    setEditingLines((prev) =>
      prev.map((l) => (l.id === lineId ? { ...l, [field]: value } : l))
    )
  }

  const removeLine = (lineId: string) => {
    setEditingLines((prev) => prev.filter((l) => l.id !== lineId))
  }

  const canEditClaimLines = claim.status !== "paid"
  const hasMaLines = useMemo(
    () => linesForResume.some((l) => l.lineType === "medical_aid"),
    [linesForResume]
  )
  const schemeSubmitStatuses = useMemo(
    (): ClaimStatus[] => ["draft", "submitted", "rejected", "partial"],
    []
  )
  const showMedikreditLane =
    Boolean(practiceId) && schemeSubmitStatuses.includes(claim.status)

  const discardInlineEdit = useCallback(() => {
    setInlineEditId(null)
    setInlineDraft(null)
  }, [])

  const openInlineEdit = useCallback(
    (line: ClaimLine) => {
      if (!canEditClaimLines) return
      setInlineEditId(line.id)
      setInlineDraft({ ...line })
    },
    [canEditClaimLines]
  )

  const updateInlineDraftField = (
    field: keyof ClaimLine,
    value: string | number | string[] | ClaimLineType
  ) => {
    setInlineDraft((d) => (d ? { ...d, [field]: value } : d))
  }

  const saveInlineEdit = () => {
    if (!inlineDraft) return
    const base = isEditing ? editingLines : claim.lines
    const next = base.map((l) => (l.id === inlineDraft.id ? inlineDraft : l))
    const totals = recalcTotals(next)
    if (isEditing) {
      setEditingLines(next)
    } else {
      onUpdateClaim(claim.id, { lines: next, ...totals })
      if (claim.status === "draft" && practiceId) {
        void fetchClient("/api/clinical/practice-claims/draft", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            practiceId,
            patientId: claim.patientId,
            clinicalEncounterId: claim.clinicalEncounterId ?? null,
            claimId: claim.id,
            lines: next,
          }),
        }).catch(() => {})
      } else {
        void persistClaim({ lines: next }).catch(() => {})
      }
    }
    discardInlineEdit()
  }

  const addLine = () => {
    discardInlineEdit()
    setEditingLines((prev) => [
      ...prev,
      {
        id: `l-${Date.now()}`,
        description: "",
        icdCode: "",
        tariffCode: "",
        nappiCode: "",
        amount: 0,
        lineType: "medical_aid" as ClaimLineType,
        status: claim.status,
        treatmentDate: treatmentDateIso,
      },
    ])
  }

  const submitToScheme = useCallback(async () => {
    if (!practiceId) return
    const profile = patients.find((p) => p.id === claim.patientId)
    if (!profile) {
      setServerMessage("Patient profile not loaded in workspace — open directory or decrypt first.")
      return
    }

    const maLines = linesForResume.filter((l) => l.lineType === "medical_aid")
    if (maLines.length === 0) {
      setServerMessage("Add at least one medical-aid line before submitting.")
      return
    }
    if (maLines.some((l) => !l.icdCode?.trim())) {
      setServerMessage(
        "Add a primary ICD-10 code on every medical-aid line before resubmitting. The scheme rejects lines without one (RJ 762 — No primary ICD code submitted)."
      )
      return
    }

    setSchemeDialogOpen(true)
    setSchemeBusy(true)
    setSchemeError(null)
    setSchemeResult(null)

    try {
      const out = await postPersistedMedikreditClaim({
        practiceId,
        claim,
        profile,
        maLines,
        treatmentDateIso,
      })
      if (!out.ok) {
        setSchemeError(out.error)
        return
      }
      if (out.result) setSchemeResult(out.result)

      window.dispatchEvent(
        new CustomEvent("fleming:patient-overview-reload", { detail: { patientId: claim.patientId } })
      )

      const refreshed = await fetchPracticeClaimsForWorkspace(practiceId)
      useWorkspaceStore.getState().setClaims(refreshed)
      const next = refreshed.find((c) => c.id === claim.id)
      if (next && onClaimSyncedFromServer) onClaimSyncedFromServer(next)

      setServerMessage(null)
    } catch (e) {
      setSchemeError(e instanceof Error ? e.message : "Submission failed")
    } finally {
      setSchemeBusy(false)
    }
  }, [
    practiceId,
    patients,
    linesForResume,
    treatmentDateIso,
    claim,
    onClaimSyncedFromServer,
  ])

  const reversePersistedClaim = useCallback(async () => {
    if (!practiceId || reversalBusy) return
    const profile = patients.find((patient) => patient.id === claim.patientId)
    if (!profile) {
      setServerMessage("Load the patient profile before reversing this claim.")
      return
    }
    if (!window.confirm("Reverse this accepted MediKredit transaction? This action is recorded permanently.")) {
      return
    }
    setReversalBusy(true)
    setServerMessage(null)
    try {
      const response = await fetchClient("/api/clinical/medikredit/reversal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          practiceId,
          claimId: claim.id,
          patient: practicePatientToMedikreditPayload(profile),
        }),
      })
      const payload = (await response.json()) as {
        error?: string
        status?: string
        result?: ClaimResponse
      }
      if (!response.ok) {
        throw new Error(
          payload.error ||
            payload.result?.rejectionDescription ||
            "MediKredit did not accept the reversal."
        )
      }
      onUpdateStatus(claim.id, "reversed")
      setServerMessage("Claim reversed. Create a corrected draft and link it as a resubmission.")
      const refreshed = await fetchPracticeClaimsForWorkspace(practiceId)
      useWorkspaceStore.getState().setClaims(refreshed)
      const next = refreshed.find((row) => row.id === claim.id)
      if (next) onClaimSyncedFromServer?.(next)
    } catch (error) {
      setServerMessage(error instanceof Error ? error.message : "Reversal failed")
    } finally {
      setReversalBusy(false)
    }
  }, [
    claim.id,
    claim.patientId,
    onClaimSyncedFromServer,
    onUpdateStatus,
    patients,
    practiceId,
    reversalBusy,
  ])

  const createCorrectedDraft = useCallback(async () => {
    if (!practiceId) return
    setServerMessage(null)
    try {
      const response = await fetchClient("/api/clinical/practice-claims/draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          practiceId,
          patientId: claim.patientId,
          clinicalEncounterId: claim.clinicalEncounterId ?? null,
          lines: claim.lines.map((line) => ({
            ...line,
            status: "draft",
            mediAdjudication: undefined,
          })),
          resubmissionOfClaimId: claim.id,
        }),
      })
      const payload = (await response.json()) as { claimId?: string; error?: string }
      if (!response.ok || !payload.claimId) {
        throw new Error(payload.error || "Could not create corrected draft")
      }
      const refreshed = await fetchPracticeClaimsForWorkspace(practiceId)
      useWorkspaceStore.getState().setClaims(refreshed)
      setServerMessage(`Corrected draft ${payload.claimId.slice(0, 8)} created and linked to this reversal.`)
    } catch (error) {
      setServerMessage(error instanceof Error ? error.message : "Could not create corrected draft")
    }
  }, [claim.clinicalEncounterId, claim.id, claim.lines, claim.patientId, practiceId])

  return (
    <motion.div
      key="claim-detail"
      initial={{ x: "100%" }}
      animate={{ x: 0 }}
      exit={{ x: "100%" }}
      transition={{ type: "spring", stiffness: 380, damping: 36 }}
      className="absolute inset-y-0 right-0 z-10 flex w-[460px] flex-col overflow-hidden border-l border-border/40 bg-background/[0.97] backdrop-blur-xl"
    >
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between border-b border-border/40 px-5 py-3.5">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h3 className="truncate text-[13px] font-semibold tracking-[-0.01em] text-foreground">{claim.patientName}</h3>
              <span className={cn("shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide", STATUS_BADGE[claim.status])}>
                {claim.status}
              </span>
            </div>
            <p className="mt-0.5 text-[10px] text-muted-foreground/60 font-mono">
              {new Date(claim.createdAt).toLocaleDateString("en-ZA", { day: "numeric", month: "short", year: "numeric" })}
              {(claim.medikreditResponse as unknown as ClaimResponse | null)?.txNbr ? (
                <span className="ml-2">· TX {(claim.medikreditResponse as unknown as ClaimResponse).txNbr}</span>
              ) : null}
            </p>
          </div>
          <button type="button" onClick={onClose} className="ml-3 shrink-0 rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-secondary">
            <X className="size-3.5" />
          </button>
        </div>

        {/* Body */}
        <div
          className="flex-1 space-y-4 overflow-y-auto px-5 pb-5 pt-4"
          style={{ scrollbarWidth: "none" }}
        >
          {/* Status track */}
          <div className="border-b border-border/30 pb-4">
            <StatusTimeline status={claim.status} />
          </div>

          {(() => {
            const mk = claim.medikreditResponse as ClaimResponse | undefined
            if (!mk || !medResponseLooksAdjudicated(mk)) return null
            const claimRes = mk.res ?? mk.responseCode
            const isApproved = mk.outcome === "approved" || claimRes === "P"
            const isPartial = mk.outcome === "partially_approved"
            const isRejected = mk.outcome === "rejected"
            const rmrs = mk.remittanceMessages ?? []
            const reason = claimResponseReason(mk)
            const patientLiability = claimResponsePatientLiability(mk)
            const tone = isApproved ? "text-emerald-300/95" : isPartial ? "text-amber-200/95" : isRejected ? "text-rose-300/95" : "text-muted-foreground/75"
            return (
              <div className="rounded-xl border border-border/30 bg-secondary/20 p-3.5">
                <div className="flex items-center justify-between gap-2">
                  <p className={cn("text-[11px] font-semibold tracking-tight", tone)}>
                    {isRejected ? "Scheme adjudication rejected" : isPartial ? "Scheme adjudication partial" : isApproved ? "Scheme adjudication approved" : "Scheme adjudication"}
                  </p>
                  <span className="rounded-full bg-secondary/60 px-2 py-0.5 text-[9px] font-semibold text-muted-foreground">
                    {mk.outcome?.replaceAll("_", " ") ?? "response"}
                  </span>
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5 font-mono text-[9px] text-muted-foreground">
                  {mk.txNbr ? <span className="rounded-md bg-secondary/50 px-1.5 py-0.5">TX {mk.txNbr}</span> : null}
                  {mk.healthNetworkId ? <span className="rounded-md bg-secondary/50 px-1.5 py-0.5">HNet {mk.healthNetworkId}</span> : null}
                  {claimRes ? <span className="rounded-md bg-secondary/50 px-1.5 py-0.5">res {claimRes}</span> : null}
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <div className="rounded-xl border border-emerald-400/12 bg-emerald-400/[0.045] px-3 py-2">
                    <p className="text-[8px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Approved</p>
                    <p className="mt-1 tabular-nums text-[14px] font-semibold tracking-tight text-emerald-300/95">
                      {mk.approvedAmount != null ? formatClaimMoney(mk.approvedAmount) : "-"}
                    </p>
                  </div>
                  <div className="rounded-xl border border-amber-400/12 bg-amber-400/[0.045] px-3 py-2">
                    <p className="text-[8px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Patient liability</p>
                    <p className="mt-1 tabular-nums text-[14px] font-semibold tracking-tight text-amber-300/95">
                      {formatClaimMoney(patientLiability)}
                    </p>
                  </div>
                </div>
                {reason ? (
                  <p className={cn(
                    "mt-3 rounded-xl border px-3 py-2 text-[10px] leading-relaxed",
                    isRejected ? "border-rose-500/15 bg-rose-500/[0.055] text-rose-200/85" : "border-border/30 bg-secondary/30 text-muted-foreground/65"
                  )}>
                    {reason}
                  </p>
                ) : null}
                {rmrs.length > 0 ? (
                  <ul className="mt-3 space-y-1 border-l border-border/40 pl-3">
                    {rmrs.slice(0, 4).map((r, i) => (
                      <li key={`${r.code}-${i}`} className="flex gap-2 text-[10px] text-muted-foreground">
                        <span className="shrink-0 font-mono text-[9px] text-muted-foreground">{r.code}</span>
                        <span>{r.description}</span>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            )
          })()}

          {claim.status === "partial" ||
          claimResponsePatientLiability((claim.medikreditResponse ?? null) as ClaimResponse | null) > 0 ? (
            <ShortfallRemainderPanel
              claimId={claim.id}
              practiceId={practiceId}
              medikreditResponse={claim.medikreditResponse}
            />
          ) : null}

          {serverMessage ? <p className="text-[10px] text-muted-foreground">{serverMessage}</p> : null}
          {/* Rejection reason */}
          {claim.status === "rejected" &&
          claim.rejectionReason &&
          claim.rejectionReason !== claimResponseReason((claim.medikreditResponse ?? {}) as unknown as ClaimResponse) && (
            <div className="border-l border-rose-500/35 pl-3">
              <p className="text-[10px] font-medium text-rose-400/95">Scheme rejection</p>
              <p className="mt-1 text-[11px] leading-relaxed text-rose-200/75">{claim.rejectionReason}</p>
            </div>
          )}

          {/* Line Items */}
          <div className="space-y-3 pt-1">
            <div className="flex items-center justify-between gap-2">
              <p className="text-[10px] font-medium tracking-wide text-muted-foreground">Lines</p>
              <div className="flex shrink-0 flex-wrap justify-end gap-1.5">
                {!isEditing ? (
                  <button
                    type="button"
                    onClick={() => {
                      discardInlineEdit()
                      setEditingLines(claim.lines)
                      setIsEditing(true)
                    }}
                    className="flex items-center gap-1 rounded-md px-2 py-1 text-[9px] font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-accent-foreground"
                  >
                    <PencilSimple className="size-3" /> Edit all
                  </button>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={addLine}
                      className="flex items-center gap-1 rounded-md px-2 py-1 text-[9px] font-medium text-blue-400 transition-colors hover:bg-blue-500/10"
                    >
                      <Plus className="size-3" weight="bold" /> Add Line
                    </button>
                    <button
                      type="button"
                      onClick={handleSaveLines}
                      className="flex items-center gap-1 rounded-md bg-blue-500/15 px-2 py-1 text-[9px] font-semibold text-blue-400 transition-colors hover:bg-blue-500/25"
                    >
                      <Check className="size-3" weight="bold" /> Save
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        discardInlineEdit()
                        setIsEditing(false)
                      }}
                      className="rounded-md px-2 py-1 text-[9px] font-medium text-muted-foreground transition-colors hover:bg-secondary"
                    >
                      Cancel
                    </button>
                  </>
                )}
              </div>
            </div>

            <div className="overflow-hidden rounded-xl border border-border/40">
              <div className="divide-y divide-border/30">
              {(isEditing ? editingLines : claim.lines).map((line) => {
                const d = inlineDraft
                const isInlineEditing = Boolean(!isEditing && inlineEditId === line.id && d && d.id === line.id)
                const adjudicationLiability = claimLineLiability(line.mediAdjudication ?? {})
                const adjudicationStatus = line.mediAdjudication?.schemeStatus
                const adjudicationMeta = claimStatusMeta(adjudicationStatus)

                const lineEditorFields = (
                  <>
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={isInlineEditing ? d!.description : line.description}
                        onChange={(e) =>
                          isInlineEditing
                            ? updateInlineDraftField("description", e.target.value)
                            : updateLine(line.id, "description", e.target.value)
                        }
                        placeholder="Description"
                        className="flex-1 rounded-md border border-border/40 bg-secondary/40 px-2 py-1 text-[11px] text-foreground outline-none placeholder:text-muted-foreground/50 focus:border-blue-500/30"
                      />
                      {isEditing ? (
                        <button type="button" onClick={() => removeLine(line.id)} className="text-muted-foreground hover:text-status-danger">
                          <Trash className="size-3.5" />
                        </button>
                      ) : (
                        <div className="flex gap-1">
                          <button
                            type="button"
                            onClick={discardInlineEdit}
                            className="rounded-md px-2 py-1 text-[9px] text-muted-foreground hover:bg-secondary"
                          >
                            Cancel
                          </button>
                          <button
                            type="button"
                            onClick={() => void saveInlineEdit()}
                            className="rounded-md bg-blue-500/18 px-2 py-1 text-[9px] font-semibold text-blue-300 hover:bg-blue-500/26"
                          >
                            Save line
                          </button>
                        </div>
                      )}
                    </div>
                    <div className="grid grid-cols-4 gap-2">
                      <input
                        type="text"
                        value={(isInlineEditing ? d!.icdCode : line.icdCode) ?? ""}
                        onChange={(e) =>
                          isInlineEditing ? updateInlineDraftField("icdCode", e.target.value) : updateLine(line.id, "icdCode", e.target.value)
                        }
                        placeholder="ICD-10"
                        className={cn(
                          "rounded-md border bg-panel-muted px-2 py-1 text-[10px] text-foreground outline-none placeholder:text-muted-foreground/50 focus:border-blue-500/30",
                          line.lineType === "medical_aid" && !((isInlineEditing ? d!.icdCode : line.icdCode) ?? "").trim()
                            ? "border-amber-500/45 ring-1 ring-amber-400/20"
                            : "border-panel-border"
                        )}
                      />
                      <input
                        type="text"
                        value={(isInlineEditing ? d!.tariffCode : line.tariffCode) ?? ""}
                        onChange={(e) =>
                          isInlineEditing
                            ? updateInlineDraftField("tariffCode", e.target.value)
                            : updateLine(line.id, "tariffCode", e.target.value)
                        }
                        placeholder="Tariff"
                        className="rounded-md border border-panel-border bg-panel-muted px-2 py-1 text-[10px] text-foreground outline-none placeholder:text-muted-foreground/50 focus:border-blue-500/30"
                      />
                      <input
                        type="text"
                        value={(isInlineEditing ? d!.nappiCode : line.nappiCode) ?? ""}
                        onChange={(e) =>
                          isInlineEditing ? updateInlineDraftField("nappiCode", e.target.value) : updateLine(line.id, "nappiCode", e.target.value)
                        }
                        placeholder="NAPPI"
                        className="rounded-md border border-panel-border bg-panel-muted px-2 py-1 text-[10px] text-foreground outline-none placeholder:text-muted-foreground/50 focus:border-blue-500/30"
                      />
                      <input
                        type="number"
                        value={(isInlineEditing ? d!.amount : line.amount) || ""}
                        onChange={(e) =>
                          isInlineEditing
                            ? updateInlineDraftField("amount", parseFloat(e.target.value) || 0)
                            : updateLine(line.id, "amount", parseFloat(e.target.value) || 0)
                        }
                        placeholder="Amount"
                        className="rounded-md border border-panel-border bg-panel-muted px-2 py-1 text-right text-[10px] tabular-nums text-foreground outline-none placeholder:text-muted-foreground/50 focus:border-blue-500/30"
                      />
                    </div>
                    <label className="flex items-center gap-2 text-[9px] text-muted-foreground">
                      Treatment date
                      <input
                        type="date"
                        value={(isInlineEditing ? d!.treatmentDate : line.treatmentDate) ?? treatmentDateIso}
                        onChange={(event) =>
                          isInlineEditing
                            ? updateInlineDraftField("treatmentDate", event.target.value)
                            : updateLine(line.id, "treatmentDate", event.target.value)
                        }
                        className="rounded-md border border-panel-border bg-panel-muted px-2 py-1 text-[10px] text-foreground"
                      />
                    </label>
                    <div className="flex flex-wrap gap-2">
                      {(["medical_aid", "cash", "patient_liability"] as ClaimLineType[]).map((lt) => (
                        <label key={lt} className="flex cursor-pointer items-center gap-1">
                          <input
                            type="radio"
                            name={isInlineEditing ? `lineType-inline-${line.id}` : `lineType-${line.id}`}
                            checked={(isInlineEditing ? d!.lineType : line.lineType) === lt}
                            onChange={() =>
                              isInlineEditing ? updateInlineDraftField("lineType", lt) : updateLine(line.id, "lineType", lt)
                            }
                            className="size-2.5 accent-blue-500"
                          />
                          <span className="text-[9px] text-muted-foreground">
                            {lt === "medical_aid" ? "MA" : lt === "cash" ? "Cash" : "Patient"}
                          </span>
                        </label>
                      ))}
                    </div>
                    {(isInlineEditing ? d!.lineType : line.lineType) === "medical_aid" ? (
                      <div className="rounded-md border border-panel-border bg-panel-muted px-2 py-1.5">
                        <p className="mb-1 text-[9px] font-medium uppercase tracking-wide text-muted-foreground">Modifiers</p>
                        <ClaimModifierPicker
                          lineId={line.id}
                          codes={(isInlineEditing ? d?.modifierCodes : line.modifierCodes) ?? []}
                          available={availableModifiers}
                          onAdd={(code) => {
                            const current = (isInlineEditing ? d?.modifierCodes : line.modifierCodes) ?? []
                            if (current.includes(code) || current.length >= MAX_MODIFIERS_PER_LINE) return
                            const next = [...current, code]
                            if (isInlineEditing) {
                              updateInlineDraftField("modifierCodes", next)
                            } else {
                              updateLine(line.id, "modifierCodes", next)
                            }
                          }}
                          onRemove={(code) => {
                            const current = (isInlineEditing ? d?.modifierCodes : line.modifierCodes) ?? []
                            const next = current.filter((c) => c !== code)
                            if (isInlineEditing) {
                              updateInlineDraftField("modifierCodes", next)
                            } else {
                              updateLine(line.id, "modifierCodes", next)
                            }
                          }}
                        />
                      </div>
                    ) : null}
                  </>
                )

                return (
                  <div
                    key={line.id}
                    className={cn(
                      "px-3.5 py-3 transition-colors",
                      isEditing
                        ? "bg-panel-muted"
                        : isInlineEditing
                          ? "bg-blue-500/[0.07]"
                          : "hover:bg-panel-muted/50"
                    )}
                  >
                    {isEditing ? (
                      <div className="space-y-2">{lineEditorFields}</div>
                    ) : isInlineEditing ? (
                      <div className="space-y-2">{lineEditorFields}</div>
                    ) : (
                      <div className="flex items-start gap-2">
                        <button
                          type="button"
                          disabled={!canEditClaimLines}
                          aria-label={canEditClaimLines ? `Edit ${line.description || "line"}` : undefined}
                          onClick={() => canEditClaimLines && openInlineEdit(line)}
                          className={cn(
                            "mt-0.5 shrink-0 rounded-lg p-1 text-muted-foreground transition-colors",
                            canEditClaimLines ? "hover:bg-secondary hover:text-accent-foreground/65" : "opacity-20"
                          )}
                        >
                          <PencilSimple className="size-4" />
                        </button>
                        <div className="flex min-w-0 flex-1 items-start justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <button
                              type="button"
                              disabled={!canEditClaimLines}
                              onClick={() => canEditClaimLines && openInlineEdit(line)}
                              className={cn(
                                "block text-left text-[12px] font-medium leading-snug tracking-tight",
                                canEditClaimLines ? "text-foreground/88 hover:text-accent-foreground" : "text-foreground/85"
                              )}
                            >
                              {line.description}
                            </button>
                            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                              <span
                                className={cn(
                                  "rounded-md px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide",
                                  line.lineType === "medical_aid"
                                    ? "bg-blue-500/12 text-blue-400"
                                    : line.lineType === "cash"
                                      ? "bg-emerald-500/12 text-emerald-400"
                                      : "bg-purple-500/12 text-purple-400"
                                )}
                              >
                                {line.lineType === "medical_aid" ? "MA" : line.lineType === "cash" ? "Cash" : "Patient"}
                              </span>
                              {line.lineType === "medical_aid" && line.status && line.status !== "draft" ? (
                                <span className={cn("rounded-md px-1.5 py-0.5 text-[9px] font-semibold uppercase", STATUS_BADGE[line.status] ?? "bg-secondary text-muted-foreground")}>
                                  {line.status}
                                </span>
                              ) : null}
                              {adjudicationStatus ? (
                                <span className={cn("inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[9px] font-semibold", adjudicationMeta.tone)}>
                                  <span className={cn("size-1 rounded-full", adjudicationMeta.dot)} />
                                  {adjudicationMeta.label}
                                </span>
                              ) : null}
                              {line.icdCode ? <span className="font-mono text-[9px] text-muted-foreground">{line.icdCode}</span> : null}
                              {line.tariffCode ? <span className="font-mono text-[9px] text-muted-foreground">{line.tariffCode}</span> : null}
                              {(line.modifierCodes?.length ?? 0) > 0 ? (
                                <span className="font-mono text-[9px] text-muted-foreground">+{(line.modifierCodes ?? []).join(",")}</span>
                              ) : null}
                            </div>
                            {line.mediAdjudication?.rejectionDescription ? (
                              <p className="mt-1 text-[9px] text-rose-300/85">{line.mediAdjudication.rejectionDescription}</p>
                            ) : null}
                            {line.mediAdjudication?.schemeStatus ? (
                              <p className="mt-1 font-mono text-[9px] text-muted-foreground">
                                res {adjudicationMeta.short}
                                {line.mediAdjudication.rejectionCode ? ` · RJ ${line.mediAdjudication.rejectionCode}` : ""}
                                {adjudicationLiability != null ? ` · ${formatClaimMoney(adjudicationLiability)} patient liability` : ""}
                              </p>
                            ) : null}
                          </div>
                          <div className="shrink-0 text-right">
                            <span className="text-[13px] font-semibold tabular-nums tracking-tight text-foreground/92">R{line.amount.toLocaleString()}</span>
                            {line.mediAdjudication?.net ? (
                              <p className="text-[9px] tabular-nums text-emerald-400/75">R{line.mediAdjudication.net} net</p>
                            ) : null}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
            </div>
          </div>

          {/* Totals */}
          <div className="flex items-end justify-between gap-4 border-t border-panel-border pt-4">
            <div className="min-w-0 space-y-1">
              {claim.medicalAidAmount > 0 && (
                <p className="text-[10px] text-muted-foreground">
                  Medical aid{" "}
                  <span className="tabular-nums font-medium text-blue-400/95">R{claim.medicalAidAmount.toLocaleString()}</span>
                </p>
              )}
              {claim.cashAmount > 0 && (
                <p className="text-[10px] text-muted-foreground">
                  Cash{" "}
                  <span className="tabular-nums font-medium text-emerald-400/95">R{claim.cashAmount.toLocaleString()}</span>
                </p>
              )}
            </div>
            <div className="text-right">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Total</p>
              <p className="tabular-nums text-[20px] font-semibold tracking-tight text-foreground/95">R{claim.totalAmount.toLocaleString()}</p>
            </div>
          </div>

        </div>

        {/* Footer — single scheme CTA + invoice + print */}
        <div className="border-t border-panel-border bg-panel-muted px-4 pb-[max(4rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur-md supports-[backdrop-filter]:bg-panel-muted/50">
          {showMedikreditLane ? (
            hasMaLines ? (
              <button
                type="button"
                disabled={schemeBusy}
                onClick={() => void submitToScheme()}
                className={cn(
                  "mb-3 flex h-11 w-full items-center justify-center gap-2 rounded-xl text-[13px] font-semibold tracking-tight transition-all disabled:opacity-50",
                  claim.status === "rejected"
                    ? "bg-rose-500/90 text-foreground shadow-md shadow-rose-950/30 hover:bg-rose-500"
                    : "bg-[linear-gradient(180deg,#38bdf8_0%,#0284c7_100%)] text-foreground shadow-md shadow-black/40 hover:brightness-[1.03]"
                )}
              >
                {schemeBusy ? (
                  <ArrowsClockwise className="size-4 animate-spin" weight="bold" />
                ) : (
                  <PaperPlaneTilt className="size-4" weight="bold" />
                )}
                {claim.status === "rejected"
                  ? "Resubmit to MediKredit"
                  : claim.status === "partial"
                    ? "Submit amendment"
                    : "Submit to MediKredit"}
              </button>
            ) : (
              <p className="mb-3 text-center text-[10px] leading-snug text-amber-400/70">
                Set one line to <span className="font-medium text-amber-200/90">Medical aid</span> to submit.
              </p>
            )
          ) : null}

          {claim.status !== "reversed" &&
          Boolean((claim.medikreditResponse as unknown as ClaimResponse | null)?.txNbr) &&
          (claim.status === "approved" || claim.status === "partial" || claim.status === "submitted") ? (
            <button
              type="button"
              disabled={reversalBusy}
              onClick={() => void reversePersistedClaim()}
              className="mb-3 flex h-10 w-full items-center justify-center gap-2 rounded-xl border border-amber-400/20 bg-amber-400/[0.08] text-[11px] font-semibold text-amber-200 transition-colors hover:bg-amber-400/[0.14] disabled:opacity-45"
            >
              {reversalBusy ? <ArrowsClockwise className="size-3.5 animate-spin" /> : null}
              Reverse MediKredit claim
            </button>
          ) : null}

          {claim.status === "reversed" ? (
            <button
              type="button"
              onClick={() => void createCorrectedDraft()}
              className="mb-3 flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-blue-500/15 text-[11px] font-semibold text-blue-300 transition-colors hover:bg-blue-500/22"
            >
              Create linked corrected draft
            </button>
          ) : null}

          <ClaimInvoiceFooter
            claim={claim}
            practiceId={practiceId}
            cashAmount={claim.cashAmount}
            medicalAidAmount={claim.medicalAidAmount}
            onInvoiceCreated={onInvoiceCreated}
            onClaimPaid={() => onUpdateStatus(claim.id, "paid")}
          />
        </div>

      <MedikreditSchemeSubmissionDialog
        open={schemeDialogOpen}
        onOpenChange={setSchemeDialogOpen}
        busy={schemeBusy}
        error={schemeError}
        result={schemeResult}
        onEditClaim={() => {
          discardInlineEdit()
          setEditingLines(claim.lines)
          setIsEditing(true)
        }}
      />
    </motion.div>
  )
}

// ─── Create Claim Modal ──────────────────────────────────────────

export function CreateClaimModal({
  practiceId,
  patients,
  onSave,
  onClose,
}: {
  practiceId: string | null
  patients: import("@/lib/clinical-workspace").PracticePatient[]
  onSave: (claim: PracticeClaim) => void
  onClose: () => void
}) {
  const [patientSearch, setPatientSearch] = useState("")
  const [selectedPatient, setSelectedPatient] = useState<{ id: string; name: string } | null>(null)
  const [showDropdown, setShowDropdown] = useState(false)
  const [lines, setLines] = useState<ClaimLine[]>([
    { id: `l-${Date.now()}`, description: "", icdCode: "", tariffCode: "", nappiCode: "", quantity: 1, amount: 0, lineType: "medical_aid", status: "draft", treatmentDate: new Date().toISOString().slice(0, 10) },
  ])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const filtered = useMemo(() => {
    if (!patientSearch.trim()) return patients.slice(0, 8)
    const q = patientSearch.toLowerCase()
    return patients.filter((p) => p.name.toLowerCase().includes(q)).slice(0, 8)
  }, [patients, patientSearch])

  const totals = useMemo(() => {
    let ma = 0, cash = 0, pl = 0
    for (const l of lines) {
      const lineTotal = l.amount * (l.quantity ?? 1)
      if (l.lineType === "medical_aid") ma += lineTotal
      else if (l.lineType === "cash") cash += lineTotal
      else pl += lineTotal
    }
    return { ma, cash, pl, total: ma + cash + pl }
  }, [lines])
  const availableModifiers = useMemo(
    () => getModifiersForDiscipline(BILLING_MODIFIER_DISCIPLINE),
    []
  )

  const updateLine = (id: string, field: keyof ClaimLine, value: string | number | ClaimLineType | string[]) => {
    setLines((prev) => prev.map((l) => (l.id === id ? { ...l, [field]: value } : l)))
  }

  const addLine = () => {
    setLines((prev) => [
      ...prev,
      { id: `l-${Date.now()}`, description: "", icdCode: "", tariffCode: "", nappiCode: "", quantity: 1, amount: 0, lineType: "medical_aid", status: "draft", treatmentDate: new Date().toISOString().slice(0, 10) },
    ])
  }

  const removeLine = (id: string) => {
    if (lines.length <= 1) return
    setLines((prev) => prev.filter((l) => l.id !== id))
  }

  const handleSave = async (asDraft: boolean) => {
    if (!selectedPatient) return
    const finalLines = lines.map((l) => ({
      ...l,
      amount: l.amount * (l.quantity ?? 1),
      status: (asDraft ? "draft" : "submitted") as ClaimStatus,
    }))
    const claim: PracticeClaim = {
      id: `cl-${Date.now()}`,
      patientId: selectedPatient.id,
      patientName: selectedPatient.name,
      lines: finalLines,
      totalAmount: totals.total,
      medicalAidAmount: totals.ma,
      cashAmount: totals.cash,
      status: asDraft ? "draft" : "submitted",
      createdAt: new Date().toISOString(),
      ...(!asDraft ? { submittedAt: new Date().toISOString() } : {}),
    }
    setSaving(true)
    setError(null)
    try {
      if (practiceId) {
        const res = await fetchClient("/api/clinical/practice-claims/draft", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            practiceId,
            patientId: selectedPatient.id,
            lines: finalLines,
          }),
        })
        const body = (await res.json()) as { claimId?: string; error?: string }
        if (!res.ok || !body.claimId) throw new Error(body.error || "Could not save claim")
        claim.id = body.claimId

        if (!asDraft) {
          const supabase = createClient()
          if (supabase) {
            const { error: updateError } = await supabase
              .from("practice_claims")
              .update({ status: "submitted", updated_at: new Date().toISOString() })
              .eq("id", claim.id)
              .eq("practice_id", practiceId)
            if (updateError) throw updateError
          }
        }
      }

      onSave(claim)
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Could not save claim")
    } finally {
      setSaving(false)
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[130] flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <AssistantModalSuppressor />
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.95, opacity: 0 }}
        transition={{ type: "spring", stiffness: 400, damping: 35 }}
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[85vh] w-full max-w-2xl flex-col rounded-2xl border border-panel-border bg-panel shadow-2xl"
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-panel-border px-5 py-3.5">
          <h2 className="text-[14px] font-semibold">New Claim</h2>
          <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-muted-foreground hover:bg-secondary hover:text-accent-foreground/60">
            <X className="size-4" />
          </button>
        </div>

        {/* Modal Body */}
        <div
          className="flex-1 space-y-4 overflow-y-auto p-5 pb-[max(5rem,env(safe-area-inset-bottom))]"
          style={{ scrollbarWidth: "none" }}
        >
          {/* Patient search */}
          <div className="relative">
            <p className="mb-1.5 text-[9px] font-medium uppercase tracking-wider text-muted-foreground">Patient</p>
            {selectedPatient ? (
              <div className="flex items-center gap-2 rounded-lg border border-panel-border bg-panel-muted px-3 py-2">
                <span className="flex-1 text-[12px] font-medium">{selectedPatient.name}</span>
                <button
                  type="button"
                  onClick={() => { setSelectedPatient(null); setPatientSearch("") }}
                  className="text-muted-foreground hover:text-accent-foreground"
                >
                  <X className="size-3.5" />
                </button>
              </div>
            ) : (
              <div className="relative">
                <MagnifyingGlass className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                <input
                  ref={inputRef}
                  type="text"
                  value={patientSearch}
                  onChange={(e) => { setPatientSearch(e.target.value); setShowDropdown(true) }}
                  onFocus={() => setShowDropdown(true)}
                  placeholder="Search patients..."
                  className="w-full rounded-lg border border-panel-border bg-panel-muted py-2 pl-8 pr-3 text-[12px] text-foreground outline-none placeholder:text-muted-foreground/50 focus:border-blue-500/30"
                />
                {showDropdown && filtered.length > 0 && (
                  <div className="absolute left-0 top-full z-10 mt-1 w-full rounded-lg border border-panel-border bg-popover py-1 shadow-xl">
                    {filtered.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => {
                          setSelectedPatient({ id: p.id, name: p.name })
                          setShowDropdown(false)
                        }}
                        className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[11px] text-muted-foreground/80 transition-colors hover:bg-secondary"
                      >
                        <span className="font-medium text-foreground">{p.name}</span>
                        {p.medicalAidScheme && (
                          <span className="text-[9px] text-muted-foreground">{p.medicalAidScheme}</span>
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Line items */}
          <div>
            <div className="mb-2 flex items-center justify-between">
              <p className="text-[9px] font-medium uppercase tracking-wider text-muted-foreground">Line Items</p>
              <button
                type="button"
                onClick={addLine}
                className="flex items-center gap-1 rounded-md px-2 py-1 text-[9px] font-medium text-blue-400 transition-colors hover:bg-blue-500/10"
              >
                <Plus className="size-3" weight="bold" /> Add Line
              </button>
            </div>
            <div className="space-y-2">
              {lines.map((line, i) => (
                <div key={line.id} className="rounded-xl border border-panel-border bg-panel-muted/50 p-3 space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="text-[9px] font-bold text-muted-foreground">{i + 1}</span>
                    <input
                      type="text"
                      value={line.description}
                      onChange={(e) => updateLine(line.id, "description", e.target.value)}
                      placeholder="Description (e.g. Consultation 0190)"
                      className="flex-1 rounded-md border border-panel-border bg-panel-muted px-2 py-1.5 text-[11px] text-foreground outline-none placeholder:text-muted-foreground/50 focus:border-blue-500/30"
                    />
                    {lines.length > 1 && (
                      <button type="button" onClick={() => removeLine(line.id)} className="text-muted-foreground hover:text-status-danger">
                        <Trash className="size-3.5" />
                      </button>
                    )}
                  </div>
                  <div className="grid grid-cols-5 gap-2">
                    <input
                      type="text"
                      value={line.icdCode ?? ""}
                      onChange={(e) => updateLine(line.id, "icdCode", e.target.value)}
                      placeholder="ICD-10"
                      className={cn(
                        "rounded-md border bg-panel-muted px-2 py-1 text-[10px] text-foreground outline-none placeholder:text-muted-foreground/50 focus:border-blue-500/30",
                        line.lineType === "medical_aid" && !line.icdCode?.trim()
                          ? "border-amber-500/45 ring-1 ring-amber-400/20"
                          : "border-panel-border"
                      )}
                    />
                    <input
                      type="text"
                      value={line.tariffCode ?? ""}
                      onChange={(e) => updateLine(line.id, "tariffCode", e.target.value)}
                      placeholder="Tariff"
                      className="rounded-md border border-panel-border bg-panel-muted px-2 py-1 text-[10px] text-foreground outline-none placeholder:text-muted-foreground/50 focus:border-blue-500/30"
                    />
                    <input
                      type="text"
                      value={line.nappiCode ?? ""}
                      onChange={(e) => updateLine(line.id, "nappiCode", e.target.value)}
                      placeholder="NAPPI"
                      className="rounded-md border border-panel-border bg-panel-muted px-2 py-1 text-[10px] text-foreground outline-none placeholder:text-muted-foreground/50 focus:border-blue-500/30"
                    />
                    <input
                      type="number"
                      value={line.quantity ?? 1}
                      min={1}
                      onChange={(e) => updateLine(line.id, "quantity", parseInt(e.target.value) || 1)}
                      placeholder="Qty"
                      className="rounded-md border border-panel-border bg-panel-muted px-2 py-1 text-center text-[10px] tabular-nums text-foreground outline-none placeholder:text-muted-foreground/50 focus:border-blue-500/30"
                    />
                    <input
                      type="number"
                      value={line.amount || ""}
                      onChange={(e) => updateLine(line.id, "amount", parseFloat(e.target.value) || 0)}
                      placeholder="Unit Price"
                      className="rounded-md border border-panel-border bg-panel-muted px-2 py-1 text-right text-[10px] tabular-nums text-foreground outline-none placeholder:text-muted-foreground/50 focus:border-blue-500/30"
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex gap-3">
                      {(["medical_aid", "cash", "patient_liability"] as ClaimLineType[]).map((lt) => (
                        <label key={lt} className="flex items-center gap-1 cursor-pointer">
                          <input
                            type="radio"
                            name={`create-lt-${line.id}`}
                            checked={line.lineType === lt}
                            onChange={() => updateLine(line.id, "lineType", lt)}
                            className="size-2.5 accent-blue-500"
                          />
                          <span className="text-[9px] text-muted-foreground">
                            {lt === "medical_aid" ? "MA" : lt === "cash" ? "Cash" : "Patient Liability"}
                          </span>
                        </label>
                      ))}
                    </div>
                    <span className="text-[10px] font-bold tabular-nums text-muted-foreground">
                      = R{(line.amount * (line.quantity ?? 1)).toLocaleString()}
                    </span>
                  </div>
                  {line.lineType === "medical_aid" ? (
                    <div className="rounded-md border border-panel-border bg-panel-muted px-2 py-1.5">
                      <p className="mb-1 text-[9px] font-medium uppercase tracking-wide text-muted-foreground">Modifiers</p>
                      <ClaimModifierPicker
                        lineId={line.id}
                        codes={line.modifierCodes ?? []}
                        available={availableModifiers}
                        onAdd={(code) => {
                          const current = line.modifierCodes ?? []
                          if (current.includes(code) || current.length >= MAX_MODIFIERS_PER_LINE) return
                          updateLine(line.id, "modifierCodes", [...current, code])
                        }}
                        onRemove={(code) => {
                          updateLine(
                            line.id,
                            "modifierCodes",
                            (line.modifierCodes ?? []).filter((c) => c !== code)
                          )
                        }}
                      />
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          </div>

          {/* Totals */}
          <div className="rounded-xl border border-panel-border bg-panel-muted/50 p-3 space-y-1.5">
            {totals.ma > 0 && (
              <div className="flex justify-between text-[11px]">
                <span className="text-muted-foreground">MA Portion</span>
                <span className="font-bold tabular-nums text-blue-400">R{totals.ma.toLocaleString()}</span>
              </div>
            )}
            {totals.cash > 0 && (
              <div className="flex justify-between text-[11px]">
                <span className="text-muted-foreground">Cash Portion</span>
                <span className="font-bold tabular-nums text-status-success">R{totals.cash.toLocaleString()}</span>
              </div>
            )}
            {totals.pl > 0 && (
              <div className="flex justify-between text-[11px]">
                <span className="text-muted-foreground">Patient Liability</span>
                <span className="font-bold tabular-nums text-purple-400">R{totals.pl.toLocaleString()}</span>
              </div>
            )}
            <div className="border-t border-panel-border pt-1.5 flex justify-between text-[11px]">
              <span className="font-semibold text-foreground/70">Total</span>
              <span className="font-bold tabular-nums">R{totals.total.toLocaleString()}</span>
            </div>
          </div>
          {error ? (
            <div className="rounded-xl border border-status-danger/20 bg-status-danger/5 px-3 py-2 text-[11px] font-medium text-status-danger">
              {error}
            </div>
          ) : null}
        </div>

        {/* Modal Footer */}
        <div className="border-t border-panel-border px-5 py-3.5 flex gap-2">
          <button
            type="button"
            onClick={() => void handleSave(true)}
            disabled={!selectedPatient || saving}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-panel-muted py-2.5 text-[11px] font-semibold text-muted-foreground/70 transition-colors hover:bg-secondary disabled:opacity-30 disabled:pointer-events-none"
          >
            {saving ? "Saving..." : "Save as Draft"}
          </button>
          <button
            type="button"
            onClick={() => void handleSave(false)}
            disabled={!selectedPatient || saving}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-blue-500/15 py-2.5 text-[11px] font-semibold text-blue-400 transition-colors hover:bg-blue-500/25 disabled:opacity-30 disabled:pointer-events-none"
          >
            <PaperPlaneTilt className="size-3.5" weight="fill" />
            {saving ? "Saving..." : "Submit"}
          </button>
        </div>
      </motion.div>
    </motion.div>
  )
}

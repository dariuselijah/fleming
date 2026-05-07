"use client"

import { useWorkspace, useWorkspaceStore } from "@/lib/clinical-workspace"
import { usePracticeCrypto } from "@/lib/clinical-workspace/practice-crypto-context"
import { fetchPracticeClaimsForWorkspace } from "@/lib/clinical-workspace/refresh-practice-claims"
import { fetchClient } from "@/lib/fetch"
import { cn } from "@/lib/utils"
import { ArrowRight, Plus, ShieldCheck, Spinner, Trash, WarningCircle, CheckCircle } from "@phosphor-icons/react"
import { useMemo, useState } from "react"
import { BentoTile } from "../bento-tile"
import type { RevenueInvoice, RevenuePayment } from "./types"
import { formatDate, formatZarCents } from "./ui/format"
import { EmptyRevenueState, RevenueBadge, RevenueTable } from "./ui/primitives"
import { PatientCombobox } from "./patient-combobox"
import { MedpraxCodeSearch, type MedpraxPickedCode } from "./medprax-code-search"

type QuickClaimLine = {
  id: string
  description: string
  amount: string
  lineType: "medical_aid" | "cash" | "patient_liability"
  lineSource: "medprax" | "manual"
  tariffCode?: string
  nappiCode?: string
  icdCode?: string
}

const LINE_TYPE_LABELS: Record<QuickClaimLine["lineType"], string> = {
  medical_aid: "Medical aid",
  patient_liability: "Patient liability",
  cash: "Cash",
}

function newLine(): QuickClaimLine {
  return { id: `line-${Date.now()}-${Math.random()}`, description: "", amount: "", lineType: "medical_aid", lineSource: "manual" }
}

export function ClaimsTab({
  invoices,
  payments,
  refresh,
}: {
  invoices: RevenueInvoice[]
  payments: RevenuePayment[]
  refresh: () => void
}) {
  const { practiceId } = usePracticeCrypto()
  const { claims, patients } = useWorkspace()
  const setClaims = useWorkspaceStore((s) => s.setClaims)
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null)
  const [quickPatientId, setQuickPatientId] = useState("")
  const [quickLines, setQuickLines] = useState<QuickClaimLine[]>([newLine()])
  const [busy, setBusy] = useState(false)
  const invoiceByClaim = useMemo(() => new Map(invoices.map((i) => [i.claim_id, i])), [invoices])

  const reloadClaims = async () => {
    if (!practiceId) return
    const rows = await fetchPracticeClaimsForWorkspace(practiceId)
    setClaims(rows)
  }

  const totalAmount = quickLines.reduce((sum, l) => {
    const v = parseFloat(l.amount.replace(",", "."))
    return sum + (Number.isFinite(v) ? v : 0)
  }, 0)

  const createQuickClaim = async () => {
    if (!practiceId || !quickPatientId) {
      setMessage({ text: "Choose a patient before creating a claim.", ok: false })
      return
    }
    const lines = quickLines
      .map((line) => ({
        ...line,
        description: line.description.trim() || "Line item",
        amount: parseFloat(line.amount.replace(",", ".")),
      }))
      .filter((line) => Number.isFinite(line.amount) && line.amount > 0)
    if (lines.length === 0) {
      setMessage({ text: "Enter a valid amount on at least one line.", ok: false })
      return
    }
    setBusy(true)
    setMessage(null)
    try {
      const res = await fetchClient("/api/clinical/practice-claims/draft", {
        method: "POST",
        body: JSON.stringify({
          practiceId,
          patientId: quickPatientId,
          clinicalEncounterId: null,
          lines: lines.map((line) => ({ ...line, status: "draft" })),
        }),
      })
      const j = (await res.json().catch(() => ({}))) as { error?: string; claimId?: string }
      if (!res.ok) throw new Error(j.error ?? "Could not create claim")
      setQuickLines([newLine()])
      setQuickPatientId("")
      setMessage({ text: "Draft claim created — open it from the list to submit via MediKredit.", ok: true })
      await reloadClaims()
      refresh()
    } catch (e) {
      setMessage({ text: e instanceof Error ? e.message : "Could not create claim", ok: false })
    } finally {
      setBusy(false)
    }
  }

  const updateLine = (id: string, patch: Partial<QuickClaimLine>) =>
    setQuickLines((prev) => prev.map((l) => (l.id === id ? { ...l, ...patch } : l)))

  const removeLine = (id: string) =>
    setQuickLines((prev) => (prev.length > 1 ? prev.filter((l) => l.id !== id) : prev))

  const applyMedpraxPick = (id: string, pick: MedpraxPickedCode) => {
    updateLine(id, {
      description: pick.description,
      amount: pick.amount ? (pick.amount / 100).toFixed(2) : (quickLines.find((l) => l.id === id)?.amount ?? ""),
      lineSource: "medprax",
      ...(pick.kind === "tariff" ? { tariffCode: pick.code } : {}),
      ...(pick.kind === "nappi" ? { nappiCode: pick.code } : {}),
      ...(pick.kind === "icd" ? { icdCode: pick.code } : {}),
    })
  }

  const convertToPrivate = async (claimId: string) => {
    setMessage(null)
    try {
      const res = await fetchClient("/api/billing/invoices", {
        method: "POST",
        body: JSON.stringify({ claimId, billingMode: "cash" }),
      })
      const j = (await res.json().catch(() => ({}))) as { error?: string }
      if (!res.ok) throw new Error(j.error ?? "Could not create invoice")
      setMessage({ text: "Private invoice created.", ok: true })
      refresh()
    } catch (e) {
      setMessage({ text: e instanceof Error ? e.message : "Could not create invoice", ok: false })
    }
  }

  const reverseClaim = async (invoice: RevenueInvoice) => {
    const payment = payments.find((p) => p.invoice_id === invoice.id && p.status === "succeeded")
    if (!payment) {
      setMessage({ text: "No succeeded payment found to reverse.", ok: false })
      return
    }
    setMessage(null)
    try {
      const res = await fetchClient(`/api/billing/invoices/${invoice.id}/credit-notes`, {
        method: "POST",
        body: JSON.stringify({ paymentId: payment.id, amountCents: payment.amount_cents, reason: "Claim reversal" }),
      })
      const j = (await res.json().catch(() => ({}))) as { error?: string }
      if (!res.ok) throw new Error(j.error ?? "Could not reverse claim")
      setMessage({ text: "Claim reversal credit note created.", ok: true })
      refresh()
    } catch (e) {
      setMessage({ text: e instanceof Error ? e.message : "Could not reverse claim", ok: false })
    }
  }

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
      {/* Left: quick claim builder */}
      <BentoTile
        title="New claim"
        subtitle="Build a claim with Medprax-verified line items"
        icon={<ShieldCheck className="size-4 text-violet-400" weight="fill" />}
      >
        <div className="space-y-4">
          {/* Patient */}
          <div>
            <label className="mb-1.5 block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Patient</label>
            <PatientCombobox patients={patients} value={quickPatientId} onChange={setQuickPatientId} placeholder="Search or add patient…" />
          </div>

          {/* Line items */}
          <div>
            <label className="mb-1.5 block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Line items
            </label>
            <div className="space-y-2">
              {quickLines.map((line, idx) => (
                <div
                  key={line.id}
                  className="relative rounded-2xl border border-border/60 bg-background/60 p-3 dark:border-white/[0.07] dark:bg-white/[0.02]"
                >
                  {/* Line number + remove */}
                  <div className="mb-2.5 flex items-center justify-between">
                    <span className="text-[10px] font-semibold text-muted-foreground/60">LINE {idx + 1}</span>
                    {quickLines.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeLine(line.id)}
                        className="rounded-lg p-1 text-muted-foreground/40 transition-colors hover:bg-red-500/10 hover:text-red-400"
                      >
                        <Trash className="size-3.5" />
                      </button>
                    )}
                  </div>

                  {/* Medprax search */}
                  <div className="mb-2">
                    <MedpraxCodeSearch onPick={(pick) => applyMedpraxPick(line.id, pick)} />
                  </div>

                  {/* Description + codes row */}
                  <div className="mb-2 grid gap-2 sm:grid-cols-[1fr_auto]">
                    <input
                      value={line.description}
                      onChange={(e) => updateLine(line.id, { description: e.target.value, lineSource: "manual" })}
                      placeholder="Description"
                      className="w-full rounded-xl border border-border bg-background px-3 py-2 text-[12px] placeholder:text-muted-foreground/40 dark:border-white/[0.08] dark:bg-black/20"
                    />
                    {line.lineSource === "medprax" && (
                      <span className="inline-flex items-center gap-1 rounded-lg bg-emerald-500/10 px-2 py-1.5 text-[9px] font-semibold text-emerald-400">
                        <ShieldCheck className="size-3" weight="fill" />
                        Verified
                      </span>
                    )}
                  </div>

                  {/* Amount + type row */}
                  <div className="grid grid-cols-2 gap-2">
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[11px] text-muted-foreground">R</span>
                      <input
                        value={line.amount}
                        onChange={(e) => updateLine(line.id, { amount: e.target.value })}
                        inputMode="decimal"
                        placeholder="0.00"
                        className="w-full rounded-xl border border-border bg-background pl-6 pr-3 py-2 text-[12px] placeholder:text-muted-foreground/40 dark:border-white/[0.08] dark:bg-black/20"
                      />
                    </div>
                    <select
                      value={line.lineType}
                      onChange={(e) => updateLine(line.id, { lineType: e.target.value as QuickClaimLine["lineType"] })}
                      className="rounded-xl border border-border bg-background px-3 py-2 text-[11px] dark:border-white/[0.08] dark:bg-black/20"
                    >
                      {(Object.entries(LINE_TYPE_LABELS) as [QuickClaimLine["lineType"], string][]).map(([k, label]) => (
                        <option key={k} value={k}>{label}</option>
                      ))}
                    </select>
                  </div>

                  {/* Codes chips */}
                  {(line.tariffCode ?? line.nappiCode ?? line.icdCode) ? (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {line.tariffCode && <CodeChip label="Tariff" code={line.tariffCode} />}
                      {line.nappiCode && <CodeChip label="NAPPI" code={line.nappiCode} />}
                      {line.icdCode && <CodeChip label="ICD" code={line.icdCode} />}
                    </div>
                  ) : null}
                </div>
              ))}
            </div>

            <button
              type="button"
              onClick={() => setQuickLines((prev) => [...prev, newLine()])}
              className="mt-2 inline-flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-border/60 py-2.5 text-[11px] font-semibold text-muted-foreground/60 transition-colors hover:border-border hover:text-muted-foreground dark:border-white/[0.07]"
            >
              <Plus className="size-3.5" />
              Add line item
            </button>
          </div>

          {/* Total + submit */}
          <div className="flex items-center justify-between rounded-2xl border border-border/60 bg-muted/30 px-4 py-3 dark:border-white/[0.07]">
            <div>
              <p className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">Total</p>
              <p className="mt-0.5 text-lg font-semibold">R {totalAmount.toFixed(2)}</p>
            </div>
            <button
              type="button"
              disabled={busy || !quickPatientId || totalAmount === 0}
              onClick={() => void createQuickClaim()}
              className={cn(
                "inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-[12px] font-semibold transition-all",
                quickPatientId && totalAmount > 0
                  ? "bg-violet-500/20 text-violet-300 hover:bg-violet-500/30"
                  : "cursor-not-allowed bg-muted text-muted-foreground/40"
              )}
            >
              {busy ? <Spinner className="size-4 animate-spin" /> : <ArrowRight className="size-4" />}
              Create draft claim
            </button>
          </div>

          {message && (
            <p className={cn(
              "flex items-center gap-1.5 rounded-xl px-3 py-2.5 text-[11px] font-medium",
              message.ok ? "bg-emerald-500/10 text-emerald-400" : "bg-amber-500/10 text-amber-400"
            )}>
              {message.ok ? <CheckCircle className="size-3.5 shrink-0" weight="fill" /> : <WarningCircle className="size-3.5 shrink-0" weight="fill" />}
              {message.text}
            </p>
          )}
        </div>
      </BentoTile>

      {/* Right: claims list */}
      <BentoTile
        title="Claims"
        subtitle={`${claims.length} total`}
        className="xl:sticky xl:top-16 xl:self-start"
      >
        {claims.length === 0 ? (
          <EmptyRevenueState
            title="No claims yet"
            body="Claims submitted through MediKredit appear here with linked invoices and shortfall status."
          />
        ) : (
          <RevenueTable>
            <thead className="bg-muted/40 text-muted-foreground dark:bg-white/[0.03]">
              <tr>
                <th className="px-3 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider">Patient</th>
                <th className="px-3 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider">Status</th>
                <th className="px-3 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider">Amount</th>
                <th className="px-3 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider">Date</th>
                <th className="px-3 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {claims.map((claim) => {
                const inv = invoiceByClaim.get(claim.id)
                return (
                  <tr key={claim.id} className="border-t border-border/50 transition-colors hover:bg-muted/20 dark:border-white/[0.05] dark:hover:bg-white/[0.02]">
                    <td className="px-3 py-2.5 text-[11px] font-medium">{claim.patientName}</td>
                    <td className="px-3 py-2.5">
                      <RevenueBadge
                        tone={claim.status === "paid" || claim.status === "approved" ? "green" : claim.status === "rejected" ? "red" : "amber"}
                      >
                        {claim.status}
                      </RevenueBadge>
                    </td>
                    <td className="px-3 py-2.5 text-[11px]">{formatZarCents(Math.round(claim.totalAmount * 100))}</td>
                    <td className="px-3 py-2.5 text-[11px] text-muted-foreground">{formatDate(claim.createdAt)}</td>
                    <td className="px-3 py-2.5 text-right">
                      <div className="flex justify-end gap-1.5">
                        {!inv && (
                          <button
                            type="button"
                            onClick={() => void convertToPrivate(claim.id)}
                            className="rounded-lg bg-blue-500/15 px-2 py-1 text-[10px] font-semibold text-blue-400 hover:bg-blue-500/25"
                          >
                            → Private
                          </button>
                        )}
                        {inv && (
                          <button
                            type="button"
                            onClick={() => void reverseClaim(inv)}
                            className="rounded-lg bg-red-500/10 px-2 py-1 text-[10px] font-semibold text-red-400 hover:bg-red-500/20"
                          >
                            Reverse
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </RevenueTable>
        )}
      </BentoTile>
    </div>
  )
}

function CodeChip({ label, code }: { label: string; code: string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-md bg-muted/60 px-1.5 py-0.5 text-[9px] font-semibold text-muted-foreground dark:bg-white/[0.06]">
      <span className="text-foreground/40">{label}</span>
      {code}
    </span>
  )
}

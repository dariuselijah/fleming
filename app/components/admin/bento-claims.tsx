"use client"

import {
  useWorkspace,
  useWorkspaceStore,
  type PracticeClaim,
  type ClaimLine,
  type ClaimLineType,
  type ClaimStatus,
  type BillingSubTab,
} from "@/lib/clinical-workspace"
import { cn } from "@/lib/utils"
import {
  ArrowsClockwise,
  ArrowsDownUp,
  Bell,
  CaretRight,
  Check,
  CheckCircle,
  CreditCard,
  CurrencyCircleDollar,
  FileText,
  MagnifyingGlass,
  PaperPlaneTilt,
  PencilSimple,
  Plus,
  Printer,
  Receipt,
  ShieldCheck,
  Trash,
  Warning,
  X,
} from "@phosphor-icons/react"
import { BentoTile } from "./bento-tile"
import { RevenueSparkline } from "./revenue-sparkline"
import { motion, AnimatePresence } from "motion/react"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"

type SortKey = "date" | "patient" | "amount" | "status"
type SortDir = "asc" | "desc"

const MOCK_SPARKLINE_SENT = [12, 15, 8, 22, 18, 25, 30, 28, 35, 32, 38, 42]
const MOCK_SPARKLINE_SETTLED = [5, 8, 6, 14, 12, 18, 22, 20, 28, 25, 30, 35]

const STATUS_BADGE: Record<string, string> = {
  draft: "bg-white/[0.06] text-white/50",
  submitted: "bg-blue-500/15 text-blue-400",
  approved: "bg-[#00E676]/15 text-[#00E676]",
  rejected: "bg-[#EF5350]/15 text-[#EF5350]",
  paid: "bg-[#00E676]/20 text-[#00E676]",
  partial: "bg-purple-500/15 text-purple-400",
}

const SUB_TABS: { id: BillingSubTab; label: string }[] = [
  { id: "claims", label: "Claims" },
  { id: "invoices", label: "Invoices" },
  { id: "outstanding", label: "Outstanding" },
  { id: "payments", label: "Payments" },
]

/** Shown in UI when the workspace store has no claims yet (sidebar + table). */
export const DEMO_PRACTICE_CLAIMS: PracticeClaim[] = [
  { id: "cl-1", patientId: "p1", patientName: "Sarah Johnson", lines: [{ id: "l1", description: "Consultation (0190)", icdCode: "I10", amount: 450, lineType: "medical_aid", status: "draft" }], totalAmount: 450, medicalAidAmount: 450, cashAmount: 0, status: "draft", createdAt: "2026-04-04T08:30:00Z" },
  { id: "cl-2", patientId: "p2", patientName: "Michael Chen", lines: [{ id: "l2", description: "Extended Consult (0191)", icdCode: "R07.9", amount: 680, lineType: "medical_aid", status: "submitted" }, { id: "l2b", description: "ECG (1112)", icdCode: "R07.9", tariffCode: "1112", amount: 220, lineType: "cash", status: "submitted" }], totalAmount: 900, medicalAidAmount: 680, cashAmount: 220, status: "submitted", submittedAt: "2026-04-04T09:10:00Z", createdAt: "2026-04-04T08:45:00Z" },
  { id: "cl-3", patientId: "p3", patientName: "Emma Williams", lines: [{ id: "l3", description: "Follow-up (0023)", icdCode: "E11.9", amount: 350, lineType: "medical_aid", status: "paid" }], totalAmount: 350, medicalAidAmount: 350, cashAmount: 0, status: "paid", createdAt: "2026-04-03T10:00:00Z", paidAt: "2026-04-03T16:00:00Z", paymentMethod: "EFT", paymentRef: "REF-99102" },
  { id: "cl-4", patientId: "p4", patientName: "James Brown", lines: [{ id: "l4", description: "Skin Biopsy (0270)", icdCode: "D23.9", amount: 1200, lineType: "cash", status: "draft" }], totalAmount: 1200, medicalAidAmount: 0, cashAmount: 1200, status: "draft", createdAt: "2026-04-04T09:30:00Z" },
  { id: "cl-5", patientId: "p7", patientName: "Lisa Anderson", lines: [{ id: "l5", description: "Consultation (0190)", icdCode: "F41.1", amount: 450, lineType: "medical_aid", status: "rejected" }], totalAmount: 450, medicalAidAmount: 450, cashAmount: 0, status: "rejected", rejectionReason: "Pre-authorisation required for psychiatric consultation", createdAt: "2026-04-02T14:00:00Z" },
  { id: "cl-6", patientId: "p8", patientName: "Robert Taylor", lines: [{ id: "l6", description: "Post-op Follow-up (0023)", icdCode: "T81.4", amount: 350, lineType: "medical_aid", status: "submitted" }], totalAmount: 350, medicalAidAmount: 350, cashAmount: 0, status: "submitted", submittedAt: "2026-04-03T15:30:00Z", createdAt: "2026-04-03T14:00:00Z" },
]

// ─── Main Component ──────────────────────────────────────────────

export function BentoClaims() {
  const {
    claims: storeClaims,
    updateClaimStatus,
    updateClaim,
    addClaim,
    patients,
    activeBillingSubTab,
    setBillingSubTab,
  } = useWorkspace()

  const billingFocusRequest = useWorkspaceStore((s) => s.billingFocusRequest)
  const lastBillingFocusNonce = useRef(0)

  const allClaims = storeClaims.length > 0 ? storeClaims : DEMO_PRACTICE_CLAIMS

  const [sortKey, setSortKey] = useState<SortKey>("date")
  const [sortDir, setSortDir] = useState<SortDir>("desc")
  const [selectedClaim, setSelectedClaim] = useState<PracticeClaim | null>(null)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [showCreateModal, setShowCreateModal] = useState(false)

  useEffect(() => {
    if (billingFocusRequest.nonce <= lastBillingFocusNonce.current) return
    if (!billingFocusRequest.claimId) return
    lastBillingFocusNonce.current = billingFocusRequest.nonce
    const claim = allClaims.find((c) => c.id === billingFocusRequest.claimId)
    if (!claim) return
    setSelectedClaim(claim)
    if (claim.status === "paid") setBillingSubTab("payments")
    else if (["draft", "submitted", "rejected", "partial"].includes(claim.status))
      setBillingSubTab("outstanding")
    else setBillingSubTab("claims")
  }, [billingFocusRequest, allClaims, setBillingSubTab])

  const { totalSent, totalSettled, totalPending } = useMemo(() => {
    let s = 0, c = 0, p = 0
    for (const cl of allClaims) {
      if (cl.status !== "draft") s += cl.totalAmount
      if (cl.status === "paid") c += cl.totalAmount
      if (cl.status === "submitted") p += cl.totalAmount
    }
    return { totalSent: s || 4250, totalSettled: c || 2870, totalPending: p || 1380 }
  }, [allClaims])

  const filteredClaims = useMemo(() => {
    if (activeBillingSubTab === "outstanding")
      return allClaims.filter((c) => ["draft", "submitted", "rejected"].includes(c.status))
    if (activeBillingSubTab === "payments")
      return allClaims.filter((c) => c.status === "paid")
    return allClaims
  }, [allClaims, activeBillingSubTab])

  const sorted = useMemo(() => {
    const copy = [...filteredClaims]
    copy.sort((a, b) => {
      let cmp = 0
      if (sortKey === "date") cmp = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
      else if (sortKey === "patient") cmp = a.patientName.localeCompare(b.patientName)
      else if (sortKey === "amount") cmp = a.totalAmount - b.totalAmount
      else if (sortKey === "status") cmp = a.status.localeCompare(b.status)
      return sortDir === "asc" ? cmp : -cmp
    })
    return copy
  }, [filteredClaims, sortKey, sortDir])

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"))
    else { setSortKey(key); setSortDir("desc") }
  }

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  const bulkSubmit = useCallback(() => {
    for (const id of selectedIds) updateClaimStatus(id, "submitted")
    setSelectedIds(new Set())
  }, [selectedIds, updateClaimStatus])

  const draftSelected = [...selectedIds].filter(
    (id) => filteredClaims.find((c) => c.id === id)?.status === "draft"
  )

  const handleSaveClaim = (claim: PracticeClaim) => {
    addClaim(claim)
    setShowCreateModal(false)
  }

  const agingBuckets = useMemo(() => {
    if (activeBillingSubTab !== "outstanding") return null
    const now = Date.now()
    const buckets = { "0-30d": [] as PracticeClaim[], "31-60d": [] as PracticeClaim[], "61-90d": [] as PracticeClaim[], "90+d": [] as PracticeClaim[] }
    for (const c of filteredClaims) {
      const days = Math.floor((now - new Date(c.createdAt).getTime()) / 86400000)
      if (days <= 30) buckets["0-30d"].push(c)
      else if (days <= 60) buckets["31-60d"].push(c)
      else if (days <= 90) buckets["61-90d"].push(c)
      else buckets["90+d"].push(c)
    }
    return buckets
  }, [filteredClaims, activeBillingSubTab])

  return (
    <div className="flex h-full gap-3">
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Header: Sub-tabs + Create */}
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-1 rounded-xl bg-white/[0.04] p-1">
            {SUB_TABS.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setBillingSubTab(tab.id)}
                className={cn(
                  "rounded-lg px-3.5 py-1.5 text-[11px] font-semibold transition-all",
                  activeBillingSubTab === tab.id
                    ? "bg-white/[0.1] text-white shadow-sm"
                    : "text-white/35 hover:text-white/55"
                )}
              >
                {tab.label}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => setShowCreateModal(true)}
            className="flex items-center gap-1.5 rounded-xl bg-blue-500/15 px-3.5 py-1.5 text-[11px] font-semibold text-blue-400 transition-colors hover:bg-blue-500/25"
          >
            <Plus className="size-3.5" weight="bold" />
            Create
          </button>
        </div>

        {/* Pulse strip (claims & outstanding tabs) */}
        {(activeBillingSubTab === "claims" || activeBillingSubTab === "outstanding") && (
          <div className="mb-3 flex items-center gap-6">
            <PulseChip label="Sent" value={`R${totalSent.toLocaleString()}`} data={MOCK_SPARKLINE_SENT} color="#3b82f6" />
            <PulseChip label="Pending" value={`R${totalPending.toLocaleString()}`} color="#FFC107" />
            <PulseChip label="Cleared" value={`R${totalSettled.toLocaleString()}`} data={MOCK_SPARKLINE_SETTLED} color="#00E676" />
            <div className="ml-auto">
              {draftSelected.length > 0 && (
                <button
                  type="button"
                  onClick={bulkSubmit}
                  className="flex items-center gap-1.5 rounded-lg bg-blue-500/15 px-3 py-1.5 text-[11px] font-semibold text-blue-400 transition-colors hover:bg-blue-500/25"
                >
                  <PaperPlaneTilt className="size-3.5" weight="fill" />
                  Bulk Submit ({draftSelected.length})
                </button>
              )}
            </div>
          </div>
        )}

        {/* Payments summary header */}
        {activeBillingSubTab === "payments" && (
          <PaymentsSummary claims={filteredClaims} />
        )}

        {/* Outstanding aging buckets */}
        {activeBillingSubTab === "outstanding" && agingBuckets && (
          <div className="mb-3 flex gap-2">
            {(Object.entries(agingBuckets) as [string, PracticeClaim[]][]).map(([label, items]) => {
              const total = items.reduce((s, c) => s + c.totalAmount, 0)
              const isOld = label === "61-90d" || label === "90+d"
              return (
                <div
                  key={label}
                  className={cn(
                    "flex-1 rounded-xl border px-3 py-2",
                    isOld
                      ? "border-[#EF5350]/20 bg-[#EF5350]/[0.04]"
                      : "border-white/[0.06] bg-white/[0.02]"
                  )}
                >
                  <p className="text-[9px] font-medium uppercase tracking-wider text-white/25">{label}</p>
                  <p className={cn("text-sm font-bold tabular-nums", isOld ? "text-[#EF5350]" : "text-white/70")}>
                    R{total.toLocaleString()}
                  </p>
                  <p className="text-[9px] text-white/20">{items.length} claim{items.length !== 1 ? "s" : ""}</p>
                </div>
              )
            })}
          </div>
        )}

        {/* Invoices placeholder */}
        {activeBillingSubTab === "invoices" && (
          <div className="flex flex-1 items-center justify-center rounded-2xl border border-white/[0.05] bg-white/[0.015]">
            <div className="text-center">
              <FileText className="mx-auto mb-2 size-8 text-white/15" />
              <p className="text-[13px] font-medium text-white/30">Invoices</p>
              <p className="mt-1 text-[11px] text-white/15">Invoice generation coming soon</p>
            </div>
          </div>
        )}

        {/* Table (claims, outstanding, payments) */}
        {activeBillingSubTab !== "invoices" && (
          <div className="flex-1 overflow-hidden rounded-2xl border border-white/[0.05] bg-white/[0.015]">
            <div className="h-full overflow-x-auto overflow-y-auto" style={{ scrollbarWidth: "none" }}>
              <table className="w-full min-w-[700px] border-collapse text-left">
                <thead>
                  <tr className="border-b border-white/[0.06]">
                    <th className="w-8 px-3 py-2.5">
                      <input
                        type="checkbox"
                        checked={selectedIds.size === sorted.length && sorted.length > 0}
                        onChange={() => {
                          if (selectedIds.size === sorted.length) setSelectedIds(new Set())
                          else setSelectedIds(new Set(sorted.map((c) => c.id)))
                        }}
                        className="size-3.5 rounded accent-blue-500"
                      />
                    </th>
                    <ColHeader label="Date" sortKey="date" current={sortKey} dir={sortDir} onSort={toggleSort} />
                    <ColHeader label="Patient" sortKey="patient" current={sortKey} dir={sortDir} onSort={toggleSort} />
                    <th className="px-3 py-2.5 text-[10px] font-medium uppercase tracking-wider text-white/25">ICD-10</th>
                    <ColHeader label="Amount" sortKey="amount" current={sortKey} dir={sortDir} onSort={toggleSort} />
                    <ColHeader label="Status" sortKey="status" current={sortKey} dir={sortDir} onSort={toggleSort} />
                    <th className="px-3 py-2.5 text-[10px] font-medium uppercase tracking-wider text-white/25">Type</th>
                    {activeBillingSubTab === "payments" && (
                      <>
                        <th className="px-3 py-2.5 text-[10px] font-medium uppercase tracking-wider text-white/25">Method</th>
                        <th className="px-3 py-2.5 text-[10px] font-medium uppercase tracking-wider text-white/25">Reference</th>
                      </>
                    )}
                    <th className="w-10 px-3 py-2.5" />
                  </tr>
                </thead>
                <tbody>
                  {sorted.map((claim) => {
                    const icdCodes = [...new Set(claim.lines.map((l) => l.icdCode).filter(Boolean))]
                    const payType = claim.medicalAidAmount > 0 && claim.cashAmount > 0 ? "Split" : claim.medicalAidAmount > 0 ? "MA" : "Cash"

                    return (
                      <tr
                        key={claim.id}
                        onClick={() => setSelectedClaim(claim)}
                        className="cursor-pointer border-b border-white/[0.03] transition-colors hover:bg-white/[0.03]"
                      >
                        <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                          <input
                            type="checkbox"
                            checked={selectedIds.has(claim.id)}
                            onChange={() => toggleSelect(claim.id)}
                            className="size-3.5 rounded accent-blue-500"
                          />
                        </td>
                        <td className="px-3 py-2 text-[11px] tabular-nums text-white/40">
                          {new Date(claim.createdAt).toLocaleDateString([], { month: "short", day: "numeric" })}
                        </td>
                        <td className="px-3 py-2 text-[11px] font-medium text-foreground">{claim.patientName}</td>
                        <td className="px-3 py-2">
                          <div className="flex gap-1">
                            {icdCodes.map((code) => (
                              <span key={code} className="rounded bg-white/[0.06] px-1.5 py-0.5 text-[9px] font-medium tabular-nums text-white/50">
                                {code}
                              </span>
                            ))}
                          </div>
                        </td>
                        <td className="px-3 py-2 text-right text-[11px] font-bold tabular-nums text-foreground">
                          R{claim.totalAmount.toLocaleString()}
                        </td>
                        <td className="px-3 py-2">
                          <span className={cn("rounded-full px-2 py-0.5 text-[9px] font-semibold uppercase", STATUS_BADGE[claim.status])}>
                            {claim.status}
                          </span>
                        </td>
                        <td className="px-3 py-2">
                          <span className={cn(
                            "text-[10px] font-medium",
                            payType === "MA" ? "text-blue-400" : payType === "Cash" ? "text-[#00E676]" : "text-purple-400"
                          )}>
                            {payType}
                          </span>
                        </td>
                        {activeBillingSubTab === "payments" && (
                          <>
                            <td className="px-3 py-2 text-[10px] text-white/40">{claim.paymentMethod ?? "—"}</td>
                            <td className="px-3 py-2 text-[10px] font-mono text-white/30">{claim.paymentRef ?? "—"}</td>
                          </>
                        )}
                        <td className="px-3 py-2 text-right" onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center justify-end gap-1">
                            {activeBillingSubTab === "outstanding" && claim.status === "submitted" && (
                              <button
                                type="button"
                                title="Send Reminder"
                                className="rounded-md p-1 text-white/20 transition-colors hover:bg-amber-500/10 hover:text-amber-400"
                              >
                                <Bell className="size-3.5" />
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => setSelectedClaim(claim)}
                              className="rounded-md p-1 text-white/20 transition-colors hover:bg-white/[0.06] hover:text-white/50"
                            >
                              <PencilSimple className="size-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                  {sorted.length === 0 && (
                    <tr>
                      <td colSpan={activeBillingSubTab === "payments" ? 10 : 8} className="px-4 py-12 text-center text-[11px] text-white/20">
                        No claims found
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Detail slide-out (50% width) */}
      <AnimatePresence mode="wait">
        {selectedClaim && (
          <ClaimDetailPanel
            claim={selectedClaim}
            onClose={() => setSelectedClaim(null)}
            onUpdateClaim={(id, update) => {
              updateClaim(id, update)
              const updated = { ...selectedClaim, ...update }
              setSelectedClaim(updated)
            }}
            onUpdateStatus={(id, status) => {
              updateClaimStatus(id, status)
              setSelectedClaim({ ...selectedClaim, status })
            }}
          />
        )}
      </AnimatePresence>

      {/* Create modal */}
      <AnimatePresence>
        {showCreateModal && (
          <CreateClaimModal
            patients={patients}
            onSave={handleSaveClaim}
            onClose={() => setShowCreateModal(false)}
          />
        )}
      </AnimatePresence>
    </div>
  )
}

// ─── Pulse Chip ──────────────────────────────────────────────────

function PulseChip({ label, value, data, color }: { label: string; value: string; data?: number[]; color: string }) {
  return (
    <div className="flex items-center gap-2.5">
      <div>
        <p className="text-[9px] font-medium uppercase tracking-wider text-white/25">{label}</p>
        <p className="text-sm font-bold tabular-nums" style={{ color }}>{value}</p>
      </div>
      {data && <RevenueSparkline data={data} color={color} width={64} height={20} />}
    </div>
  )
}

// ─── Payments Summary ────────────────────────────────────────────

function PaymentsSummary({ claims }: { claims: PracticeClaim[] }) {
  const stats = useMemo(() => {
    let total = 0
    const methods: Record<string, number> = {}
    for (const c of claims) {
      total += c.totalAmount
      const m = c.paymentMethod ?? "Unknown"
      methods[m] = (methods[m] ?? 0) + c.totalAmount
    }
    return { total, count: claims.length, methods }
  }, [claims])

  return (
    <div className="mb-3 flex gap-3">
      <div className="flex-1 rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-2">
        <p className="text-[9px] font-medium uppercase tracking-wider text-white/25">Total Received</p>
        <p className="text-sm font-bold tabular-nums text-[#00E676]">R{stats.total.toLocaleString()}</p>
        <p className="text-[9px] text-white/20">{stats.count} payment{stats.count !== 1 ? "s" : ""}</p>
      </div>
      {Object.entries(stats.methods).map(([method, amount]) => (
        <div key={method} className="flex-1 rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-2">
          <p className="text-[9px] font-medium uppercase tracking-wider text-white/25">{method}</p>
          <p className="text-sm font-bold tabular-nums text-white/60">R{amount.toLocaleString()}</p>
        </div>
      ))}
    </div>
  )
}

// ─── Column Header ───────────────────────────────────────────────

function ColHeader({
  label, sortKey, current, dir, onSort,
}: {
  label: string; sortKey: SortKey; current: SortKey; dir: SortDir; onSort: (k: SortKey) => void
}) {
  const active = current === sortKey
  return (
    <th className="px-3 py-2.5">
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className={cn("flex items-center gap-1 text-[10px] font-medium uppercase tracking-wider transition-colors", active ? "text-white/60" : "text-white/25 hover:text-white/40")}
      >
        {label}
        <ArrowsDownUp className="size-3" weight={active ? "fill" : "regular"} />
      </button>
    </th>
  )
}

// ─── Status Timeline ─────────────────────────────────────────────

const TIMELINE_STEPS: { key: ClaimStatus; label: string }[] = [
  { key: "draft", label: "Draft" },
  { key: "submitted", label: "Submitted" },
  { key: "approved", label: "Approved" },
  { key: "paid", label: "Paid" },
]

function StatusTimeline({ status }: { status: ClaimStatus }) {
  const statusOrder: ClaimStatus[] = ["draft", "submitted", "approved", "paid"]
  const currentIdx = status === "rejected"
    ? statusOrder.indexOf("submitted")
    : statusOrder.indexOf(status)

  const steps = status === "rejected"
    ? [
        { key: "draft" as ClaimStatus, label: "Draft" },
        { key: "submitted" as ClaimStatus, label: "Submitted" },
        { key: "rejected" as ClaimStatus, label: "Rejected" },
      ]
    : TIMELINE_STEPS

  return (
    <div className="flex items-center gap-0">
      {steps.map((step, i) => {
        const isRejected = step.key === "rejected"
        const isPast = status === "rejected"
          ? i <= 1
          : i <= currentIdx
        const isCurrent = status === "rejected"
          ? step.key === "rejected"
          : step.key === status

        return (
          <div key={step.key} className="flex items-center">
            <div className="flex flex-col items-center">
              <div
                className={cn(
                  "flex size-5 items-center justify-center rounded-full border text-[8px] font-bold transition-all",
                  isRejected && isCurrent
                    ? "border-[#EF5350] bg-[#EF5350]/20 text-[#EF5350]"
                    : isPast
                      ? "border-[#00E676]/40 bg-[#00E676]/15 text-[#00E676]"
                      : "border-white/10 bg-white/[0.03] text-white/20"
                )}
              >
                {isPast && !isCurrent ? <Check className="size-2.5" weight="bold" /> : null}
                {isCurrent && isRejected ? <X className="size-2.5" weight="bold" /> : null}
                {isCurrent && !isRejected ? <Check className="size-2.5" weight="bold" /> : null}
              </div>
              <p className={cn(
                "mt-1 text-[8px] font-medium",
                isRejected && isCurrent ? "text-[#EF5350]" : isPast ? "text-white/50" : "text-white/15"
              )}>
                {step.label}
              </p>
            </div>
            {i < steps.length - 1 && (
              <div className={cn(
                "mx-1 mb-3 h-px w-6",
                i < (status === "rejected" ? 1 : currentIdx)
                  ? "bg-[#00E676]/30"
                  : "bg-white/[0.06]"
              )} />
            )}
          </div>
        )
      })}
    </div>
  )
}

// ─── Claim Detail Panel (50% width) ─────────────────────────────

function ClaimDetailPanel({
  claim,
  onClose,
  onUpdateClaim,
  onUpdateStatus,
}: {
  claim: PracticeClaim
  onClose: () => void
  onUpdateClaim: (id: string, update: Partial<PracticeClaim>) => void
  onUpdateStatus: (id: string, status: ClaimStatus) => void
}) {
  const [editingLines, setEditingLines] = useState<ClaimLine[]>(claim.lines)
  const [paymentMethod, setPaymentMethod] = useState("EFT")
  const [paymentRef, setPaymentRef] = useState("")
  const [isEditing, setIsEditing] = useState(false)

  const recalcTotals = useCallback((lines: ClaimLine[]) => {
    let ma = 0, cash = 0
    for (const l of lines) {
      if (l.lineType === "medical_aid") ma += l.amount
      else cash += l.amount
    }
    return { medicalAidAmount: ma, cashAmount: cash, totalAmount: ma + cash }
  }, [])

  const handleSaveLines = () => {
    const totals = recalcTotals(editingLines)
    onUpdateClaim(claim.id, { lines: editingLines, ...totals })
    setIsEditing(false)
  }

  const updateLine = (lineId: string, field: keyof ClaimLine, value: string | number) => {
    setEditingLines((prev) =>
      prev.map((l) => (l.id === lineId ? { ...l, [field]: value } : l))
    )
  }

  const addLine = () => {
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
      },
    ])
  }

  const removeLine = (lineId: string) => {
    setEditingLines((prev) => prev.filter((l) => l.id !== lineId))
  }

  const handleMarkPaid = () => {
    onUpdateClaim(claim.id, {
      status: "paid",
      paymentMethod,
      paymentRef,
      paidAt: new Date().toISOString(),
    })
    onUpdateStatus(claim.id, "paid")
  }

  return (
    <motion.div
      key="claim-detail"
      initial={{ width: 0, opacity: 0 }}
      animate={{ width: "50%", opacity: 1 }}
      exit={{ width: 0, opacity: 0 }}
      transition={{ type: "spring", stiffness: 400, damping: 35 }}
      className="shrink-0 overflow-hidden"
    >
      <div className="flex h-full w-full flex-col rounded-2xl border border-white/[0.05] bg-white/[0.02]">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/[0.05] px-5 py-3">
          <div className="flex items-center gap-3">
            <div>
              <h3 className="text-[13px] font-semibold">{claim.patientName}</h3>
              <p className="text-[10px] text-white/25">#{claim.id}</p>
            </div>
            <span className={cn("rounded-full px-2 py-0.5 text-[9px] font-semibold uppercase", STATUS_BADGE[claim.status])}>
              {claim.status}
            </span>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-white/30 transition-colors hover:bg-white/[0.06] hover:text-white/60">
            <X className="size-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4" style={{ scrollbarWidth: "none" }}>
          {/* Status Timeline */}
          <div className="rounded-xl border border-white/[0.05] bg-white/[0.02] p-3">
            <StatusTimeline status={claim.status} />
          </div>

          {/* Rejection reason */}
          {claim.status === "rejected" && claim.rejectionReason && (
            <div className="rounded-xl border border-[#EF5350]/20 bg-[#EF5350]/[0.05] p-3">
              <div className="flex items-start gap-2">
                <Warning className="mt-0.5 size-4 shrink-0 text-[#EF5350]" weight="fill" />
                <div>
                  <p className="text-[11px] font-semibold text-[#EF5350]">Rejection Reason</p>
                  <p className="mt-0.5 text-[11px] text-[#EF5350]/70">{claim.rejectionReason}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => onUpdateStatus(claim.id, "submitted")}
                className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-lg bg-[#EF5350]/10 py-1.5 text-[11px] font-semibold text-[#EF5350] transition-colors hover:bg-[#EF5350]/20"
              >
                <ArrowsClockwise className="size-3.5" />
                Resubmit
              </button>
            </div>
          )}

          {/* Line Items */}
          <div>
            <div className="mb-2 flex items-center justify-between">
              <p className="text-[9px] font-medium uppercase tracking-wider text-white/20">Line Items</p>
              <div className="flex gap-1.5">
                {!isEditing ? (
                  <button
                    type="button"
                    onClick={() => { setEditingLines(claim.lines); setIsEditing(true) }}
                    className="flex items-center gap-1 rounded-md px-2 py-1 text-[9px] font-medium text-white/25 transition-colors hover:bg-white/[0.06] hover:text-white/50"
                  >
                    <PencilSimple className="size-3" /> Edit
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
                      onClick={() => setIsEditing(false)}
                      className="rounded-md px-2 py-1 text-[9px] font-medium text-white/25 transition-colors hover:bg-white/[0.06]"
                    >
                      Cancel
                    </button>
                  </>
                )}
              </div>
            </div>

            <div className="space-y-2">
              {(isEditing ? editingLines : claim.lines).map((line) => (
                <div key={line.id} className="rounded-xl border border-white/[0.05] bg-white/[0.02] px-3 py-2.5">
                  {isEditing ? (
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          value={line.description}
                          onChange={(e) => updateLine(line.id, "description", e.target.value)}
                          placeholder="Description"
                          className="flex-1 rounded-md border border-white/[0.08] bg-white/[0.03] px-2 py-1 text-[11px] text-foreground outline-none placeholder:text-white/20 focus:border-blue-500/30"
                        />
                        <button type="button" onClick={() => removeLine(line.id)} className="text-white/15 hover:text-[#EF5350]">
                          <Trash className="size-3.5" />
                        </button>
                      </div>
                      <div className="grid grid-cols-4 gap-2">
                        <input
                          type="text"
                          value={line.icdCode ?? ""}
                          onChange={(e) => updateLine(line.id, "icdCode", e.target.value)}
                          placeholder="ICD-10"
                          className="rounded-md border border-white/[0.08] bg-white/[0.03] px-2 py-1 text-[10px] text-foreground outline-none placeholder:text-white/20 focus:border-blue-500/30"
                        />
                        <input
                          type="text"
                          value={line.tariffCode ?? ""}
                          onChange={(e) => updateLine(line.id, "tariffCode", e.target.value)}
                          placeholder="Tariff"
                          className="rounded-md border border-white/[0.08] bg-white/[0.03] px-2 py-1 text-[10px] text-foreground outline-none placeholder:text-white/20 focus:border-blue-500/30"
                        />
                        <input
                          type="text"
                          value={line.nappiCode ?? ""}
                          onChange={(e) => updateLine(line.id, "nappiCode", e.target.value)}
                          placeholder="NAPPI"
                          className="rounded-md border border-white/[0.08] bg-white/[0.03] px-2 py-1 text-[10px] text-foreground outline-none placeholder:text-white/20 focus:border-blue-500/30"
                        />
                        <input
                          type="number"
                          value={line.amount || ""}
                          onChange={(e) => updateLine(line.id, "amount", parseFloat(e.target.value) || 0)}
                          placeholder="Amount"
                          className="rounded-md border border-white/[0.08] bg-white/[0.03] px-2 py-1 text-right text-[10px] tabular-nums text-foreground outline-none placeholder:text-white/20 focus:border-blue-500/30"
                        />
                      </div>
                      <div className="flex gap-2">
                        {(["medical_aid", "cash", "patient_liability"] as ClaimLineType[]).map((lt) => (
                          <label key={lt} className="flex items-center gap-1 cursor-pointer">
                            <input
                              type="radio"
                              name={`lineType-${line.id}`}
                              checked={line.lineType === lt}
                              onChange={() => updateLine(line.id, "lineType", lt)}
                              className="size-2.5 accent-blue-500"
                            />
                            <span className="text-[9px] text-white/40">
                              {lt === "medical_aid" ? "MA" : lt === "cash" ? "Cash" : "Patient"}
                            </span>
                          </label>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-medium">{line.description}</span>
                        <span className="text-[11px] font-bold tabular-nums">R{line.amount.toLocaleString()}</span>
                      </div>
                      <div className="mt-1 flex gap-2 text-[9px] text-white/25">
                        {line.icdCode && <span>ICD: {line.icdCode}</span>}
                        {line.tariffCode && <span>Tariff: {line.tariffCode}</span>}
                        {line.nappiCode && <span>NAPPI: {line.nappiCode}</span>}
                        <span className={cn(
                          "rounded-full px-1.5 py-px font-semibold uppercase",
                          line.lineType === "medical_aid"
                            ? "bg-blue-500/10 text-blue-400"
                            : line.lineType === "cash"
                              ? "bg-[#00E676]/10 text-[#00E676]"
                              : "bg-purple-500/10 text-purple-400"
                        )}>
                          {line.lineType === "medical_aid" ? "MA" : line.lineType === "cash" ? "Cash" : "Patient"}
                        </span>
                      </div>
                    </>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Totals */}
          <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3 space-y-2">
            {claim.medicalAidAmount > 0 && (
              <div className="flex items-center justify-between text-[11px]">
                <span className="flex items-center gap-1.5 text-white/50"><ShieldCheck className="size-3.5 text-blue-400" weight="fill" />Medical Aid</span>
                <span className="font-bold tabular-nums text-blue-400">R{claim.medicalAidAmount.toLocaleString()}</span>
              </div>
            )}
            {claim.cashAmount > 0 && (
              <div className="flex items-center justify-between text-[11px]">
                <span className="flex items-center gap-1.5 text-white/50"><Receipt className="size-3.5 text-[#00E676]" weight="fill" />Cash</span>
                <span className="font-bold tabular-nums text-[#00E676]">R{claim.cashAmount.toLocaleString()}</span>
              </div>
            )}
            <div className="border-t border-white/[0.05] pt-2 flex items-center justify-between text-[11px]">
              <span className="font-semibold text-white/70">Total</span>
              <span className="font-bold tabular-nums">R{claim.totalAmount.toLocaleString()}</span>
            </div>
          </div>

          {/* Payment recording */}
          {claim.status !== "paid" && claim.status !== "draft" && (
            <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3 space-y-2.5">
              <p className="text-[9px] font-medium uppercase tracking-wider text-white/20">Record Payment</p>
              <div className="flex gap-2">
                <select
                  value={paymentMethod}
                  onChange={(e) => setPaymentMethod(e.target.value)}
                  className="flex-1 rounded-md border border-white/[0.08] bg-white/[0.03] px-2 py-1.5 text-[11px] text-foreground outline-none focus:border-blue-500/30"
                >
                  <option value="EFT">EFT</option>
                  <option value="Cash">Cash</option>
                  <option value="Card">Card</option>
                </select>
                <input
                  type="text"
                  value={paymentRef}
                  onChange={(e) => setPaymentRef(e.target.value)}
                  placeholder="Reference"
                  className="flex-1 rounded-md border border-white/[0.08] bg-white/[0.03] px-2 py-1.5 text-[11px] text-foreground outline-none placeholder:text-white/20 focus:border-blue-500/30"
                />
              </div>
              <button
                type="button"
                onClick={handleMarkPaid}
                className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-[#00E676]/10 py-2 text-[11px] font-semibold text-[#00E676] transition-colors hover:bg-[#00E676]/20"
              >
                <CheckCircle className="size-3.5" weight="fill" />
                Mark as Paid
              </button>
            </div>
          )}
        </div>

        {/* Action Footer */}
        <div className="border-t border-white/[0.05] p-4">
          {claim.status === "draft" ? (
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => onUpdateStatus(claim.id, "submitted")}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-blue-500/15 py-2 text-[11px] font-semibold text-blue-400 transition-colors hover:bg-blue-500/25"
              >
                <ShieldCheck className="size-3.5" weight="fill" />
                Submit to Scheme
              </button>
              {claim.cashAmount > 0 && (
                <button
                  type="button"
                  onClick={handleMarkPaid}
                  className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-[#00E676]/10 py-2 text-[11px] font-semibold text-[#00E676] transition-colors hover:bg-[#00E676]/20"
                >
                  <Receipt className="size-3.5" weight="fill" />
                  Record Cash
                </button>
              )}
            </div>
          ) : (
            <div className="flex gap-2">
              {claim.status === "submitted" && (
                <button
                  type="button"
                  onClick={() => onUpdateStatus(claim.id, "submitted")}
                  className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-blue-500/15 py-2 text-[11px] font-semibold text-blue-400 transition-colors hover:bg-blue-500/25"
                >
                  <ShieldCheck className="size-3.5" weight="fill" />
                  Submit to Scheme
                </button>
              )}
              <button
                type="button"
                className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-white/[0.04] py-2 text-[11px] font-semibold text-white/40 transition-colors hover:bg-white/[0.08]"
              >
                <Printer className="size-3.5" />
                Print / PDF
              </button>
            </div>
          )}
        </div>
      </div>
    </motion.div>
  )
}

// ─── Create Claim Modal ──────────────────────────────────────────

function CreateClaimModal({
  patients,
  onSave,
  onClose,
}: {
  patients: import("@/lib/clinical-workspace").PracticePatient[]
  onSave: (claim: PracticeClaim) => void
  onClose: () => void
}) {
  const [patientSearch, setPatientSearch] = useState("")
  const [selectedPatient, setSelectedPatient] = useState<{ id: string; name: string } | null>(null)
  const [showDropdown, setShowDropdown] = useState(false)
  const [lines, setLines] = useState<ClaimLine[]>([
    { id: `l-${Date.now()}`, description: "", icdCode: "", tariffCode: "", nappiCode: "", quantity: 1, amount: 0, lineType: "medical_aid", status: "draft" },
  ])
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

  const updateLine = (id: string, field: keyof ClaimLine, value: string | number) => {
    setLines((prev) => prev.map((l) => (l.id === id ? { ...l, [field]: value } : l)))
  }

  const addLine = () => {
    setLines((prev) => [
      ...prev,
      { id: `l-${Date.now()}`, description: "", icdCode: "", tariffCode: "", nappiCode: "", quantity: 1, amount: 0, lineType: "medical_aid", status: "draft" },
    ])
  }

  const removeLine = (id: string) => {
    if (lines.length <= 1) return
    setLines((prev) => prev.filter((l) => l.id !== id))
  }

  const handleSave = (asDraft: boolean) => {
    if (!selectedPatient) return
    const finalLines = lines.map((l) => ({
      ...l,
      amount: l.amount * (l.quantity ?? 1),
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
    onSave(claim)
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.95, opacity: 0 }}
        transition={{ type: "spring", stiffness: 400, damping: 35 }}
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[85vh] w-full max-w-2xl flex-col rounded-2xl border border-white/[0.08] bg-[#111113] shadow-2xl"
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-white/[0.06] px-5 py-3.5">
          <h2 className="text-[14px] font-semibold">New Claim</h2>
          <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-white/30 hover:bg-white/[0.06] hover:text-white/60">
            <X className="size-4" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4" style={{ scrollbarWidth: "none" }}>
          {/* Patient search */}
          <div className="relative">
            <p className="mb-1.5 text-[9px] font-medium uppercase tracking-wider text-white/25">Patient</p>
            {selectedPatient ? (
              <div className="flex items-center gap-2 rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-2">
                <span className="flex-1 text-[12px] font-medium">{selectedPatient.name}</span>
                <button
                  type="button"
                  onClick={() => { setSelectedPatient(null); setPatientSearch("") }}
                  className="text-white/25 hover:text-white/50"
                >
                  <X className="size-3.5" />
                </button>
              </div>
            ) : (
              <div className="relative">
                <MagnifyingGlass className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-white/20" />
                <input
                  ref={inputRef}
                  type="text"
                  value={patientSearch}
                  onChange={(e) => { setPatientSearch(e.target.value); setShowDropdown(true) }}
                  onFocus={() => setShowDropdown(true)}
                  placeholder="Search patients..."
                  className="w-full rounded-lg border border-white/[0.08] bg-white/[0.03] py-2 pl-8 pr-3 text-[12px] text-foreground outline-none placeholder:text-white/20 focus:border-blue-500/30"
                />
                {showDropdown && filtered.length > 0 && (
                  <div className="absolute left-0 top-full z-10 mt-1 w-full rounded-lg border border-white/[0.08] bg-[#18181b] py-1 shadow-xl">
                    {filtered.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => {
                          setSelectedPatient({ id: p.id, name: p.name })
                          setShowDropdown(false)
                        }}
                        className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[11px] text-white/60 transition-colors hover:bg-white/[0.06]"
                      >
                        <span className="font-medium text-foreground">{p.name}</span>
                        {p.medicalAidScheme && (
                          <span className="text-[9px] text-white/25">{p.medicalAidScheme}</span>
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
              <p className="text-[9px] font-medium uppercase tracking-wider text-white/25">Line Items</p>
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
                <div key={line.id} className="rounded-xl border border-white/[0.05] bg-white/[0.02] p-3 space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="text-[9px] font-bold text-white/15">{i + 1}</span>
                    <input
                      type="text"
                      value={line.description}
                      onChange={(e) => updateLine(line.id, "description", e.target.value)}
                      placeholder="Description (e.g. Consultation 0190)"
                      className="flex-1 rounded-md border border-white/[0.08] bg-white/[0.03] px-2 py-1.5 text-[11px] text-foreground outline-none placeholder:text-white/20 focus:border-blue-500/30"
                    />
                    {lines.length > 1 && (
                      <button type="button" onClick={() => removeLine(line.id)} className="text-white/15 hover:text-[#EF5350]">
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
                      className="rounded-md border border-white/[0.08] bg-white/[0.03] px-2 py-1 text-[10px] text-foreground outline-none placeholder:text-white/20 focus:border-blue-500/30"
                    />
                    <input
                      type="text"
                      value={line.tariffCode ?? ""}
                      onChange={(e) => updateLine(line.id, "tariffCode", e.target.value)}
                      placeholder="Tariff"
                      className="rounded-md border border-white/[0.08] bg-white/[0.03] px-2 py-1 text-[10px] text-foreground outline-none placeholder:text-white/20 focus:border-blue-500/30"
                    />
                    <input
                      type="text"
                      value={line.nappiCode ?? ""}
                      onChange={(e) => updateLine(line.id, "nappiCode", e.target.value)}
                      placeholder="NAPPI"
                      className="rounded-md border border-white/[0.08] bg-white/[0.03] px-2 py-1 text-[10px] text-foreground outline-none placeholder:text-white/20 focus:border-blue-500/30"
                    />
                    <input
                      type="number"
                      value={line.quantity ?? 1}
                      min={1}
                      onChange={(e) => updateLine(line.id, "quantity", parseInt(e.target.value) || 1)}
                      placeholder="Qty"
                      className="rounded-md border border-white/[0.08] bg-white/[0.03] px-2 py-1 text-center text-[10px] tabular-nums text-foreground outline-none placeholder:text-white/20 focus:border-blue-500/30"
                    />
                    <input
                      type="number"
                      value={line.amount || ""}
                      onChange={(e) => updateLine(line.id, "amount", parseFloat(e.target.value) || 0)}
                      placeholder="Unit Price"
                      className="rounded-md border border-white/[0.08] bg-white/[0.03] px-2 py-1 text-right text-[10px] tabular-nums text-foreground outline-none placeholder:text-white/20 focus:border-blue-500/30"
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
                          <span className="text-[9px] text-white/40">
                            {lt === "medical_aid" ? "MA" : lt === "cash" ? "Cash" : "Patient Liability"}
                          </span>
                        </label>
                      ))}
                    </div>
                    <span className="text-[10px] font-bold tabular-nums text-white/40">
                      = R{(line.amount * (line.quantity ?? 1)).toLocaleString()}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Totals */}
          <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3 space-y-1.5">
            {totals.ma > 0 && (
              <div className="flex justify-between text-[11px]">
                <span className="text-white/40">MA Portion</span>
                <span className="font-bold tabular-nums text-blue-400">R{totals.ma.toLocaleString()}</span>
              </div>
            )}
            {totals.cash > 0 && (
              <div className="flex justify-between text-[11px]">
                <span className="text-white/40">Cash Portion</span>
                <span className="font-bold tabular-nums text-[#00E676]">R{totals.cash.toLocaleString()}</span>
              </div>
            )}
            {totals.pl > 0 && (
              <div className="flex justify-between text-[11px]">
                <span className="text-white/40">Patient Liability</span>
                <span className="font-bold tabular-nums text-purple-400">R{totals.pl.toLocaleString()}</span>
              </div>
            )}
            <div className="border-t border-white/[0.05] pt-1.5 flex justify-between text-[11px]">
              <span className="font-semibold text-white/70">Total</span>
              <span className="font-bold tabular-nums">R{totals.total.toLocaleString()}</span>
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="border-t border-white/[0.06] px-5 py-3.5 flex gap-2">
          <button
            type="button"
            onClick={() => handleSave(true)}
            disabled={!selectedPatient}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-white/[0.04] py-2.5 text-[11px] font-semibold text-white/50 transition-colors hover:bg-white/[0.08] disabled:opacity-30 disabled:pointer-events-none"
          >
            Save as Draft
          </button>
          <button
            type="button"
            onClick={() => handleSave(false)}
            disabled={!selectedPatient}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-blue-500/15 py-2.5 text-[11px] font-semibold text-blue-400 transition-colors hover:bg-blue-500/25 disabled:opacity-30 disabled:pointer-events-none"
          >
            <PaperPlaneTilt className="size-3.5" weight="fill" />
            Submit
          </button>
        </div>
      </motion.div>
    </motion.div>
  )
}

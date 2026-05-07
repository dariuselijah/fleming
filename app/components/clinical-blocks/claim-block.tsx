"use client"

import type { MedicalBlock } from "@/lib/clinical-workspace"
import { cn } from "@/lib/utils"
import {
  Receipt,
  CheckCircle,
  XCircle,
  Clock,
  ArrowClockwise,
  Brain,
  CaretDown,
} from "@phosphor-icons/react"
import { motion, AnimatePresence } from "motion/react"
import { useState } from "react"

type ClaimStatus = "submitted" | "approved" | "rejected" | "pending" | "resubmitted"

interface ClaimMeta {
  claimNumber?: string
  scheme?: string
  amount?: number
  icdCodes?: string[]
  tariffCodes?: string[]
  status: ClaimStatus
  rejectionCode?: string
  rejectionReason?: string
  resolverSteps?: string[]
}

function parseClaimMeta(block: MedicalBlock): ClaimMeta {
  const meta = block.metadata as any
  return {
    claimNumber: meta?.claimNumber,
    scheme: meta?.scheme,
    amount: meta?.amount,
    icdCodes: meta?.icdCodes ?? [],
    tariffCodes: meta?.tariffCodes ?? [],
    status: meta?.status ?? "pending",
    rejectionCode: meta?.rejectionCode,
    rejectionReason: meta?.rejectionReason,
    resolverSteps: meta?.resolverSteps,
  }
}

const STATUS_ICONS: Record<ClaimStatus, React.ComponentType<any>> = {
  submitted: Clock,
  approved: CheckCircle,
  rejected: XCircle,
  pending: Clock,
  resubmitted: ArrowClockwise,
}

const STATUS_COLORS: Record<ClaimStatus, string> = {
  submitted: "text-blue-600 bg-blue-500/10 border-blue-500/20",
  approved: "text-emerald-600 bg-emerald-500/10 border-emerald-500/20",
  rejected: "text-red-600 bg-red-500/10 border-red-500/20",
  pending: "text-amber-600 bg-amber-500/10 border-amber-500/20",
  resubmitted: "text-purple-600 bg-purple-500/10 border-purple-500/20",
}

export function ClaimBlock({ block }: { block: MedicalBlock }) {
  const claim = parseClaimMeta(block)
  const StatusIcon = STATUS_ICONS[claim.status]
  const [showResolver, setShowResolver] = useState(false)

  return (
    <div
      className={cn(
        "rounded-2xl border shadow-sm",
        claim.status === "rejected" ? "border-red-500/30" : "border-border/50"
      )}
    >
      <div className="flex items-center justify-between px-4 py-3">
        <div className="flex items-center gap-2">
          <Receipt className="size-4 text-amber-500" weight="fill" />
          <span className="text-xs font-semibold">
            {claim.claimNumber ? `Claim #${claim.claimNumber}` : "Billing Claim"}
          </span>
          {claim.scheme && (
            <span className="text-[10px] text-muted-foreground">· {claim.scheme}</span>
          )}
        </div>
        <div
          className={cn(
            "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider",
            STATUS_COLORS[claim.status]
          )}
        >
          <StatusIcon className="size-3" weight="fill" />
          {claim.status}
        </div>
      </div>

      <div className="border-t border-border/20 px-4 py-3">
        <div className="flex items-center justify-between">
          {claim.amount != null && (
            <span className="text-lg font-bold tabular-nums">
              R{claim.amount.toLocaleString()}
            </span>
          )}
          <div className="flex gap-2">
            {claim.icdCodes?.map((code) => (
              <span key={code} className="rounded-md bg-purple-500/10 px-1.5 py-0.5 text-[10px] font-medium text-purple-600 dark:text-purple-400">
                {code}
              </span>
            ))}
            {claim.tariffCodes?.map((code) => (
              <span key={code} className="rounded-md bg-blue-500/10 px-1.5 py-0.5 text-[10px] font-medium text-blue-600 dark:text-blue-400">
                {code}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Rejection details and agentic resolver */}
      {claim.status === "rejected" && (
        <div className="border-t border-red-500/20 px-4 py-3">
          {claim.rejectionCode && (
            <div className="mb-2 flex items-center gap-2">
              <XCircle className="size-3.5 text-red-500" weight="fill" />
              <span className="text-xs font-medium text-red-600 dark:text-red-400">
                {claim.rejectionCode}
              </span>
              {claim.rejectionReason && (
                <span className="text-xs text-muted-foreground">
                  — {claim.rejectionReason}
                </span>
              )}
            </div>
          )}

          <button
            type="button"
            onClick={() => setShowResolver(!showResolver)}
            className="flex w-full items-center gap-2 rounded-xl bg-indigo-500/10 px-3 py-2 text-left transition-colors hover:bg-indigo-500/15"
          >
            <Brain className="size-4 text-indigo-500" weight="fill" />
            <span className="flex-1 text-xs font-medium text-indigo-700 dark:text-indigo-300">
              Fleming Resolve — AI Claim Analysis
            </span>
            <CaretDown
              className={cn(
                "size-3.5 text-indigo-500 transition-transform",
                showResolver && "rotate-180"
              )}
            />
          </button>

          <AnimatePresence>
            {showResolver && claim.resolverSteps && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="mt-2 overflow-hidden rounded-xl border border-indigo-500/20 bg-indigo-500/5 p-3"
              >
                <h5 className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-indigo-600 dark:text-indigo-400">
                  Reasoning Log
                </h5>
                <div className="space-y-1.5">
                  {claim.resolverSteps.map((step, i) => (
                    <div key={i} className="flex items-start gap-2">
                      <span className="mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full bg-indigo-500/20 text-[8px] font-bold text-indigo-600 dark:text-indigo-400">
                        {i + 1}
                      </span>
                      <span className="text-[11px] leading-relaxed text-foreground/80">{step}</span>
                    </div>
                  ))}
                </div>
                <button
                  type="button"
                  className="mt-3 w-full rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-indigo-700"
                >
                  Resubmit with Corrections
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}
    </div>
  )
}

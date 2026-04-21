"use client"

import type { PracticeClaim } from "@/lib/clinical-workspace"
import { cn } from "@/lib/utils"
import { FileText, ArrowRight } from "@phosphor-icons/react"

const STATUS_STYLES: Record<string, string> = {
  draft: "bg-[#FFC107]/10 text-[#FFC107]",
  submitted: "bg-blue-500/10 text-blue-400",
  approved: "bg-[#00E676]/10 text-[#00E676]",
  rejected: "bg-[#EF5350]/10 text-[#EF5350]",
  paid: "bg-[#00E676]/15 text-[#00E676]",
  partial: "bg-purple-500/10 text-purple-400",
}

export function ClaimActionCard({
  claim,
  onSubmit,
}: {
  claim: PracticeClaim
  onSubmit: () => void
}) {
  const hasSplit = claim.medicalAidAmount > 0 && claim.cashAmount > 0

  return (
    <div className="flex items-center gap-3 rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-2.5 transition-all hover:border-white/[0.12] hover:bg-white/[0.04]">
      <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-white/[0.04]">
        <FileText className="size-4 text-white/40" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-[12px] font-medium text-foreground">{claim.patientName}</span>
          <span className={cn("rounded-full px-1.5 py-px text-[9px] font-semibold uppercase", STATUS_STYLES[claim.status])}>
            {claim.status}
          </span>
          {hasSplit && (
            <span className="rounded-full border border-white/[0.08] px-1.5 py-px text-[8px] font-medium text-white/30">
              MA: R{claim.medicalAidAmount} | Cash: R{claim.cashAmount}
            </span>
          )}
        </div>
        <p className="text-[10px] text-white/30">
          {claim.lines.length} line{claim.lines.length !== 1 ? "s" : ""} · R{claim.totalAmount.toLocaleString()}
        </p>
      </div>
      {claim.status === "draft" && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onSubmit() }}
          className="flex items-center gap-1 rounded-lg bg-white/[0.08] px-2.5 py-1 text-[10px] font-semibold text-foreground transition-colors hover:bg-white/[0.14]"
        >
          Submit
          <ArrowRight className="size-3" />
        </button>
      )}
    </div>
  )
}

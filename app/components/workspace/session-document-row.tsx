"use client"

import type { SessionDocument } from "@/lib/clinical-workspace"
import { stripClinicalMarkdownPreview } from "@/lib/clinical-workspace/strip-clinical-markdown"
import { cn } from "@/lib/utils"
import { FileText } from "@phosphor-icons/react"

export const DOC_TAB_LABELS: Record<string, string> = {
  soap: "SOAP",
  summary: "Summary",
  evidence: "Evidence",
  interactions: "Interactions",
  drug: "Drug info",
  icd: "ICD-10",
  prescribe: "Rx",
  refer: "Referral",
  vitals: "Vitals",
  verify: "Verify",
  claim: "Claim",
}

function statusClasses(status: string, variant: "sidebar" | "sidecar") {
  if (variant === "sidebar") {
    if (status === "accepted") return "text-[#00E676]"
    if (status === "rejected") return "text-[#EF5350]"
    return "text-[#FFC107]"
  }
  if (status === "accepted") return "text-emerald-600 dark:text-emerald-400"
  if (status === "rejected") return "text-amber-700 dark:text-amber-400"
  return "text-muted-foreground"
}

export function SessionDocumentRow({
  entry,
  onOpen,
  variant = "sidecar",
}: {
  entry: SessionDocument
  onOpen: () => void
  variant?: "sidebar" | "sidecar"
}) {
  const title = DOC_TAB_LABELS[entry.document.type] ?? entry.document.title
  const previewRaw = entry.document.content ?? ""
  const preview =
    variant === "sidebar"
      ? ""
      : stripClinicalMarkdownPreview(previewRaw, 140)
  const updated = entry.updatedAt
    ? new Date(entry.updatedAt).toLocaleString([], {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : null

  return (
    <button
      type="button"
      onClick={onOpen}
      className={cn(
        "group flex w-full gap-2.5 rounded-xl border text-left transition-all",
        variant === "sidebar"
          ? "border-white/[0.08] bg-white/[0.02] px-2 py-1.5 hover:border-indigo-500/30 hover:bg-white/[0.06]"
          : "border-border/45 bg-gradient-to-br from-card/90 to-card/40 p-3 shadow-sm hover:border-indigo-500/35 hover:from-card hover:to-card/80"
      )}
    >
      <div
        className={cn(
          "mt-0.5 flex shrink-0 items-center justify-center rounded-lg border",
          variant === "sidebar"
            ? "size-6 border-white/[0.08] bg-white/[0.04] text-white/45"
            : "size-8 border-border/40 bg-muted/30 text-muted-foreground"
        )}
      >
        <FileText className={variant === "sidebar" ? "size-3.5" : "size-4"} weight="duotone" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <span
            className={cn(
              "truncate text-xs font-semibold tracking-tight",
              variant === "sidebar" ? "text-foreground" : "text-foreground"
            )}
          >
            {title}
          </span>
          <span
            className={cn(
              "shrink-0 text-[10px] font-semibold uppercase tracking-wide",
              statusClasses(entry.status, variant)
            )}
          >
            {entry.status}
          </span>
        </div>
        {updated && (
          <p
            className={cn(
              "mt-0.5 text-[10px]",
              variant === "sidebar" ? "text-white/25" : "text-muted-foreground/70"
            )}
          >
            {updated}
          </p>
        )}
        {preview.length > 0 && (
          <p
            className={cn(
              "mt-1 line-clamp-2 text-[10px] leading-relaxed",
              variant === "sidebar" ? "text-white/35" : "text-muted-foreground"
            )}
          >
            {preview}
            {entry.document.content && entry.document.content.length > 140 ? "…" : ""}
          </p>
        )}
      </div>
    </button>
  )
}

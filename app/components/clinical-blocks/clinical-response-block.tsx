"use client"

import { cn } from "@/lib/utils"
import {
  Clipboard,
  Flask,
  Heartbeat,
  Pill,
  Receipt,
  ArrowRight,
  Warning,
  BookOpen,
  FileText,
  ShieldCheck,
  Hash,
} from "@phosphor-icons/react"

const COMMAND_BLOCK_STYLES: Record<string, {
  icon: React.ComponentType<any>
  label: string
  accent: string
  iconColor: string
  borderColor: string
}> = {
  summary: {
    icon: Clipboard,
    label: "Clinical Summary",
    accent: "bg-indigo-500/5",
    iconColor: "text-indigo-500",
    borderColor: "border-indigo-500/15",
  },
  interactions: {
    icon: Warning,
    label: "Drug Interactions",
    accent: "bg-orange-500/5",
    iconColor: "text-orange-500",
    borderColor: "border-orange-500/15",
  },
  evidence: {
    icon: BookOpen,
    label: "Evidence Review",
    accent: "bg-emerald-500/5",
    iconColor: "text-emerald-500",
    borderColor: "border-emerald-500/15",
  },
  drug: {
    icon: Pill,
    label: "Drug Information",
    accent: "bg-sky-500/5",
    iconColor: "text-sky-500",
    borderColor: "border-sky-500/15",
  },
  icd: {
    icon: Hash,
    label: "ICD-10 Codes",
    accent: "bg-amber-500/5",
    iconColor: "text-amber-500",
    borderColor: "border-amber-500/15",
  },
  prescribe: {
    icon: Pill,
    label: "Prescription",
    accent: "bg-sky-500/5",
    iconColor: "text-sky-500",
    borderColor: "border-sky-500/15",
  },
  refer: {
    icon: ArrowRight,
    label: "Referral",
    accent: "bg-teal-500/5",
    iconColor: "text-teal-500",
    borderColor: "border-teal-500/15",
  },
  soap: {
    icon: Clipboard,
    label: "SOAP Note",
    accent: "bg-indigo-500/5",
    iconColor: "text-indigo-500",
    borderColor: "border-indigo-500/15",
  },
  vitals: {
    icon: Heartbeat,
    label: "Vitals Assessment",
    accent: "bg-emerald-500/5",
    iconColor: "text-emerald-500",
    borderColor: "border-emerald-500/15",
  },
  verify: {
    icon: ShieldCheck,
    label: "Eligibility Verification",
    accent: "bg-amber-500/5",
    iconColor: "text-amber-500",
    borderColor: "border-amber-500/15",
  },
  claim: {
    icon: Receipt,
    label: "Billing Claim",
    accent: "bg-amber-500/5",
    iconColor: "text-amber-500",
    borderColor: "border-amber-500/15",
  },
}

/**
 * Detects `[/command]` prefix in assistant text and returns the command id.
 * The AI response typically begins with content that starts immediately after
 * the user's `[/command]` prompt.
 */
export function detectClinicalCommand(userMessage: string): string | null {
  const match = userMessage.match(/^\[\/(\w+)\]/)
  return match ? match[1] : null
}

/**
 * Wraps assistant response content with a clinical block header when the
 * preceding user message was a slash command.
 */
export function ClinicalResponseHeader({ commandId }: { commandId: string }) {
  const style = COMMAND_BLOCK_STYLES[commandId]
  if (!style) return null

  const Icon = style.icon

  return (
    <div className={cn(
      "mb-3 flex items-center gap-2.5 rounded-xl border px-3.5 py-2.5",
      style.accent,
      style.borderColor
    )}>
      <div className={cn("flex size-7 items-center justify-center rounded-lg bg-background/80 shadow-sm", style.iconColor)}>
        <Icon className="size-4" weight="duotone" />
      </div>
      <div>
        <span className={cn("text-xs font-semibold", style.iconColor)}>{style.label}</span>
        <span className="ml-2 text-[10px] text-muted-foreground">Fleming Clinical Response</span>
      </div>
    </div>
  )
}

/**
 * Parses evidence source sections from the response text.
 */
export function EvidenceSourcesBlock({ sources }: { sources: string[] }) {
  if (!sources.length) return null

  return (
    <div className="mt-4 rounded-xl border border-emerald-500/15 bg-emerald-500/5 p-3.5">
      <h4 className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
        <BookOpen className="size-3.5" weight="duotone" />
        Evidence Sources ({sources.length})
      </h4>
      <div className="space-y-1.5">
        {sources.map((source, i) => (
          <div key={i} className="flex gap-2 text-[11px] leading-relaxed text-muted-foreground">
            <span className="mt-0.5 flex size-4 shrink-0 items-center justify-center rounded bg-emerald-500/15 text-[9px] font-bold text-emerald-600 dark:text-emerald-400">
              {i + 1}
            </span>
            <span>{source}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

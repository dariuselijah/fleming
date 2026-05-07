"use client"

import { useWorkspace, type MedicalBlock, type MedicalBlockType } from "@/lib/clinical-workspace"
import { cn } from "@/lib/utils"
import {
  Flask,
  Heartbeat,
  FileText,
  Receipt,
  Pill,
  Image,
  Microphone,
  Warning,
  Clipboard,
  ArrowRight,
  ArrowSquareOut,
} from "@phosphor-icons/react"
import { motion } from "motion/react"

const BLOCK_ICONS: Record<MedicalBlockType, React.ComponentType<any>> = {
  LAB: Flask,
  VITAL: Heartbeat,
  NOTE: FileText,
  SOAP: Clipboard,
  CLAIM: Receipt,
  BILLING: Receipt,
  PRESCRIPTION: Pill,
  IMAGING: Image,
  SCRIBE: Microphone,
  REFERRAL: ArrowRight,
  ALERT: Warning,
}

const BLOCK_ACCENT: Record<MedicalBlockType, string> = {
  LAB: "from-purple-500/5 to-transparent border-purple-500/10",
  VITAL: "from-emerald-500/5 to-transparent border-emerald-500/10",
  NOTE: "from-blue-500/5 to-transparent border-blue-500/10",
  SOAP: "from-indigo-500/5 to-transparent border-indigo-500/10",
  CLAIM: "from-amber-500/5 to-transparent border-amber-500/10",
  BILLING: "from-amber-500/5 to-transparent border-amber-500/10",
  PRESCRIPTION: "from-sky-500/5 to-transparent border-sky-500/10",
  IMAGING: "from-rose-500/5 to-transparent border-rose-500/10",
  SCRIBE: "from-red-500/5 to-transparent border-red-500/10",
  REFERRAL: "from-teal-500/5 to-transparent border-teal-500/10",
  ALERT: "from-orange-500/5 to-transparent border-orange-500/10",
}

const BLOCK_ICON_COLOR: Record<MedicalBlockType, string> = {
  LAB: "text-purple-500",
  VITAL: "text-emerald-500",
  NOTE: "text-blue-500",
  SOAP: "text-indigo-500",
  CLAIM: "text-amber-500",
  BILLING: "text-amber-500",
  PRESCRIPTION: "text-sky-500",
  IMAGING: "text-rose-500",
  SCRIBE: "text-red-500",
  REFERRAL: "text-teal-500",
  ALERT: "text-orange-500",
}

function formatSummaryBullets(summary?: string): string[] {
  if (!summary) return []
  return summary
    .split(/[.;]\s*/)
    .filter((s) => s.trim().length > 5)
    .slice(0, 3)
    .map((s) => s.trim().replace(/\.$/, ""))
}

export function MiniCard({ block }: { block: MedicalBlock }) {
  const { openDocumentSheet } = useWorkspace()
  const Icon = BLOCK_ICONS[block.type] ?? FileText
  const accent = BLOCK_ACCENT[block.type] ?? "from-muted/5 to-transparent border-border/10"
  const iconColor = BLOCK_ICON_COLOR[block.type] ?? "text-muted-foreground"

  const ts = new Date(block.timestamp)
  const dateStr = ts.toLocaleDateString([], { month: "short", day: "numeric" })
  const timeStr = ts.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
  const bullets = formatSummaryBullets(block.summary)

  return (
    <motion.button
      type="button"
      onClick={() => openDocumentSheet(block.id)}
      whileHover={{ scale: 1.02, y: -2 }}
      whileTap={{ scale: 0.98 }}
      transition={{ type: "spring", stiffness: 400, damping: 25 }}
      className={cn(
        "group w-full max-w-md rounded-xl border bg-gradient-to-br p-3.5 text-left shadow-sm transition-shadow hover:shadow-md",
        accent
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <div className={cn("flex size-7 items-center justify-center rounded-lg bg-background/80", iconColor)}>
            <Icon className="size-4" weight="duotone" />
          </div>
          <div>
            <h4 className="text-[13px] font-semibold leading-tight text-foreground">
              {block.title ?? block.type}
            </h4>
            <span className="text-[10px] text-muted-foreground">
              {dateStr} · {timeStr}
            </span>
          </div>
        </div>
        <ArrowSquareOut
          className="size-3.5 shrink-0 text-muted-foreground/0 transition-all group-hover:text-muted-foreground/60"
        />
      </div>

      {bullets.length > 0 && (
        <ul className="mt-2.5 space-y-1">
          {bullets.map((b, i) => (
            <li key={i} className="flex items-start gap-1.5 text-[11px] leading-relaxed text-muted-foreground">
              <span className="mt-1.5 size-1 shrink-0 rounded-full bg-current opacity-40" />
              {b}
            </li>
          ))}
        </ul>
      )}

      {!block.summary && (
        <p className="mt-2 text-[11px] italic text-muted-foreground/50">
          No summary available
        </p>
      )}
    </motion.button>
  )
}

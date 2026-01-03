"use client"

import { cn } from "@/lib/utils"
import { BookOpenText, Lightning, Sparkle } from "@phosphor-icons/react"
import { motion } from "motion/react"

interface EvidenceModeToggleProps {
  enabled: boolean
  onToggle: (enabled: boolean) => void
  className?: string
  size?: "sm" | "md"
}

/**
 * Evidence Mode Toggle - Switch between regular chat and evidence-backed mode
 * When enabled, queries are searched against the medical_evidence database
 */
export function EvidenceModeToggle({
  enabled,
  onToggle,
  className,
  size = "sm",
}: EvidenceModeToggleProps) {
  return (
    <button
      onClick={() => onToggle(!enabled)}
      className={cn(
        "group relative flex items-center gap-1.5 rounded-full transition-all duration-200",
        "border",
        enabled
          ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/20"
          : "bg-accent/50 border-transparent text-muted-foreground hover:bg-accent hover:text-foreground",
        size === "sm" ? "px-2.5 py-1 text-xs" : "px-3 py-1.5 text-sm",
        className
      )}
      title={enabled ? "Evidence mode: ON - Responses backed by PubMed" : "Evidence mode: OFF"}
    >
      {enabled ? (
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="flex items-center gap-1.5"
        >
          <BookOpenText weight="fill" className={cn(
            size === "sm" ? "h-3.5 w-3.5" : "h-4 w-4"
          )} />
          <span className="font-medium">Evidence</span>
          <span className={cn(
            "flex h-1.5 w-1.5 rounded-full bg-emerald-500",
            "animate-pulse"
          )} />
        </motion.div>
      ) : (
        <div className="flex items-center gap-1.5">
          <BookOpenText className={cn(
            size === "sm" ? "h-3.5 w-3.5" : "h-4 w-4"
          )} />
          <span>Evidence</span>
        </div>
      )}
    </button>
  )
}

/**
 * Evidence Mode Indicator - Shows when evidence is being used in response
 */
interface EvidenceModeIndicatorProps {
  isSearching?: boolean
  sourcesCount?: number
  className?: string
}

export function EvidenceModeIndicator({
  isSearching,
  sourcesCount,
  className,
}: EvidenceModeIndicatorProps) {
  if (isSearching) {
    return (
      <div className={cn(
        "inline-flex items-center gap-2 rounded-lg bg-emerald-500/10 px-3 py-1.5 text-xs text-emerald-600 dark:text-emerald-400",
        className
      )}>
        <Lightning weight="fill" className="h-3.5 w-3.5 animate-pulse" />
        <span>Searching medical evidence...</span>
      </div>
    )
  }

  if (sourcesCount && sourcesCount > 0) {
    return (
      <div className={cn(
        "inline-flex items-center gap-2 rounded-lg bg-emerald-500/10 px-3 py-1.5 text-xs text-emerald-600 dark:text-emerald-400",
        className
      )}>
        <Sparkle weight="fill" className="h-3.5 w-3.5" />
        <span>Synthesizing {sourcesCount} sources</span>
      </div>
    )
  }

  return null
}

/**
 * Evidence Search Status - Shows detailed search progress
 */
interface EvidenceSearchStatusProps {
  status: 'idle' | 'searching' | 'synthesizing' | 'complete'
  sourcesFound?: number
  searchTimeMs?: number
  className?: string
}

export function EvidenceSearchStatus({
  status,
  sourcesFound,
  searchTimeMs,
  className,
}: EvidenceSearchStatusProps) {
  if (status === 'idle') return null

  const statusConfig = {
    searching: {
      icon: Lightning,
      text: 'Searching PubMed evidence...',
      color: 'text-amber-600 dark:text-amber-400',
      bg: 'bg-amber-500/10',
    },
    synthesizing: {
      icon: Sparkle,
      text: `Synthesizing ${sourcesFound || 0} sources...`,
      color: 'text-emerald-600 dark:text-emerald-400',
      bg: 'bg-emerald-500/10',
    },
    complete: {
      icon: BookOpenText,
      text: `${sourcesFound || 0} sources${searchTimeMs ? ` (${searchTimeMs}ms)` : ''}`,
      color: 'text-emerald-600 dark:text-emerald-400',
      bg: 'bg-emerald-500/10',
    },
  }

  const config = statusConfig[status]
  const Icon = config.icon

  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      className={cn(
        "inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs",
        config.bg,
        config.color,
        className
      )}
    >
      <Icon 
        weight="fill" 
        className={cn(
          "h-3.5 w-3.5",
          status === 'searching' && "animate-pulse"
        )} 
      />
      <span>{config.text}</span>
    </motion.div>
  )
}


"use client"

import { useWorkspace, type VitalReading } from "@/lib/clinical-workspace"
import { cn } from "@/lib/utils"
import { motion, AnimatePresence } from "motion/react"
import { useCallback } from "react"
import {
  Heartbeat,
  Thermometer,
  Drop,
  Wind,
  Lightning,
} from "@phosphor-icons/react"

const VITAL_ICONS: Record<string, React.ComponentType<any>> = {
  heart_rate: Heartbeat,
  blood_pressure: Drop,
  temperature: Thermometer,
  respiratory_rate: Wind,
  spo2: Lightning,
}

const VITAL_COLORS: Record<string, string> = {
  heart_rate: "bg-red-500/10 border-red-500/20 text-red-600 dark:text-red-400",
  blood_pressure: "bg-blue-500/10 border-blue-500/20 text-blue-600 dark:text-blue-400",
  temperature: "bg-amber-500/10 border-amber-500/20 text-amber-600 dark:text-amber-400",
  respiratory_rate: "bg-teal-500/10 border-teal-500/20 text-teal-600 dark:text-teal-400",
  spo2: "bg-indigo-500/10 border-indigo-500/20 text-indigo-600 dark:text-indigo-400",
  weight: "bg-muted border-border text-foreground",
  glucose: "bg-purple-500/10 border-purple-500/20 text-purple-600 dark:text-purple-400",
}

function formatVitalValue(vital: VitalReading): string {
  if (vital.type === "blood_pressure" && vital.secondaryValue) {
    return `${vital.value}/${vital.secondaryValue}`
  }
  return `${vital.value}`
}

function FloatingVitalPill({ vital, onCommit }: { vital: VitalReading; onCommit: (id: string) => void }) {
  const Icon = VITAL_ICONS[vital.type] ?? Heartbeat
  const colorClass = VITAL_COLORS[vital.type] ?? "bg-muted border-border text-foreground"

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 20, scale: 0.9 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{
        opacity: 0,
        scale: 0.5,
        y: -40,
        transition: { type: "spring", stiffness: 300, damping: 20 },
      }}
      className={cn(
        "inline-flex items-center gap-2 rounded-full border px-3 py-1.5 shadow-sm",
        colorClass
      )}
    >
      <Icon className="size-3.5" weight="fill" />
      <span className="text-xs font-semibold tabular-nums">
        {formatVitalValue(vital)}
      </span>
      <span className="text-[10px] opacity-70">{vital.unit}</span>
      {!vital.committed && (
        <button
          type="button"
          onClick={() => onCommit(vital.id)}
          className="ml-1 rounded-full bg-foreground/10 px-2 py-0.5 text-[10px] font-medium transition-colors hover:bg-foreground/20"
        >
          Commit
        </button>
      )}
    </motion.div>
  )
}

export function PaneCanvas({
  children,
  scribeSlot,
}: {
  children: React.ReactNode
  scribeSlot?: React.ReactNode
}) {
  const { activePatient, commitVital, documentSheet } = useWorkspace()

  const uncommittedVitals = (activePatient?.vitals ?? []).filter((v) => !v.committed)

  const handleCommit = useCallback(
    (vitalId: string) => {
      if (!activePatient) return
      commitVital(activePatient.patientId, vitalId)
    },
    [activePatient, commitVital]
  )

  return (
    <div className="relative flex h-full min-w-0 flex-1 flex-col overflow-hidden">
      {/* Floating vitals pills */}
      <AnimatePresence>
        {uncommittedVitals.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="absolute top-2 right-4 left-4 z-20 flex flex-wrap items-center justify-center gap-2"
          >
            {uncommittedVitals.map((vital) => (
              <FloatingVitalPill
                key={vital.id}
                vital={vital}
                onCommit={handleCommit}
              />
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Live scribe transcript — fixed height, pushes chat down */}
      {scribeSlot && (
        <div className="shrink-0">{scribeSlot}</div>
      )}

      {/* Chat stream fills remaining space */}
      <div
        className={cn(
          "flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden transition-[filter] duration-300",
          documentSheet.isOpen && "brightness-[0.98] saturate-[0.95]"
        )}
      >
        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">{children}</div>
      </div>
    </div>
  )
}

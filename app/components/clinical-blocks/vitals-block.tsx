"use client"

import { useWorkspace, type VitalReading } from "@/lib/clinical-workspace"
import { cn } from "@/lib/utils"
import {
  Heartbeat,
  Thermometer,
  Drop,
  Wind,
  Lightning,
  Scales,
  Drop as GlucoseIcon,
  Plus,
  Check,
  X,
} from "@phosphor-icons/react"
import { motion, AnimatePresence } from "motion/react"
import { useCallback, useState } from "react"

export type VitalType = VitalReading["type"]

export const VITAL_CONFIG: Record<
  VitalType,
  {
    label: string
    icon: React.ComponentType<any>
    unit: string
    color: string
    hasSecondary?: boolean
    secondaryLabel?: string
    range: [number, number]
  }
> = {
  heart_rate: {
    label: "Heart Rate",
    icon: Heartbeat,
    unit: "bpm",
    color: "text-red-500 bg-red-500/10",
    range: [40, 200],
  },
  blood_pressure: {
    label: "Blood Pressure",
    icon: Drop,
    unit: "mmHg",
    color: "text-blue-500 bg-blue-500/10",
    hasSecondary: true,
    secondaryLabel: "Diastolic",
    range: [60, 250],
  },
  spo2: {
    label: "SpO2",
    icon: Lightning,
    unit: "%",
    color: "text-indigo-500 bg-indigo-500/10",
    range: [70, 100],
  },
  temperature: {
    label: "Temperature",
    icon: Thermometer,
    unit: "°C",
    color: "text-amber-500 bg-amber-500/10",
    range: [34, 42],
  },
  respiratory_rate: {
    label: "Resp. Rate",
    icon: Wind,
    unit: "/min",
    color: "text-teal-500 bg-teal-500/10",
    range: [8, 40],
  },
  weight: {
    label: "Weight",
    icon: Scales,
    unit: "kg",
    color: "text-slate-500 bg-slate-500/10",
    range: [1, 300],
  },
  glucose: {
    label: "Glucose",
    icon: GlucoseIcon,
    unit: "mmol/L",
    color: "text-purple-500 bg-purple-500/10",
    range: [1, 30],
  },
}

export function VitalsEntryBlock() {
  const { activePatient, addVitalReading } = useWorkspace()
  const [selectedType, setSelectedType] = useState<VitalType>("heart_rate")
  const [primaryValue, setPrimaryValue] = useState("")
  const [secondaryValue, setSecondaryValue] = useState("")
  const [isOpen, setIsOpen] = useState(true)

  const config = VITAL_CONFIG[selectedType]

  const handleSubmit = useCallback(() => {
    if (!activePatient || !primaryValue) return

    const reading: VitalReading = {
      id: `vital-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      type: selectedType,
      value: parseFloat(primaryValue),
      unit: config.unit,
      secondaryValue: secondaryValue ? parseFloat(secondaryValue) : undefined,
      timestamp: new Date(),
      source: "manual",
      committed: false,
    }

    addVitalReading(activePatient.patientId, reading)
    setPrimaryValue("")
    setSecondaryValue("")
  }, [activePatient, primaryValue, secondaryValue, selectedType, config.unit, addVitalReading])

  if (!activePatient || !isOpen) return null

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 20 }}
      className="mx-auto w-full max-w-3xl px-4"
    >
      <div className="rounded-2xl border border-border/50 bg-background/80 p-4 shadow-sm backdrop-blur-xl">
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Heartbeat className="size-4 text-indigo-500" weight="fill" />
            <span className="text-xs font-semibold">Record Vitals</span>
          </div>
          <button
            type="button"
            onClick={() => setIsOpen(false)}
            className="text-muted-foreground hover:text-foreground"
          >
            <X className="size-4" />
          </button>
        </div>

        {/* Vital type selector */}
        <div className="mb-3 flex flex-wrap gap-1.5">
          {(Object.keys(VITAL_CONFIG) as VitalType[]).map((type) => {
            const c = VITAL_CONFIG[type]
            const Icon = c.icon
            return (
              <button
                key={type}
                type="button"
                onClick={() => setSelectedType(type)}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[11px] font-medium transition-all",
                  selectedType === type
                    ? "border-indigo-500/30 bg-indigo-500/10 text-indigo-700 dark:text-indigo-300"
                    : "border-border/50 text-muted-foreground hover:bg-muted"
                )}
              >
                <Icon className="size-3.5" />
                {c.label}
              </button>
            )
          })}
        </div>

        {/* Value inputs */}
        <div className="flex items-end gap-3">
          <div className="flex-1">
            <label className="mb-1 block text-[10px] font-medium text-muted-foreground">
              {config.hasSecondary ? "Systolic" : config.label}
            </label>
            <input
              type="number"
              value={primaryValue}
              onChange={(e) => setPrimaryValue(e.target.value)}
              placeholder="0"
              min={config.range[0]}
              max={config.range[1]}
              className="w-full rounded-lg border border-border/50 bg-muted/30 px-3 py-2 text-sm font-semibold tabular-nums outline-none transition-colors focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/20"
            />
          </div>

          {config.hasSecondary && (
            <>
              <span className="pb-2 text-lg text-muted-foreground">/</span>
              <div className="flex-1">
                <label className="mb-1 block text-[10px] font-medium text-muted-foreground">
                  {config.secondaryLabel ?? "Secondary"}
                </label>
                <input
                  type="number"
                  value={secondaryValue}
                  onChange={(e) => setSecondaryValue(e.target.value)}
                  placeholder="0"
                  className="w-full rounded-lg border border-border/50 bg-muted/30 px-3 py-2 text-sm font-semibold tabular-nums outline-none transition-colors focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/20"
                />
              </div>
            </>
          )}

          <span className="pb-2.5 text-xs text-muted-foreground">{config.unit}</span>

          <button
            type="button"
            onClick={handleSubmit}
            disabled={!primaryValue}
            className="inline-flex size-9 shrink-0 items-center justify-center rounded-lg bg-indigo-600 text-white transition-colors hover:bg-indigo-700 disabled:opacity-40"
          >
            <Check className="size-4" weight="bold" />
          </button>
        </div>
      </div>
    </motion.div>
  )
}

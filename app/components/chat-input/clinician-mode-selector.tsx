"use client"

import { Button } from "@/components/ui/button"
import type { ClinicianWorkflowMode } from "@/lib/clinician-mode"
import { CLINICIAN_MODE_LABELS } from "@/lib/clinician-mode"
import { cn } from "@/lib/utils"
import {
  CheckCircle,
  FirstAidKit,
  ListMagnifyingGlass,
  ListNumbers,
  Stethoscope,
  WarningIcon,
} from "@phosphor-icons/react"
import type { ComponentType } from "react"

type ClinicianModeSelectorProps = {
  value: ClinicianWorkflowMode
  onChange: (mode: ClinicianWorkflowMode) => void
}

const MODE_OPTIONS: Array<{
  id: ClinicianWorkflowMode
  icon: ComponentType<{ className?: string }>
}> = [
  { id: "open_search", icon: ListMagnifyingGlass },
  { id: "clinical_summary", icon: Stethoscope },
  { id: "drug_interactions", icon: WarningIcon },
  { id: "stewardship", icon: FirstAidKit },
  { id: "icd10_codes", icon: ListNumbers },
  { id: "med_review", icon: CheckCircle },
]

export function ClinicianModeSelector({
  value,
  onChange,
}: ClinicianModeSelectorProps) {
  return (
    <div className="mb-2 w-full">
      <div
        className="overflow-x-auto overflow-y-visible px-1 py-1"
        style={{ WebkitOverflowScrolling: "touch" }}
      >
        <div className="bg-muted/60 inline-flex min-w-max rounded-full p-1 gap-0.5 sm:gap-0">
          {MODE_OPTIONS.map((mode) => {
            const isActive = mode.id === value
            const Icon = mode.icon
            return (
              <Button
                key={mode.id}
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => onChange(mode.id)}
                className={cn(
                  "rounded-full px-2.5 py-2 sm:px-3 flex items-center gap-1.5 whitespace-nowrap transition-all text-xs sm:text-sm shrink-0 touch-manipulation leading-none",
                  isActive
                    ? "bg-background text-foreground shadow-xs"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                <Icon className="size-3 sm:size-3.5 shrink-0" />
                {CLINICIAN_MODE_LABELS[mode.id]}
              </Button>
            )
          })}
        </div>
      </div>
    </div>
  )
}

"use client"

import { Button } from "@/components/ui/button"
import type { ClinicianWorkflowMode } from "@/lib/clinician-mode"
import { CLINICIAN_MODE_LABELS } from "@/lib/clinician-mode"
import { cn } from "@/lib/utils"
import {
  CheckCircle,
  ListMagnifyingGlass,
  ListNumbers,
  ShieldCheck,
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
  { id: "stewardship", icon: ShieldCheck },
  { id: "icd10_codes", icon: ListNumbers },
  { id: "med_review", icon: CheckCircle },
]

export function ClinicianModeSelector({
  value,
  onChange,
}: ClinicianModeSelectorProps) {
  return (
    <div className="mb-2 flex items-center justify-center">
      <div className="bg-muted/60 inline-flex rounded-full p-1">
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
                "rounded-full px-3 transition-all",
                isActive
                  ? "bg-background text-foreground shadow-xs"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <Icon className="size-3.5" />
              {CLINICIAN_MODE_LABELS[mode.id]}
            </Button>
          )
        })}
      </div>
    </div>
  )
}

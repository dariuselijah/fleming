"use client"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import type { MedicalStudentLearningMode } from "@/lib/medical-student-learning"
import type { ComponentType } from "react"
import {
  ChatCenteredText,
  Flask,
  Pulse,
} from "@phosphor-icons/react"

type LearningModeSelectorProps = {
  value: MedicalStudentLearningMode
  onChange: (mode: MedicalStudentLearningMode) => void
}

const MODE_OPTIONS: Array<{
  id: MedicalStudentLearningMode
  label: string
  icon: ComponentType<{ className?: string }>
}> = [
  { id: "ask", label: "Ask", icon: ChatCenteredText },
  { id: "simulate", label: "Simulate", icon: Pulse },
  { id: "guideline", label: "Guideline", icon: Flask },
]

export function LearningModeSelector({
  value,
  onChange,
}: LearningModeSelectorProps) {
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
              {mode.label}
            </Button>
          )
        })}
      </div>
    </div>
  )
}

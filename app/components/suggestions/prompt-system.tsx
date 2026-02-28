"use client"

import { AnimatePresence } from "motion/react"
import React, { memo } from "react"
import { Suggestions } from "../chat-input/suggestions"
import type { ClinicianWorkflowMode } from "@/lib/clinician-mode"
import type { MedicalStudentLearningMode } from "@/lib/medical-student-learning"

type PromptSystemProps = {
  onValueChange: (value: string) => void
  onSuggestion: (suggestion: string) => void
  value: string
  learningMode: MedicalStudentLearningMode
  clinicianMode: ClinicianWorkflowMode
  position?: "floating" | "inline"
}

export const PromptSystem = memo(function PromptSystem({
  onValueChange,
  onSuggestion,
  value,
  learningMode,
  clinicianMode,
  position = "floating",
}: PromptSystemProps) {
  const containerClassName =
    position === "inline"
      ? "relative order-4 w-full"
      : "relative order-1 w-full md:absolute md:bottom-[-70px] md:order-2 md:h-[70px]"

  return (
    <>
      <div className={containerClassName}>
        <AnimatePresence mode="popLayout">
          <Suggestions
            onValueChange={onValueChange}
            onSuggestion={onSuggestion}
            value={value}
            learningMode={learningMode}
            clinicianMode={clinicianMode}
          />
        </AnimatePresence>
      </div>
    </>
  )
})

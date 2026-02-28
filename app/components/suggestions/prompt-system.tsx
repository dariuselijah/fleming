"use client"

import { AnimatePresence } from "motion/react"
import React, { memo } from "react"
import { Suggestions } from "../chat-input/suggestions"
import type { MedicalStudentLearningMode } from "@/lib/medical-student-learning"

type PromptSystemProps = {
  onValueChange: (value: string) => void
  onSuggestion: (suggestion: string) => void
  value: string
  learningMode: MedicalStudentLearningMode
}

export const PromptSystem = memo(function PromptSystem({
  onValueChange,
  onSuggestion,
  value,
  learningMode,
}: PromptSystemProps) {
  return (
    <>
      <div className="relative order-1 w-full md:absolute md:bottom-[-70px] md:order-2 md:h-[70px]">
        <AnimatePresence mode="popLayout">
          <Suggestions
            onValueChange={onValueChange}
            onSuggestion={onSuggestion}
            value={value}
            learningMode={learningMode}
          />
        </AnimatePresence>
      </div>
    </>
  )
})

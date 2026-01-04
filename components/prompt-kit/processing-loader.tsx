"use client"

import { motion, AnimatePresence } from "motion/react"
import { useState, useEffect } from "react"
import { 
  MagnifyingGlass, 
  BookOpen, 
  Sparkle, 
  Brain,
  CaretDown
} from "@phosphor-icons/react"
import { cn } from "@/lib/utils"

interface ProcessingStep {
  icon: typeof MagnifyingGlass
  label: string
  description: string
}

const PROCESSING_STEPS: ProcessingStep[] = [
  {
    icon: MagnifyingGlass,
    label: "Searching",
    description: "Scanning medical literature"
  },
  {
    icon: BookOpen,
    label: "Analyzing",
    description: "Reviewing evidence quality"
  },
  {
    icon: Sparkle,
    label: "Synthesizing",
    description: "Combining research findings"
  },
  {
    icon: Brain,
    label: "Generating",
    description: "Crafting evidence-based response"
  }
]

interface ProcessingLoaderProps {
  className?: string
}

export function ProcessingLoader({ className }: ProcessingLoaderProps) {
  const [currentStep, setCurrentStep] = useState(0)
  const [isExpanded, setIsExpanded] = useState(false)
  const [isMounted, setIsMounted] = useState(false)

  // Prevent hydration mismatch by only animating on client
  useEffect(() => {
    setIsMounted(true)
    // Cycle through steps every 2 seconds
    const interval = setInterval(() => {
      setCurrentStep((prev) => (prev + 1) % PROCESSING_STEPS.length)
    }, 2000)

    return () => clearInterval(interval)
  }, [])

  // Use step 0 for SSR to prevent hydration mismatch
  const displayStep = isMounted ? currentStep : 0
  const currentStepData = PROCESSING_STEPS[displayStep]

  return (
    <div className={cn("w-full", className)}>
      {/* Collapsible header */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center gap-3 group"
        type="button"
      >
        {/* Spinning loader */}
        <div className="relative flex-shrink-0">
          {isMounted ? (
            <motion.div
              animate={{ rotate: 360 }}
              transition={{
                duration: 1.5,
                repeat: Infinity,
                ease: "linear",
              }}
              className="h-4 w-4"
            >
              <div className="h-4 w-4 border-2 border-muted-foreground/30 border-t-muted-foreground/60 rounded-full" />
            </motion.div>
          ) : (
            <div className="h-4 w-4 border-2 border-muted-foreground/30 border-t-muted-foreground/60 rounded-full" />
          )}
        </div>

        {/* Current step text */}
        <div className="flex-1 text-left">
          {isMounted ? (
            <AnimatePresence mode="wait">
              <motion.div
                key={displayStep}
                initial={{ opacity: 0, x: -5 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 5 }}
                transition={{ duration: 0.2 }}
              >
                <span className="text-sm text-muted-foreground/70 font-light">
                  {currentStepData.label} • {currentStepData.description}
                </span>
              </motion.div>
            </AnimatePresence>
          ) : (
            <span className="text-sm text-muted-foreground/70 font-light">
              {currentStepData.label} • {currentStepData.description}
            </span>
          )}
        </div>

        {/* Expand/collapse icon */}
        {isMounted ? (
          <motion.div
            animate={{ rotate: isExpanded ? 180 : 0 }}
            transition={{ duration: 0.2 }}
            className="flex-shrink-0"
          >
            <CaretDown className="h-3.5 w-3.5 text-muted-foreground/40 group-hover:text-muted-foreground/60 transition-colors" />
          </motion.div>
        ) : (
          <CaretDown className="h-3.5 w-3.5 text-muted-foreground/40 group-hover:text-muted-foreground/60 transition-colors" />
        )}
      </button>

      {/* Expandable content */}
      {isMounted && (
        <AnimatePresence>
          {isExpanded && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.3, ease: "easeInOut" }}
              className="overflow-hidden"
            >
              <div className="pt-3 pl-7 space-y-2.5">
                {PROCESSING_STEPS.map((step, index) => {
                  const StepIcon = step.icon
                  const isActive = index === displayStep
                  const isCompleted = index < displayStep
                
                return (
                  <motion.div
                    key={index}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: index * 0.05 }}
                    className={cn(
                      "flex items-start gap-2.5 transition-colors",
                      isActive && "text-foreground/80",
                      !isActive && "text-muted-foreground/50"
                    )}
                  >
                    <div className="flex-shrink-0 mt-0.5">
                      {isActive ? (
                        <motion.div
                          animate={{ rotate: 360 }}
                          transition={{
                            duration: 2,
                            repeat: Infinity,
                            ease: "linear",
                          }}
                        >
                          <StepIcon className="h-3.5 w-3.5" weight="duotone" />
                        </motion.div>
                      ) : isCompleted ? (
                        <StepIcon className="h-3.5 w-3.5 opacity-50" weight="fill" />
                      ) : (
                        <StepIcon className="h-3.5 w-3.5 opacity-30" weight="light" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-light">
                        <span className={cn(
                          isActive && "font-normal"
                        )}>
                          {step.label}
                        </span>
                        <span className="text-muted-foreground/40 ml-1.5">
                          {step.description}
                        </span>
                      </div>
                    </div>
                  </motion.div>
                )
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      )}
    </div>
  )
}


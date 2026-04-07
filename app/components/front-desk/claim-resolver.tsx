"use client"

import { cn } from "@/lib/utils"
import {
  Brain,
  CheckCircle,
  SpinnerGap,
  ArrowClockwise,
  FileText,
  MagnifyingGlass,
  Scales,
  PaperPlaneRight,
} from "@phosphor-icons/react"
import { motion, AnimatePresence } from "motion/react"
import { useCallback, useState } from "react"

type ResolverStep = {
  id: number
  label: string
  detail: string
  status: "pending" | "running" | "completed"
  icon: React.ComponentType<any>
}

type ResolverState = "idle" | "resolving" | "resolved" | "error"

interface ResolverResult {
  suggestedICD: string[]
  suggestedTariff: string[]
  rationale: string
  confidence: number
}

export function ClaimResolver({
  claimNumber,
  rejectionCode,
  rejectionReason,
}: {
  claimNumber: string
  rejectionCode: string
  rejectionReason: string
}) {
  const [state, setState] = useState<ResolverState>("idle")
  const [steps, setSteps] = useState<ResolverStep[]>([])
  const [result, setResult] = useState<ResolverResult | null>(null)

  const runResolver = useCallback(() => {
    setState("resolving")

    const resolverSteps: ResolverStep[] = [
      {
        id: 1,
        label: "Parsing rejection code",
        detail: `Analyzing code ${rejectionCode}: "${rejectionReason}"`,
        status: "pending",
        icon: FileText,
      },
      {
        id: 2,
        label: "Scanning clinical documentation",
        detail: "Reviewing scribe transcript and SOAP note for justification",
        status: "pending",
        icon: MagnifyingGlass,
      },
      {
        id: 3,
        label: "Cross-referencing coding rules",
        detail: "Checking Medikredit/Medprax coding guidelines and tariff tables",
        status: "pending",
        icon: Scales,
      },
      {
        id: 4,
        label: "Generating correction",
        detail: "Building corrected claim with updated codes and documentation",
        status: "pending",
        icon: Brain,
      },
    ]

    setSteps(resolverSteps)

    // Simulate step-by-step resolution
    let currentStep = 0
    const timer = setInterval(() => {
      if (currentStep >= resolverSteps.length) {
        clearInterval(timer)
        setState("resolved")
        setResult({
          suggestedICD: ["E11.65", "I10", "N18.3"],
          suggestedTariff: ["0190", "0191"],
          rationale:
            "The original claim used non-specific ICD code E11.9. Clinical documentation supports E11.65 (Type 2 diabetes with hyperglycemia) based on HbA1c of 7.2%. Added I10 and N18.3 as co-morbidities documented in the SOAP assessment.",
          confidence: 0.87,
        })
        return
      }

      setSteps((prev) =>
        prev.map((s) => {
          if (s.id === currentStep + 1) return { ...s, status: "running" }
          if (s.id === currentStep) return { ...s, status: "completed" }
          return s
        })
      )

      currentStep++
    }, 1200)

    return () => clearInterval(timer)
  }, [rejectionCode, rejectionReason])

  if (state === "idle") {
    return (
      <button
        type="button"
        onClick={runResolver}
        className="flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-500/10 px-4 py-3 text-xs font-medium text-indigo-700 transition-colors hover:bg-indigo-500/15 dark:text-indigo-300"
      >
        <Brain className="size-4" weight="fill" />
        Fleming Resolve — Analyze Rejection
      </button>
    )
  }

  return (
    <div className="rounded-xl border border-indigo-500/20 bg-indigo-500/5 p-4">
      <div className="mb-3 flex items-center gap-2">
        <Brain className="size-4 text-indigo-500" weight="fill" />
        <h4 className="text-xs font-semibold text-indigo-700 dark:text-indigo-300">
          Fleming Claim Resolver
        </h4>
        <span className="text-[10px] text-muted-foreground">Claim #{claimNumber}</span>
      </div>

      {/* Reasoning steps */}
      <div className="space-y-2">
        <AnimatePresence>
          {steps.map((step) => {
            const StepIcon = step.icon
            return (
              <motion.div
                key={step.id}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                className="flex items-start gap-3"
              >
                <div className="mt-0.5 flex size-5 shrink-0 items-center justify-center">
                  {step.status === "completed" ? (
                    <CheckCircle className="size-4 text-emerald-500" weight="fill" />
                  ) : step.status === "running" ? (
                    <SpinnerGap className="size-4 animate-spin text-indigo-500" />
                  ) : (
                    <div className="size-3 rounded-full border-2 border-border" />
                  )}
                </div>
                <div>
                  <span
                    className={cn(
                      "text-[11px] font-medium",
                      step.status === "completed"
                        ? "text-foreground"
                        : step.status === "running"
                          ? "text-indigo-600 dark:text-indigo-400"
                          : "text-muted-foreground"
                    )}
                  >
                    {step.label}
                  </span>
                  <p className="text-[10px] text-muted-foreground">{step.detail}</p>
                </div>
              </motion.div>
            )
          })}
        </AnimatePresence>
      </div>

      {/* Result */}
      {result && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="mt-4 rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-3"
        >
          <div className="mb-2 flex items-center justify-between">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
              Suggested Correction
            </span>
            <span className="text-[10px] text-muted-foreground">
              Confidence: {Math.round(result.confidence * 100)}%
            </span>
          </div>

          <div className="mb-2 flex flex-wrap gap-1.5">
            {result.suggestedICD.map((code) => (
              <span
                key={code}
                className="rounded-md bg-purple-500/15 px-1.5 py-0.5 text-[10px] font-medium text-purple-700 dark:text-purple-300"
              >
                ICD: {code}
              </span>
            ))}
            {result.suggestedTariff.map((code) => (
              <span
                key={code}
                className="rounded-md bg-blue-500/15 px-1.5 py-0.5 text-[10px] font-medium text-blue-700 dark:text-blue-300"
              >
                Tariff: {code}
              </span>
            ))}
          </div>

          <p className="text-[11px] leading-relaxed text-foreground/80">{result.rationale}</p>

          <button
            type="button"
            className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-xs font-medium text-white transition-colors hover:bg-indigo-700"
          >
            <PaperPlaneRight className="size-3.5" weight="bold" />
            Resubmit with Corrections
          </button>
        </motion.div>
      )}
    </div>
  )
}

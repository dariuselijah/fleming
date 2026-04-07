"use client"

import { cn } from "@/lib/utils"
import {
  ShieldCheck,
  CheckCircle,
  XCircle,
  Clock,
  SpinnerGap,
} from "@phosphor-icons/react"
import { motion } from "motion/react"
import { useCallback, useEffect, useState } from "react"

type EligibilityStatus = "idle" | "checking" | "eligible" | "not_eligible" | "error"

interface EligibilityResult {
  status: EligibilityStatus
  scheme?: string
  memberNumber?: string
  planType?: string
  benefitRemaining?: number
  dependants?: number
  message?: string
}

export function EligibilityCard({ patientName }: { patientName: string }) {
  const [result, setResult] = useState<EligibilityResult>({ status: "idle" })

  const checkEligibility = useCallback(() => {
    setResult({ status: "checking" })

    // Simulated Medikredit check
    setTimeout(() => {
      const isEligible = Math.random() > 0.2
      if (isEligible) {
        setResult({
          status: "eligible",
          scheme: "Discovery Health",
          memberNumber: "DH" + Math.floor(Math.random() * 900000 + 100000),
          planType: "Executive Plan",
          benefitRemaining: Math.floor(Math.random() * 15000 + 5000),
          dependants: Math.floor(Math.random() * 3),
        })
      } else {
        setResult({
          status: "not_eligible",
          message: "Member benefits exhausted for current cycle.",
          scheme: "Bonitas",
          memberNumber: "BN" + Math.floor(Math.random() * 900000 + 100000),
        })
      }
    }, 1500)
  }, [])

  if (result.status === "idle") {
    return (
      <button
        type="button"
        onClick={checkEligibility}
        className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-border/50 py-3 text-xs font-medium text-indigo-600 transition-colors hover:bg-indigo-500/5 dark:text-indigo-400"
      >
        <ShieldCheck className="size-4" />
        Verify Medikredit Eligibility
      </button>
    )
  }

  if (result.status === "checking") {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="flex items-center justify-center gap-2 py-4"
      >
        <SpinnerGap className="size-4 animate-spin text-indigo-500" />
        <span className="text-xs text-muted-foreground">
          Checking eligibility for {patientName}...
        </span>
      </motion.div>
    )
  }

  const isEligible = result.status === "eligible"

  return (
    <motion.div
      initial={{ opacity: 0, y: 5 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn(
        "rounded-xl border p-3",
        isEligible
          ? "border-emerald-500/30 bg-emerald-500/5"
          : "border-red-500/30 bg-red-500/5"
      )}
    >
      <div className="flex items-center gap-2">
        {isEligible ? (
          <CheckCircle className="size-4 text-emerald-600 dark:text-emerald-400" weight="fill" />
        ) : (
          <XCircle className="size-4 text-red-600 dark:text-red-400" weight="fill" />
        )}
        <span
          className={cn(
            "text-xs font-semibold",
            isEligible
              ? "text-emerald-700 dark:text-emerald-300"
              : "text-red-700 dark:text-red-300"
          )}
        >
          {isEligible ? "Eligible" : "Not Eligible"}
        </span>
      </div>

      <div className="mt-2 grid grid-cols-2 gap-2 text-[11px]">
        {result.scheme && (
          <div>
            <span className="text-muted-foreground">Scheme</span>
            <p className="font-medium">{result.scheme}</p>
          </div>
        )}
        {result.memberNumber && (
          <div>
            <span className="text-muted-foreground">Member #</span>
            <p className="font-medium tabular-nums">{result.memberNumber}</p>
          </div>
        )}
        {result.planType && (
          <div>
            <span className="text-muted-foreground">Plan</span>
            <p className="font-medium">{result.planType}</p>
          </div>
        )}
        {result.benefitRemaining != null && (
          <div>
            <span className="text-muted-foreground">Benefits Remaining</span>
            <p className="font-semibold text-emerald-600 dark:text-emerald-400">
              R{result.benefitRemaining.toLocaleString()}
            </p>
          </div>
        )}
      </div>

      {result.message && (
        <p className="mt-2 text-[11px] text-red-600 dark:text-red-400">{result.message}</p>
      )}

      <button
        type="button"
        onClick={checkEligibility}
        className="mt-2 text-[10px] font-medium text-indigo-600 hover:text-indigo-700 dark:text-indigo-400"
      >
        Re-check
      </button>
    </motion.div>
  )
}

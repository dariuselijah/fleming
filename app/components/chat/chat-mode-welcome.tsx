"use client"

import { motion } from "motion/react"
import { useMemo } from "react"
import {
  Books,
  ChartLineUp,
  FirstAid,
  Pill,
  Stethoscope,
  Syringe,
} from "@phosphor-icons/react"

type ExampleQuery = {
  category: string
  icon: typeof Stethoscope
  iconColor: string
  teaser: string
  prompt: string
}

const EXAMPLES: ExampleQuery[] = [
  {
    category: "Treatment evidence",
    icon: Pill,
    iconColor: "text-emerald-400",
    teaser: "First-line therapy for CAP in a 65 y/o with COPD",
    prompt:
      "What is the first-line antibiotic regimen for community-acquired pneumonia in a 65-year-old with COPD on inhaled steroids? Cite the latest IDSA/ATS guidelines and discuss tailoring for likely H. influenzae and atypical coverage.",
  },
  {
    category: "Drug guidance",
    icon: Stethoscope,
    iconColor: "text-blue-400",
    teaser: "SGLT2 inhibitors in HFpEF — current evidence",
    prompt:
      "Summarize the current evidence for SGLT2 inhibitors in HFpEF. Include landmark trials (EMPEROR-Preserved, DELIVER), magnitude of benefit, and current ACC/AHA recommendations on initiation.",
  },
  {
    category: "Diagnostics",
    icon: FirstAid,
    iconColor: "text-amber-400",
    teaser: "Workup of acute chest pain in a 45 y/o smoker",
    prompt:
      "How should I work up acute chest pain in a 45-year-old smoker presenting to the ED? Include the ESC 0/1-hour high-sensitivity troponin algorithm and risk stratification (HEART score).",
  },
  {
    category: "Updated guidelines",
    icon: Books,
    iconColor: "text-indigo-400",
    teaser: "2026 ESC guidelines for atrial fibrillation",
    prompt:
      "Summarize the 2026 ESC guidelines for management of atrial fibrillation. Highlight key changes from prior versions, especially around rhythm control vs rate control and anticoagulation thresholds.",
  },
  {
    category: "Drug interactions",
    icon: Syringe,
    iconColor: "text-rose-400",
    teaser: "Apixaban + amiodarone — clinically significant?",
    prompt:
      "Is the combination of apixaban and amiodarone clinically significant? Discuss the pharmacokinetic interaction, magnitude of effect, dose adjustments, and monitoring recommendations.",
  },
  {
    category: "Differential dx",
    icon: ChartLineUp,
    iconColor: "text-violet-400",
    teaser: "New bilateral lower-limb edema in a 70 y/o",
    prompt:
      "Build a structured differential for new-onset bilateral lower-extremity edema in a 70-year-old. Cover cardiac, hepatic, renal, venous, and lymphatic causes with key exam and lab findings to differentiate.",
  },
]

export function ChatModeWelcome({
  userName,
  onSuggestion,
}: {
  userName?: string | null
  onSuggestion: (prompt: string) => void
}) {
  const greeting = useMemo(() => {
    const h = new Date().getHours()
    if (h < 5) return "Working late"
    if (h < 12) return "Good morning"
    if (h < 18) return "Good afternoon"
    return "Good evening"
  }, [])

  const firstName = useMemo(() => {
    if (!userName) return ""
    const n = userName.trim().split(" ")[0]
    return n ?? ""
  }, [userName])

  return (
    <div className="flex flex-1 flex-col items-center justify-center px-6 pb-6">
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: [0.32, 0.72, 0, 1] }}
        className="text-center"
      >
        <p className="text-[10px] font-medium uppercase tracking-[0.28em] text-muted-foreground/45">
          AskFleming
        </p>
        <h1 className="mt-3 text-[28px] font-semibold tracking-tight text-foreground sm:text-[32px]">
          {greeting}
          {firstName ? (
            <>
              <span className="text-muted-foreground/40">, </span>
              <span>{firstName}</span>
            </>
          ) : null}
        </h1>
        <p className="mt-2 max-w-md text-[13px] leading-relaxed text-muted-foreground/75">
          Ask anything clinical. Every answer is evidence-checked with peer-reviewed
          citations and current guidelines.
        </p>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, delay: 0.1, ease: [0.32, 0.72, 0, 1] }}
        className="mt-9 w-full max-w-2xl"
      >
        <div className="mb-3 flex items-center justify-between px-1">
          <p className="text-[10px] font-medium uppercase tracking-[0.22em] text-muted-foreground/40">
            Try an example
          </p>
          <p className="text-[10px] text-muted-foreground/35">
            Tap to send · all return cited evidence
          </p>
        </div>
        <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
          {EXAMPLES.map((ex, idx) => (
            <motion.button
              key={ex.category}
              type="button"
              onClick={() => onSuggestion(ex.prompt)}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{
                duration: 0.35,
                delay: 0.12 + idx * 0.04,
                ease: [0.32, 0.72, 0, 1],
              }}
              className="group relative flex items-start gap-3 overflow-hidden rounded-xl border border-border/40 bg-card/30 px-3.5 py-3 text-left transition-all duration-200 hover:-translate-y-px hover:border-border hover:bg-card/70 hover:shadow-[0_4px_16px_-8px_rgba(0,0,0,0.35)]"
            >
              <span
                className={`mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg bg-white/[0.04] ${ex.iconColor} transition-colors group-hover:bg-white/[0.07]`}
              >
                <ex.icon className="size-3.5" weight="fill" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[9.5px] font-semibold uppercase tracking-[0.18em] text-muted-foreground/45 transition-colors group-hover:text-muted-foreground/70">
                  {ex.category}
                </span>
                <span className="mt-1 block text-[12.5px] leading-snug text-foreground/85 transition-colors group-hover:text-foreground">
                  {ex.teaser}
                </span>
              </span>
            </motion.button>
          ))}
        </div>
      </motion.div>
    </div>
  )
}

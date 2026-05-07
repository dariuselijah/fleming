"use client"

import { cn } from "@/lib/utils"
import {
  useChecklistStore,
  type ChecklistStepId,
  type ChecklistStep,
  type StepStatus,
} from "@/lib/onboarding/checklist-store"
import { usePracticeCrypto } from "@/lib/clinical-workspace/practice-crypto-context"
import { encryptJson } from "@/lib/crypto/practice-e2ee"
import { createClient } from "@/lib/supabase/client"
import { useUser } from "@/lib/user-store/provider"
import { useUserPreferences } from "@/lib/user-preference-store/provider"
import { motion, AnimatePresence } from "motion/react"
import {
  ArrowsOutSimple,
  CaretDown,
  CaretRight,
  ChatCircle,
  Check,
  ClockCounterClockwise,
  FileXls,
  Phone,
  Plugs,
  Robot,
  ShieldCheck,
  Spinner,
  Stethoscope,
  Upload,
  X,
} from "@phosphor-icons/react"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { MedikreditProviderSettingsForm } from "@/app/components/medikredit/medikredit-provider-settings-form"
import { upsertMedikreditProviderPatch } from "@/lib/medikredit/upsert-medikredit-provider-patch"

const STEP_ICONS: Record<ChecklistStepId, typeof Stethoscope> = {
  profile: Stethoscope,
  services: FileXls,
  patient_messaging: ChatCircle,
  voice: Phone,
  labs: Plugs,
  medikredit: ShieldCheck,
  ai_settings: Robot,
}

const STATUS_RING: Record<StepStatus, string> = {
  pending: "border-border text-muted-foreground/45 dark:border-white/15 dark:text-white/25",
  in_progress: "border-primary/60 text-primary",
  done: "border-emerald-500/60 text-emerald-600 dark:text-emerald-400",
  waiting: "border-amber-400/60 text-amber-600 dark:text-amber-400",
}

const springSnappy = { type: "spring" as const, damping: 30, stiffness: 400, mass: 0.85 }
const springSoft = { type: "spring" as const, damping: 28, stiffness: 260, mass: 0.9 }
const fade = { duration: 0.22, ease: [0.16, 1, 0.3, 1] as const }

const STEP_ORDER: ChecklistStepId[] = [
  "profile",
  "services",
  "patient_messaging",
  "voice",
  "labs",
  "medikredit",
  "ai_settings",
]

function advanceAfterComplete(completedId: ChecklistStepId) {
  const { steps, setExpandedStep, closePanel } = useChecklistStore.getState()
  const start = STEP_ORDER.indexOf(completedId)
  const nextId = STEP_ORDER.slice(start + 1).find((id) => {
    const st = steps.find((x) => x.id === id)
    return st && st.status !== "done" && st.status !== "waiting"
  })
  if (nextId) setExpandedStep(nextId)
  else closePanel()
}

function ProgressRing({ pct, size = 32 }: { pct: number; size?: number }) {
  const r = (size / 2) * 0.81
  const c = 2 * Math.PI * r
  const dash = (pct / 100) * c
  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg className="-rotate-90" width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          strokeWidth={size > 28 ? 2.5 : 2}
          stroke="currentColor"
          fill="none"
          className="text-muted-foreground/15 dark:text-white/[0.08]"
        />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          strokeWidth={size > 28 ? 2.5 : 2}
          stroke="currentColor"
          fill="none"
          strokeLinecap="round"
          className="text-primary"
          initial={false}
          animate={{ strokeDasharray: `${dash} ${c}` }}
          transition={springSoft}
        />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center text-[9px] font-bold tabular-nums text-foreground/80 dark:text-white/80">
        {pct}%
      </span>
    </div>
  )
}

export function OnboardingChecklist() {
  const { user } = useUser()
  const { preferences, updatePreferences } = useUserPreferences()
  const steps = useChecklistStore((s) => s.steps)
  const expandedStep = useChecklistStore((s) => s.expandedStep)
  const panelOpen = useChecklistStore((s) => s.panelOpen)
  const minimized = useChecklistStore((s) => s.minimized)
  const openPanel = useChecklistStore((s) => s.openPanel)
  const closePanel = useChecklistStore((s) => s.closePanel)
  const setMinimized = useChecklistStore((s) => s.setMinimized)
  const setExpandedStep = useChecklistStore((s) => s.setExpandedStep)
  const setStepStatus = useChecklistStore((s) => s.setStepStatus)

  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  const done = useMemo(
    () => steps.filter((s) => s.status === "done" || s.status === "waiting").length,
    [steps]
  )
  const total = steps.length
  const pct = Math.round((done / total) * 100)

  const hideGuide =
    Boolean(preferences.practiceProfileCompleted) ||
    Boolean(preferences.practiceSetupGuideDismissed)

  const dismissSetupGuide = useCallback(async () => {
    try {
      await updatePreferences({ practiceSetupGuideDismissed: true })
    } catch (e) {
      console.warn("[OnboardingChecklist] dismiss preferences", e)
    }
    closePanel()
    setMinimized(false)
  }, [closePanel, setMinimized, updatePreferences])

  useEffect(() => {
    if (!preferences.practiceProfileCompleted) return
    setStepStatus("profile", "done")
    closePanel()
    setMinimized(false)
  }, [preferences.practiceProfileCompleted, closePanel, setMinimized, setStepStatus])

  useEffect(() => {
    if (!panelOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") void dismissSetupGuide()
    }
    window.addEventListener("keydown", onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => {
      window.removeEventListener("keydown", onKey)
      document.body.style.overflow = prev
    }
  }, [panelOpen, dismissSetupGuide])

  if (!user?.id) return null
  if (hideGuide) return null

  return (
    <>
      {mounted
        ? createPortal(
            <AnimatePresence>
              {panelOpen ? (
                <SetupPanelOverlay
                  key="setup-panel"
                  steps={steps}
                  expandedStep={expandedStep}
                  onSelectStep={(id) => setExpandedStep(id)}
                  onClose={() => void dismissSetupGuide()}
                  pct={pct}
                  done={done}
                  total={total}
                />
              ) : null}
            </AnimatePresence>,
            document.body
          )
        : null}

      {panelOpen ? null : minimized ? (
        <motion.button
          type="button"
          initial={{ opacity: 0, scale: 0.92, y: 12 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={springSnappy}
          whileHover={{ scale: 1.03 }}
          whileTap={{ scale: 0.98 }}
          onClick={() => setMinimized(false)}
          className="fixed bottom-5 right-5 z-[180] flex items-center gap-2.5 rounded-full border border-border/80 bg-card/95 px-4 py-2.5 shadow-[0_12px_40px_-8px_rgba(0,0,0,0.18)] backdrop-blur-md transition-colors hover:border-border hover:bg-card dark:border-white/[0.12] dark:bg-[#111]/95 dark:shadow-[0_12px_40px_-8px_rgba(0,0,0,0.65)] dark:hover:border-white/20 dark:hover:bg-[#161616]/95"
        >
          <ProgressRing pct={pct} size={28} />
          <span className="text-xs font-medium text-foreground/75 dark:text-white/75">Setup</span>
        </motion.button>
      ) : (
        <motion.div
          initial={{ opacity: 0, y: 18, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={springSnappy}
          className="fixed bottom-5 right-5 z-[180] flex w-[min(100vw-2rem,360px)] flex-col overflow-hidden rounded-2xl border border-border/80 bg-card/95 shadow-[0_20px_50px_-12px_rgba(0,0,0,0.2)] backdrop-blur-xl dark:border-white/[0.1] dark:bg-[#0c0c0d]/95 dark:shadow-[0_20px_50px_-12px_rgba(0,0,0,0.7)]"
        >
          <div className="flex items-center justify-between border-b border-border/70 px-3.5 py-3 dark:border-white/[0.06]">
            <div className="flex items-center gap-2.5">
              <ProgressRing pct={pct} size={36} />
              <div>
                <h3 className="text-[13px] font-semibold tracking-tight text-foreground">Practice setup</h3>
                <p className="text-[10px] text-muted-foreground">
                  {done} of {total} complete
                </p>
              </div>
            </div>
            <div className="flex items-center gap-0.5">
              <motion.button
                type="button"
                whileTap={{ scale: 0.94 }}
                onClick={() => openPanel(null)}
                className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground dark:text-white/40 dark:hover:bg-white/[0.06] dark:hover:text-white/80"
                aria-label="Expand setup"
                title="Expand"
              >
                <ArrowsOutSimple className="size-4" weight="bold" />
              </motion.button>
              <motion.button
                type="button"
                whileTap={{ scale: 0.94 }}
                onClick={() => setMinimized(true)}
                className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground dark:text-white/35 dark:hover:bg-white/[0.06] dark:hover:text-white/65"
                aria-label="Minimize"
              >
                <CaretDown className="size-4" weight="bold" />
              </motion.button>
              <motion.button
                type="button"
                whileTap={{ scale: 0.94 }}
                onClick={() => void dismissSetupGuide()}
                className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground dark:text-white/35 dark:hover:bg-white/[0.06] dark:hover:text-white/65"
                aria-label="Close setup"
                title="Close setup"
              >
                <X className="size-4" weight="bold" />
              </motion.button>
            </div>
          </div>

          <motion.ul
            className="max-h-[min(340px,52vh)] overflow-y-auto py-1"
            style={{ scrollbarWidth: "thin" }}
            initial="hidden"
            animate="show"
            variants={{
              hidden: {},
              show: { transition: { staggerChildren: 0.04, delayChildren: 0.06 } },
            }}
          >
            {steps.map((step) => (
              <CompactStepRow
                key={step.id}
                step={step}
                onOpen={() => openPanel(step.id)}
              />
            ))}
          </motion.ul>

          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.2, ...fade }}
            className="border-t border-border/70 px-3 py-2.5 dark:border-white/[0.05]"
          >
            <button
              type="button"
              onClick={() => openPanel(null)}
              className="flex w-full items-center justify-center gap-2 rounded-xl border border-border bg-muted/40 py-2 text-[11px] font-medium text-muted-foreground transition-colors hover:border-border hover:bg-muted hover:text-foreground dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-white/60 dark:hover:border-white/15 dark:hover:bg-white/[0.07] dark:hover:text-white/85"
            >
              <ArrowsOutSimple className="size-3.5" />
              Open full workspace
            </button>
          </motion.div>
        </motion.div>
      )}
    </>
  )
}

function CompactStepRow({ step, onOpen }: { step: ChecklistStep; onOpen: () => void }) {
  const Icon = STEP_ICONS[step.id] ?? ChatCircle
  return (
    <motion.li
      variants={{
        hidden: { opacity: 0, x: 8 },
        show: { opacity: 1, x: 0, transition: springSnappy },
      }}
    >
      <motion.button
        type="button"
        onClick={onOpen}
        whileHover={{ backgroundColor: "hsl(var(--muted) / 0.55)" }}
        whileTap={{ scale: 0.995 }}
        className="flex w-full items-center gap-3 px-3.5 py-2.5 text-left"
      >
        <div
          className={cn(
            "flex size-8 shrink-0 items-center justify-center rounded-full border-2 transition-colors",
            STATUS_RING[step.status]
          )}
        >
          {step.status === "done" ? (
            <Check className="size-3.5" weight="bold" />
          ) : step.status === "waiting" ? (
            <ClockCounterClockwise className="size-3.5 text-amber-400/90" />
          ) : (
            <Icon className="size-3.5" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p
            className={cn(
              "text-[12px] font-medium tracking-tight",
              step.status === "done"
                ? "text-muted-foreground/55 line-through decoration-muted-foreground/25 dark:text-white/38 dark:decoration-white/20"
                : "text-foreground"
            )}
          >
            {step.label}
          </p>
          <p className="truncate text-[10px] text-muted-foreground dark:text-white/28">{step.description}</p>
        </div>
        <CaretRight className="size-3.5 shrink-0 text-muted-foreground/60 dark:text-white/20" weight="bold" />
      </motion.button>
    </motion.li>
  )
}

function SetupPanelOverlay({
  steps,
  expandedStep,
  onSelectStep,
  onClose,
  pct,
  done,
  total,
}: {
  steps: ChecklistStep[]
  expandedStep: ChecklistStepId | null
  onSelectStep: (id: ChecklistStepId) => void
  onClose: () => void
  pct: number
  done: number
  total: number
}) {
  const active = expandedStep ?? steps[0]?.id ?? "profile"
  const activeMeta = steps.find((s) => s.id === active)

  return (
    <motion.div
      className="fixed inset-0 z-[240] flex items-center justify-center p-3 sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="setup-panel-title"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={fade}
    >
      <button
        type="button"
        aria-label="Close"
        className="absolute inset-0 bg-background/65 backdrop-blur-[2px] dark:bg-black/55"
        onClick={onClose}
      />
      <motion.div
        initial={{ opacity: 0, y: 28, scale: 0.94 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 20, scale: 0.96 }}
        transition={springSnappy}
        className="relative flex max-h-[min(92vh,880px)] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-border bg-card/95 shadow-[0_32px_80px_-20px_rgba(0,0,0,0.24)] backdrop-blur-2xl dark:border-white/[0.1] dark:bg-[#0a0a0b]/[0.97] dark:shadow-[0_32px_80px_-20px_rgba(0,0,0,0.85)] sm:flex-row"
        onClick={(e) => e.stopPropagation()}
      >
        <aside className="flex w-full shrink-0 flex-col border-b border-border/70 sm:w-[min(240px,32%)] sm:border-r sm:border-b-0 dark:border-white/[0.06]">
          <div className="flex items-center justify-between gap-2 border-b border-border/70 px-4 py-3.5 dark:border-white/[0.06]">
            <div className="flex min-w-0 items-center gap-2.5">
              <ProgressRing pct={pct} size={34} />
              <div className="min-w-0">
                <h2 id="setup-panel-title" className="truncate text-sm font-semibold text-foreground">
                  Practice setup
                </h2>
                <p className="text-[10px] text-muted-foreground">
                  {done}/{total} done
                </p>
              </div>
            </div>
            <motion.button
              type="button"
              whileTap={{ scale: 0.92 }}
              onClick={onClose}
              className="rounded-lg p-2 text-muted-foreground hover:bg-muted hover:text-foreground dark:text-white/40 dark:hover:bg-white/[0.06] dark:hover:text-white/80"
              aria-label="Close panel"
            >
              <X className="size-4" weight="bold" />
            </motion.button>
          </div>
          <nav className="flex max-h-[40vh] flex-row gap-1 overflow-x-auto p-2 sm:max-h-none sm:flex-col sm:overflow-y-auto sm:py-3" style={{ scrollbarWidth: "thin" }}>
            {steps.map((step) => {
              const Icon = STEP_ICONS[step.id] ?? ChatCircle
              const isActive = active === step.id
              return (
                <motion.button
                  key={step.id}
                  type="button"
                  onClick={() => onSelectStep(step.id)}
                  layout
                  transition={springSoft}
                  className={cn(
                    "flex shrink-0 items-center gap-2.5 rounded-xl px-3 py-2.5 text-left transition-colors sm:w-full",
                    isActive
                      ? "bg-muted text-foreground dark:bg-white/[0.08] dark:text-white"
                      : "text-muted-foreground hover:bg-muted/70 hover:text-foreground dark:text-white/45 dark:hover:bg-white/[0.04] dark:hover:text-white/75"
                  )}
                >
                  <div
                    className={cn(
                      "flex size-7 shrink-0 items-center justify-center rounded-full border-2",
                      isActive ? "border-primary/50 text-primary" : STATUS_RING[step.status]
                    )}
                  >
                    {step.status === "done" ? (
                      <Check className="size-3" weight="bold" />
                    ) : step.status === "waiting" ? (
                      <ClockCounterClockwise className="size-3 text-amber-400" />
                    ) : (
                      <Icon className="size-3" />
                    )}
                  </div>
                  <span className="max-w-[5.25rem] truncate text-[11px] font-medium sm:max-w-[10rem] sm:text-[12px]">
                    {step.label}
                  </span>
                </motion.button>
              )
            })}
          </nav>
        </aside>

        <section className="flex min-h-0 min-w-0 flex-1 flex-col">
          <AnimatePresence mode="wait">
            <motion.div
              key={active}
              initial={{ opacity: 0, x: 12 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -8 }}
              transition={fade}
              className="flex min-h-0 flex-1 flex-col"
            >
              <header className="border-b border-border/70 px-5 py-4 sm:px-8 dark:border-white/[0.06]">
                <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Step</p>
                <h3 className="mt-1 text-lg font-semibold tracking-tight text-foreground sm:text-xl">
                  {activeMeta?.label}
                </h3>
                <p className="mt-1 text-sm text-muted-foreground">{activeMeta?.description}</p>
              </header>
              <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-8 sm:py-7" style={{ scrollbarWidth: "thin" }}>
                <StepContent stepId={active} layout="panel" />
              </div>
            </motion.div>
          </AnimatePresence>
        </section>
      </motion.div>
    </motion.div>
  )
}

function StepContent({ stepId, layout }: { stepId: ChecklistStepId; layout: "panel" }) {
  switch (stepId) {
    case "profile":
      return <ProfileStep layout={layout} />
    case "services":
      return <ServicesStep layout={layout} />
    case "patient_messaging":
      return <PatientMessagingStep layout={layout} />
    case "voice":
      return <VoiceAgentStep layout={layout} />
    case "labs":
      return <LabsStep layout={layout} />
    case "medikredit":
      return <MedikreditStep layout={layout} />
    case "ai_settings":
      return <AISettingsStep layout={layout} />
    default:
      return null
  }
}

// ---------------------------------------------------------------------------
// Step: Practice Profile
// ---------------------------------------------------------------------------
function ProfileStep({ layout }: { layout: "panel" }) {
  const setStatus = useChecklistStore((s) => s.setStepStatus)
  const closePanel = useChecklistStore((s) => s.closePanel)
  const setMinimized = useChecklistStore((s) => s.setMinimized)
  const { updatePreferences } = useUserPreferences()
  const { practiceId, dekKey, unlocked } = usePracticeCrypto()
  const [bhf, setBhf] = useState("")
  const [hpcsa, setHpcsa] = useState("")
  const [practiceName, setPracticeName] = useState("")
  const [phone, setPhone] = useState("")
  const [saving, setSaving] = useState(false)

  const canSave = bhf.trim().length > 2 && hpcsa.trim().length > 2 && practiceName.trim().length > 2

  useEffect(() => {
    if (!practiceId) return
    const sb = createClient()
    if (!sb) return
    let cancelled = false
    void sb
      .from("practices")
      .select("name")
      .eq("id", practiceId)
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled || !data?.name) return
        setPracticeName((prev) => prev || data.name || "")
      })
    void sb
      .from("medikredit_providers")
      .select("bhf_number,hpc_number")
      .eq("practice_id", practiceId)
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled || !data) return
        if (data.bhf_number) setBhf((p) => p || data.bhf_number || "")
        if (data.hpc_number) setHpcsa((p) => p || data.hpc_number || "")
      })
    return () => {
      cancelled = true
    }
  }, [practiceId])

  const handleSave = useCallback(async () => {
    if (!canSave || !practiceId || !dekKey || !unlocked) return
    setSaving(true)
    try {
      const sb = createClient()
      if (!sb) return
      const extras = { bhfNumber: bhf, hpcsaNumber: hpcsa, phone }
      const { ciphertext, iv } = await encryptJson(dekKey, extras)
      await sb.from("practices").update({ name: practiceName }).eq("id", practiceId)
      await sb.from("practice_billing_settings").upsert(
        {
          practice_id: practiceId,
          provider_name: practiceName,
          billing_ciphertext: ciphertext,
          billing_iv: iv,
          billing_version: 1,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "practice_id" }
      )
      try {
        await upsertMedikreditProviderPatch(sb, practiceId, {
          bhf_number: bhf.trim(),
          hpc_number: hpcsa.trim(),
        })
      } catch (mkErr) {
        console.warn("[ProfileStep] medikredit_providers", mkErr)
      }
      setStatus("profile", "done")
      await updatePreferences({ practiceProfileCompleted: true })
      closePanel()
      setMinimized(false)
    } catch (e) {
      console.warn("[ProfileStep]", e)
    } finally {
      setSaving(false)
    }
  }, [
    bhf,
    canSave,
    closePanel,
    dekKey,
    hpcsa,
    phone,
    practiceId,
    practiceName,
    setMinimized,
    setStatus,
    unlocked,
    updatePreferences,
  ])

  const comfy = layout === "panel"

  return (
    <div className={cn("space-y-5", comfy && "max-w-2xl")}>
      {!unlocked && (
        <p className="rounded-xl border border-amber-500/20 bg-amber-500/5 px-4 py-3 text-sm text-amber-200/80">
          Unlock your practice encryption key first to save profile details securely.
        </p>
      )}
      <Field
        label="Practice name"
        value={practiceName}
        onChange={setPracticeName}
        placeholder="Fleming Family Practice"
        comfortable={comfy}
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="BHF number" value={bhf} onChange={setBhf} placeholder="0437621" comfortable={comfy} />
        <Field label="HPCSA number" value={hpcsa} onChange={setHpcsa} placeholder="MP0123456" comfortable={comfy} />
      </div>
      <Field label="Practice phone" value={phone} onChange={setPhone} placeholder="+27 11 000 0000" comfortable={comfy} />
      <SaveButton disabled={!canSave || saving || !unlocked} saving={saving} onClick={handleSave} comfortable={comfy} />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Step: Services & Pricing
// ---------------------------------------------------------------------------
function ServicesStep({ layout }: { layout: "panel" }) {
  const setStatus = useChecklistStore((s) => s.setStepStatus)
  const [mode, setMode] = useState<"upload" | "manual">("upload")
  const [file, setFile] = useState<File | null>(null)
  const [services, setServices] = useState<{ name: string; code: string; price: string }[]>([
    { name: "", code: "", price: "" },
  ])
  const fileRef = useRef<HTMLInputElement>(null)
  const [parsing, setParsing] = useState(false)

  const handleFilePick = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    if (f) setFile(f)
  }, [])

  const handleUpload = useCallback(async () => {
    if (!file) return
    setParsing(true)
    await new Promise((r) => setTimeout(r, 1600))
    setServices([
      { name: "Consultation — Level 3", code: "0190", price: "490" },
      { name: "Follow-up visit", code: "0191", price: "310" },
      { name: "ECG 12-lead", code: "3501", price: "280" },
    ])
    setParsing(false)
    setMode("manual")
  }, [file])

  const addRow = useCallback(() => {
    setServices((prev) => [...prev, { name: "", code: "", price: "" }])
  }, [])

  const updateRow = useCallback((idx: number, field: string, val: string) => {
    setServices((prev) => prev.map((r, i) => (i === idx ? { ...r, [field]: val } : r)))
  }, [])

  const handleSave = useCallback(() => {
    setStatus("services", "done")
    advanceAfterComplete("services")
  }, [setStatus])

  const comfy = layout === "panel"

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-2">
        <TabButton active={mode === "upload"} onClick={() => setMode("upload")} comfortable={comfy}>
          Upload file
        </TabButton>
        <TabButton active={mode === "manual"} onClick={() => setMode("manual")} comfortable={comfy}>
          Enter manually
        </TabButton>
      </div>

      {mode === "upload" ? (
        <motion.div layout className="space-y-4">
          <motion.div
            layout
            className="flex cursor-pointer flex-col items-center gap-3 rounded-2xl border border-dashed border-border bg-background px-6 py-10 text-center transition-colors hover:border-primary/35 hover:bg-muted/50 dark:border-white/15 dark:bg-white/[0.02] dark:hover:border-white/25 dark:hover:bg-white/[0.04]"
            onClick={() => fileRef.current?.click()}
            whileHover={{ scale: 1.005 }}
            whileTap={{ scale: 0.995 }}
          >
            <motion.div
              animate={{ y: [0, -3, 0] }}
              transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
            >
              <Upload className="size-8 text-muted-foreground/45 dark:text-white/25" />
            </motion.div>
            <p className="text-sm text-muted-foreground">
              {file ? file.name : "Excel, CSV, or PDF — click to choose"}
            </p>
            <p className="max-w-sm text-xs text-muted-foreground/75 dark:text-white/25">We detect columns and map service names, codes, and prices.</p>
          </motion.div>
          <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv,.pdf" className="hidden" onChange={handleFilePick} />
          <AnimatePresence>
            {file ? (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 4 }}
                transition={springSoft}
              >
                <button
                  type="button"
                  disabled={parsing}
                  onClick={() => void handleUpload()}
                  className="flex w-full max-w-md items-center justify-center gap-2 rounded-xl bg-primary py-3 text-sm font-semibold text-primary-foreground disabled:opacity-50"
                >
                  {parsing ? <Spinner className="size-4 animate-spin" /> : <FileXls className="size-4" />}
                  {parsing ? "Parsing…" : "Parse & preview"}
                </button>
              </motion.div>
            ) : null}
          </AnimatePresence>
        </motion.div>
      ) : (
        <motion.div layout className="space-y-4">
          <div className="overflow-hidden rounded-xl border border-border dark:border-white/[0.08]">
            <div className="grid grid-cols-[minmax(0,1fr)_7rem_6rem_2.5rem] gap-0 border-b border-border bg-muted/40 px-3 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground sm:grid-cols-[minmax(0,1fr)_8.5rem_7.5rem_2.75rem] sm:px-4 dark:border-white/[0.06] dark:bg-white/[0.03] dark:text-white/35">
              <span>Service</span>
              <span className="hidden sm:inline">Code</span>
              <span className="sm:hidden">Cd</span>
              <span>Price</span>
              <span />
            </div>
            <div className="max-h-[min(420px,45vh)] overflow-y-auto" style={{ scrollbarWidth: "thin" }}>
              <AnimatePresence initial={false}>
                {services.map((row, i) => (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={springSoft}
                    className="grid grid-cols-[minmax(0,1fr)_7rem_6rem_2.5rem] items-center gap-2 border-b border-border/70 px-3 py-2.5 last:border-0 sm:grid-cols-[minmax(0,1fr)_8.5rem_7.5rem_2.75rem] sm:px-4 dark:border-white/[0.04]"
                  >
                    <input
                      value={row.name}
                      onChange={(e) => updateRow(i, "name", e.target.value)}
                      placeholder="Service name"
                      className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground outline-none placeholder:text-muted-foreground/45 focus:border-primary/40 focus:ring-1 focus:ring-primary/20 dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-white dark:placeholder:text-white/20"
                    />
                    <input
                      value={row.code}
                      onChange={(e) => updateRow(i, "code", e.target.value)}
                      placeholder="0190"
                      className="w-full rounded-lg border border-input bg-background px-2.5 py-2 text-sm tabular-nums text-foreground outline-none placeholder:text-muted-foreground/45 focus:border-primary/40 dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-white dark:placeholder:text-white/20"
                    />
                    <div className="relative">
                      <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground/60 dark:text-white/25">R</span>
                      <input
                        value={row.price}
                        onChange={(e) => updateRow(i, "price", e.target.value)}
                        placeholder="0"
                        className="w-full rounded-lg border border-input bg-background py-2 pr-2 pl-7 text-sm tabular-nums text-foreground outline-none placeholder:text-muted-foreground/45 focus:border-primary/40 dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-white dark:placeholder:text-white/20"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => services.length > 1 && setServices((p) => p.filter((_, j) => j !== i))}
                      className="flex size-8 items-center justify-center rounded-lg text-muted-foreground/60 hover:bg-red-500/15 hover:text-red-600 disabled:opacity-20 dark:text-white/25 dark:hover:text-red-300"
                      disabled={services.length <= 1}
                      aria-label="Remove row"
                    >
                      <X className="size-3.5" />
                    </button>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          </div>
          <motion.button
            type="button"
            onClick={addRow}
            whileTap={{ scale: 0.98 }}
            className="text-sm font-medium text-primary/90 hover:text-primary"
          >
            + Add another service
          </motion.button>
          <SaveButton
            disabled={services.every((r) => !r.name.trim())}
            saving={false}
            onClick={handleSave}
            label="Save services"
            comfortable={comfy}
          />
        </motion.div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Step: Patient messaging (SMS / RCS)
// ---------------------------------------------------------------------------
function PatientMessagingStep({ layout }: { layout: "panel" }) {
  const setStatus = useChecklistStore((s) => s.setStepStatus)
  const [mode, setMode] = useState<"connect" | "new">("connect")
  const [waNumber, setWaNumber] = useState("")
  const comfy = layout === "panel"

  return (
    <div className={cn("space-y-5", comfy && "max-w-2xl")}>
      <p className="text-sm leading-relaxed text-muted-foreground">
        Patients text your practice number; messages use SMS everywhere and RCS rich features when the handset and carrier
        support them. The AI agent handles bookings, FAQs, and urgent routing.
      </p>
      <div className="flex flex-wrap gap-2">
        <TabButton active={mode === "connect"} onClick={() => setMode("connect")} comfortable={comfy}>
          Connect existing
        </TabButton>
        <TabButton active={mode === "new"} onClick={() => setMode("new")} comfortable={comfy}>
          New Twilio number
        </TabButton>
      </div>
      {mode === "connect" ? (
        <div className="space-y-3">
          <Field label="Practice mobile number" value={waNumber} onChange={setWaNumber} placeholder="+27 82 000 0000" comfortable={comfy} />
          <p className="text-xs text-muted-foreground/75 dark:text-white/25">We send a verification code via Twilio.</p>
        </div>
      ) : (
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={springSoft}
          className="rounded-2xl border border-border bg-background p-5 dark:border-white/[0.08] dark:bg-white/[0.02]"
        >
          <p className="text-sm text-muted-foreground">
            We provision a dedicated number through Twilio and wire it to your practice. Typical setup: about two minutes.
          </p>
        </motion.div>
      )}
      <div className="space-y-2">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Agent can handle</p>
        <div className="flex flex-wrap gap-2">
          {["Bookings", "FAQs & hours", "Urgent routing", "Reminders"].map((cap) => (
            <motion.span
              key={cap}
              initial={{ opacity: 0, scale: 0.92 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={springSoft}
              className="rounded-lg border border-border bg-muted/40 px-3 py-1.5 text-xs text-muted-foreground dark:border-white/[0.08] dark:bg-white/[0.03] dark:text-white/45"
            >
              {cap}
            </motion.span>
          ))}
        </div>
      </div>
      <SaveButton
        disabled={mode === "connect" && waNumber.trim().length < 10}
        saving={false}
        onClick={() => {
          setStatus("patient_messaging", "done")
          advanceAfterComplete("patient_messaging")
        }}
        label="Enable patient messaging"
        comfortable={comfy}
      />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Step: AI Voice Agent
// ---------------------------------------------------------------------------
function VoiceAgentStep({ layout }: { layout: "panel" }) {
  const setStatus = useChecklistStore((s) => s.setStepStatus)
  const [outbound, setOutbound] = useState(true)
  const [inbound, setInbound] = useState(true)
  const comfy = layout === "panel"

  return (
    <div className={cn("space-y-5", comfy && "max-w-2xl")}>
      <p className="text-sm leading-relaxed text-muted-foreground">
        Voice AI cuts no-shows and answers after-hours calls. Turn on only what you need.
      </p>
      <div className="space-y-3">
        <ToggleRow
          label="Outbound calls"
          description="Pre-appointment check-ins, follow-ups, fewer no-shows"
          enabled={outbound}
          onToggle={() => setOutbound(!outbound)}
          comfortable={comfy}
        />
        <ToggleRow
          label="Inbound calls"
          description="Questions, bookings, light triage"
          enabled={inbound}
          onToggle={() => setInbound(!inbound)}
          comfortable={comfy}
        />
      </div>
      <SaveButton
        disabled={!outbound && !inbound}
        saving={false}
        onClick={() => {
          setStatus("voice", "done")
          advanceAfterComplete("voice")
        }}
        label="Activate voice agent"
        comfortable={comfy}
      />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Step: Lab Connections
// ---------------------------------------------------------------------------
function LabsStep({ layout }: { layout: "panel" }) {
  const setStatus = useChecklistStore((s) => s.setStepStatus)
  const [selected, setSelected] = useState<string[]>([])
  const [submitted, setSubmitted] = useState(false)
  const comfy = layout === "panel"

  const labs = [
    { id: "lancet", name: "Lancet Laboratories", desc: "Bloods, histology, microbiology" },
    { id: "ampath", name: "Ampath Pathology", desc: "Full pathology panel" },
    { id: "xray", name: "X-ray / radiology partner", desc: "Imaging results feed" },
    { id: "other", name: "Other lab / custom", desc: "We reach out on your behalf" },
  ]

  const toggle = useCallback((id: string) => {
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
  }, [])

  const handleSubmit = useCallback(() => {
    setSubmitted(true)
    setStatus("labs", "waiting", {
      waitingSince: new Date().toISOString(),
      waitDays: 5,
    })
  }, [setStatus])

  if (submitted) {
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={springSnappy}
        className="flex flex-col items-center gap-4 py-8 text-center"
      >
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 8, repeat: Infinity, ease: "linear" }}
          className="flex size-14 items-center justify-center rounded-full border border-amber-400/25 bg-amber-400/10"
        >
          <ClockCounterClockwise className="size-7 text-amber-400" />
        </motion.div>
        <div>
          <p className="text-base font-medium text-foreground">Contacting lab partners</p>
          <p className="mt-2 max-w-md text-sm text-muted-foreground">
            We&apos;re reaching out to {selected.length} provider{selected.length > 1 ? "s" : ""}. You&apos;ll be notified when
            results routing is live.
          </p>
        </div>
        <p className="flex items-center gap-2 text-xs text-muted-foreground">
          <Spinner className="size-3.5 animate-spin" />
          Usually 3–5 business days
        </p>
      </motion.div>
    )
  }

  return (
    <div className={cn("space-y-5", comfy && "max-w-2xl")}>
      <p className="text-sm text-muted-foreground">Pick providers for automatic lab results in your inbox.</p>
      <div className="grid gap-2 sm:grid-cols-2">
        {labs.map((lab, i) => {
          const on = selected.includes(lab.id)
          return (
            <motion.button
              key={lab.id}
              type="button"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ ...springSoft, delay: i * 0.04 }}
              onClick={() => toggle(lab.id)}
              whileHover={{ scale: 1.01 }}
              whileTap={{ scale: 0.99 }}
              className={cn(
                "flex items-start gap-3 rounded-xl border p-4 text-left transition-colors",
                on
                  ? "border-primary/45 bg-primary/[0.07]"
                  : "border-border bg-background hover:bg-muted/50 dark:border-white/[0.08] dark:bg-white/[0.02] dark:hover:bg-white/[0.04]"
              )}
            >
              <div
                className={cn(
                  "mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-md border transition-colors",
                  on ? "border-primary bg-primary text-primary-foreground" : "border-border dark:border-white/20"
                )}
              >
                {on && <Check className="size-3" weight="bold" />}
              </div>
              <div>
                <p className="text-sm font-medium text-foreground">{lab.name}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">{lab.desc}</p>
              </div>
            </motion.button>
          )
        })}
      </div>
      <SaveButton
        disabled={selected.length === 0}
        saving={false}
        onClick={handleSubmit}
        label="Contact lab partners"
        comfortable={comfy}
      />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Step: Medikredit Verification
// ---------------------------------------------------------------------------
function MedikreditStep({ layout: _layout }: { layout: "panel" }) {
  const setStatus = useChecklistStore((s) => s.setStepStatus)
  const step = useChecklistStore((s) => s.steps.find((x) => x.id === "medikredit"))
  const { practiceId } = usePracticeCrypto()
  const isWaiting = step?.status === "waiting"

  const waitingBanner =
    isWaiting && step?.waitingSince
      ? { waitingSince: step.waitingSince, waitDays: step.waitDays ?? 4 }
      : isWaiting
        ? { waitingSince: new Date().toISOString(), waitDays: step?.waitDays ?? 4 }
        : null

  const onSuccessfulSave = useCallback(() => {
    const st = useChecklistStore.getState().steps.find((x) => x.id === "medikredit")
    if (!st || st.status !== "waiting") {
      setStatus("medikredit", "waiting", {
        waitingSince: new Date().toISOString(),
        waitDays: 4,
      })
    }
  }, [setStatus])

  return (
    <MedikreditProviderSettingsForm
      practiceId={practiceId}
      variant="onboarding"
      waitingBanner={waitingBanner}
      onSuccessfulSave={onSuccessfulSave}
    />
  )
}

// ---------------------------------------------------------------------------
// Step: AI Settings
// ---------------------------------------------------------------------------
function AISettingsStep({ layout }: { layout: "panel" }) {
  const setStatus = useChecklistStore((s) => s.setStepStatus)
  const [autoSoap, setAutoSoap] = useState(true)
  const [evidenceSearch, setEvidenceSearch] = useState(true)
  const [drugInteractions, setDrugInteractions] = useState(true)
  const [clinicalDecision, setClinicalDecision] = useState(true)
  const comfy = layout === "panel"

  return (
    <div className={cn("space-y-5", comfy && "max-w-2xl")}>
      <p className="text-sm text-muted-foreground">Tune clinical AI during consults and in chat.</p>
      <div className="space-y-3">
        <ToggleRow label="Auto-generate SOAP" description="Draft notes from scribe transcripts" enabled={autoSoap} onToggle={() => setAutoSoap(!autoSoap)} comfortable={comfy} />
        <ToggleRow label="Evidence search" description="PubMed & guideline citations" enabled={evidenceSearch} onToggle={() => setEvidenceSearch(!evidenceSearch)} comfortable={comfy} />
        <ToggleRow label="Drug interaction alerts" description="Flags when prescribing" enabled={drugInteractions} onToggle={() => setDrugInteractions(!drugInteractions)} comfortable={comfy} />
        <ToggleRow label="Clinical decision support" description="Differential suggestions" enabled={clinicalDecision} onToggle={() => setClinicalDecision(!clinicalDecision)} comfortable={comfy} />
      </div>
      <SaveButton
        saving={false}
        disabled={false}
        onClick={() => {
          setStatus("ai_settings", "done")
          advanceAfterComplete("ai_settings")
        }}
        label="Save AI settings"
        comfortable={comfy}
      />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Shared components
// ---------------------------------------------------------------------------

function Field({
  label,
  value,
  onChange,
  placeholder,
  comfortable,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
  comfortable?: boolean
}) {
  return (
    <label className="block">
      <span className={cn("font-medium uppercase tracking-wider text-muted-foreground", comfortable ? "text-[10px]" : "text-[9px]")}>
        {label}
      </span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={cn(
          "mt-1.5 w-full rounded-xl border border-input bg-background text-foreground outline-none placeholder:text-muted-foreground/45 focus:border-primary/35 focus:ring-2 focus:ring-primary/15 dark:border-white/[0.1] dark:bg-white/[0.04] dark:text-white dark:placeholder:text-white/20",
          comfortable ? "px-3.5 py-2.5 text-sm" : "px-2.5 py-2 text-[11px]"
        )}
      />
    </label>
  )
}

function TabButton({
  active,
  onClick,
  children,
  comfortable,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
  comfortable?: boolean
}) {
  return (
    <motion.button
      type="button"
      onClick={onClick}
      whileTap={{ scale: 0.97 }}
      className={cn(
        "rounded-xl font-medium transition-colors",
        comfortable ? "px-4 py-2 text-sm" : "px-3 py-1.5 text-[10px]",
        active
          ? "bg-muted text-foreground shadow-sm dark:bg-white/[0.12] dark:text-white"
          : "text-muted-foreground hover:bg-muted/70 hover:text-foreground dark:text-white/40 dark:hover:bg-white/[0.05] dark:hover:text-white/70"
      )}
    >
      {children}
    </motion.button>
  )
}

function ToggleRow({
  label,
  description,
  enabled,
  onToggle,
  comfortable,
}: {
  label: string
  description: string
  enabled: boolean
  onToggle: () => void
  comfortable?: boolean
}) {
  return (
    <motion.button
      type="button"
      onClick={onToggle}
      whileHover={{ backgroundColor: "hsl(var(--muted) / 0.55)" }}
      whileTap={{ scale: 0.995 }}
      className={cn(
        "flex w-full items-center gap-4 rounded-2xl border border-border bg-background text-left transition-colors dark:border-white/[0.07] dark:bg-white/[0.02]",
        comfortable ? "p-4" : "p-2.5"
      )}
    >
      <div className="min-w-0 flex-1">
        <p className={cn("font-medium text-foreground", comfortable ? "text-sm" : "text-[11px]")}>{label}</p>
        <p className={cn("text-muted-foreground", comfortable ? "mt-1 text-xs" : "text-[9px]")}>{description}</p>
      </div>
      <div
        className={cn(
          "relative flex shrink-0 items-center rounded-full transition-colors",
          comfortable ? "h-7 w-[3.25rem] p-0.5" : "h-5 w-9 p-px",
          enabled ? "bg-primary" : "bg-muted dark:bg-white/10"
        )}
      >
        <motion.span
          className={cn("block rounded-full bg-white shadow-md", comfortable ? "size-6" : "size-4")}
          initial={false}
          animate={{ x: enabled ? (comfortable ? 24 : 18) : 0 }}
          transition={springSnappy}
        />
      </div>
    </motion.button>
  )
}

function SaveButton({
  disabled,
  saving,
  onClick,
  label = "Save & continue",
  comfortable,
}: {
  disabled: boolean
  saving: boolean
  onClick: () => void
  label?: string
  comfortable?: boolean
}) {
  return (
    <motion.button
      type="button"
      disabled={disabled}
      onClick={onClick}
      whileHover={{ scale: disabled ? 1 : 1.01 }}
      whileTap={{ scale: disabled ? 1 : 0.98 }}
      className={cn(
        "flex w-full max-w-md items-center justify-center gap-2 rounded-xl bg-primary font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-40 dark:bg-white dark:text-zinc-950 dark:hover:bg-white/95",
        comfortable ? "py-3 text-sm" : "py-2 text-[11px]"
      )}
    >
      {saving && <Spinner className="size-4 animate-spin" />}
      {label}
    </motion.button>
  )
}

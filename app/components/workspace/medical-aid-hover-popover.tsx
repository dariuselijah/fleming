"use client"

import { useCallback, useMemo, useState } from "react"
import { motion, AnimatePresence } from "motion/react"
import {
  CheckCircle,
  CreditCard,
  ShieldCheck,
  SpinnerGap,
  User,
  Users,
  WarningCircle,
  XCircle,
} from "@phosphor-icons/react"
import { useWorkspace, useWorkspaceStore } from "@/lib/clinical-workspace"
import { usePracticeCrypto } from "@/lib/clinical-workspace/practice-crypto-context"
import { practicePatientToMedikreditPayload } from "@/lib/clinical-workspace/medikredit-claim-from-session"
import { useEligibilityCheck } from "@/lib/hooks/use-eligibility-check"
import type { EligibilityResponse, FamilyEligibilityResponse, FamilyDependentRow } from "@/lib/medikredit/types"
import { cn } from "@/lib/utils"
import { toast } from "sonner"

function sessionMedicalAidFromPractice(
  m: "verified" | "pending" | "terminated" | "unknown"
): "active" | "inactive" | "pending" | "unknown" {
  if (m === "verified") return "active"
  if (m === "pending") return "pending"
  if (m === "terminated") return "inactive"
  return "unknown"
}

const STATUS_META = {
  active: {
    label: "Active",
    headline: "Active medical aid plan",
    chip: "border-emerald-500/25 bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
    card: "border-emerald-500/20 bg-gradient-to-br from-emerald-500/[0.12] to-emerald-500/[0.04]",
    icon: CheckCircle,
    iconClass: "text-emerald-500",
  },
  pending: {
    label: "Pending",
    headline: "Verification pending",
    chip: "border-amber-500/25 bg-amber-500/15 text-amber-700 dark:text-amber-400",
    card: "border-amber-500/20 bg-gradient-to-br from-amber-500/[0.12] to-amber-500/[0.04]",
    icon: WarningCircle,
    iconClass: "text-amber-500",
  },
  inactive: {
    label: "Inactive",
    headline: "Medical aid inactive",
    chip: "border-red-500/25 bg-red-500/15 text-red-700 dark:text-red-400",
    card: "border-red-500/20 bg-gradient-to-br from-red-500/[0.10] to-red-500/[0.03]",
    icon: XCircle,
    iconClass: "text-red-500",
  },
  unknown: {
    label: "Unknown",
    headline: "Medical aid on file",
    chip: "border-border bg-muted text-muted-foreground",
    card: "border-border/60 bg-muted/30",
    icon: ShieldCheck,
    iconClass: "text-muted-foreground",
  },
} as const

function ResultPulse({ ok }: { ok: boolean | null }) {
  if (ok === null) {
    return <SpinnerGap className="size-4 shrink-0 animate-spin text-muted-foreground" />
  }
  return ok ? (
    <motion.span
      initial={{ scale: 0.5, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ type: "spring", stiffness: 520, damping: 22 }}
    >
      <CheckCircle className="size-4 shrink-0 text-emerald-500" weight="fill" />
    </motion.span>
  ) : (
    <motion.span
      initial={{ scale: 0.5, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ type: "spring", stiffness: 520, damping: 22 }}
    >
      <XCircle className="size-4 shrink-0 text-rose-500" weight="fill" />
    </motion.span>
  )
}

function DependentRow({ dep }: { dep: FamilyDependentRow }) {
  const name =
    dep.name?.trim() ||
    [dep.firstNames, dep.surname].filter(Boolean).join(" ").trim() ||
    "Dependant"
  return (
    <div className="flex items-start gap-2 rounded-lg bg-background/60 px-2.5 py-2">
      <User className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-[11px] font-medium text-foreground">{name}</p>
        <p className="truncate text-[10px] text-muted-foreground">
          {[dep.relationshipLabel, dep.planDescription, dep.dep_cd ? `#${dep.dep_cd}` : ""]
            .filter(Boolean)
            .join(" · ") || "On scheme"}
        </p>
      </div>
    </div>
  )
}

export function MedicalAidHoverPopover({
  patientId,
  status,
  scheme,
  memberNumber,
}: {
  patientId: string
  status: "active" | "inactive" | "pending" | "unknown" | undefined
  scheme?: string
  memberNumber?: string
}) {
  const { updatePatient } = useWorkspace()
  const { practiceId } = usePracticeCrypto()
  const { loading, runEligibility, runFamily } = useEligibilityCheck({ practiceId })
  const [open, setOpen] = useState(false)
  const [elig, setElig] = useState<EligibilityResponse | null>(null)
  const [fam, setFam] = useState<FamilyEligibilityResponse | null>(null)
  const [ran, setRan] = useState(false)

  const practicePatient = useWorkspaceStore((s) => s.patients.find((p) => p.id === patientId))

  const label = status ?? "unknown"
  const meta = STATUS_META[label]
  const StatusIcon = meta.icon

  const planLabel = useMemo(() => {
    if (elig?.planDescription?.trim()) return elig.planDescription.trim()
    if (practicePatient?.medicalAidPlan?.trim()) return practicePatient.medicalAidPlan.trim()
    return null
  }, [elig?.planDescription, practicePatient?.medicalAidPlan])

  const schemeLabel =
    scheme?.trim() ||
    practicePatient?.medicalAidScheme?.trim() ||
    practicePatient?.medicalAidSchemeCode?.trim() ||
    null

  const memberLabel = memberNumber?.trim() || practicePatient?.memberNumber?.trim() || null

  const canCheck = Boolean(memberLabel && (schemeLabel || practicePatient?.medicalAidSchemeCode?.trim()))

  const runChecks = useCallback(async () => {
    const pp = useWorkspaceStore.getState().patients.find((p) => p.id === patientId)
    if (!pp?.memberNumber?.trim() || !pp.medicalAidScheme?.trim()) {
      toast.error("Medical aid details missing", {
        description: "Add scheme and member number in the patient chart first.",
      })
      return
    }
    setRan(true)
    setElig(null)
    setFam(null)
    const payload = practicePatientToMedikreditPayload(pp)
    const [elRes, famRes] = await Promise.all([
      runEligibility(payload, true),
      runFamily(payload, undefined, true),
    ])
    setElig(elRes)
    setFam(famRes)

    if (elRes?.status === "eligible" && elRes.ok) {
      const patch = {
        medicalAidStatus: "verified" as const,
        medicalAidPlan: elRes.planDescription ?? pp.medicalAidPlan,
      }
      updatePatient(patientId, patch)
      useWorkspaceStore.setState((s) => ({
        openPatients: s.openPatients.map((p) =>
          p.patientId === patientId
            ? { ...p, medicalAidStatus: sessionMedicalAidFromPractice("verified") }
            : p
        ),
      }))
    }
  }, [patientId, runEligibility, runFamily, updatePatient])

  const eligOk = Boolean(elig?.ok && elig.status === "eligible")
  const famOk = Boolean(fam?.ok)

  return (
    <div
      className="relative"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        type="button"
        className={cn(
          "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider transition-colors hover:ring-1 hover:ring-border/60",
          meta.chip
        )}
      >
        <ShieldCheck className="size-2.5" weight="fill" />
        {meta.label}
      </button>

      <AnimatePresence>
        {open ? (
          <motion.div
            initial={{ opacity: 0, y: 6, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 6, scale: 0.97 }}
            transition={{ duration: 0.16, ease: [0.22, 1, 0.36, 1] }}
            className="absolute left-0 top-full z-[115] mt-2 w-[280px] overflow-hidden rounded-2xl border border-border/70 bg-card/95 shadow-2xl shadow-black/10 ring-1 ring-black/[0.04] backdrop-blur-xl dark:shadow-black/40 dark:ring-white/[0.06]"
          >
            <div className={cn("border-b border-border/40 px-3.5 py-3", meta.card)}>
              <div className="flex items-start gap-2.5">
                <StatusIcon className={cn("mt-0.5 size-4 shrink-0", meta.iconClass)} weight="fill" />
                <div className="min-w-0 flex-1">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                    {meta.headline}
                  </p>
                  {schemeLabel ? (
                    <p className="mt-0.5 truncate text-[13px] font-semibold tracking-tight text-foreground">
                      {schemeLabel}
                    </p>
                  ) : (
                    <p className="mt-0.5 text-[12px] text-muted-foreground">No scheme on file</p>
                  )}
                  {planLabel ? (
                    <p className="mt-0.5 truncate text-[11px] text-foreground/75">{planLabel}</p>
                  ) : null}
                </div>
              </div>
              {memberLabel ? (
                <div className="mt-2.5 flex items-center gap-1.5 rounded-lg bg-background/50 px-2 py-1.5">
                  <CreditCard className="size-3 shrink-0 text-muted-foreground" />
                  <span className="truncate font-mono text-[10px] text-muted-foreground">
                    Member {memberLabel}
                  </span>
                </div>
              ) : null}
            </div>

            <div className="space-y-2 p-3">
              {ran || loading ? (
                <>
                  <div
                    className={cn(
                      "rounded-xl border px-3 py-2.5 transition-colors",
                      eligOk
                        ? "border-emerald-500/25 bg-emerald-500/[0.06]"
                        : elig && !eligOk
                          ? "border-rose-500/25 bg-rose-500/[0.06]"
                          : "border-border/50 bg-muted/20"
                    )}
                  >
                    <div className="flex items-center gap-2">
                      <ResultPulse ok={loading && !elig ? null : elig ? eligOk : null} />
                      <div className="min-w-0 flex-1">
                        <p className="text-[11px] font-semibold text-foreground">Eligibility</p>
                        <p className="truncate text-[10px] text-muted-foreground">
                          {loading && !elig
                            ? "Checking with scheme…"
                            : elig?.planDescription ||
                              elig?.responseMessage ||
                              elig?.rejectionDescription ||
                              (eligOk ? "Member eligible" : "Not eligible")}
                        </p>
                      </div>
                    </div>
                  </div>

                  <div
                    className={cn(
                      "rounded-xl border px-3 py-2.5 transition-colors",
                      famOk
                        ? "border-emerald-500/25 bg-emerald-500/[0.06]"
                        : fam && !famOk
                          ? "border-rose-500/25 bg-rose-500/[0.06]"
                          : "border-border/50 bg-muted/20"
                    )}
                  >
                    <div className="flex items-center gap-2">
                      <ResultPulse ok={loading && !fam ? null : fam ? famOk : null} />
                      <div className="min-w-0 flex-1">
                        <p className="flex items-center gap-1 text-[11px] font-semibold text-foreground">
                          <Users className="size-3" />
                          Famcheck
                        </p>
                        <p className="text-[10px] text-muted-foreground">
                          {loading && !fam
                            ? "Loading dependants…"
                            : fam?.dependents?.length
                              ? `${fam.dependents.length} dependant${fam.dependents.length === 1 ? "" : "s"} on file`
                              : famOk
                                ? "No dependants returned"
                                : "Could not load household"}
                        </p>
                      </div>
                    </div>
                    {fam?.dependents && fam.dependents.length > 0 ? (
                      <div className="mt-2 max-h-[140px] space-y-1 overflow-y-auto pr-0.5">
                        {fam.dependents.slice(0, 6).map((dep, i) => (
                          <DependentRow key={`${dep.dep_cd ?? dep.id_nbr ?? i}`} dep={dep} />
                        ))}
                      </div>
                    ) : null}
                  </div>
                </>
              ) : (
                <p className="text-[10px] leading-relaxed text-muted-foreground">
                  Run a live check against MediKredit to confirm eligibility and household dependants.
                </p>
              )}

              <button
                type="button"
                disabled={loading || !canCheck}
                onClick={() => void runChecks()}
                className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-foreground px-3 py-2 text-[11px] font-semibold text-background transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-45"
              >
                {loading ? (
                  <>
                    <SpinnerGap className="size-3.5 animate-spin" />
                    Checking…
                  </>
                ) : ran ? (
                  "Re-run eligibility + famcheck"
                ) : (
                  "Run eligibility + famcheck"
                )}
              </button>
              {!canCheck ? (
                <p className="text-center text-[9px] text-muted-foreground">
                  Add scheme and member number to enable checks
                </p>
              ) : null}
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  )
}

"use client"

import type { PracticePatient } from "@/lib/clinical-workspace"
import { usePatientAiSummary, usePatientOverview } from "@/lib/patient/use-patient-overview"
import { BentoTile } from "./bento-tile"
import { X, Sparkle, Stethoscope, FolderOpen, Phone, ChatCircle } from "@phosphor-icons/react"

/**
 * Compact right-column patient glance. The full chart is rendered only in the
 * file panel so selecting a row does not duplicate overview/AI work.
 */
export function PatientDetailPanel({
  patient,
  onClose,
  onNewVisit,
  onContinueDraft,
  onScribe,
  onOpenFile,
}: {
  patient: PracticePatient
  onClose: () => void
  onNewVisit: () => void
  onContinueDraft?: () => void
  onScribe: () => void
  onOpenFile: () => void
}) {
  const overviewQuery = usePatientOverview(patient.id)
  const overview = overviewQuery.data ?? null
  const summaryQuery = usePatientAiSummary(patient.id)
  const summary = summaryQuery.data ?? null
  const rollup = summary?.rollup ?? null
  const idHint = patient.idNumber
    ? `•••• ${patient.idNumber.replace(/\D/g, "").slice(-4)}`
    : patient.dateOfBirth ?? "—"
  const alerts = [
    ...(patient.allergies ?? []).slice(0, 2).map((label) => ({ label, tone: "rose" as const })),
    ...(patient.chronicConditions ?? []).slice(0, 2).map((label) => ({ label, tone: "emerald" as const })),
  ]

  return (
    <div className="flex max-h-[min(85vh,900px)] flex-col gap-3 overflow-hidden">
      <BentoTile
        title={patient.name}
        subtitle={`ID ${idHint} · ${patient.sex ?? "?"} · ${patient.age ?? "—"}y`}
        icon={<Sparkle className="size-4" />}
        action={
          <button
            type="button"
            onClick={onClose}
            aria-label="Close patient glance"
            className="shrink-0 rounded-lg p-1 text-muted-foreground hover:bg-secondary hover:text-accent-foreground/70"
          >
            <X className="size-4" />
          </button>
        }
        className="min-h-0 flex-1 overflow-hidden"
      >
        <div className="space-y-4">
          <div className="rounded-2xl border border-panel-border bg-panel-muted p-3">
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Patient glance</p>
            <div className="mt-2 grid grid-cols-3 gap-2 text-center">
              <div className="rounded-xl bg-panel-muted px-2 py-2">
                <p className="text-[9px] uppercase tracking-wider text-muted-foreground">Age</p>
                <p className="text-sm font-semibold text-foreground/85">{patient.age ?? "—"}</p>
              </div>
              <div className="rounded-xl bg-panel-muted px-2 py-2">
                <p className="text-[9px] uppercase tracking-wider text-muted-foreground">Sex</p>
                <p className="text-sm font-semibold text-foreground/85">{patient.sex ?? "—"}</p>
              </div>
              <div className="rounded-xl bg-panel-muted px-2 py-2">
                <p className="text-[9px] uppercase tracking-wider text-muted-foreground">Balance</p>
                <p className="text-sm font-semibold text-foreground/85">
                  {patient.outstandingBalance > 0 ? `R${patient.outstandingBalance.toLocaleString()}` : "—"}
                </p>
              </div>
            </div>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {patient.medicalAidScheme ? (
                <span className="rounded-full bg-secondary px-2 py-0.5 text-[10px] text-muted-foreground/75">{patient.medicalAidScheme}</span>
              ) : null}
              {alerts.map((a) => (
                <span
                  key={`${a.tone}-${a.label}`}
                  className={
                    a.tone === "rose"
                      ? "rounded-full bg-rose-500/10 px-2 py-0.5 text-[10px] text-rose-300/90"
                      : "rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] text-emerald-300/90"
                  }
                >
                  {a.label}
                </span>
              ))}
              {alerts.length === 0 && !patient.medicalAidScheme ? (
                <span className="text-[11px] text-muted-foreground">No key alerts captured yet.</span>
              ) : null}
            </div>
          </div>

          <section className="rounded-2xl border border-violet-400/12 bg-gradient-to-b from-violet-500/[0.07] to-panel-muted p-3">
            <div className="flex items-center gap-1.5">
              <Sparkle className="size-3.5 text-violet-200/80" />
              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-violet-200/85">AI context</p>
            </div>
            {overviewQuery.isLoading ? (
              <p className="mt-2 text-[11px] text-muted-foreground">Loading chart context…</p>
            ) : !overview?.summaryCount ? (
              <p className="mt-2 text-[11px] text-muted-foreground">No signed visit summaries yet.</p>
            ) : (
              <>
                <p className="mt-2 text-[12px] leading-relaxed text-foreground/85">
                  {summaryQuery.isFetching && !rollup
                    ? "Preparing cached patient context…"
                    : rollup || overview.aiContext.latestSummaryText || "Context unavailable."}
                </p>
                {overview.aiContext.latestChiefComplaint ? (
                  <p className="mt-2 text-[11px] text-violet-200/80">{overview.aiContext.latestChiefComplaint}</p>
                ) : null}
              </>
            )}
          </section>

          <div className="grid grid-cols-2 gap-2">
            {onContinueDraft ? (
              <button
                type="button"
                onClick={onContinueDraft}
                className="col-span-2 inline-flex items-center justify-center gap-1.5 rounded-xl border border-amber-500/25 bg-amber-500/10 px-3 py-2 text-[11px] font-medium text-amber-200 hover:bg-amber-500/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <Stethoscope className="size-3.5" />
                Continue draft visit
              </button>
            ) : null}
            <button
              type="button"
              onClick={onOpenFile}
              className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-secondary px-3 py-2 text-[11px] font-medium text-foreground/80 hover:bg-secondary"
            >
              <FolderOpen className="size-3.5" />
              Open file
            </button>
            <button
              type="button"
              onClick={onNewVisit}
              className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-sky-500/10 px-3 py-2 text-[11px] font-medium text-sky-200 hover:bg-sky-500/15"
            >
              <Stethoscope className="size-3.5" />
              New visit
            </button>
            <button
              type="button"
              onClick={onScribe}
              className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-emerald-500/10 px-3 py-2 text-[11px] font-medium text-emerald-200 hover:bg-emerald-500/15"
            >
              <Sparkle className="size-3.5" />
              Scribe
            </button>
            {patient.phone ? (
              <a
                href={`tel:${patient.phone}`}
                className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-secondary px-3 py-2 text-[11px] font-medium text-foreground/70 hover:bg-secondary"
              >
                <Phone className="size-3.5" />
                Call
              </a>
            ) : (
              <span className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-panel-muted px-3 py-2 text-[11px] text-muted-foreground">
                <ChatCircle className="size-3.5" />
                No phone
              </span>
            )}
          </div>
        </div>
      </BentoTile>
    </div>
  )
}

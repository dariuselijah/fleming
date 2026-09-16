"use client"

import { UserPlus } from "@phosphor-icons/react"
import { cn } from "@/lib/utils"
import { panelSurface } from "@/lib/theme/surfaces"
import type { FamilyDependentRow } from "@/lib/medikredit/types"
import { formatMedikreditYmd, medikreditFamilyRowToPrefill } from "@/lib/medikredit/family-prefill"
import type { PatientRegistrationPrefill } from "@/lib/clinical/smart-import-patient"

export type EligibilityUiPayload = {
  status?: string
  planDescription?: string
  responseMessage?: string
  responseCode?: string
  res?: string
  rejectionDescription?: string
}

export function EligibilityCheckCard({
  patientName,
  eligibility,
  error,
}: {
  patientName: string
  eligibility?: EligibilityUiPayload
  error?: string
}) {
  if (error) {
    return (
      <div className="rounded-2xl border border-status-danger/25 bg-status-danger/[0.08] px-3.5 py-3 text-[12px] text-status-danger-foreground dark:text-status-danger">
        <p className="font-medium">Eligibility</p>
        <p className="mt-1 text-[11px] text-muted-foreground">{error}</p>
      </div>
    )
  }
  if (!eligibility) return null
  const st = eligibility.status ?? "unknown"
  const okish = st === "eligible" || st === "pending"
  return (
    <div
      className={cn(
        "rounded-2xl border px-3.5 py-3",
        okish
          ? "border-status-success/25 bg-status-success/[0.08]"
          : "border-panel-border bg-panel"
      )}
    >
      <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground">MediKredit · Eligibility</p>
      <p className="mt-1 text-[12px] font-semibold text-foreground/90">{patientName}</p>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <span
          className={cn(
            "rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
            okish
              ? "bg-status-success/20 text-status-success-foreground dark:text-status-success"
              : "bg-muted text-muted-foreground"
          )}
        >
          {st.replace(/_/g, " ")}
        </span>
        {eligibility.planDescription ? (
          <span className="text-[11px] text-foreground/75">{eligibility.planDescription}</span>
        ) : null}
      </div>
      {eligibility.responseMessage ? (
        <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">{eligibility.responseMessage}</p>
      ) : null}
      {eligibility.rejectionDescription ? (
        <p className="mt-1 text-[11px] text-status-warning-foreground dark:text-status-warning">{eligibility.rejectionDescription}</p>
      ) : null}
    </div>
  )
}

export function FamilyCheckCard({
  patientName,
  principal,
  dependents,
  error,
  onAddDependent,
}: {
  patientName: string
  principal: {
    name?: string
    scheme?: string
    schemeCode?: string
    memberNumber?: string
    mainMemberName?: string
  }
  dependents: FamilyDependentRow[]
  error?: string
  onAddDependent: (prefill: PatientRegistrationPrefill) => void
}) {
  if (error) {
    return (
      <div className="rounded-2xl border border-status-danger/25 bg-status-danger/[0.08] px-3.5 py-3 text-[12px] text-status-danger-foreground dark:text-status-danger">
        <p className="font-medium">Family check</p>
        <p className="mt-1 text-[11px] text-muted-foreground">{error}</p>
      </div>
    )
  }
  const ctx = {
    scheme: principal.scheme,
    schemeCode: principal.schemeCode,
    memberNumber: principal.memberNumber,
    mainMemberName: principal.mainMemberName ?? principal.name ?? patientName,
  }
  return (
    <div className={cn("rounded-2xl px-3.5 py-3", panelSurface)}>
      <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground">MediKredit · Dependants</p>
      <p className="mt-1 text-[12px] font-semibold text-foreground/90">{patientName}</p>
      {principal.scheme ? (
        <p className="mt-0.5 text-[10px] text-muted-foreground">
          {principal.scheme}
          {principal.memberNumber ? ` · ${principal.memberNumber}` : ""}
        </p>
      ) : null}
      {dependents.length === 0 ? (
        <p className="mt-2 text-[11px] text-muted-foreground">No dependants returned for this member.</p>
      ) : (
        <ul className="mt-3 space-y-2">
          {dependents.map((d, i) => {
            const label =
              [d.firstNames, d.surname].filter(Boolean).join(" ").trim() ||
              d.name?.trim() ||
              "Dependant"
            const dob =
              d.dateOfBirthIso ||
              (d.dobYmd ? formatMedikreditYmd(d.dobYmd) : null) ||
              "—"
            const dep = d.dep_cd ?? "—"
            return (
              <li
                key={`${dep}-${i}`}
                className="flex items-start justify-between gap-2 rounded-xl border border-panel-border bg-panel-muted px-2.5 py-2"
              >
                <div className="min-w-0">
                  <p className="truncate text-[11px] font-medium text-foreground/90">{label}</p>
                  <p className="text-[10px] text-muted-foreground">
                    Dep {dep} · DOB {dob}
                  </p>
                  {d.planDescription ? (
                    <p className="mt-0.5 truncate text-[10px] text-muted-foreground">{d.planDescription}</p>
                  ) : null}
                </div>
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => onAddDependent(medikreditFamilyRowToPrefill(d, ctx))}
                  className="flex shrink-0 items-center gap-1 rounded-lg bg-secondary px-2 py-1 text-[10px] font-medium text-secondary-foreground hover:bg-secondary/80"
                >
                  <UserPlus className="size-3.5" />
                  Add
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

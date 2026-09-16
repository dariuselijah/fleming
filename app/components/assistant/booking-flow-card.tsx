"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { motion } from "motion/react"
import { CaretDown, CaretUp, Check, CreditCard, CurrencyCircleDollar, ShieldCheck } from "@phosphor-icons/react"
import { cn } from "@/lib/utils"
import { panelSurface } from "@/lib/theme/surfaces"
import { SERVICE_CATALOG } from "@/lib/practice/service-catalog"
import { fetchClient } from "@/lib/fetch"
import { parseTimeToMinutes, minutesToTimeStr } from "@/lib/practice/appointment-hours"
import { formatDayHeadingLong } from "@/lib/practice/calendar-date-display"
import type { SlotOption } from "./available-slots-card"
import type { PaymentType, PracticePatient } from "@/lib/clinical-workspace"

type ProviderOption = { id: string; name: string }

type PatientBookingHints = Pick<
  PracticePatient,
  | "medicalAidStatus"
  | "memberNumber"
  | "medicalAidScheme"
  | "medicalAidPlan"
  | "medicalAidSchemeCode"
  | "mainMemberName"
>

type BookResponse = {
  ok?: boolean
  error?: string
  appointment?: Record<string, unknown>
  clientAction?: { type?: string }
}

function initials(name: string) {
  const p = name.trim().split(/\s+/).filter(Boolean)
  if (p.length === 0) return "?"
  if (p.length === 1) return p[0]!.slice(0, 2).toUpperCase()
  return `${p[0]![0] ?? ""}${p[p.length - 1]![0] ?? ""}`.toUpperCase()
}

export function BookingFlowCard({
  slot,
  patientId,
  patientName,
  patientProfile,
  practiceProviders,
  onDismiss,
  onBooked,
}: {
  slot: SlotOption
  patientId: string
  patientName: string
  /** Decrypted workspace patient — used to default payment + scheme/member. */
  patientProfile?: PatientBookingHints | null
  practiceProviders: ProviderOption[]
  onDismiss: () => void
  onBooked: (res: { ok: boolean; appointment?: Record<string, unknown>; error?: string }) => void
}) {
  const defaultSvc = SERVICE_CATALOG[0]!
  const prefersMedAid =
    !!patientProfile &&
    (patientProfile.medicalAidStatus === "verified" || !!patientProfile.memberNumber?.trim())

  const [providerId, setProviderId] = useState(
    () => slot.providerStaffId ?? practiceProviders[0]?.id ?? ""
  )
  const [paymentMode, setPaymentMode] = useState<"cash" | "card" | "medical_aid">(() =>
    prefersMedAid ? "medical_aid" : "cash"
  )
  const [medicalAid, setMedicalAid] = useState(
    () => patientProfile?.medicalAidScheme?.trim() || patientProfile?.medicalAidPlan?.trim() || ""
  )
  const [memberNumber, setMemberNumber] = useState(() => patientProfile?.memberNumber?.trim() ?? "")
  const [service, setService] = useState(defaultSvc.name)
  const [duration, setDuration] = useState(() => slot.durationMinutes || defaultSvc.defaultDurationMinutes)
  const [durationTouched, setDurationTouched] = useState(false)
  const [icdCodes, setIcdCodes] = useState("")
  const [notes, setNotes] = useState("")
  const [advancedOpen, setAdvancedOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [step, setStep] = useState<1 | 2>(1)

  useEffect(() => {
    setStep(1)
  }, [slot.date, slot.startTime])

  const selectedSvc = useMemo(() => SERVICE_CATALOG.find((s) => s.name === service), [service])
  const totalFee = selectedSvc?.price ?? 0

  const onServicePick = useCallback((name: string) => {
    setService(name)
    const svc = SERVICE_CATALOG.find((s) => s.name === name)
    if (!durationTouched && svc?.defaultDurationMinutes != null) {
      setDuration(svc.defaultDurationMinutes)
    }
  }, [durationTouched])

  const endTimeStr = useMemo(() => {
    const startMin = parseTimeToMinutes(slot.startTime)
    return minutesToTimeStr(startMin + duration)
  }, [slot.startTime, duration])

  const paymentType: PaymentType = paymentMode === "medical_aid" ? "medical_aid" : paymentMode

  const paymentStepComplete = useMemo(() => {
    if (paymentMode === "medical_aid") {
      return medicalAid.trim().length > 0 && memberNumber.trim().length > 0
    }
    return true
  }, [paymentMode, medicalAid, memberNumber])

  const canSubmit = useMemo(() => {
    if (practiceProviders.length > 1 && !providerId) return false
    if (paymentMode === "medical_aid") {
      return medicalAid.trim().length > 0 && memberNumber.trim().length > 0
    }
    return true
  }, [practiceProviders.length, providerId, paymentMode, medicalAid, memberNumber])

  const submit = useCallback(async () => {
    setSubmitting(true)
    setError(null)
    const codes = icdCodes
      .split(",")
      .map((c) => c.trim())
      .filter(Boolean)
    try {
      const res = await fetchClient("/api/appointments/book", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          patientId,
          apptDate: slot.date,
          startTime: slot.startTime,
          durationMinutes: duration,
          providerStaffId: providerId || undefined,
          service,
          reason: notes.trim() || service,
          paymentType,
          medicalAid: paymentType === "medical_aid" ? medicalAid : undefined,
          memberNumber: paymentType === "medical_aid" ? memberNumber : undefined,
          notes: notes.trim() || null,
          icdCodes: codes.length ? codes : undefined,
          totalFee,
        }),
      })
      const j = (await res.json().catch(() => ({}))) as BookResponse
      if (!res.ok || !j.ok) {
        const err = j.error ?? "Could not book appointment"
        setError(err)
        onBooked({ ok: false, error: err })
        return
      }
      onBooked({ ok: true, appointment: j.appointment })
    } catch (e) {
      const err = e instanceof Error ? e.message : "Network error"
      setError(err)
      onBooked({ ok: false, error: err })
    } finally {
      setSubmitting(false)
    }
  }, [
    patientId,
    slot.date,
    slot.startTime,
    duration,
    providerId,
    service,
    notes,
    paymentType,
    medicalAid,
    memberNumber,
    icdCodes,
    totalFee,
    onBooked,
  ])

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22, ease: [0.2, 0.7, 0.2, 1] }}
      className={cn("overflow-hidden rounded-2xl", panelSurface)}
    >
      <div className="flex items-start justify-between gap-3 border-b border-panel-border px-4 py-3">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <div
            className="flex size-10 shrink-0 items-center justify-center rounded-xl text-[11px] font-semibold text-white"
            style={{ background: "linear-gradient(145deg, hsl(260 24% 38%), hsl(220 20% 28%))" }}
          >
            {initials(patientName)}
          </div>
          <div className="min-w-0">
            <p className="truncate text-[13px] font-semibold tracking-tight text-panel-foreground">{patientName}</p>
            <p className="mt-0.5 text-[11px] tabular-nums text-muted-foreground">
              {formatDayHeadingLong(slot.date)} · {slot.startTime}–{endTimeStr}
              <span className="mx-1.5 text-muted-foreground/60">·</span>
              <span className="rounded-md bg-muted px-1.5 py-px text-[10px] font-medium text-muted-foreground">
                {duration} min
              </span>
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onDismiss}
          className="shrink-0 rounded-lg px-2 py-1 text-[10px] font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
        >
          Close
        </button>
      </div>

      <div className="flex items-center justify-between border-b border-panel-border px-4 py-2">
        {step === 2 ? (
          <button
            type="button"
            onClick={() => setStep(1)}
            className="text-[10px] font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            ← Payment
          </button>
        ) : (
          <span className="text-[10px] text-muted-foreground">Step 1 of 2</span>
        )}
        <span className="text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
          {step === 1 ? "Payment" : "Service"}
        </span>
        {step === 1 ? (
          <span className="w-[52px]" aria-hidden />
        ) : (
          <span className="text-[10px] text-muted-foreground">Step 2 of 2</span>
        )}
      </div>

      <div className="space-y-4 px-4 py-4">
        {step === 1 ? (
          <div>
            <p className="mb-2 text-[10px] font-medium uppercase tracking-[0.16em] text-muted-foreground">Payment</p>
            <div className="flex gap-2">
              {(
                [
                  { id: "cash" as const, label: "Cash", icon: CurrencyCircleDollar },
                  { id: "card" as const, label: "Card", icon: CreditCard },
                  { id: "medical_aid" as const, label: "Medical aid", icon: ShieldCheck },
                ] as const
              ).map(({ id, label, icon: Icon }) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setPaymentMode(id)}
                  className={cn(
                    "flex flex-1 flex-col items-center gap-1 rounded-xl border py-2.5 text-[10px] font-medium transition-all",
                    paymentMode === id
                      ? "border-status-warning/35 bg-status-warning/[0.12] text-status-warning-foreground shadow-sm dark:text-status-warning"
                      : "border-panel-border bg-panel text-muted-foreground hover:bg-panel-muted hover:text-foreground"
                  )}
                >
                  <Icon className="size-4 opacity-90" />
                  {label}
                </button>
              ))}
            </div>
            {paymentMode === "medical_aid" ? (
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                <input
                  value={medicalAid}
                  onChange={(e) => setMedicalAid(e.target.value)}
                  placeholder="Scheme or plan"
                  className="rounded-xl border border-input bg-background px-3 py-2 text-[12px] text-foreground placeholder:text-muted-foreground/50"
                />
                <input
                  value={memberNumber}
                  onChange={(e) => setMemberNumber(e.target.value)}
                  placeholder="Member number"
                  className="rounded-xl border border-input bg-background px-3 py-2 text-[12px] text-foreground placeholder:text-muted-foreground/50"
                />
              </div>
            ) : null}
            <button
              type="button"
              disabled={!paymentStepComplete}
              onClick={() => setStep(2)}
              className="mt-4 flex w-full items-center justify-center rounded-xl border border-border bg-secondary py-3 text-[12px] font-semibold text-secondary-foreground transition-colors hover:bg-secondary/80 disabled:cursor-not-allowed disabled:opacity-35"
            >
              Continue to service
            </button>
          </div>
        ) : (
          <>
            <div>
              <p className="mb-2 text-[10px] font-medium uppercase tracking-[0.16em] text-muted-foreground">Service</p>
              <div className="flex flex-wrap gap-1.5">
                {SERVICE_CATALOG.map((s) => (
                  <button
                    key={s.name}
                    type="button"
                    onClick={() => onServicePick(s.name)}
                    className={cn(
                      "rounded-full border px-3 py-1.5 text-[11px] transition-all",
                      service === s.name
                      ? "border-primary bg-primary text-primary-foreground shadow-sm"
                      : "border-panel-border bg-panel text-muted-foreground hover:bg-panel-muted hover:text-foreground"
                    )}
                  >
                    {s.name}
                    <span
                      className={cn("ml-1.5 tabular-nums", service === s.name ? "text-primary-foreground/75" : "text-muted-foreground")}
                    >
                      R{s.price}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            <div className="rounded-xl border border-panel-border bg-panel-muted/50">
              <button
                type="button"
                onClick={() => setAdvancedOpen((o) => !o)}
                className="flex w-full items-center justify-between px-3 py-2.5 text-left text-[11px] font-medium text-muted-foreground"
              >
                <span>Edit details</span>
                {advancedOpen ? <CaretUp className="size-3.5" /> : <CaretDown className="size-3.5" />}
              </button>
              {advancedOpen ? (
                <div className="space-y-3 border-t border-panel-border px-3 pb-3 pt-3">
                  {practiceProviders.length > 1 ? (
                    <div>
                      <p className="mb-1.5 text-[10px] uppercase tracking-wider text-muted-foreground">Provider</p>
                      <select
                        value={providerId}
                        onChange={(e) => setProviderId(e.target.value)}
                        className="w-full rounded-xl border border-input bg-background px-3 py-2 text-[12px] text-foreground"
                      >
                        {practiceProviders.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  ) : null}
                  <div>
                    <p className="mb-1.5 text-[10px] uppercase tracking-wider text-muted-foreground">Duration</p>
                    <div className="flex flex-wrap gap-1.5">
                      {([15, 30, 45, 60] as const).map((d) => (
                        <button
                          key={d}
                          type="button"
                          onClick={() => {
                            setDurationTouched(true)
                            setDuration(d)
                          }}
                          className={cn(
                            "rounded-full border px-3 py-1.5 text-[11px] tabular-nums",
                            duration === d
                              ? "border-primary bg-primary text-primary-foreground"
                              : "border-panel-border text-muted-foreground hover:bg-panel-muted hover:text-foreground"
                          )}
                        >
                          {d} min
                        </button>
                      ))}
                    </div>
                  </div>
                  <input
                    value={icdCodes}
                    onChange={(e) => setIcdCodes(e.target.value)}
                    placeholder="ICD-10 (comma-separated, optional)"
                    className="w-full rounded-xl border border-input bg-background px-3 py-2 text-[12px] text-foreground placeholder:text-muted-foreground/50"
                  />
                  <textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Notes (optional)"
                    rows={2}
                    className="w-full resize-none rounded-xl border border-input bg-background px-3 py-2 text-[12px] text-foreground placeholder:text-muted-foreground/50"
                  />
                </div>
              ) : null}
            </div>

            {error ? <p className="text-[11px] text-status-danger-foreground dark:text-status-danger">{error}</p> : null}

            <button
              type="button"
              disabled={submitting || !canSubmit}
              onClick={() => void submit()}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-3 text-[12px] font-semibold text-primary-foreground shadow-sm disabled:opacity-40"
            >
              <Check className="size-4" weight="bold" />
              {submitting ? "Booking…" : "Confirm booking"}
            </button>
          </>
        )}
      </div>
    </motion.div>
  )
}

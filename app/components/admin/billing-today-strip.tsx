"use client"

import { useWorkspace } from "@/lib/clinical-workspace"
import { usePracticeCrypto } from "@/lib/clinical-workspace/practice-crypto-context"
import { fetchClient } from "@/lib/fetch"
import { cn } from "@/lib/utils"
import { CalendarBlank, PaperPlaneTilt, Plus } from "@phosphor-icons/react"
import { useCallback, useEffect, useMemo, useState } from "react"

type InvoiceRow = {
  id: string
  patient_id: string
  claim_id?: string | null
  appointment_id?: string | null
  status: string
  invoice_number?: string
}

function localTodayYmd() {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, "0")
  const day = String(d.getDate()).padStart(2, "0")
  return `${y}-${m}-${day}`
}

const STATUS_CHIP: Record<string, string> = {
  booked: "border-l-white/30",
  confirmed: "border-l-cyan-400",
  checked_in: "border-l-blue-400",
  in_progress: "border-l-indigo-400",
  completed: "border-l-emerald-400",
  no_show: "border-l-rose-400",
  cancelled: "border-l-white/15",
}

export function BillingTodayStrip() {
  const { practiceId } = usePracticeCrypto()
  const { appointments, claims } = useWorkspace()
  const [invoices, setInvoices] = useState<InvoiceRow[]>([])
  const [loading, setLoading] = useState(true)
  const [actionId, setActionId] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)

  const todayYmd = localTodayYmd()

  const todays = useMemo(() => {
    return appointments.filter((a) => a.date === todayYmd)
  }, [appointments, todayYmd])

  const loadInvoices = useCallback(async () => {
    if (!practiceId) return
    setLoading(true)
    try {
      const res = await fetchClient("/api/billing/invoices")
      if (!res.ok) return
      const j = (await res.json()) as { invoices?: InvoiceRow[] }
      setInvoices(Array.isArray(j.invoices) ? j.invoices : [])
    } catch {
      /* ignore */
    } finally {
      setLoading(false)
    }
  }, [practiceId])

  useEffect(() => {
    void loadInvoices()
  }, [loadInvoices])

  const draftClaimForPatient = useCallback(
    (patientId: string) => claims.find((c) => c.patientId === patientId && c.status === "draft"),
    [claims]
  )

  const invoiceForAppointment = useCallback(
    (appointmentId: string, patientId: string, samePatientAppointmentCount: number) => {
      const byAppt = invoices.find((i) => i.appointment_id === appointmentId)
      if (byAppt) return byAppt
      if (samePatientAppointmentCount !== 1) return null
      return invoices.find((i) => i.patient_id === patientId) ?? null
    },
    [invoices]
  )

  const createInvoiceForAppointment = async (appointmentId: string, patientId: string) => {
    if (!practiceId) return
    const claim = draftClaimForPatient(patientId)
    if (!claim) {
      setMsg("Create a draft claim for this patient in Claims first.")
      return
    }
    setActionId(appointmentId)
    setMsg(null)
    try {
      const res = await fetchClient("/api/billing/invoices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          claimId: claim.id,
          billingMode: claim.medicalAidAmount > 0 && claim.cashAmount > 0 ? "split" : claim.medicalAidAmount > 0 ? "scheme_only" : "cash",
        }),
      })
      const j = (await res.json()) as { invoiceId?: string; error?: string }
      if (!res.ok) throw new Error(j.error || "Failed to create invoice")
      await loadInvoices()
      setMsg("Invoice created")
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Failed")
    } finally {
      setActionId(null)
    }
  }

  const sendInvoiceSms = async (invoiceId: string) => {
    if (!practiceId) return
    setActionId(invoiceId)
    setMsg(null)
    try {
      const res = await fetchClient(`/api/billing/invoices/${invoiceId}/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channels: ["sms"], issueFirst: true }),
      })
      const j = (await res.json()) as { error?: string }
      if (!res.ok) throw new Error(j.error || "Send failed")
      await loadInvoices()
      setMsg("Invoice sent")
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Failed")
    } finally {
      setActionId(null)
    }
  }

  if (!practiceId) return null

  return (
    <div className="mb-3 rounded-2xl border border-panel-border bg-panel-muted/50 p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <CalendarBlank className="size-4 text-muted-foreground" />
          <p className="text-[11px] font-semibold text-foreground/70">Today</p>
          <span className="rounded-full bg-secondary px-2 py-0.5 text-[9px] font-medium text-muted-foreground">{todayYmd}</span>
        </div>
        {loading && <span className="text-[9px] text-muted-foreground">Loading…</span>}
      </div>
      {msg ? <p className="mb-2 text-[10px] text-amber-200/90">{msg}</p> : null}

      {todays.length === 0 && !loading ? (
        <p className="py-4 text-center text-[11px] text-muted-foreground">No appointments today — everything billed.</p>
      ) : (
        <div className="flex gap-2 overflow-x-auto pb-1" style={{ scrollbarWidth: "none" }}>
          {todays.map((a) => {
            const samePatientCount = todays.filter((t) => t.patientId === a.patientId).length
            const inv = invoiceForAppointment(a.id, a.patientId, samePatientCount)
            const draftClaim = draftClaimForPatient(a.patientId)
            const chip = STATUS_CHIP[a.status] ?? STATUS_CHIP.booked
            const busy = actionId === a.id || (inv && actionId === inv.id)
            return (
              <div
                key={a.id}
                className={cn(
                  "min-w-[220px] max-w-[260px] shrink-0 rounded-xl border border-panel-border bg-panel-muted p-3",
                  "border-l-4",
                  chip
                )}
              >
                <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">{a.startTime} – {a.endTime}</p>
                <p className="mt-1 line-clamp-1 text-[12px] font-semibold text-foreground/85">{a.patientName}</p>
                <p className="line-clamp-1 text-[10px] text-muted-foreground">{a.service || a.reason || "Visit"}</p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  <button
                    type="button"
                    disabled={busy || Boolean(inv) || !draftClaim}
                    onClick={() => void createInvoiceForAppointment(a.id, a.patientId)}
                    title={!draftClaim ? "Need a draft claim for this patient" : "Create invoice from draft claim"}
                    className="inline-flex items-center gap-1 rounded-lg bg-emerald-500/15 px-2 py-1 text-[10px] font-semibold text-emerald-300 hover:bg-emerald-500/25 disabled:opacity-40"
                  >
                    <Plus className="size-3" weight="bold" />
                    Invoice
                  </button>
                  <button
                    type="button"
                    disabled={busy || !inv}
                    onClick={() => inv && void sendInvoiceSms(inv.id)}
                    className="inline-flex items-center gap-1 rounded-lg bg-blue-500/15 px-2 py-1 text-[10px] font-semibold text-blue-300 hover:bg-blue-500/25 disabled:opacity-40"
                  >
                    <PaperPlaneTilt className="size-3" weight="fill" />
                    Send
                  </button>
                </div>
                {inv ? (
                  <p className="mt-1.5 text-[9px] text-muted-foreground">
                    {inv.invoice_number ?? inv.id.slice(0, 8)} · {inv.status}
                  </p>
                ) : null}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

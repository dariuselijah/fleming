"use client"

import { BentoTile } from "./bento-tile"
import { cn } from "@/lib/utils"
import { useWorkspaceStore } from "@/lib/clinical-workspace"
import type { AdminNotification } from "@/lib/clinical-workspace/types"
import {
  Bell,
  CalendarCheck,
  ChatText,
  Clock,
  Flask,
  Receipt,
  UserPlus,
  Warning,
  Package,
} from "@phosphor-icons/react"
import { useMemo, type ComponentType } from "react"

type PhosphorIcon = ComponentType<{ className?: string; weight?: "fill" | "bold" | "regular" | "duotone" }>

type FeedRow = {
  id: string
  at: number
  description: string
  icon: PhosphorIcon
  iconColor: string
  onClick?: () => void
}

function relTime(ts: number): string {
  const s = Math.floor((Date.now() - ts) / 1000)
  if (s < 45) return "Just now"
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  if (s < 604800) return `${Math.floor(s / 86400)}d ago`
  return new Date(ts).toLocaleDateString([], { month: "short", day: "numeric" })
}

function notifIcon(n: AdminNotification): { icon: PhosphorIcon; color: string } {
  switch (n.type) {
    case "lab_result":
      return { icon: Flask, color: "text-[#FFC107]" }
    case "claim_status":
    case "payment_received":
    case "payment_overdue":
    case "medical_aid_rejection":
      return { icon: Receipt, color: "text-blue-400" }
    case "appointment_reminder":
      return { icon: CalendarCheck, color: "text-indigo-400" }
    case "patient_message":
      return { icon: ChatText, color: "text-green-400" }
    case "stock_low":
      return { icon: Package, color: "text-[#FFC107]" }
    default:
      return { icon: Bell, color: "text-white/40" }
  }
}

export function LiveActivityFeed() {
  const notifications = useWorkspaceStore((s) => s.notifications)
  const inboxMessages = useWorkspaceStore((s) => s.inboxMessages)
  const patients = useWorkspaceStore((s) => s.patients)
  const appointments = useWorkspaceStore((s) => s.appointments)
  const claims = useWorkspaceStore((s) => s.claims)
  const practiceFlow = useWorkspaceStore((s) => s.practiceFlow)
  const setMode = useWorkspaceStore((s) => s.setMode)
  const setAdminTab = useWorkspaceStore((s) => s.setAdminTab)
  const requestInboxScrollTo = useWorkspaceStore((s) => s.requestInboxScrollTo)
  const requestCalendarFocusAppointment = useWorkspaceStore((s) => s.requestCalendarFocusAppointment)
  const requestBillingFocusClaim = useWorkspaceStore((s) => s.requestBillingFocusClaim)

  const rows = useMemo(() => {
    const out: FeedRow[] = []

    for (const n of notifications) {
      const { icon, color } = notifIcon(n)
      const at = new Date(n.timestamp).getTime()
      out.push({
        id: `n-${n.id}`,
        at,
        description: n.detail ? `${n.title} — ${n.detail}` : n.title,
        icon,
        iconColor: color,
        onClick: () => {
          if (n.actionRoute?.tab) {
            setMode("admin")
            setAdminTab(n.actionRoute.tab)
            if (n.actionRoute.tab === "calendar" && n.actionRoute.entityId) {
              requestCalendarFocusAppointment(n.actionRoute.entityId)
            }
            if (n.actionRoute.tab === "billing" && n.actionRoute.entityId) {
              requestBillingFocusClaim(n.actionRoute.entityId)
            }
            if (n.actionRoute.tab === "inbox") {
              requestInboxScrollTo("messages")
            }
          } else {
            requestInboxScrollTo("messages")
          }
        },
      })
    }

    for (const m of inboxMessages) {
      const at = new Date(m.timestamp).getTime()
      if (m.channel === "lab") {
        out.push({
          id: `lab-${m.id}`,
          at,
          description: `Lab queue: ${m.from} — ${m.preview.slice(0, 80)}${m.preview.length > 80 ? "…" : ""}`,
          icon: Flask,
          iconColor: "text-[#FFC107]",
          onClick: () => requestInboxScrollTo("labs"),
        })
      } else if (m.channel === "rcs" || m.channel === "sms" || m.channel === "voice" || m.channel === "portal") {
        out.push({
          id: `msg-${m.id}`,
          at,
          description: `Inbox: ${m.from} — ${m.preview.slice(0, 72)}${m.preview.length > 72 ? "…" : ""}`,
          icon: ChatText,
          iconColor: "text-green-400",
          onClick: () => requestInboxScrollTo("messages"),
        })
      }
    }

    for (const p of patients) {
      const at = new Date(p.registeredAt || Date.now()).getTime()
      out.push({
        id: `p-${p.id}`,
        at,
        description: `Patient registered: ${p.name}`,
        icon: UserPlus,
        iconColor: "text-[#00E676]",
        onClick: () => {
          setMode("admin")
          setAdminTab("patients")
        },
      })
    }

    for (const a of appointments) {
      const at = new Date(`${a.date}T${a.startTime || "12:00"}:00`).getTime()
      out.push({
        id: `a-${a.id}`,
        at,
        description: `Appointment · ${a.patientName} — ${a.date} ${a.startTime}`,
        icon: CalendarCheck,
        iconColor: "text-indigo-400",
        onClick: () => {
          setMode("admin")
          setAdminTab("calendar")
          requestCalendarFocusAppointment(a.id)
        },
      })
    }

    for (const c of claims) {
      const at = new Date(c.submittedAt || c.createdAt).getTime()
      const label =
        c.status === "draft"
          ? `Draft claim · ${c.patientName} (${c.totalAmount ? `R${c.totalAmount}` : "no total"})`
          : `Claim ${c.status} · ${c.patientName}`
      out.push({
        id: `c-${c.id}`,
        at,
        description: label,
        icon: Receipt,
        iconColor: c.status === "draft" ? "text-amber-400" : "text-blue-400",
        onClick: () => {
          setMode("admin")
          setAdminTab("billing")
          requestBillingFocusClaim(c.id)
        },
      })
    }

    for (const f of practiceFlow) {
      const t = f.checkInTime || f.appointmentTime || f.startTime || new Date()
      const at = t instanceof Date ? t.getTime() : new Date(t).getTime()
      out.push({
        id: `f-${f.patientId}-${at}`,
        at,
        description: `Flow · ${f.patientName}: ${f.status.replace(/_/g, " ")}`,
        icon: Warning,
        iconColor: "text-[#FFC107]",
        onClick: () => {
          setMode("admin")
          setAdminTab("patients")
        },
      })
    }

    out.sort((a, b) => b.at - a.at)
    return out.slice(0, 14)
  }, [
    notifications,
    inboxMessages,
    patients,
    appointments,
    claims,
    practiceFlow,
    setMode,
    setAdminTab,
    requestInboxScrollTo,
    requestCalendarFocusAppointment,
    requestBillingFocusClaim,
  ])

  return (
    <BentoTile
      title="Recent activity"
      subtitle="Live from notifications, inbox, patients, schedule & billing"
      icon={<Clock className="size-4 text-white/30" />}
    >
      {rows.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-6">
          <Bell className="size-8 text-white/10" />
          <p className="text-[11px] text-white/25">No activity yet</p>
          <p className="max-w-xs text-center text-[10px] text-white/15">
            Smart Import, scheduling, claims, and WhatsApp will populate this timeline. Rows are clickable.
          </p>
        </div>
      ) : (
        <div className="relative space-y-0">
          <div className="absolute bottom-2 left-[11px] top-2 w-px bg-white/[0.06]" />
          {rows.map((event) => {
            const EIcon = event.icon
            const clickable = Boolean(event.onClick)
            const Inner = (
              <>
                <div className="relative z-10 flex size-[22px] shrink-0 items-center justify-center rounded-full border border-white/[0.08] bg-[#0c0c0e]">
                  <EIcon className={cn("size-3", event.iconColor)} weight="fill" />
                </div>
                <div className="flex min-w-0 flex-1 items-baseline justify-between gap-3 pt-0.5">
                  <p className="text-[11px] leading-snug text-white/60">{event.description}</p>
                  <span className="shrink-0 text-[9px] text-white/20">{relTime(event.at)}</span>
                </div>
              </>
            )
            return clickable ? (
              <button
                key={event.id}
                type="button"
                onClick={event.onClick}
                className="relative flex w-full items-start gap-3 rounded-lg py-1.5 text-left transition-colors hover:bg-white/[0.03]"
              >
                {Inner}
              </button>
            ) : (
              <div key={event.id} className="relative flex items-start gap-3 py-1.5">
                {Inner}
              </div>
            )
          })}
        </div>
      )}
    </BentoTile>
  )
}

"use client"

import { useWorkQueueStore, useWorkQueueDerived } from "@/lib/admin/work-queue-store"
import type { WorkQueueFilter } from "@/lib/admin/work-queue-types"
import { useWorkspaceStore } from "@/lib/clinical-workspace"
import { cn } from "@/lib/utils"
import {
  SidebarBadge,
  SidebarEmpty,
  SidebarLinkRow,
  SidebarSectionGroup,
  SidebarSectionLabel,
} from "@/app/components/layout/sidebar/sidebar-primitives"
import {
  CalendarPlus,
  ChatText,
  EnvelopeSimple,
  FileArrowUp,
  PaperPlaneTilt,
  Phone,
  Plugs,
  UserPlus,
} from "@phosphor-icons/react"
import { useCallback, useMemo, useEffect, type ReactNode } from "react"

const TASK_FILTERS: {
  id: WorkQueueFilter
  label: string
  dot: string
  icon?: ReactNode
  setupSection?: "sms" | "voice" | "email"
}[] = [
  { id: "all", label: "All tasks", dot: "bg-sidebar-foreground/35" },
  { id: "urgent", label: "Urgent", dot: "bg-red-400" },
  { id: "handoffs", label: "Handoffs", dot: "bg-indigo-400" },
  { id: "sms", label: "SMS inbox", dot: "bg-blue-400", icon: <ChatText className="size-3" />, setupSection: "sms" },
  { id: "voice", label: "Voice", dot: "bg-sky-400", icon: <Phone className="size-3" />, setupSection: "voice" },
  { id: "email", label: "Email inbox", dot: "bg-violet-400", icon: <EnvelopeSimple className="size-3" />, setupSection: "email" },
  { id: "labs", label: "Labs", dot: "bg-red-400" },
  { id: "claims", label: "Claims", dot: "bg-amber-400" },
  { id: "billing", label: "Billing", dot: "bg-emerald-400" },
  { id: "appointments", label: "Appointments", dot: "bg-sky-400" },
  { id: "documents", label: "Documents", dot: "bg-violet-400" },
  { id: "imports", label: "Imports", dot: "bg-violet-400" },
]

/** Front Desk sidebar: nav dropdown (parent), unified task filters, today, quick actions. */
export function WorkQueueSidebarPanel() {
  const filter = useWorkQueueStore((s) => s.filter)
  const setFilter = useWorkQueueStore((s) => s.setFilter)
  const { pulse, counts } = useWorkQueueDerived()

  const appointments = useWorkspaceStore((s) => s.appointments)
  const selectedDate = useWorkspaceStore((s) => s.selectedDate)
  const setAdminTab = useWorkspaceStore((s) => s.setAdminTab)
  const setMode = useWorkspaceStore((s) => s.setMode)
  const openPatientAddModalWithPrefill = useWorkspaceStore((s) => s.openPatientAddModalWithPrefill)
  const setImportModalOpen = useWorkQueueStore((s) => s.setImportModalOpen)
  const setSmsComposeOpen = useWorkQueueStore((s) => s.setSmsComposeOpen)
  const channelStatus = useWorkQueueStore((s) => s.channelStatus)
  const refreshChannelStatus = useWorkQueueStore((s) => s.refreshChannelStatus)

  const today = selectedDate ?? new Date().toISOString().slice(0, 10)
  const todayLabel = new Date().toLocaleDateString([], { month: "short", day: "numeric" })

  const todaySchedule = useMemo(() => {
    return appointments
      .filter((a) => a.date === today)
      .filter((a) => ["booked", "confirmed", "checked_in", "in_progress"].includes(a.status))
      .sort((a, b) => a.startTime.localeCompare(b.startTime))
  }, [appointments, today])

  const nextAppt = todaySchedule[0] ?? null
  const restToday = todaySchedule.slice(1, 3)

  const goCalendar = useCallback(() => {
    setMode("admin")
    setAdminTab("calendar")
  }, [setMode, setAdminTab])

  const goChannels = useCallback(
    (section?: string) => {
      setMode("admin")
      setAdminTab("channels")
      if (section && typeof window !== "undefined") {
        window.sessionStorage.setItem("channels-focus", section)
      }
    },
    [setMode, setAdminTab]
  )

  useEffect(() => {
    void refreshChannelStatus()
  }, [refreshChannelStatus])

  // Migrate legacy filter if persisted
  useEffect(() => {
    if ((filter as string) === "messages") setFilter("sms")
  }, [filter, setFilter])

  function channelConnected(section?: "sms" | "voice" | "email"): boolean | null {
    if (!channelStatus.loaded) return null
    if (section === "sms") return channelStatus.smsConnected
    if (section === "voice") return channelStatus.voiceConnected
    if (section === "email") return channelStatus.emailConnected
    return null
  }

  return (
    <div className="space-y-4">
      <div className="px-2">
        <SidebarSectionLabel title="Task queue" trailing={`${pulse.total} open · ${todayLabel}`} />
        <p className="mt-0.5 px-2 text-[9px] text-sidebar-foreground/40">{pulse.urgent} urgent</p>
      </div>

      <SidebarSectionGroup title="Tasks">
        {TASK_FILTERS.map((opt) => {
          const connected = channelConnected(opt.setupSection)
          const needsSetup = connected === false
          return (
            <div
              key={opt.id}
              className={cn(
                "flex w-full items-center gap-1 rounded-md transition-colors",
                filter === opt.id ? "bg-sidebar-accent text-sidebar-accent-foreground" : "text-sidebar-foreground/65"
              )}
            >
              <button
                type="button"
                onClick={() => setFilter(opt.id)}
                className="flex min-w-0 flex-1 items-center gap-2 px-2 py-1.5 text-left hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
              >
                {opt.icon ?? <span className={cn("size-1.5 shrink-0 rounded-full", opt.dot)} />}
                <span className="flex-1 truncate text-[11px] font-medium">{opt.label}</span>
                <SidebarBadge tone={opt.id === "urgent" && counts[opt.id] > 0 ? "bad" : "default"}>
                  {counts[opt.id]}
                </SidebarBadge>
              </button>
              {needsSetup && opt.setupSection && (
                <button
                  type="button"
                  onClick={() => goChannels(opt.setupSection)}
                  className="mr-1 shrink-0 rounded px-1.5 py-0.5 text-[8px] font-semibold uppercase tracking-wide text-amber-400 hover:bg-amber-400/10"
                >
                  Setup
                </button>
              )}
            </div>
          )
        })}
      </SidebarSectionGroup>

      <SidebarSectionGroup title="Today">
        {nextAppt ? (
          <>
            <button
              type="button"
              onClick={goCalendar}
              className="w-full rounded-md border border-sidebar-border/80 bg-sidebar-accent/40 px-2.5 py-2 text-left transition-colors hover:bg-sidebar-accent"
            >
              <p className="text-[8px] font-medium uppercase tracking-[0.18em] text-sidebar-foreground/40">Next up</p>
              <p className="mt-0.5 truncate text-[11px] font-semibold text-sidebar-foreground/90">{nextAppt.patientName}</p>
              <p className="text-[10px] tabular-nums text-sidebar-foreground/45">{nextAppt.startTime}</p>
            </button>
            {restToday.map((a) => (
              <div key={a.id} className="flex items-center justify-between gap-2 px-2 py-1 text-[10px]">
                <span className="truncate text-sidebar-foreground/70">{a.patientName}</span>
                <span className="shrink-0 tabular-nums text-sidebar-foreground/40">{a.startTime}</span>
              </div>
            ))}
          </>
        ) : (
          <SidebarEmpty>No appointments today</SidebarEmpty>
        )}
      </SidebarSectionGroup>

      <SidebarSectionGroup title="Quick actions">
        <SidebarLinkRow
          icon={<PaperPlaneTilt className="size-3.5" />}
          label="New SMS"
          description="Compose a patient message"
          onClick={() => setSmsComposeOpen(true)}
        />
        <SidebarLinkRow
          icon={<Plugs className="size-3.5" />}
          label="SMS, voice & email setup"
          description="Configure patient channels"
          onClick={() => goChannels()}
        />
        <SidebarLinkRow
          icon={<UserPlus className="size-3.5" />}
          label="Register patient"
          onClick={() => openPatientAddModalWithPrefill({})}
        />
        <SidebarLinkRow
          icon={<FileArrowUp className="size-3.5" />}
          label="Import file"
          onClick={() => setImportModalOpen(true)}
        />
        <SidebarLinkRow
          icon={<CalendarPlus className="size-3.5" />}
          label="Book appointment"
          onClick={goCalendar}
        />
      </SidebarSectionGroup>
    </div>
  )
}

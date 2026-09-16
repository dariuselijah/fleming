"use client"

import type { WorkQueueItem } from "@/lib/admin/work-queue-types"
import { useWorkQueueStore } from "@/lib/admin/work-queue-store"
import { useWorkspace } from "@/lib/clinical-workspace"
import {
  PanelBody,
  PanelFooter,
  PanelGhostButton,
  PanelHeader,
  PanelHint,
  PanelPrimaryButton,
  PanelShell,
} from "@/app/components/ui/panel-primitives"
import { CalendarCheck } from "@phosphor-icons/react"

export function AppointmentPanel({ item }: { item: WorkQueueItem }) {
  const payload = item.payload.type === "appointment" ? item.payload.data : null
  const resolveItem = useWorkQueueStore((s) => s.resolveItem)
  const incrementAiResolved = useWorkQueueStore((s) => s.incrementAiResolved)
  const { setAdminTab, requestCalendarFocusAppointment } = useWorkspace()

  if (!payload) return null

  return (
    <PanelShell>
      <PanelHeader
        icon={<CalendarCheck className="size-4 text-blue-400" weight="fill" />}
        title={payload.patientName}
        subtitle={`${payload.date} · ${payload.startTime} · ${payload.kind.replace("_", " ")}`}
      />

      <PanelBody>
        <p className="text-[11px] leading-relaxed text-foreground/80">{item.summaryLine}</p>
        {item.aiActionLine ? <PanelHint>{item.aiActionLine}</PanelHint> : null}
      </PanelBody>

      <PanelFooter>
        <PanelPrimaryButton
          onClick={() => {
            requestCalendarFocusAppointment(payload.appointmentId)
            setAdminTab("calendar")
          }}
        >
          {payload.kind === "no_show" ? "Reschedule in calendar" : "Open in calendar"}
        </PanelPrimaryButton>
        <PanelGhostButton
          onClick={() => {
            resolveItem(item.id)
            incrementAiResolved()
          }}
        >
          Mark handled
        </PanelGhostButton>
      </PanelFooter>
    </PanelShell>
  )
}

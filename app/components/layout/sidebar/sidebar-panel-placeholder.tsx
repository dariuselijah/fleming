"use client"

import { cn } from "@/lib/utils"
import { useWorkspaceStore } from "@/lib/clinical-workspace"
import { Plugs } from "@phosphor-icons/react"
import type { ReactNode } from "react"
import { SidebarLinkRow, SidebarSectionLabel } from "./sidebar-primitives"

type SidebarAction = {
  label: string
  onClick: () => void
}

/**
 * Default panel for admin sidebars when there is no list or secondary navigation.
 */
export function SidebarPanelPlaceholder({
  icon,
  title,
  description,
  actions,
  className,
}: {
  icon: ReactNode
  title: string
  description?: string
  actions?: SidebarAction[]
  className?: string
}) {
  return (
    <div className={cn("space-y-2.5 px-1", className)}>
      <div className="flex items-center gap-2 px-2">
        <span className="flex size-5 items-center justify-center text-white/45">{icon}</span>
        <p className="text-[12px] font-semibold tracking-tight text-white/80">{title}</p>
      </div>
      {description ? (
        <p className="px-2 text-[10.5px] leading-relaxed text-white/40">{description}</p>
      ) : null}
      {actions && actions.length > 0 ? (
        <div className="space-y-px">
          {actions.map((a) => (
            <SidebarLinkRow key={a.label} label={a.label} onClick={a.onClick} />
          ))}
        </div>
      ) : null}
    </div>
  )
}

export function ChannelsSidebarPanel() {
  const setAdminTab = useWorkspaceStore((s) => s.setAdminTab)

  return (
    <div className="space-y-5">
      <SidebarPanelPlaceholder
        icon={<Plugs className="size-4" weight="duotone" />}
        title="Patient channels"
        description="Link WhatsApp and voice. Incoming messages land in Inbox the moment a number is live."
      />
      <div className="space-y-1.5">
        <SidebarSectionLabel title="Quick jump" />
        <div className="space-y-px">
          <SidebarLinkRow label="Open Inbox" onClick={() => setAdminTab("inbox")} />
        </div>
      </div>
    </div>
  )
}

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
        <span className="flex size-5 items-center justify-center text-sidebar-foreground/65">{icon}</span>
        <p className="text-[12px] font-semibold tracking-tight text-sidebar-foreground/80">{title}</p>
      </div>
      {description ? (
        <p className="text-micro px-2 leading-relaxed text-sidebar-foreground/45">{description}</p>
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
        description="Link WhatsApp and voice. Incoming messages land in Front Desk the moment a number is live."
      />
      <div className="space-y-1.5">
        <SidebarSectionLabel title="Quick jump" />
        <div className="space-y-px">
          <SidebarLinkRow label="Open Front Desk" onClick={() => setAdminTab("front_desk")} />
        </div>
      </div>
    </div>
  )
}

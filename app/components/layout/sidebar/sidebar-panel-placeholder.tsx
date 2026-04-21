"use client"

import { cn } from "@/lib/utils"
import { useWorkspaceStore } from "@/lib/clinical-workspace"
import { Plugs } from "@phosphor-icons/react"
import type { ReactNode } from "react"

type SidebarAction = {
  label: string
  onClick: () => void
}

/**
 * Default panel for admin sidebars when there is no list or secondary navigation.
 * Reuse anywhere the right column would otherwise be blank.
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
    <div
      className={cn(
        "rounded-2xl border border-white/[0.06] bg-white/[0.02] px-3 py-4",
        className
      )}
    >
      <div className="mb-3 flex size-10 items-center justify-center rounded-xl border border-white/[0.08] bg-white/[0.04] text-white/50">
        {icon}
      </div>
      <p className="text-xs font-semibold text-foreground">{title}</p>
      {description && (
        <p className="mt-2 text-[11px] leading-relaxed text-white/38">{description}</p>
      )}
      {actions && actions.length > 0 && (
        <div className="mt-4 space-y-1.5">
          {actions.map((a) => (
            <button
              key={a.label}
              type="button"
              onClick={a.onClick}
              className="w-full rounded-lg border border-white/[0.08] bg-white/[0.03] px-2.5 py-2 text-left text-[11px] font-medium text-white/65 transition-colors hover:border-white/15 hover:bg-white/[0.06] hover:text-white/85"
            >
              {a.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export function ChannelsSidebarPanel() {
  const setAdminTab = useWorkspaceStore((s) => s.setAdminTab)

  return (
    <SidebarPanelPlaceholder
      icon={<Plugs className="size-5" weight="duotone" />}
      title="Patient channels"
      description="Link WhatsApp and voice here. Incoming messages appear in Inbox when a number is live."
      actions={[{ label: "Open Inbox", onClick: () => setAdminTab("inbox") }]}
    />
  )
}

"use client"

import { ListRow } from "@/components/ui/list-row"
import { cn } from "@/lib/utils"
import type { ReactNode } from "react"

/**
 * Shared sidebar primitives — sleek, minimal building blocks for
 * every per-page sidebar panel (Calendar, Billing, Inventory, etc).
 *
 * Design principles:
 *   • whitespace > borders
 *   • text-only stats over heavy cards
 *   • compact, mono-friendly numerics
 *   • subtle hover, no decorative chrome
 */

export function SidebarSectionLabel({
  title,
  trailing,
  className,
}: {
  title: string
  trailing?: ReactNode
  className?: string
}) {
  return (
    <div className={cn("flex items-center justify-between px-2", className)}>
      <p className="text-micro font-medium uppercase tracking-[0.18em] text-sidebar-foreground/45">{title}</p>
      {trailing ? <div className="text-micro text-sidebar-foreground/55">{trailing}</div> : null}
    </div>
  )
}

export function SidebarSectionGroup({
  title,
  trailing,
  children,
  className,
}: {
  title?: string
  trailing?: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <section className={cn("space-y-1.5", className)}>
      {title ? <SidebarSectionLabel title={title} trailing={trailing} /> : null}
      <div className="space-y-px">{children}</div>
    </section>
  )
}

export function SidebarStatRow({
  label,
  value,
  tone = "default",
  onClick,
  hint,
}: {
  label: string
  value: ReactNode
  tone?: "default" | "good" | "warn" | "bad" | "muted"
  onClick?: () => void
  hint?: string
}) {
  const toneClass =
    tone === "good"
      ? "text-status-success-foreground dark:text-status-success"
      : tone === "warn"
        ? "text-status-warning-foreground dark:text-status-warning"
        : tone === "bad"
          ? "text-status-danger-foreground dark:text-status-danger"
          : tone === "muted"
            ? "text-sidebar-foreground/45"
            : "text-sidebar-foreground/85"
  const Component = onClick ? "button" : "div"
  return (
    <Component
      type={onClick ? "button" : undefined}
      onClick={onClick}
      className={cn(
        "flex w-full items-center justify-between gap-3 rounded-md px-2 py-1.5 text-left transition-colors",
        onClick && "hover:bg-sidebar-accent"
      )}
    >
      <span className="min-w-0 flex-1 truncate text-[11px] text-sidebar-foreground/55">{label}</span>
      <span className={cn("shrink-0 text-[12px] font-semibold tabular-nums", toneClass)}>
        {value}
      </span>
      {hint ? <span className="text-micro shrink-0 text-sidebar-foreground/45">{hint}</span> : null}
    </Component>
  )
}

export function SidebarLinkRow({
  icon,
  label,
  trailing,
  onClick,
  href,
  active = false,
  tone = "default",
  description,
}: {
  icon?: ReactNode
  label: string
  trailing?: ReactNode
  onClick?: () => void
  href?: string
  active?: boolean
  tone?: "default" | "muted"
  description?: string
}) {
  const className = cn(
    "group flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left transition-colors",
    active
      ? "bg-sidebar-accent text-sidebar-accent-foreground"
      : tone === "muted"
        ? "text-sidebar-foreground/50 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground/75"
        : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
  )
  const inner = (
    <>
      {icon ? (
        <span className="flex size-3.5 shrink-0 items-center justify-center text-current opacity-70">
          {icon}
        </span>
      ) : null}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[12px] font-medium tracking-tight">{label}</span>
        {description ? (
          <span className="text-micro block truncate text-sidebar-foreground/45">{description}</span>
        ) : null}
      </span>
      {trailing ? <span className="shrink-0">{trailing}</span> : null}
    </>
  )
  if (href) {
    return (
      <ListRow asChild density="compact" interactive selected={active} className={className}>
        <a href={href}>{inner}</a>
      </ListRow>
    )
  }
  return (
    <ListRow asChild density="compact" interactive selected={active} className={className}>
      <button type="button" onClick={onClick}>
        {inner}
      </button>
    </ListRow>
  )
}

export function SidebarBadge({
  children,
  tone = "default",
}: {
  children: ReactNode
  tone?: "default" | "good" | "warn" | "bad" | "info"
}) {
  const toneClass =
    tone === "good"
      ? "bg-status-success/15 text-status-success-foreground dark:text-status-success"
      : tone === "warn"
        ? "bg-status-warning/15 text-status-warning-foreground dark:text-status-warning"
        : tone === "bad"
          ? "bg-status-danger/15 text-status-danger-foreground dark:text-status-danger"
          : tone === "info"
            ? "bg-status-info/15 text-status-info-foreground dark:text-status-info"
            : "bg-sidebar-accent text-sidebar-foreground/70"
  return (
    <span
      className={cn(
        "text-micro inline-flex items-center justify-center rounded-full px-1.5 py-0.5 font-bold tabular-nums",
        toneClass
      )}
    >
      {children}
    </span>
  )
}

/**
 * Headline metric — single big number, used sparingly at the top of a panel.
 */
export function SidebarHeadline({
  label,
  value,
  delta,
  tone = "default",
}: {
  label: string
  value: ReactNode
  delta?: string
  tone?: "default" | "good" | "warn" | "bad"
}) {
  const toneClass =
    tone === "good"
      ? "text-status-success-foreground dark:text-status-success"
      : tone === "warn"
        ? "text-status-warning-foreground dark:text-status-warning"
        : tone === "bad"
          ? "text-status-danger-foreground dark:text-status-danger"
          : "text-sidebar-foreground"
  return (
    <div className="px-2">
      <p className="text-micro font-medium uppercase tracking-[0.18em] text-sidebar-foreground/45">{label}</p>
      <p className={cn("mt-1 text-[20px] font-semibold tracking-tight tabular-nums", toneClass)}>
        {value}
      </p>
      {delta ? <p className="text-micro mt-0.5 text-sidebar-foreground/45">{delta}</p> : null}
    </div>
  )
}

export function SidebarDivider({ className }: { className?: string }) {
  return <div className={cn("mx-2 h-px bg-sidebar-border", className)} />
}

export function SidebarEmpty({ children }: { children: ReactNode }) {
  return <p className="text-micro px-2 py-2 italic text-sidebar-foreground/45">{children}</p>
}

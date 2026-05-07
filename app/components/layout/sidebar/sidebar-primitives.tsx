"use client"

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
      <p className="text-[9px] font-medium uppercase tracking-[0.22em] text-white/30">{title}</p>
      {trailing ? <div className="text-[10px] text-white/40">{trailing}</div> : null}
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
      ? "text-emerald-400"
      : tone === "warn"
        ? "text-amber-400"
        : tone === "bad"
          ? "text-rose-400"
          : tone === "muted"
            ? "text-white/40"
            : "text-white/85"
  const Component = onClick ? "button" : "div"
  return (
    <Component
      type={onClick ? "button" : undefined}
      onClick={onClick}
      className={cn(
        "flex w-full items-center justify-between gap-3 rounded-md px-2 py-1.5 text-left transition-colors",
        onClick && "hover:bg-white/[0.035]"
      )}
    >
      <span className="min-w-0 flex-1 truncate text-[11px] text-white/45">{label}</span>
      <span className={cn("shrink-0 text-[12px] font-semibold tabular-nums", toneClass)}>
        {value}
      </span>
      {hint ? <span className="shrink-0 text-[9px] text-white/25">{hint}</span> : null}
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
      ? "bg-white/[0.05] text-white"
      : tone === "muted"
        ? "text-white/40 hover:bg-white/[0.03] hover:text-white/70"
        : "text-white/65 hover:bg-white/[0.03] hover:text-white/95"
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
          <span className="block truncate text-[9px] text-white/30">{description}</span>
        ) : null}
      </span>
      {trailing ? <span className="shrink-0">{trailing}</span> : null}
    </>
  )
  if (href) {
    return (
      <a href={href} className={className}>
        {inner}
      </a>
    )
  }
  return (
    <button type="button" onClick={onClick} className={className}>
      {inner}
    </button>
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
      ? "bg-emerald-500/15 text-emerald-300"
      : tone === "warn"
        ? "bg-amber-500/15 text-amber-300"
        : tone === "bad"
          ? "bg-rose-500/15 text-rose-300"
          : tone === "info"
            ? "bg-blue-500/15 text-blue-300"
            : "bg-white/[0.06] text-white/55"
  return (
    <span
      className={cn(
        "inline-flex items-center justify-center rounded-full px-1.5 py-0.5 text-[9px] font-bold tabular-nums",
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
      ? "text-emerald-400"
      : tone === "warn"
        ? "text-amber-400"
        : tone === "bad"
          ? "text-rose-400"
          : "text-white"
  return (
    <div className="px-2">
      <p className="text-[9px] font-medium uppercase tracking-[0.22em] text-white/30">{label}</p>
      <p className={cn("mt-1 text-[20px] font-semibold tracking-tight tabular-nums", toneClass)}>
        {value}
      </p>
      {delta ? <p className="mt-0.5 text-[10px] text-white/35">{delta}</p> : null}
    </div>
  )
}

export function SidebarDivider({ className }: { className?: string }) {
  return <div className={cn("mx-2 h-px bg-white/[0.05]", className)} />
}

export function SidebarEmpty({ children }: { children: ReactNode }) {
  return <p className="px-2 py-2 text-[10.5px] italic text-white/25">{children}</p>
}

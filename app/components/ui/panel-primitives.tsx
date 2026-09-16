"use client"

import { cn } from "@/lib/utils"
import type { ReactNode } from "react"

export function PanelShell({
  children,
  className,
}: {
  children: ReactNode
  className?: string
}) {
  return <div className={cn("flex h-full flex-col overflow-hidden", className)}>{children}</div>
}

export function PanelHeader({
  icon,
  title,
  subtitle,
  meta,
  className,
}: {
  icon?: ReactNode
  title: ReactNode
  subtitle?: ReactNode
  meta?: ReactNode
  className?: string
}) {
  return (
    <div className={cn("shrink-0 border-b border-panel-border px-4 py-3", className)}>
      <div className="flex items-start gap-2">
        {icon ? <div className="mt-0.5 shrink-0">{icon}</div> : null}
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-semibold text-foreground">{title}</p>
          {subtitle ? <p className="text-micro truncate text-muted-foreground">{subtitle}</p> : null}
          {meta ? <p className="text-micro mt-0.5 text-muted-foreground">{meta}</p> : null}
        </div>
      </div>
    </div>
  )
}

export function PanelBody({
  children,
  className,
}: {
  children: ReactNode
  className?: string
}) {
  return (
    <div
      className={cn("min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-3", className)}
      style={{ scrollbarWidth: "thin" }}
    >
      {children}
    </div>
  )
}

export function PanelFooter({
  children,
  className,
}: {
  children: ReactNode
  className?: string
}) {
  return (
    <div className={cn("shrink-0 space-y-2 border-t border-panel-border bg-background p-4 pb-5", className)}>
      {children}
    </div>
  )
}

export function PanelSectionLabel({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <p className={cn("text-micro font-semibold uppercase tracking-[0.16em] text-muted-foreground", className)}>
      {children}
    </p>
  )
}

export function PanelHint({
  children,
  icon,
  className,
}: {
  children: ReactNode
  icon?: ReactNode
  className?: string
}) {
  return (
    <div className={cn("flex gap-2 rounded-lg border border-panel-border bg-panel-muted/30 px-3 py-2", className)}>
      {icon ? <div className="mt-0.5 shrink-0 text-muted-foreground">{icon}</div> : null}
      <p className="text-[11px] leading-relaxed text-muted-foreground">{children}</p>
    </div>
  )
}

export function PanelPrimaryButton({
  children,
  className,
  disabled,
  onClick,
  type = "button",
}: {
  children: ReactNode
  className?: string
  disabled?: boolean
  onClick?: () => void
  type?: "button" | "submit"
}) {
  return (
    <button
      type={type}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "text-micro flex min-h-touch w-full items-center justify-center gap-1.5 rounded-xl bg-foreground px-4 py-2.5 font-semibold text-background transition-opacity disabled:opacity-50",
        className
      )}
    >
      {children}
    </button>
  )
}

export function PanelSecondaryButton({
  children,
  className,
  disabled,
  onClick,
  type = "button",
}: {
  children: ReactNode
  className?: string
  disabled?: boolean
  onClick?: () => void
  type?: "button" | "submit"
}) {
  return (
    <button
      type={type}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "text-micro flex min-h-touch w-full items-center justify-center gap-1.5 rounded-xl border border-panel-border bg-panel-muted px-4 py-2 font-medium text-foreground/80 transition-opacity disabled:opacity-50",
        className
      )}
    >
      {children}
    </button>
  )
}

export function PanelGhostButton({
  children,
  className,
  disabled,
  onClick,
}: {
  children: ReactNode
  className?: string
  disabled?: boolean
  onClick?: () => void
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "text-micro min-h-touch w-full rounded-xl px-4 py-2 font-medium text-muted-foreground hover:bg-panel-muted hover:text-foreground disabled:opacity-50",
        className
      )}
    >
      {children}
    </button>
  )
}

export function EditorShell({
  header,
  children,
  footer,
  className,
}: {
  header: ReactNode
  children: ReactNode
  footer: ReactNode
  className?: string
}) {
  return (
    <div className={cn("flex min-h-0 flex-1 flex-col overflow-hidden", className)}>
      <div className="shrink-0 border-b border-panel-border bg-panel-muted/20">{header}</div>
      <div className="min-h-0 flex-1 overflow-hidden">{children}</div>
      <div className="shrink-0 border-t border-panel-border bg-background/95 backdrop-blur-sm">{footer}</div>
    </div>
  )
}

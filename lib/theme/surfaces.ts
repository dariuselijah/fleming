import { cn } from "@/lib/utils"

export const panelSurface =
  "border border-panel-border bg-panel text-panel-foreground shadow-raised"

export const panelMutedSurface =
  "border border-panel-border bg-panel-muted text-panel-foreground"

export const glassSurface =
  "border border-glass-border bg-glass text-foreground shadow-raised backdrop-blur-sm"

export const overlaySurface =
  "border border-panel-border bg-overlay text-overlay-foreground shadow-floating"

export const interactiveSurface =
  "transition-colors duration-[var(--duration-fast)] ease-calm hover:bg-panel-muted"

export function surfaceClassName(...className: Array<string | false | null | undefined>) {
  return cn(panelSurface, ...className)
}

export function overlayClassName(...className: Array<string | false | null | undefined>) {
  return cn(overlaySurface, ...className)
}

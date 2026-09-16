"use client"

import { cn } from "@/lib/utils"
import { panelSurface } from "@/lib/theme/surfaces"
import { motion } from "motion/react"
import type { ReactNode } from "react"

interface BentoTileProps {
  children: ReactNode
  className?: string
  title?: string
  subtitle?: string
  icon?: ReactNode
  action?: ReactNode
  glow?: "green" | "amber" | "red" | "blue"
}

const GLOW_RING: Record<string, string> = {
  green: "ring-1 ring-status-success/20",
  amber: "ring-1 ring-status-warning/20",
  red: "ring-1 ring-status-danger/20",
  blue: "ring-1 ring-status-info/20",
}

export function BentoTile({ children, className, title, subtitle, icon, action, glow }: BentoTileProps) {
  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.97 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.97 }}
      transition={{ type: "spring", stiffness: 400, damping: 35 }}
      className={cn(
        "relative flex flex-col overflow-hidden rounded-2xl",
        panelSurface,
        glow && GLOW_RING[glow],
        className
      )}
    >
      {(title || action) && (
        <div className="flex items-center justify-between px-4 pt-3.5 pb-0">
          <div className="flex items-center gap-2">
            {icon && <span className="text-muted-foreground">{icon}</span>}
            <div>
              {title && <h3 className="text-[13px] font-semibold text-foreground">{title}</h3>}
              {subtitle && <p className="text-[10px] text-muted-foreground">{subtitle}</p>}
            </div>
          </div>
          {action}
        </div>
      )}
      <div className="flex-1 p-4">{children}</div>
    </motion.div>
  )
}

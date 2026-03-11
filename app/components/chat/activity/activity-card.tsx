"use client"

import { cn } from "@/lib/utils"
import type { ReactNode } from "react"

type ActivityCardProps = {
  title: ReactNode
  subtitle?: ReactNode
  status?: ReactNode
  icon?: ReactNode
  children?: ReactNode
  className?: string
}

export function ActivityCard({
  title,
  subtitle,
  status,
  icon,
  children,
  className,
}: ActivityCardProps) {
  return (
    <div
      className={cn(
        "rounded-xl border border-border/70 bg-background px-3 py-2.5 shadow-sm",
        className
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            {icon ? (
              <span className="text-muted-foreground inline-flex shrink-0">
                {icon}
              </span>
            ) : null}
            <p className="line-clamp-1 text-sm font-medium">{title}</p>
          </div>
          {subtitle ? (
            <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
              {subtitle}
            </p>
          ) : null}
        </div>
        {status ? <div className="shrink-0">{status}</div> : null}
      </div>
      {children ? <div className="mt-2">{children}</div> : null}
    </div>
  )
}


import { cn } from "@/lib/utils"
import * as React from "react"

function EmptyState({
  icon,
  title,
  description,
  action,
  compact = false,
  className,
  ...props
}: React.ComponentProps<"div"> & {
  icon?: React.ReactNode
  title: React.ReactNode
  description?: React.ReactNode
  action?: React.ReactNode
  compact?: boolean
}) {
  return (
    <div
      data-slot="empty-state"
      className={cn(
        "flex flex-col items-center justify-center text-center",
        compact ? "gap-1.5 px-3 py-6" : "gap-2 px-6 py-10",
        className
      )}
      {...props}
    >
      {icon ? (
        <div
          data-slot="empty-state-icon"
          aria-hidden
          className="mb-1 flex size-10 items-center justify-center rounded-xl bg-muted text-muted-foreground"
        >
          {icon}
        </div>
      ) : null}
      <p
        data-slot="empty-state-title"
        className="text-caption font-semibold text-foreground"
      >
        {title}
      </p>
      {description ? (
        <p
          data-slot="empty-state-description"
          className="text-micro max-w-sm text-pretty text-muted-foreground"
        >
          {description}
        </p>
      ) : null}
      {action ? (
        <div data-slot="empty-state-action" className="mt-2">
          {action}
        </div>
      ) : null}
    </div>
  )
}

export { EmptyState }

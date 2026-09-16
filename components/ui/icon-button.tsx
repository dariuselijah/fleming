import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import * as React from "react"

type IconButtonProps = Omit<
  React.ComponentProps<typeof Button>,
  "children" | "size"
> & {
  "aria-label": string
  children: React.ReactNode
  size?: "touch" | "compact"
}

const IconButton = React.forwardRef<HTMLButtonElement, IconButtonProps>(
  (
    {
      className,
      children,
      size = "touch",
      type = "button",
      title,
      ...props
    },
    ref
  ) => (
    <Button
      ref={ref}
      type={type}
      size="icon"
      title={title ?? props["aria-label"]}
      data-slot="icon-button"
      className={cn(
        "shrink-0 rounded-lg",
        size === "touch" ? "size-touch" : "size-9",
        className
      )}
      {...props}
    >
      {children}
    </Button>
  )
)
IconButton.displayName = "IconButton"

export { IconButton }
export type { IconButtonProps }

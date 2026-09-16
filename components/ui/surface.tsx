import { cn } from "@/lib/utils"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"
import * as React from "react"

const surfaceVariants = cva(
  "text-panel-foreground transition-colors duration-[var(--duration-fast)] ease-calm",
  {
    variants: {
      variant: {
        base: "bg-background",
        panel: "border border-panel-border bg-panel shadow-raised",
        muted: "border border-panel-border bg-panel-muted",
        glass:
          "border border-glass-border bg-glass shadow-raised backdrop-blur-sm",
        overlay:
          "border border-panel-border bg-overlay text-overlay-foreground shadow-floating",
      },
      radius: {
        none: "rounded-none",
        sm: "rounded-md",
        md: "rounded-xl",
        lg: "rounded-2xl",
      },
      interactive: {
        true: "hover:bg-panel-muted focus-within:border-ring",
        false: "",
      },
    },
    defaultVariants: {
      variant: "panel",
      radius: "md",
      interactive: false,
    },
  }
)

type SurfaceProps = React.ComponentProps<"div"> &
  VariantProps<typeof surfaceVariants> & {
    asChild?: boolean
  }

function Surface({
  asChild = false,
  className,
  variant,
  radius,
  interactive,
  ...props
}: SurfaceProps) {
  const Comp = asChild ? Slot : "div"

  return (
    <Comp
      data-slot="surface"
      data-variant={variant ?? "panel"}
      className={cn(
        surfaceVariants({ variant, radius, interactive }),
        className
      )}
      {...props}
    />
  )
}

export { Surface, surfaceVariants }
export type { SurfaceProps }

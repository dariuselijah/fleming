import { cn } from "@/lib/utils"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"
import * as React from "react"

const listRowVariants = cva(
  "group/list-row flex w-full min-w-0 items-center gap-3 rounded-lg text-left transition-colors duration-[var(--duration-fast)] ease-calm",
  {
    variants: {
      density: {
        compact: "min-h-10 px-2 py-1.5",
        default: "min-h-touch px-3 py-2",
        relaxed: "min-h-14 px-4 py-3",
      },
      interactive: {
        true: "cursor-pointer hover:bg-panel-muted focus-visible:bg-panel-muted",
        false: "",
      },
      selected: {
        true: "bg-panel-muted text-foreground",
        false: "",
      },
    },
    defaultVariants: {
      density: "default",
      interactive: false,
      selected: false,
    },
  }
)

function ListRow({
  asChild = false,
  className,
  density,
  interactive,
  selected,
  ...props
}: React.ComponentProps<"div"> &
  VariantProps<typeof listRowVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot : "div"

  return (
    <Comp
      data-slot="list-row"
      data-selected={selected || undefined}
      className={cn(
        listRowVariants({ density, interactive, selected }),
        className
      )}
      {...props}
    />
  )
}

function ListRowLeading({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="list-row-leading"
      className={cn(
        "flex size-8 shrink-0 items-center justify-center text-muted-foreground",
        className
      )}
      {...props}
    />
  )
}

function ListRowContent({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="list-row-content"
      className={cn("min-w-0 flex-1", className)}
      {...props}
    />
  )
}

function ListRowTitle({
  className,
  ...props
}: React.ComponentProps<"p">) {
  return (
    <p
      data-slot="list-row-title"
      className={cn("text-caption truncate font-medium", className)}
      {...props}
    />
  )
}

function ListRowDescription({
  className,
  ...props
}: React.ComponentProps<"p">) {
  return (
    <p
      data-slot="list-row-description"
      className={cn("text-micro truncate text-muted-foreground", className)}
      {...props}
    />
  )
}

function ListRowTrailing({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="list-row-trailing"
      className={cn(
        "text-micro ml-auto shrink-0 text-muted-foreground",
        className
      )}
      {...props}
    />
  )
}

export {
  ListRow,
  ListRowContent,
  ListRowDescription,
  ListRowLeading,
  ListRowTitle,
  ListRowTrailing,
  listRowVariants,
}

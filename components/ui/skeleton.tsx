import { cn } from "@/lib/utils"
import { cva, type VariantProps } from "class-variance-authority"
import * as React from "react"

const skeletonVariants = cva(
  "relative overflow-hidden rounded-md bg-muted motion-safe:after:absolute motion-safe:after:inset-0 motion-safe:after:animate-[shimmer_1.8s_ease-in-out_infinite] motion-safe:after:bg-[linear-gradient(90deg,transparent,oklch(1_0_0/0.12),transparent)] motion-safe:after:bg-[length:200%_100%]",
  {
    variants: {
      shape: {
        block: "",
        line: "h-3",
        avatar: "size-touch rounded-full",
        control: "h-touch",
      },
    },
    defaultVariants: {
      shape: "block",
    },
  }
)

function Skeleton({
  className,
  shape,
  ...props
}: React.ComponentProps<"div"> & VariantProps<typeof skeletonVariants>) {
  return (
    <div
      data-slot="skeleton"
      aria-hidden="true"
      className={cn(skeletonVariants({ shape }), className)}
      {...props}
    />
  )
}

function SkeletonText({
  lines = 3,
  className,
  ...props
}: React.ComponentProps<"div"> & { lines?: number }) {
  return (
    <div
      data-slot="skeleton-text"
      aria-hidden="true"
      className={cn("space-y-2", className)}
      {...props}
    >
      {Array.from({ length: lines }, (_, index) => (
        <Skeleton
          key={index}
          shape="line"
          className={cn(index === lines - 1 && lines > 1 && "w-2/3")}
        />
      ))}
    </div>
  )
}

function SkeletonRow({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton-row"
      aria-hidden="true"
      className={cn("flex min-h-touch items-center gap-3 px-3 py-2", className)}
      {...props}
    >
      <Skeleton shape="avatar" className="size-8" />
      <div className="min-w-0 flex-1 space-y-2">
        <Skeleton shape="line" className="w-1/2" />
        <Skeleton shape="line" className="h-2.5 w-3/4" />
      </div>
    </div>
  )
}

export { Skeleton, SkeletonRow, SkeletonText, skeletonVariants }

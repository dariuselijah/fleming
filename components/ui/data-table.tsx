import { cn } from "@/lib/utils"
import * as React from "react"

function DataTable({
  className,
  containerClassName,
  ...props
}: React.ComponentProps<"table"> & { containerClassName?: string }) {
  return (
    <div
      data-slot="data-table-container"
      className={cn(
        "w-full overflow-x-auto rounded-xl border border-panel-border bg-panel",
        containerClassName
      )}
    >
      <table
        data-slot="data-table"
        className={cn(
          "text-caption w-full min-w-[36rem] border-collapse text-left",
          className
        )}
        {...props}
      />
    </div>
  )
}

function DataTableHeader({
  className,
  ...props
}: React.ComponentProps<"thead">) {
  return (
    <thead
      data-slot="data-table-header"
      className={cn(
        "bg-panel-muted text-micro text-muted-foreground [&_tr]:border-b",
        className
      )}
      {...props}
    />
  )
}

function DataTableBody({
  className,
  ...props
}: React.ComponentProps<"tbody">) {
  return (
    <tbody
      data-slot="data-table-body"
      className={cn("[&_tr:last-child]:border-0", className)}
      {...props}
    />
  )
}

function DataTableRow({
  className,
  ...props
}: React.ComponentProps<"tr">) {
  return (
    <tr
      data-slot="data-table-row"
      className={cn(
        "border-b border-panel-border transition-colors duration-[var(--duration-fast)] hover:bg-panel-muted/70 data-[selected=true]:bg-panel-muted",
        className
      )}
      {...props}
    />
  )
}

function DataTableHead({
  className,
  scope = "col",
  ...props
}: React.ComponentProps<"th">) {
  return (
    <th
      data-slot="data-table-head"
      scope={scope}
      className={cn(
        "h-10 whitespace-nowrap px-3 font-semibold first:pl-4 last:pr-4",
        className
      )}
      {...props}
    />
  )
}

function DataTableCell({
  className,
  ...props
}: React.ComponentProps<"td">) {
  return (
    <td
      data-slot="data-table-cell"
      className={cn(
        "h-11 whitespace-nowrap px-3 align-middle first:pl-4 last:pr-4",
        className
      )}
      {...props}
    />
  )
}

function DataTableCaption({
  className,
  ...props
}: React.ComponentProps<"caption">) {
  return (
    <caption
      data-slot="data-table-caption"
      className={cn("text-micro mt-3 text-muted-foreground", className)}
      {...props}
    />
  )
}

export {
  DataTable,
  DataTableBody,
  DataTableCaption,
  DataTableCell,
  DataTableHead,
  DataTableHeader,
  DataTableRow,
}

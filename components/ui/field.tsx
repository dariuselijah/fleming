import { Label } from "@/components/ui/label"
import { cn } from "@/lib/utils"
import * as React from "react"

function Field({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="field"
      className={cn("group/field grid gap-1.5", className)}
      {...props}
    />
  )
}

function FieldLabel({
  className,
  required,
  children,
  ...props
}: React.ComponentProps<typeof Label> & { required?: boolean }) {
  return (
    <Label
      data-slot="field-label"
      className={cn("text-caption text-foreground", className)}
      {...props}
    >
      {children}
      {required ? (
        <>
          <span aria-hidden className="text-status-danger-foreground">
            *
          </span>
          <span className="sr-only">(required)</span>
        </>
      ) : null}
    </Label>
  )
}

function FieldDescription({
  className,
  ...props
}: React.ComponentProps<"p">) {
  return (
    <p
      data-slot="field-description"
      className={cn("text-micro text-muted-foreground", className)}
      {...props}
    />
  )
}

function FieldError({
  className,
  role = "alert",
  ...props
}: React.ComponentProps<"p">) {
  return (
    <p
      data-slot="field-error"
      role={role}
      className={cn(
        "text-micro font-medium text-status-danger-foreground dark:text-status-danger",
        className
      )}
      {...props}
    />
  )
}

function FieldControl({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="field-control"
      className={cn(
        "has-aria-invalid:[&_input]:border-destructive has-aria-invalid:[&_select]:border-destructive has-aria-invalid:[&_textarea]:border-destructive",
        className
      )}
      {...props}
    />
  )
}

export { Field, FieldControl, FieldDescription, FieldError, FieldLabel }

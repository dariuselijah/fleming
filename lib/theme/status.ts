export type StatusTone =
  | "neutral"
  | "success"
  | "warning"
  | "danger"
  | "info"

/** Semantic status classes; use these instead of feature-specific color names. */
export const statusToneClasses: Record<StatusTone, string> = {
  neutral: "bg-muted text-muted-foreground",
  success:
    "bg-status-success/15 text-status-success-foreground dark:text-status-success",
  warning:
    "bg-status-warning/15 text-status-warning-foreground dark:text-status-warning",
  danger:
    "bg-status-danger/15 text-status-danger-foreground dark:text-status-danger",
  info: "bg-status-info/15 text-status-info-foreground dark:text-status-info",
}

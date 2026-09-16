"use client"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { ROLE_LABELS, isPracticeStaffRole } from "@/lib/auth/permissions"
import { useAuthContext } from "@/lib/auth/provider"
import { Buildings, ShieldCheck } from "@phosphor-icons/react"

function formatRole(role: string | null) {
  if (isPracticeStaffRole(role)) return ROLE_LABELS[role]
  return role ? role.replaceAll("_", " ") : "No practice role"
}

export function ProductContext() {
  const auth = useAuthContext()
  const hasPractice = Boolean(auth.activePracticeId)
  const clinicalAccess = auth.hasPermission("clinical:access")

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ShieldCheck className="size-5" />
          Fleming Workspace
        </CardTitle>
        <CardDescription>
          Your settings are scoped to the practice workspace. Patient chart data stays inside patient records, not personal settings.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <div className="rounded-xl border border-border bg-muted/35 px-3 py-2.5">
          <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
            Active practice
          </p>
          <div className="mt-1 flex items-center gap-2">
            <Buildings className="size-4 text-muted-foreground" />
            <span className="font-medium text-foreground">
              {auth.activePracticeName ?? "Personal workspace"}
            </span>
          </div>
        </div>

        <div className="grid gap-2 sm:grid-cols-2">
          <div className="rounded-xl border border-border bg-muted/25 px-3 py-2.5">
            <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
              Practice role
            </p>
            <p className="mt-1 font-medium capitalize text-foreground">{formatRole(auth.activeRole)}</p>
          </div>
          <div className="rounded-xl border border-border bg-muted/25 px-3 py-2.5">
            <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
              Clinical access
            </p>
            <p className="mt-1 font-medium text-foreground">{clinicalAccess ? "Enabled" : "Not enabled"}</p>
          </div>
        </div>

        {hasPractice ? (
          <p className="text-xs leading-relaxed text-muted-foreground">
            Use the Practice tab for team, hours, billing, MediKredit, and front-desk configuration.
          </p>
        ) : (
          <p className="text-xs leading-relaxed text-muted-foreground">
            Join or create a practice to unlock the clinical workspace settings.
          </p>
        )}
      </CardContent>
    </Card>
  )
}

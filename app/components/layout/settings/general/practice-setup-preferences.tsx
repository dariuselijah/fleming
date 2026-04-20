"use client"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { useChecklistStore } from "@/lib/onboarding/checklist-store"
import { useUserPreferences } from "@/lib/user-preference-store/provider"
import { CheckCircle, Stethoscope, XCircle } from "@phosphor-icons/react"
import { useCallback, useState } from "react"

/**
 * Clinician-only: mirrors practice setup guide visibility (user_preferences).
 * Saving BHF / practice profile in the in-app checklist or Admin practice settings
 * sets practiceProfileCompleted and hides the corner guide.
 */
export function PracticeSetupPreferences() {
  const { preferences, updatePreferences } = useUserPreferences()
  const [busy, setBusy] = useState(false)

  const profileDone = Boolean(preferences.practiceProfileCompleted)
  const guideDismissed = Boolean(preferences.practiceSetupGuideDismissed)

  const resumeGuide = useCallback(async () => {
    setBusy(true)
    try {
      await updatePreferences({ practiceSetupGuideDismissed: false })
      useChecklistStore.getState().openPanel(null)
    } catch (e) {
      console.warn("[PracticeSetupPreferences]", e)
    } finally {
      setBusy(false)
    }
  }, [updatePreferences])

  if (preferences.userRole !== "doctor") return null

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Stethoscope className="size-5" />
          Practice setup
        </CardTitle>
        <CardDescription>
          The corner setup guide stays available until you save your practice profile or close it. You can bring it
          back here if you closed it early.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-col gap-2 text-sm">
          <div className="flex items-center gap-2">
            {profileDone ? (
              <CheckCircle className="size-4 shrink-0 text-emerald-500" weight="fill" />
            ) : (
              <XCircle className="text-muted-foreground size-4 shrink-0" weight="regular" />
            )}
            <span className={profileDone ? "text-foreground" : "text-muted-foreground"}>
              Practice profile {profileDone ? "saved" : "not saved yet"}
            </span>
          </div>
          <div className="flex items-center gap-2">
            {guideDismissed && !profileDone ? (
              <XCircle className="text-muted-foreground size-4 shrink-0" weight="regular" />
            ) : !guideDismissed && !profileDone ? (
              <CheckCircle className="size-4 shrink-0 text-sky-500" weight="fill" />
            ) : (
              <CheckCircle className="text-muted-foreground size-4 shrink-0 opacity-50" weight="regular" />
            )}
            <span className="text-muted-foreground">
              {profileDone
                ? "Setup guide hidden after profile was saved"
                : guideDismissed
                  ? "You closed the setup guide before finishing profile"
                  : "Setup guide is visible in the clinical workspace"}
            </span>
          </div>
        </div>

        {!profileDone && guideDismissed && (
          <Button type="button" variant="secondary" size="sm" disabled={busy} onClick={() => void resumeGuide()}>
            {busy ? "Opening…" : "Show setup guide again"}
          </Button>
        )}

        {profileDone && (
          <p className="text-muted-foreground text-xs leading-relaxed">
            Services, messaging, labs, and AI options can be configured from the clinical Admin workspace.
          </p>
        )}
      </CardContent>
    </Card>
  )
}

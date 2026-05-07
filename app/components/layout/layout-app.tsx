"use client"

import { Header } from "@/app/components/layout/header"
import { AppSidebar } from "@/app/components/layout/sidebar/app-sidebar"
import { useUserPreferences } from "@/lib/user-preference-store/provider"
import { useWorkspace, WorkspaceProvider } from "@/lib/clinical-workspace"
import { PracticeCryptoProvider } from "@/lib/clinical-workspace/practice-crypto-context"
import { ClinicalWorkspace } from "@/app/components/workspace/clinical-workspace"
import {
  PracticeIdBootstrap,
  ClinicalDataBootstrap,
} from "@/app/components/workspace/clinical-data-bootstrap"
import { ClinicalUnlockGate } from "@/app/components/workspace/clinical-unlock-gate"
import { ClinicalPersistence } from "@/app/components/workspace/clinical-persistence"
import { ClaimPreviewModal } from "@/app/components/workspace/claim-preview-modal"
import { OnboardingChecklist } from "@/app/components/onboarding/onboarding-checklist"
import { AppSettingsDialogHost } from "@/app/components/layout/settings/app-settings-dialog-host"
import { useAuthContext } from "@/lib/auth/provider"
import { useEffect } from "react"

function WorkspaceRoleSync({
  defaultMode,
  canUseClinical,
  canUseAdmin,
}: {
  defaultMode: "clinical" | "admin"
  canUseClinical: boolean
  canUseAdmin: boolean
}) {
  const { mode, setMode } = useWorkspace()

  useEffect(() => {
    if (mode === "chat") return
    if (mode === "clinical" && canUseClinical) return
    if (mode === "admin" && canUseAdmin) return
    setMode(defaultMode === "admin" && canUseAdmin ? "admin" : "clinical")
  }, [canUseAdmin, canUseClinical, defaultMode, mode, setMode])

  return null
}

export function LayoutApp({ children }: { children: React.ReactNode }) {
  const { preferences } = useUserPreferences()
  const auth = useAuthContext()
  const hasSidebar = preferences.layout === "sidebar"
  const isPracticeWorkspace =
    !!auth.activePracticeId || preferences.userRole === "doctor"

  if (isPracticeWorkspace) {
    return (
      <PracticeCryptoProvider>
        <WorkspaceProvider>
          <AppSettingsDialogHost />
          <WorkspaceRoleSync
            defaultMode={auth.defaultWorkspaceMode}
            canUseClinical={
              auth.hasPermission("clinical:access") || !auth.activePracticeId
            }
            canUseAdmin={auth.hasPermission("admin:access")}
          />
          <PracticeIdBootstrap />
          <ClinicalUnlockGate>
            <ClinicalDataBootstrap />
            <ClinicalPersistence />
            <ClaimPreviewModal />
            <div className="bg-background flex h-dvh w-full overflow-hidden">
              {hasSidebar && <AppSidebar />}
              <div className="relative flex h-full w-0 flex-shrink flex-grow flex-col overflow-hidden">
                <ClinicalWorkspace>
                  <main className="@container relative h-full w-full flex-shrink flex-grow overflow-y-auto">
                    <Header hasSidebar={hasSidebar} />
                    {children}
                  </main>
                </ClinicalWorkspace>
              </div>
            </div>
            <OnboardingChecklist />
          </ClinicalUnlockGate>
        </WorkspaceProvider>
      </PracticeCryptoProvider>
    )
  }

  return (
    <div className="bg-background flex h-dvh w-full overflow-hidden">
      <AppSettingsDialogHost />
      {hasSidebar && <AppSidebar />}
      <main className="@container relative h-dvh w-0 flex-shrink flex-grow overflow-y-auto">
        <Header hasSidebar={hasSidebar} />
        {children}
      </main>
    </div>
  )
}

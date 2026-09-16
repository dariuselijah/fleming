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
import { ClinicalPersistence } from "@/app/components/workspace/clinical-persistence"
import { ClinicalUnlockGate } from "@/app/components/workspace/clinical-unlock-gate"
import { ClaimPreviewModal } from "@/app/components/workspace/claim-preview-modal"
import { OnboardingChecklist } from "@/app/components/onboarding/onboarding-checklist"
import { AppSettingsDialogHost } from "@/app/components/layout/settings/app-settings-dialog-host"
import { useBreakpoint } from "@/app/hooks/use-breakpoint"
import { IconButton } from "@/components/ui/icon-button"
import { useSidebar } from "@/components/ui/sidebar"
import { Surface } from "@/components/ui/surface"
import { useAuthContext } from "@/lib/auth/provider"
import { List } from "@phosphor-icons/react"
import { useEffect } from "react"

function MobileNavigationButton() {
  const { toggleSidebar } = useSidebar()

  return (
    <IconButton
      aria-label="Open navigation"
      variant="surface"
      onClick={toggleSidebar}
      className="fixed left-3 top-3 z-[var(--z-navigation)] md:hidden"
    >
      <List className="size-5" weight="bold" />
    </IconButton>
  )
}

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
  const isMobile = useBreakpoint(768)
  const hasSidebar = preferences.layout === "sidebar"
  const showSidebar = hasSidebar || isMobile
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
          <ClinicalDataBootstrap />
          <ClinicalPersistence />
          <ClaimPreviewModal />
          <ClinicalUnlockGate>
          <Surface
            variant="base"
            radius="none"
            data-clinical-shell
            className="flex h-dvh w-full overflow-hidden"
          >
            {showSidebar && <AppSidebar />}
            {isMobile && <MobileNavigationButton />}
              <div className="relative flex h-full w-0 flex-shrink flex-grow flex-col overflow-hidden">
                <ClinicalWorkspace>
                  <main className="@container relative h-full w-full flex-shrink flex-grow overflow-y-auto">
                    <Header hasSidebar={hasSidebar} />
                    {children}
                  </main>
                </ClinicalWorkspace>
              </div>
          </Surface>
          </ClinicalUnlockGate>
          <OnboardingChecklist />
        </WorkspaceProvider>
      </PracticeCryptoProvider>
    )
  }

  return (
    <Surface
      variant="base"
      radius="none"
      data-clinical-shell
      className="flex h-dvh w-full overflow-hidden"
    >
      <AppSettingsDialogHost />
      {showSidebar && <AppSidebar />}
      {isMobile && !hasSidebar && <MobileNavigationButton />}
      <main className="@container relative h-dvh w-0 flex-shrink flex-grow overflow-y-auto">
        <Header hasSidebar={hasSidebar} />
        {children}
      </main>
    </Surface>
  )
}

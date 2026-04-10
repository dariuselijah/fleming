"use client"

import { Header } from "@/app/components/layout/header"
import { AppSidebar } from "@/app/components/layout/sidebar/app-sidebar"
import { useUserPreferences } from "@/lib/user-preference-store/provider"
import { WorkspaceProvider } from "@/lib/clinical-workspace"
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

export function LayoutApp({ children }: { children: React.ReactNode }) {
  const { preferences } = useUserPreferences()
  const hasSidebar = preferences.layout === "sidebar"
  const isClinicalMode = preferences.userRole === "doctor"

  if (isClinicalMode) {
    return (
      <PracticeCryptoProvider>
        <WorkspaceProvider>
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
      {hasSidebar && <AppSidebar />}
      <main className="@container relative h-dvh w-0 flex-shrink flex-grow overflow-y-auto">
        <Header hasSidebar={hasSidebar} />
        {children}
      </main>
    </div>
  )
}

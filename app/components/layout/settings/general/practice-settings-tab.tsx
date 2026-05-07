"use client"

import { isSupabaseEnabled } from "@/lib/supabase/config"
import { useAuthContext } from "@/lib/auth/provider"
import { Buildings } from "@phosphor-icons/react"
import { PracticeProfileCard } from "./practice-profile-card"
import { PracticeSetupPreferences } from "./practice-setup-preferences"
import { PracticeTeamSettings } from "./practice-team-settings"
import { PracticeHoursEditor } from "./practice-hours-editor"
import { PracticeFaqsEditor } from "./practice-faqs-editor"
import { MedikreditProviderSettingsForm } from "@/app/components/medikredit/medikredit-provider-settings-form"
import { usePracticeCrypto } from "@/lib/clinical-workspace/practice-crypto-context"

/**
 * Dedicated Settings tab: clinic identity, location, hours, FAQs, billing identifiers, and team.
 */
export function PracticeSettingsTab() {
  const auth = useAuthContext()
  const { practiceId } = usePracticeCrypto()
  if (!auth.hasPermission("settings:practice") || !isSupabaseEnabled) return null

  return (
    <div className="mx-auto max-w-3xl space-y-8 pb-8">
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <div className="bg-primary/10 flex size-10 items-center justify-center rounded-2xl">
            <Buildings className="text-primary size-5" weight="duotone" />
          </div>
          <div>
            <h2 className="text-foreground text-lg font-semibold tracking-tight">Practice</h2>
            <p className="text-muted-foreground text-sm leading-relaxed">
              Everything about your clinic — hours drive the calendar; FAQs power assistants and channels.
            </p>
          </div>
        </div>
      </div>

      <PracticeHoursEditor />
      <PracticeFaqsEditor />

      {practiceId ? (
        <MedikreditProviderSettingsForm practiceId={practiceId} variant="settings" />
      ) : (
        <p className="text-muted-foreground text-sm">
          Join or open a practice to configure MediKredit switch identifiers (group practice, vendor, works, PC).
        </p>
      )}

      <div className="border-border/50 rounded-2xl border bg-card/30 p-1 shadow-sm backdrop-blur-sm">
        <PracticeProfileCard />
      </div>

      <PracticeTeamSettings />
      <PracticeSetupPreferences />
    </div>
  )
}

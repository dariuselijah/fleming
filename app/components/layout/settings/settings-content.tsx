"use client"

import { Button } from "@/components/ui/button"
import { DrawerClose } from "@/components/ui/drawer"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { isSupabaseEnabled } from "@/lib/supabase/config"
import { cn } from "@/lib/utils"
import { useUserPreferences } from "@/lib/user-preference-store/provider"
import { Buildings, GearSixIcon, PaintBrushIcon, XIcon } from "@phosphor-icons/react"
import { useState } from "react"
import { InteractionPreferences } from "./appearance/interaction-preferences"
import { LayoutSettings } from "./appearance/layout-settings"
import { ThemeSelection } from "./appearance/theme-selection"
import { AccountManagement } from "./general/account-management"
import { UserProfile } from "./general/user-profile"
import { HealthContext } from "./general/health-context"
import { UserRoleSelection } from "./general/user-role-selection"
import { PracticeSettingsTab } from "./general/practice-settings-tab"

type SettingsContentProps = {
  isDrawer?: boolean
}

type TabType = "general" | "appearance" | "practice"

export function SettingsContent({
  isDrawer = false,
}: SettingsContentProps) {
  const [activeTab, setActiveTab] = useState<TabType>("general")
  const { preferences } = useUserPreferences()
  const showHealthContext = preferences.userRole === "general"
  const showPracticeTab = preferences.userRole === "doctor"

  return (
    <div
      className={cn(
        "flex w-full flex-col overflow-y-auto",
        isDrawer ? "p-0 pb-16" : "py-0"
      )}
    >
      {isDrawer && (
        <div className="border-border mb-2 flex items-center justify-between border-b px-4 pb-2">
          <h2 className="text-lg font-medium">Settings</h2>
          <DrawerClose asChild>
            <Button variant="ghost" size="icon">
              <XIcon className="size-4" />
            </Button>
          </DrawerClose>
        </div>
      )}

      <Tabs
        value={activeTab}
        onValueChange={(value) => setActiveTab(value as TabType)}
        className={cn(
          "flex w-full flex-row",
          isDrawer ? "" : "flex min-h-[400px]"
        )}
      >
        {isDrawer ? (
          <div className="w-full items-start justify-start overflow-hidden py-4">
            <div>
              <TabsList className="mb-4 flex w-full min-w-0 flex-nowrap items-center justify-start overflow-x-auto bg-transparent px-0">
                <TabsTrigger
                  value="general"
                  className="ml-6 flex shrink-0 items-center gap-2"
                >
                  <GearSixIcon className="size-4" />
                  <span>General</span>
                </TabsTrigger>
                <TabsTrigger
                  value="appearance"
                  className="flex shrink-0 items-center gap-2"
                >
                  <PaintBrushIcon className="size-4" />
                  <span>Appearance</span>
                </TabsTrigger>
                {showPracticeTab && (
                  <TabsTrigger value="practice" className="flex shrink-0 items-center gap-2">
                    <Buildings className="size-4" />
                    <span>Practice</span>
                  </TabsTrigger>
                )}
              </TabsList>
            </div>

            <TabsContent value="general" className="space-y-6 px-6">
              <UserProfile />
              <UserRoleSelection />
              {showHealthContext && <HealthContext />}
              {isSupabaseEnabled && <AccountManagement />}
            </TabsContent>

            <TabsContent value="appearance" className="space-y-6 px-6">
              <ThemeSelection />
              <LayoutSettings />
              <InteractionPreferences />
            </TabsContent>

            {showPracticeTab && (
              <TabsContent value="practice" className="space-y-6 px-6">
                <PracticeSettingsTab />
              </TabsContent>
            )}
          </div>
        ) : (
          <>
            <TabsList className="block w-48 rounded-none bg-transparent px-3 pt-4">
              <div className="flex w-full flex-col gap-1">
                <TabsTrigger
                  value="general"
                  className="w-full justify-start rounded-md px-3 py-2 text-left"
                >
                  <div className="flex items-center gap-2">
                    <GearSixIcon className="size-4" />
                    <span>General</span>
                  </div>
                </TabsTrigger>

                <TabsTrigger
                  value="appearance"
                  className="w-full justify-start rounded-md px-3 py-2 text-left"
                >
                  <div className="flex items-center gap-2">
                    <PaintBrushIcon className="size-4" />
                    <span>Appearance</span>
                  </div>
                </TabsTrigger>

                {showPracticeTab && (
                  <TabsTrigger value="practice" className="w-full justify-start rounded-md px-3 py-2 text-left">
                    <div className="flex items-center gap-2">
                      <Buildings className="size-4" />
                      <span>Practice</span>
                    </div>
                  </TabsTrigger>
                )}
              </div>
            </TabsList>

            <div className="flex-1 overflow-auto px-6 pt-4">
              <TabsContent value="general" className="mt-0 space-y-6">
                <UserProfile />
                <UserRoleSelection />
                {showHealthContext && <HealthContext />}
                {isSupabaseEnabled && <AccountManagement />}
              </TabsContent>

              <TabsContent value="appearance" className="mt-0 space-y-6">
                <ThemeSelection />
                <LayoutSettings />
                <InteractionPreferences />
              </TabsContent>

              {showPracticeTab && (
                <TabsContent value="practice" className="mt-0 space-y-6">
                  <PracticeSettingsTab />
                </TabsContent>
              )}
            </div>
          </>
        )}
      </Tabs>
    </div>
  )
}

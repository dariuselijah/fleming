"use client"

import { DropdownMenuItem } from "@/components/ui/dropdown-menu"
import { useAppSettingsDialog } from "@/lib/app-settings-dialog-store"
import { User } from "@phosphor-icons/react"

type SettingsTriggerProps = {
  onOpenChange: (open: boolean) => void
}

export function SettingsTrigger({ onOpenChange }: SettingsTriggerProps) {
  const openSettings = useAppSettingsDialog((s) => s.openSettings)

  return (
    <DropdownMenuItem
      onSelect={(e) => {
        e.preventDefault()
        openSettings()
        onOpenChange(true)
      }}
    >
      <User className="size-4" />
      <span>Settings</span>
    </DropdownMenuItem>
  )
}

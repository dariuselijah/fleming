"use client"

import XIcon from "@/components/icons/x"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { useUser } from "@/lib/user-store/provider"
import { ROLE_LABELS, isPracticeStaffRole } from "@/lib/auth/permissions"
import { useAuthContext } from "@/lib/auth/provider"
import { useState } from "react"
import { AppInfoTrigger } from "./app-info/app-info-trigger"
import { FeedbackTrigger } from "./feedback/feedback-trigger"
import { SettingsTrigger } from "./settings/settings-trigger"

export function UserMenu() {
  const { user } = useUser()
  const auth = useAuthContext()
  const [isMenuOpen, setMenuOpen] = useState(false)
  const [isSettingsOpen, setSettingsOpen] = useState(false)

  if (!user) return null

  const handleSettingsOpenChange = (isOpen: boolean) => {
    setSettingsOpen(isOpen)
    if (!isOpen) {
      setMenuOpen(false)
    }
  }

  return (
    // fix shadcn/ui / radix bug when dialog into dropdown menu
    <DropdownMenu open={isMenuOpen} onOpenChange={setMenuOpen} modal={false}>
      <Tooltip>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger>
            <Avatar className="bg-background hover:bg-muted">
              <AvatarImage src={user?.profile_image ?? undefined} />
              <AvatarFallback>{user?.display_name?.charAt(0)}</AvatarFallback>
            </Avatar>
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent>Profile</TooltipContent>
      </Tooltip>
      <DropdownMenuContent
        className="w-56"
        align="end"
        forceMount
        onCloseAutoFocus={(e) => e.preventDefault()}
        onInteractOutside={(e) => {
          if (isSettingsOpen) {
            e.preventDefault()
            return
          }
          setMenuOpen(false)
        }}
      >
        <DropdownMenuItem className="flex flex-col items-start gap-0 no-underline hover:bg-transparent focus:bg-transparent">
          <span>{user?.display_name}</span>
          <span className="text-muted-foreground max-w-full truncate">
            {user?.email}
          </span>
        </DropdownMenuItem>
        {auth.memberships.length > 0 && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="flex flex-col items-start gap-1 hover:bg-transparent focus:bg-transparent">
              <span className="text-xs font-medium text-muted-foreground">Practice</span>
              <span className="max-w-full truncate text-sm">
                {auth.activePracticeName ?? "No active practice"}
              </span>
            </DropdownMenuItem>
            {auth.memberships.map((membership) => {
              const active = membership.practiceId === auth.activePracticeId
              const roleLabel = isPracticeStaffRole(membership.role)
                ? ROLE_LABELS[membership.role]
                : membership.role
              return (
                <DropdownMenuItem
                  key={membership.membershipId}
                  disabled={active}
                  onSelect={(event) => {
                    event.preventDefault()
                    void auth.setActivePractice(membership.practiceId)
                    setMenuOpen(false)
                  }}
                  className="flex items-center justify-between gap-3"
                >
                  <span className="truncate">{membership.practiceName}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {active ? "Active" : roleLabel}
                  </span>
                </DropdownMenuItem>
              )
            })}
          </>
        )}
        <DropdownMenuSeparator />
        <SettingsTrigger onOpenChange={handleSettingsOpenChange} />
        <FeedbackTrigger />
        <AppInfoTrigger />
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <a
            href="https://x.com/HelloPerkily"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2"
          >
            <XIcon className="size-4 p-0.5" />
            <span>@HelloPerkily</span>
          </a>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

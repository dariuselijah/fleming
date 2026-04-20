"use client"

import { useWorkspace, type AdminTab } from "@/lib/clinical-workspace"
import { useAppSettingsDialog } from "@/lib/app-settings-dialog-store"
import { cn } from "@/lib/utils"
import {
  Tray,
  CalendarBlank,
  CurrencyDollar,
  Package,
  ChartLineUp,
  Gear,
  UserCircle,
} from "@phosphor-icons/react"

const NAV_ITEMS: { id: AdminTab; icon: typeof Tray; label: string }[] = [
  { id: "inbox", icon: Tray, label: "Inbox" },
  { id: "calendar", icon: CalendarBlank, label: "Calendar" },
  { id: "billing", icon: CurrencyDollar, label: "Billing" },
  { id: "inventory", icon: Package, label: "Inventory" },
  { id: "analytics", icon: ChartLineUp, label: "Analytics" },
  { id: "patients", icon: UserCircle, label: "Patients" },
]

export function AdminSidebar() {
  const { activeAdminTab, setAdminTab, setMode, notifications } = useWorkspace()
  const openAppSettings = useAppSettingsDialog((s) => s.openSettings)

  const unreadCount = notifications.filter((n) => !n.read).length

  return (
    <div className="flex h-full w-14 flex-col items-center border-r border-white/[0.06] bg-black/40 py-3">
      <nav className="flex flex-1 flex-col items-center gap-1">
        {NAV_ITEMS.map((item) => {
          const active = activeAdminTab === item.id
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setAdminTab(item.id)}
              title={item.label}
              className={cn(
                "relative flex size-9 items-center justify-center rounded-xl transition-all",
                active
                  ? "bg-white/[0.08] text-foreground shadow-sm"
                  : "text-white/40 hover:bg-white/[0.04] hover:text-white/70"
              )}
            >
              <item.icon className="size-[18px]" weight={active ? "fill" : "regular"} />
              {item.id === "inbox" && unreadCount > 0 && (
                <span className="absolute -right-0.5 -top-0.5 flex size-3.5 items-center justify-center rounded-full bg-[#EF5350] text-[7px] font-bold text-white">
                  {unreadCount}
                </span>
              )}
            </button>
          )
        })}
      </nav>

      <div className="flex flex-col items-center gap-1">
        <button
          type="button"
          onClick={() => {
            openAppSettings()
          }}
          title="Practice & profile settings"
          className="flex size-9 items-center justify-center rounded-xl text-white/30 transition-colors hover:bg-white/[0.04] hover:text-white/60"
        >
          <Gear className="size-[18px]" />
        </button>
        <button
          type="button"
          className="flex size-9 items-center justify-center rounded-xl text-white/30 transition-colors hover:bg-white/[0.04] hover:text-white/60"
          title="Profile"
        >
          <UserCircle className="size-[18px]" weight="fill" />
        </button>
      </div>
    </div>
  )
}

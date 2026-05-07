import {
  CalendarBlank,
  ChartLineUp,
  ChatCircle,
  CurrencyDollar,
  FolderSimple,
  Gear,
  Package,
  Plugs,
  Stethoscope,
  Tray,
  UsersThree,
} from "@phosphor-icons/react"
import type { AdminTab, WorkspaceMode } from "@/lib/clinical-workspace"
import type { AppPermission } from "@/lib/auth/permissions"

type NavIcon = typeof ChatCircle

export type MasterNavItem = {
  id: string
  label: string
  description: string
  icon: NavIcon
  permissions: AppPermission[]
  href?: string
  mode?: WorkspaceMode
  adminTab?: AdminTab
  settings?: boolean
}

export const MASTER_NAV_ITEMS: MasterNavItem[] = [
  {
    id: "chat",
    label: "Chat",
    description: "Clinical and research assistant",
    icon: ChatCircle,
    permissions: ["chat:use"],
    mode: "chat",
    href: "/",
  },
  {
    id: "clinical",
    label: "Clinical",
    description: "Patient workspace and consults",
    icon: Stethoscope,
    permissions: ["clinical:access"],
    mode: "clinical",
  },
  {
    id: "inbox",
    label: "Inbox",
    description: "Messages, labs, and alerts",
    icon: Tray,
    permissions: ["frontdesk:access"],
    mode: "admin",
    adminTab: "inbox",
  },
  {
    id: "calendar",
    label: "Calendar",
    description: "Schedules and rooms",
    icon: CalendarBlank,
    permissions: ["frontdesk:access"],
    mode: "admin",
    adminTab: "calendar",
  },
  {
    id: "patients",
    label: "Patients",
    description: "Directory and registration",
    icon: UsersThree,
    permissions: ["patients:access"],
    mode: "admin",
    adminTab: "patients",
  },
  {
    id: "billing",
    label: "Billing",
    description: "Claims, invoices, payments",
    icon: CurrencyDollar,
    permissions: ["billing:access"],
    mode: "admin",
    adminTab: "billing",
  },
  {
    id: "inventory",
    label: "Inventory",
    description: "Stock and imports",
    icon: Package,
    permissions: ["inventory:access"],
    mode: "admin",
    adminTab: "inventory",
  },
  {
    id: "analytics",
    label: "Analytics",
    description: "Revenue and practice pulse",
    icon: ChartLineUp,
    permissions: ["analytics:access"],
    mode: "admin",
    adminTab: "analytics",
  },
  {
    id: "channels",
    label: "Channels",
    description: "SMS, voice, labs, WhatsApp",
    icon: Plugs,
    permissions: ["channels:access"],
    mode: "admin",
    adminTab: "channels",
  },
  {
    id: "uploads",
    label: "Uploads",
    description: "Files and knowledge",
    icon: FolderSimple,
    permissions: ["uploads:use"],
    href: "/uploads",
  },
  {
    id: "settings",
    label: "Settings",
    description: "Practice and account setup",
    icon: Gear,
    permissions: ["settings:practice"],
    settings: true,
  },
]

"use client"

import { useWorkspace } from "@/lib/clinical-workspace"
import { motion, AnimatePresence } from "motion/react"
import dynamic from "next/dynamic"
import { CashDrawerBanner } from "./cash-drawer-banner"

const BentoCalendar = dynamic(() => import("./bento-calendar").then((m) => m.BentoCalendar), { ssr: false })
const BentoClaims = dynamic(() => import("./bento-claims").then((m) => m.BentoClaims), { ssr: false })
const BentoInventory = dynamic(() => import("./bento-inventory").then((m) => m.BentoInventory), { ssr: false })
const BentoInbox = dynamic(() => import("./bento-inbox").then((m) => m.BentoInbox), { ssr: false })
const BentoSales = dynamic(() => import("./bento-sales").then((m) => m.BentoSales), { ssr: false })
const PatientDirectory = dynamic(() => import("./patient-directory").then((m) => m.PatientDirectory), { ssr: false })
const CommsInbox = dynamic(() => import("./comms-inbox").then((m) => m.CommsInbox), { ssr: false })
const ChannelSetup = dynamic(() => import("./channel-setup").then((m) => m.ChannelSetup), { ssr: false })

const TAB_MAP: Record<string, React.ComponentType> = {
  calendar: BentoCalendar,
  billing: BentoClaims,
  inventory: BentoInventory,
  inbox: CommsInbox,
  analytics: BentoSales,
  patients: PatientDirectory,
  channels: ChannelSetup,
}

export function AdminDashboard() {
  const { activeAdminTab } = useWorkspace()
  const TabComponent = TAB_MAP[activeAdminTab]

  return (
    <div className="h-full flex-1 overflow-y-auto p-5" style={{ scrollbarWidth: "none" }}>
      <CashDrawerBanner />
      <AnimatePresence mode="wait">
        <motion.div
          key={activeAdminTab}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={{ duration: 0.12, ease: "easeOut" }}
          className="h-full"
        >
          {TabComponent && <TabComponent />}
        </motion.div>
      </AnimatePresence>
    </div>
  )
}

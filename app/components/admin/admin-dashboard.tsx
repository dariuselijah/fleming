"use client"

import { useWorkspace } from "@/lib/clinical-workspace"
import { cn } from "@/lib/utils"
import { motion, AnimatePresence } from "motion/react"
import dynamic from "next/dynamic"

const BentoCalendar = dynamic(() => import("./bento-calendar").then((m) => m.BentoCalendar), { ssr: false })
const BentoBillingEntry = dynamic(() => import("./bento-billing-entry").then((m) => m.BentoBillingEntry), {
  ssr: false,
})
const BentoInventory = dynamic(() => import("./bento-inventory").then((m) => m.BentoInventory), { ssr: false })
const BentoSales = dynamic(() => import("./bento-sales").then((m) => m.BentoSales), { ssr: false })
const PatientDirectory = dynamic(() => import("./patient-directory").then((m) => m.PatientDirectory), { ssr: false })
const WorkQueue = dynamic(() => import("./work-queue/work-queue").then((m) => m.WorkQueue), { ssr: false })
const ChannelSetup = dynamic(() => import("./channel-setup").then((m) => m.ChannelSetup), { ssr: false })

const TAB_MAP: Record<string, React.ComponentType> = {
  calendar: BentoCalendar,
  billing: BentoBillingEntry,
  inventory: BentoInventory,
  front_desk: WorkQueue,
  analytics: BentoSales,
  patients: PatientDirectory,
  channels: ChannelSetup,
}

export function AdminDashboard() {
  const { activeAdminTab } = useWorkspace()
  const TabComponent = TAB_MAP[activeAdminTab]
  // These tabs manage their own internal scrolling — give them a fixed height context
  const isConstrained = activeAdminTab === "front_desk" || activeAdminTab === "billing"

  return (
    <div
      className={cn(
        "h-full flex-1",
        isConstrained ? "min-h-0 overflow-hidden" : "overflow-y-auto p-5"
      )}
      style={isConstrained ? undefined : { scrollbarWidth: "none" }}
    >
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

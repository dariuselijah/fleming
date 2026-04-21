"use client"

import { useWorkspace, createPatientSession, type PracticeFlowEntry, type ConsultStatus } from "@/lib/clinical-workspace"
import { cn } from "@/lib/utils"
import {
  UserCircle,
  Clock,
  ArrowRight,
  ShieldCheck,
  MagnifyingGlass,
} from "@phosphor-icons/react"
import { motion, AnimatePresence } from "motion/react"
import { useMemo, useState, useCallback } from "react"
import { ArrivalCard } from "./arrival-card"

const STATUS_ORDER: ConsultStatus[] = [
  "checked_in",
  "waiting",
  "scribing",
  "reviewing",
  "billing",
  "finished",
  "no_show",
]

export function FrontDeskView() {
  const { openPatient, practiceFlow } = useWorkspace()
  const [search, setSearch] = useState("")
  const arrivals = practiceFlow

  const filtered = useMemo(() => {
    let result = arrivals
    if (search.trim()) {
      const q = search.toLowerCase()
      result = result.filter((a) => a.patientName.toLowerCase().includes(q))
    }
    return result.sort((a, b) => {
      const ai = STATUS_ORDER.indexOf(a.status)
      const bi = STATUS_ORDER.indexOf(b.status)
      if (ai !== bi) return ai - bi
      const at = a.appointmentTime?.getTime() ?? 0
      const bt = b.appointmentTime?.getTime() ?? 0
      return at - bt
    })
  }, [arrivals, search])

  const activeCount = arrivals.filter(
    (a) => !["finished", "no_show"].includes(a.status)
  ).length

  const handleOpenPatient = useCallback(
    (entry: PracticeFlowEntry) => {
      if (!entry.patientId?.trim()) return
      openPatient(
        createPatientSession({
          patientId: entry.patientId,
          name: entry.patientName,
          status: entry.status,
          roomNumber: entry.roomNumber,
        })
      )
    },
    [openPatient]
  )

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border/50 px-6 py-4">
        <div>
          <h1 className="text-lg font-semibold">Front Desk</h1>
          <p className="text-xs text-muted-foreground">
            {activeCount} active · {arrivals.length} total today
          </p>
        </div>
        <div className="flex items-center gap-2 rounded-xl border border-border/50 bg-muted/30 px-3 py-2">
          <MagnifyingGlass className="size-3.5 text-muted-foreground" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search patients..."
            className="w-48 bg-transparent text-xs outline-none placeholder:text-muted-foreground"
          />
        </div>
      </div>

      {/* Arrival stream */}
      <div className="flex-1 overflow-y-auto px-6 py-4" style={{ scrollbarWidth: "none" }}>
        <div className="mx-auto max-w-2xl space-y-2">
          <AnimatePresence>
            {filtered.map((entry) => (
              <motion.div
                key={entry.patientId}
                layout
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
              >
                <ArrivalCard
                  entry={entry}
                  onOpen={() => handleOpenPatient(entry)}
                />
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      </div>
    </div>
  )
}

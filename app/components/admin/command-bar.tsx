"use client"

import { useWorkspace, createPatientSession } from "@/lib/clinical-workspace"
import { cn } from "@/lib/utils"
import {
  MagnifyingGlass,
  CalendarBlank,
  Scan,
  CurrencyDollar,
  Stethoscope,
  Package,
  UserPlus,
  Command,
} from "@phosphor-icons/react"
import { motion } from "motion/react"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"

interface CommandItem {
  id: string
  label: string
  description?: string
  icon: typeof MagnifyingGlass
  action: () => void
  section: string
}

export function CommandBar() {
  const {
    setCommandBarOpen,
    setMode,
    setAdminTab,
    openPatient,
    toggleOverlay,
    openPatients,
    practiceProviders,
    patients,
    setActiveDoctor,
    requestInboxScrollTo,
  } = useWorkspace()

  const [query, setQuery] = useState("")
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const [selectedIdx, setSelectedIdx] = useState(0)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const close = useCallback(() => {
    setCommandBarOpen(false)
    setQuery("")
  }, [setCommandBarOpen])

  const commands = useMemo<CommandItem[]>(() => {
    const items: CommandItem[] = [
      {
        id: "scan-id",
        label: "/scan ID",
        description: "Scan patient ID or Medical Aid card",
        icon: Scan,
        action: () => {
          setMode("admin")
          setAdminTab("inbox")
          requestInboxScrollTo("smart-import")
          close()
        },
        section: "Commands",
      },
      {
        id: "bill",
        label: "/bill",
        description: "Open claims bureau",
        icon: CurrencyDollar,
        action: () => { setMode("admin"); setAdminTab("billing"); close() },
        section: "Commands",
      },
      {
        id: "calendar",
        label: "/calendar",
        description: "Open daily schedule",
        icon: CalendarBlank,
        action: () => { setMode("admin"); setAdminTab("calendar"); close() },
        section: "Commands",
      },
      {
        id: "inventory",
        label: "/inventory",
        description: "View stock levels",
        icon: Package,
        action: () => { setMode("admin"); setAdminTab("inventory"); close() },
        section: "Commands",
      },
      {
        id: "clinical",
        label: "Switch to Clinical",
        description: "Open clinical workspace",
        icon: Stethoscope,
        action: () => { setMode("clinical"); close() },
        section: "Navigation",
      },
    ]

    for (const p of practiceProviders) {
      items.push({
        id: `doctor-${p.id}`,
        label: p.name,
        description: p.specialty ?? "Switch provider",
        icon: UserPlus,
        action: () => { setActiveDoctor(p.id); close() },
        section: "Providers",
      })
    }

    for (const pt of patients) {
      items.push({
        id: `patient-${pt.id}`,
        label: pt.name,
        description: pt.medicalAidScheme ? `${pt.medicalAidScheme} · ${pt.memberNumber ?? ""}` : "Open patient consult",
        icon: Stethoscope,
        action: () => {
          openPatient(createPatientSession({
            patientId: pt.id,
            name: pt.name,
            age: pt.age,
            sex: pt.sex,
            medicalAidStatus: pt.medicalAidStatus === "verified" ? "active" : pt.medicalAidStatus === "terminated" ? "inactive" : pt.medicalAidStatus,
            medicalAidScheme: pt.medicalAidScheme,
            memberNumber: pt.memberNumber,
            chronicConditions: pt.chronicConditions ?? [],
            criticalAllergies: pt.allergies ?? [],
            activeMedications: pt.currentMedications ?? [],
          }))
          setMode("clinical")
          close()
        },
        section: "Patients",
      })
    }

    items.push({
      id: "patients-dir",
      label: "/patients",
      description: "Open patient directory",
      icon: UserPlus,
      action: () => { setMode("admin"); setAdminTab("patients"); close() },
      section: "Commands",
    })

    return items
  }, [close, openPatient, patients, practiceProviders, setActiveDoctor, setAdminTab, setMode, requestInboxScrollTo])

  const filtered = useMemo(() => {
    if (!query.trim()) return commands.slice(0, 8)
    const q = query.toLowerCase()
    return commands.filter(
      (c) => c.label.toLowerCase().includes(q) || (c.description?.toLowerCase().includes(q))
    )
  }, [commands, query])

  useEffect(() => {
    setSelectedIdx(0)
  }, [query])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "ArrowDown") {
        e.preventDefault()
        setSelectedIdx((i) => Math.min(i + 1, filtered.length - 1))
      } else if (e.key === "ArrowUp") {
        e.preventDefault()
        setSelectedIdx((i) => Math.max(i - 1, 0))
      } else if (e.key === "Enter" && filtered[selectedIdx]) {
        e.preventDefault()
        filtered[selectedIdx].action()
      }
    },
    [filtered, selectedIdx]
  )

  const sections = useMemo(() => {
    const map = new Map<string, CommandItem[]>()
    for (const item of filtered) {
      const arr = map.get(item.section) || []
      arr.push(item)
      map.set(item.section, arr)
    }
    return Array.from(map.entries())
  }, [filtered])

  let globalIdx = 0

  return (
    <>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm"
        onClick={close}
      />
      <motion.div
        initial={{ opacity: 0, y: -20, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: -20, scale: 0.96 }}
        transition={{ type: "spring", stiffness: 500, damping: 35 }}
        className="fixed inset-x-0 top-[15%] z-[101] mx-auto w-full max-w-xl"
      >
        <div className="overflow-hidden rounded-2xl border border-white/[0.1] bg-[#0a0a0a] shadow-2xl">
          <div className="flex items-center gap-3 border-b border-white/[0.06] px-4 py-3">
            <MagnifyingGlass className="size-4 shrink-0 text-white/30" />
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Search patients, bill @MichaelChen, or type /cmd..."
              className="flex-1 bg-transparent text-sm text-white outline-none placeholder:text-white/25"
            />
            <kbd className="flex items-center gap-0.5 rounded bg-white/[0.06] px-1.5 py-0.5 text-[10px] text-white/30">
              <Command className="size-2.5" />K
            </kbd>
          </div>

          <div ref={listRef} className="max-h-[320px] overflow-y-auto py-1" style={{ scrollbarWidth: "none" }}>
            {filtered.length === 0 ? (
              <div className="py-3">
                <p className="px-4 py-2 text-center text-[12px] text-white/25">No results for &ldquo;{query}&rdquo;</p>
                <div className="mt-1 border-t border-white/[0.04] pt-2">
                  <p className="px-4 pb-1 text-[10px] font-medium uppercase tracking-wider text-white/20">Quick Actions</p>
                  <button
                    type="button"
                    onClick={() => { setMode("admin"); setAdminTab("patients"); close() }}
                    className="flex w-full items-center gap-3 px-4 py-2 text-left text-white/60 transition-colors hover:bg-white/[0.06] hover:text-white"
                  >
                    <UserPlus className="size-4 shrink-0 text-[#00E676]" />
                    <div className="min-w-0 flex-1">
                      <span className="text-[12px] font-medium">Register &ldquo;{query}&rdquo; as New Patient</span>
                      <span className="ml-2 text-[11px] text-white/30">Open patient directory</span>
                    </div>
                  </button>
                </div>
              </div>
            ) : (
              sections.map(([section, items]) => (
                <div key={section}>
                  <p className="px-4 pt-2 pb-1 text-[10px] font-medium uppercase tracking-wider text-white/20">
                    {section}
                  </p>
                  {items.map((item) => {
                    const idx = globalIdx++
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={item.action}
                        onMouseEnter={() => setSelectedIdx(idx)}
                        className={cn(
                          "flex w-full items-center gap-3 px-4 py-2 text-left transition-colors",
                          idx === selectedIdx
                            ? "bg-white/[0.06] text-white"
                            : "text-white/60 hover:bg-white/[0.03]"
                        )}
                      >
                        <item.icon className="size-4 shrink-0" weight={idx === selectedIdx ? "fill" : "regular"} />
                        <div className="min-w-0 flex-1">
                          <span className="text-[12px] font-medium">{item.label}</span>
                          {item.description && (
                            <span className="ml-2 text-[11px] text-white/30">{item.description}</span>
                          )}
                        </div>
                      </button>
                    )
                  })}
                </div>
              ))
            )}
          </div>
        </div>
      </motion.div>
    </>
  )
}

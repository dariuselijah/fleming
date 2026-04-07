"use client"

import { useWorkspace, type AdminTab, type ConsultStatus, type WorkspaceMode } from "@/lib/clinical-workspace"
import { cn } from "@/lib/utils"
import {
  X,
  Plus,
  CalendarBlank,
  Package,
  ChartLineUp,
  Stethoscope,
  SquaresFour,
  Tray,
  CurrencyDollar,
  CaretDown,
  UsersThree,
  Gear,
  Plugs,
} from "@phosphor-icons/react"
import { FlemingIcon } from "@/components/icons/zola"
import { UserMenu } from "@/app/components/layout/user-menu"
import { motion, AnimatePresence } from "motion/react"
import { useCallback, useState, useRef, useEffect } from "react"
import Link from "next/link"

const STATUS_COLORS: Record<ConsultStatus, string> = {
  waiting: "bg-amber-500",
  checked_in: "bg-blue-500",
  scribing: "bg-indigo-500",
  reviewing: "bg-purple-500",
  billing: "bg-emerald-500",
  finished: "bg-muted-foreground",
  no_show: "bg-red-500",
}

const MODE_ITEMS: { id: WorkspaceMode; label: string; icon: typeof Stethoscope }[] = [
  { id: "clinical", label: "Clinical", icon: Stethoscope },
  { id: "admin", label: "Admin", icon: SquaresFour },
]

const ADMIN_TABS: { id: AdminTab; label: string; icon: typeof Tray }[] = [
  { id: "inbox", label: "Inbox", icon: Tray },
  { id: "calendar", label: "Calendar", icon: CalendarBlank },
  { id: "billing", label: "Billing", icon: CurrencyDollar },
  { id: "inventory", label: "Inventory", icon: Package },
  { id: "analytics", label: "Analytics", icon: ChartLineUp },
  { id: "patients", label: "Patients", icon: UsersThree },
  { id: "channels", label: "Channels", icon: Plugs },
  { id: "settings", label: "Settings", icon: Gear },
]

export function PatientTabBar() {
  const {
    mode,
    setMode,
    openPatients,
    activePatient,
    setActivePatient,
    closePatient,
    toggleOverlay,
    activeAdminTab,
    setAdminTab,
    activeDoctorId,
    practiceProviders,
    setActiveDoctor,
  } = useWorkspace()

  const [doctorOpen, setDoctorOpen] = useState(false)
  const doctorRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!doctorOpen) return
    function close(e: MouseEvent) {
      if (doctorRef.current && !doctorRef.current.contains(e.target as Node)) setDoctorOpen(false)
    }
    document.addEventListener("mousedown", close)
    return () => document.removeEventListener("mousedown", close)
  }, [doctorOpen])

  const handleClose = useCallback(
    (e: React.MouseEvent, patientId: string) => {
      e.stopPropagation()
      closePatient(patientId)
    },
    [closePatient]
  )

  const activeDoctor = practiceProviders.find((p) => p.id === activeDoctorId) ?? practiceProviders[0]

  return (
    <div
      className={cn(
        "flex min-h-11 shrink-0 items-center gap-1 border-b border-border/40 bg-muted/20 px-3 pb-2",
        "pt-[max(0.5rem,env(safe-area-inset-top,0px))]"
      )}
    >
      <Link
        href="/"
        className="mr-1 flex items-center gap-1.5 text-sm font-semibold tracking-tight text-foreground"
      >
        <FlemingIcon className="size-3.5" />
      </Link>

      <div className="mx-1 h-4 w-px bg-border/50" />

      {/* Mode pill */}
      <div className="flex items-center rounded-lg bg-muted/40 p-0.5">
        {MODE_ITEMS.map((m) => (
          <button
            key={m.id}
            type="button"
            onClick={() => setMode(m.id)}
            className={cn(
              "flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium transition-all",
              mode === m.id
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <m.icon className="size-3" weight={mode === m.id ? "fill" : "regular"} />
            {m.label}
          </button>
        ))}
      </div>

      {/* Provider switcher */}
      {activeDoctor && (
        <div ref={doctorRef} className="relative ml-1">
          <button
            type="button"
            onClick={() => setDoctorOpen(!doctorOpen)}
            className="flex items-center gap-1 rounded-lg bg-muted/30 px-2 py-1 text-[11px] font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            {activeDoctor.name}
            <CaretDown className="size-2.5" />
          </button>
          <AnimatePresence>
            {doctorOpen && (
              <motion.div
                initial={{ opacity: 0, y: -4, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -4, scale: 0.95 }}
                className="absolute left-0 top-full z-50 mt-1 min-w-[160px] rounded-lg border border-border/50 bg-background p-1 shadow-xl"
              >
                {practiceProviders.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => { setActiveDoctor(p.id); setDoctorOpen(false) }}
                    className={cn(
                      "flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-xs transition-colors",
                      p.id === activeDoctor.id
                        ? "bg-muted/50 text-foreground"
                        : "text-muted-foreground hover:bg-muted/30 hover:text-foreground"
                    )}
                  >
                    <span className="font-medium">{p.name}</span>
                    {p.specialty && <span className="text-[10px] text-muted-foreground/60">{p.specialty}</span>}
                  </button>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}

      <div className="mx-1 h-4 w-px bg-border/50" />

      {/* Mode-aware center content */}
      {mode === "clinical" ? (
        <>
          <AnimatePresence mode="popLayout">
            {openPatients.map((patient) => {
              const isActive = patient.patientId === activePatient?.patientId
              return (
                <motion.div
                  key={patient.patientId}
                  role="tab"
                  tabIndex={0}
                  layout
                  initial={{ opacity: 0, scale: 0.9, width: 0 }}
                  animate={{ opacity: 1, scale: 1, width: "auto" }}
                  exit={{ opacity: 0, scale: 0.9, width: 0 }}
                  transition={{ type: "spring", stiffness: 500, damping: 35 }}
                  onClick={() => setActivePatient(patient.patientId)}
                  onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") setActivePatient(patient.patientId) }}
                  className={cn(
                    "group relative flex cursor-pointer items-center gap-2 rounded-md px-2.5 py-1 text-xs font-medium transition-all select-none",
                    isActive
                      ? "bg-background text-foreground shadow-sm ring-1 ring-border/50"
                      : "text-muted-foreground hover:bg-background/60 hover:text-foreground"
                  )}
                >
                  <span className={cn("size-1.5 shrink-0 rounded-full", STATUS_COLORS[patient.status])} />
                  <span className="max-w-[140px] truncate">{patient.name}</span>
                  <button
                    type="button"
                    onClick={(e) => handleClose(e, patient.patientId)}
                    className="ml-0.5 inline-flex size-4 items-center justify-center rounded-sm opacity-0 transition-opacity hover:bg-muted group-hover:opacity-100"
                    aria-label={`Close ${patient.name}`}
                  >
                    <X className="size-2.5" />
                  </button>
                </motion.div>
              )
            })}
          </AnimatePresence>
          <button
            type="button"
            onClick={() => toggleOverlay("calendar")}
            className="inline-flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-background/60 hover:text-foreground"
            aria-label="Open patient — search or schedule"
          >
            <Plus className="size-3.5" />
          </button>
        </>
      ) : mode === "admin" ? (
        <div className="flex items-center gap-0.5">
          {ADMIN_TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setAdminTab(tab.id)}
              className={cn(
                "flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-all",
                activeAdminTab === tab.id
                  ? "bg-background text-foreground shadow-sm ring-1 ring-border/50"
                  : "text-muted-foreground hover:bg-background/60 hover:text-foreground"
              )}
            >
              <tab.icon className="size-3.5" weight={activeAdminTab === tab.id ? "fill" : "regular"} />
              {tab.label}
            </button>
          ))}
        </div>
      ) : null}

      {/* Right-side utilities */}
      <div className="ml-auto flex items-center">
        <UserMenu />
      </div>
    </div>
  )
}

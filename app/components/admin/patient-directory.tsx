"use client"

import { useWorkspace, createPatientSession, useWorkspaceStore } from "@/lib/clinical-workspace"
import type {
  PracticePatient,
  PracticeAppointment,
  MedicalAidVerification,
  PatientMedication,
  PatientSession,
} from "@/lib/clinical-workspace"
import {
  findDuplicatePatient,
  isPracticePatientProfileIncomplete,
  type PatientRegistrationPrefill,
} from "@/lib/clinical/smart-import-patient"
import { encryptPatientProfile, usePracticeCrypto } from "@/lib/clinical-workspace/practice-crypto-context"
import {
  encounterPlainToSessionPartial,
  scribePartialFromPlain,
  type EncounterStatePlain,
} from "@/lib/clinical-workspace/encounter-state"
import { fetchLatestEncounterPlain } from "@/lib/clinical-workspace/fetch-latest-encounter"
import { decryptJson } from "@/lib/crypto/practice-e2ee"
import { createClient } from "@/lib/supabase/client"
import { useUser } from "@/lib/user-store/provider"
import { useEligibilityCheck } from "@/lib/hooks/use-eligibility-check"
import type { EligibilityResponse, FamilyEligibilityResponse } from "@/lib/medikredit/types"
import { MediKreditAccreditationModal } from "@/app/components/medikredit/medi-kredit-accreditation-modal"
import { BentoTile } from "./bento-tile"
import { cn } from "@/lib/utils"
import { toast } from "sonner"
import {
  MagnifyingGlass,
  Plus,
  PlusCircle,
  CalendarBlank,
  Stethoscope,
  ArrowUp,
  ArrowDown,
  UserCircle,
  X,
  Check,
  IdentificationCard,
  Heartbeat,
  Eye,
  Camera,
  Upload,
  Spinner,
  ToggleLeft,
  ToggleRight,
  Pill,
  CurrencyDollar,
  ClockCounterClockwise,
  PencilSimple,
  ShieldCheck,
  UsersThree,
  CalendarCheck,
  ChatCircle,
  SpinnerGap,
  CheckCircle,
  XCircle,
} from "@phosphor-icons/react"
import { useMemo, useState, useCallback, useRef, useEffect } from "react"
import { AnimatePresence, motion } from "motion/react"

type SortKey = "name" | "lastVisit" | "balance" | "status"
type SortDir = "asc" | "desc"

const STATUS_CONFIG: Record<MedicalAidVerification, { label: string; dot: string; text: string }> = {
  verified: { label: "Active", dot: "bg-[#00E676]", text: "text-[#00E676]" },
  pending: { label: "Pending", dot: "bg-[#FFC107]", text: "text-[#FFC107]" },
  terminated: { label: "Terminated", dot: "bg-[#EF5350]", text: "text-[#EF5350]" },
  unknown: { label: "Unknown", dot: "bg-white/20", text: "text-white/40" },
}

const MA_SCHEMES = ["Discovery", "Bonitas", "Momentum", "GEMS", "Medihelp", "Bestmed", "Fedhealth"]

function ColHeader({
  label,
  sortKey,
  currentSort,
  currentDir,
  onSort,
  className,
}: {
  label: string
  sortKey: SortKey
  currentSort: SortKey
  currentDir: SortDir
  onSort: (k: SortKey) => void
  className?: string
}) {
  const active = currentSort === sortKey
  return (
    <button
      type="button"
      onClick={() => onSort(sortKey)}
      className={cn("group flex items-center gap-1 text-[10px] uppercase tracking-wider text-white/30 transition-colors hover:text-white/60", className)}
    >
      {label}
      {active ? (
        currentDir === "asc" ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" />
      ) : (
        <ArrowDown className="size-3 opacity-0 group-hover:opacity-40" />
      )}
    </button>
  )
}

// ── SA ID Utilities ──

function extractDobFromSaId(id: string): string | null {
  if (id.length < 6) return null
  const yy = parseInt(id.slice(0, 2), 10)
  const mm = id.slice(2, 4)
  const dd = id.slice(4, 6)
  const century = yy >= 0 && yy <= 30 ? "20" : "19"
  return `${century}${id.slice(0, 2)}-${mm}-${dd}`
}

function extractSexFromSaId(id: string): "M" | "F" | undefined {
  if (id.length < 10) return undefined
  const genderDigit = parseInt(id[6], 10)
  return genderDigit >= 5 ? "M" : "F"
}

function calculateAge(dob: string): number {
  const birth = new Date(dob)
  const today = new Date()
  let age = today.getFullYear() - birth.getFullYear()
  const m = today.getMonth() - birth.getMonth()
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--
  return age
}

export type PracticePatientDraft = Omit<PracticePatient, "id">

// ── Main Component ──

export function PatientDirectory() {
  const { user } = useUser()
  const { practiceId, dekKey, unlocked } = usePracticeCrypto()
  const {
    patients,
    claims,
    setMode,
    setAdminTab,
    openPatient,
    addPatient,
    updatePatient,
    beginNewVisitForPatient,
  } = useWorkspace()
  const [schemeNames, setSchemeNames] = useState<string[]>(MA_SCHEMES)
  const [search, setSearch] = useState("")
  const [sortKey, setSortKey] = useState<SortKey>("name")
  const [sortDir, setSortDir] = useState<SortDir>("asc")
  const [showRegister, setShowRegister] = useState(false)
  const [selectedPatientId, setSelectedPatientId] = useState<string | null>(null)
  const [registerError, setRegisterError] = useState<string | null>(null)
  const patientAddModalOpenNonce = useWorkspaceStore((s) => s.patientAddModalOpenNonce)
  const patientAddModalPrefill = useWorkspaceStore((s) => s.patientAddModalPrefill)

  useEffect(() => {
    if (patientAddModalPrefill && patientAddModalOpenNonce > 0) {
      setShowRegister(true)
    }
  }, [patientAddModalPrefill, patientAddModalOpenNonce])

  useEffect(() => {
    const supabase = createClient()
    if (!supabase) return
    let cancelled = false
    void supabase
      .from("medical_schemes")
      .select("name")
      .order("name")
      .then(({ data }) => {
        if (cancelled || !data?.length) return
        setSchemeNames(data.map((r) => String((r as { name: string }).name)))
      })
    return () => {
      cancelled = true
    }
  }, [])

  const handleSort = useCallback(
    (key: SortKey) => {
      if (key === sortKey) {
        setSortDir((d) => (d === "asc" ? "desc" : "asc"))
      } else {
        setSortKey(key)
        setSortDir("asc")
      }
    },
    [sortKey]
  )

  const filtered = useMemo(() => {
    let items = [...patients]
    if (search.trim()) {
      const q = search.toLowerCase()
      items = items.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          p.idNumber?.includes(q) ||
          p.memberNumber?.toLowerCase().includes(q) ||
          p.medicalAidScheme?.toLowerCase().includes(q)
      )
    }
    items.sort((a, b) => {
      const m = sortDir === "asc" ? 1 : -1
      switch (sortKey) {
        case "name":
          return a.name.localeCompare(b.name) * m
        case "lastVisit":
          return ((a.lastVisit ?? "").localeCompare(b.lastVisit ?? "")) * m
        case "balance":
          return (a.outstandingBalance - b.outstandingBalance) * m
        case "status":
          return a.medicalAidStatus.localeCompare(b.medicalAidStatus) * m
      }
    })
    return items
  }, [patients, search, sortKey, sortDir])

  const stats = useMemo(() => {
    const verified = patients.filter((p) => p.medicalAidStatus === "verified").length
    const pending = patients.filter((p) => p.medicalAidStatus === "pending" || p.medicalAidStatus === "unknown").length
    const chronic = patients.filter((p) => (p.chronicConditions?.length ?? 0) > 0).length
    const incompleteProfiles = patients.filter((p) => p.profileIncomplete).length
    return { total: patients.length, verified, pending, chronic, incompleteProfiles }
  }, [patients])

  const selectedPatient = useMemo(
    () => patients.find((p) => p.id === selectedPatientId) ?? null,
    [patients, selectedPatientId]
  )

  const handleBookAppointment = useCallback(
    (_patient: PracticePatient) => {
      setAdminTab("calendar")
    },
    [setAdminTab]
  )

  const handleStartScribe = useCallback(
    async (patient: PracticePatient) => {
      let encounterId: string | undefined
      let fromEncounter: Partial<PatientSession> = {}
      let plainForScribe: EncounterStatePlain | null = null

      if (practiceId && dekKey && unlocked) {
        const supabase = createClient()
        if (supabase) {
          const row = await fetchLatestEncounterPlain({
            supabase,
            practiceId,
            patientId: patient.id,
            chatId: null,
            dekKey,
          })
          if (row) {
            encounterId = row.encounterId
            fromEncounter = encounterPlainToSessionPartial(row.plain)
            plainForScribe = row.plain
          }
        }
      }

      const session = createPatientSession({
        patientId: patient.id,
        name: patient.name,
        clinicalEncounterId: encounterId,
        age: patient.age,
        sex: patient.sex,
        medicalAidStatus:
          patient.medicalAidStatus === "verified"
            ? "active"
            : patient.medicalAidStatus === "terminated"
              ? "inactive"
              : patient.medicalAidStatus,
        medicalAidScheme: patient.medicalAidScheme,
        memberNumber: patient.memberNumber,
        chronicConditions: patient.chronicConditions,
        criticalAllergies: patient.allergies,
        activeMedications: patient.currentMedications,
        ...fromEncounter,
      })
      openPatient(session)
      if (plainForScribe) {
        const s = scribePartialFromPlain(plainForScribe)
        useWorkspaceStore.setState({
          scribeTranscript: s.transcript,
          scribeSegments: s.segments,
          scribeEntities: s.entities,
          scribeHighlights: s.highlights,
          scribeEntityStatus: s.entityStatus,
        })
      } else {
        useWorkspaceStore.getState().clearScribeTranscript()
      }
      setMode("clinical")
    },
    [dekKey, openPatient, practiceId, setMode, unlocked]
  )

  const handleStartNewVisit = useCallback(
    (patient: PracticePatient) => {
      const existing = useWorkspaceStore.getState().openPatients.find((p) => p.patientId === patient.id)
      if (existing) {
        beginNewVisitForPatient(patient.id)
      } else {
        const session = createPatientSession({
          patientId: patient.id,
          name: patient.name,
          age: patient.age,
          sex: patient.sex,
          medicalAidStatus:
            patient.medicalAidStatus === "verified"
              ? "active"
              : patient.medicalAidStatus === "terminated"
                ? "inactive"
                : patient.medicalAidStatus,
          medicalAidScheme: patient.medicalAidScheme,
          memberNumber: patient.memberNumber,
          chronicConditions: patient.chronicConditions,
          criticalAllergies: patient.allergies,
          activeMedications: patient.currentMedications,
          status: "checked_in",
        })
        openPatient(session)
        useWorkspaceStore.getState().clearScribeTranscript()
      }
      setMode("clinical")
    },
    [beginNewVisitForPatient, openPatient, setMode]
  )

  const handleViewPatient = useCallback((patient: PracticePatient) => {
    setSelectedPatientId(patient.id)
  }, [])

  const handleCreatePatient = useCallback(
    async (draft: PracticePatientDraft) => {
      setRegisterError(null)
      const dup = findDuplicatePatient(patients, {
        idNumber: draft.idNumber,
        passportNumber: draft.passportNumber,
      })
      if (dup) {
        setRegisterError(
          `This practice already has a patient with this SA ID or passport number (${dup.name}). Open their file or use a different identifier.`
        )
        return
      }
      const supabase = createClient()
      if (practiceId && dekKey && unlocked && supabase && user?.id) {
        try {
          const profile = { ...draft } as Record<string, unknown>
          const { ciphertext, iv } = await encryptPatientProfile(dekKey, profile)
          const { data, error } = await supabase
            .from("practice_patients")
            .insert({
              practice_id: practiceId,
              profile_ciphertext: ciphertext,
              profile_iv: iv,
              display_name_hint: draft.name,
              created_by: user.id,
            })
            .select("id")
            .single()
          if (!error && data?.id) {
            addPatient({ ...draft, id: data.id as string })
            setShowRegister(false)
            return
          }
          console.warn("[PatientDirectory] insert practice_patients", error)
        } catch (e) {
          console.warn("[PatientDirectory] persist patient", e)
        }
      }
      addPatient({ ...draft, id: crypto.randomUUID() })
      setShowRegister(false)
    },
    [addPatient, dekKey, patients, practiceId, unlocked, user?.id]
  )

  return (
    <div className="flex h-full flex-col gap-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">Patient Directory</h2>
          <p className="text-[11px] text-white/30">{stats.total} registered patients</p>
        </div>
        <button
          type="button"
          onClick={() => setShowRegister(true)}
          className="flex items-center gap-1.5 rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 py-1.5 text-xs font-medium text-white/70 transition-colors hover:bg-white/[0.08] hover:text-white"
        >
          <Plus className="size-3.5" weight="bold" />
          Add Patient
        </button>
      </div>

      {/* Top Stats */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <StatCard label="Total Patients" value={stats.total} />
        <StatCard label="Verified MA" value={stats.verified} accent="text-[#00E676]" />
        <StatCard label="Pending Verification" value={stats.pending} accent="text-[#FFC107]" />
        <StatCard label="Chronic Conditions" value={stats.chronic} accent="text-blue-400" />
        <StatCard
          label="Incomplete profiles"
          value={stats.incompleteProfiles}
          accent={stats.incompleteProfiles > 0 ? "text-amber-400" : "text-white/30"}
        />
      </div>

      {/* Bento Grid */}
      <div className="grid min-h-0 flex-1 grid-cols-[1fr_280px] gap-4">
        {/* Main Table */}
        <BentoTile className="min-h-0 flex-col">
          <div className="mb-3 flex items-center gap-2">
            <div className="relative flex-1">
              <MagnifyingGlass className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-white/25" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by name, ID, member number..."
                className="w-full rounded-lg border border-white/[0.06] bg-white/[0.02] py-2 pl-8 pr-3 text-xs text-foreground placeholder:text-white/20 focus:border-white/[0.12] focus:outline-none"
              />
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-auto" style={{ scrollbarWidth: "none" }}>
            <table className="w-full text-left">
              <thead className="sticky top-0 z-10 bg-black/80 backdrop-blur-sm">
                <tr className="border-b border-white/[0.06]">
                  <th className="pb-2 pl-2 pr-3">
                    <ColHeader label="Patient" sortKey="name" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} />
                  </th>
                  <th className="px-3 pb-2">
                    <ColHeader label="Last Visit" sortKey="lastVisit" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} />
                  </th>
                  <th className="px-3 pb-2">
                    <ColHeader label="MA Status" sortKey="status" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} />
                  </th>
                  <th className="px-3 pb-2">
                    <ColHeader label="Balance" sortKey="balance" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} className="justify-end" />
                  </th>
                  <th className="px-3 pb-2 text-right">
                    <span className="text-[10px] uppercase tracking-wider text-white/30">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((patient) => (
                  <PatientRow
                    key={patient.id}
                    patient={patient}
                    onBook={handleBookAppointment}
                    onScribe={handleStartScribe}
                    onNewVisit={handleStartNewVisit}
                    onView={handleViewPatient}
                    isSelected={patient.id === selectedPatientId}
                  />
                ))}
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={5} className="py-16 text-center">
                      <UserCircle className="mx-auto mb-2 size-8 text-white/10" />
                      <p className="text-xs text-white/30">
                        {search ? "No patients match your search" : "No patients registered"}
                      </p>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </BentoTile>

        {/* Right Column */}
        <div className="flex flex-col gap-4">
          <BentoTile
            title="Registration Funnel"
            subtitle="Onboarding status"
            icon={<IdentificationCard className="size-4" />}
            glow={stats.pending > 0 ? "amber" : undefined}
          >
            <div className="space-y-3">
              <FunnelRow label="Complete Profiles" value={stats.verified} total={stats.total} color="bg-[#00E676]" />
              <FunnelRow label="Missing ID/MA Photo" value={stats.pending} total={stats.total} color="bg-[#FFC107]" />
              <FunnelRow label="Never Visited" value={patients.filter((p) => !p.lastVisit).length} total={stats.total} color="bg-[#EF5350]" />
            </div>
          </BentoTile>

          <BentoTile
            title="Demographic Pulse"
            subtitle="Patient base overview"
            icon={<Heartbeat className="size-4" />}
          >
            <div className="space-y-4">
              <div>
                <p className="mb-2 text-[10px] font-medium uppercase tracking-wider text-white/30">Age Groups</p>
                <div className="flex gap-1">
                  {(() => {
                    const ranges = [
                      { label: "18-30", min: 18, max: 30 },
                      { label: "31-45", min: 31, max: 45 },
                      { label: "46-60", min: 46, max: 60 },
                      { label: "60+", min: 60, max: 120 },
                    ]
                    const counts = ranges.map((r) => patients.filter((p) => (p.age ?? 0) >= r.min && (p.age ?? 0) <= r.max).length)
                    const max = Math.max(...counts, 1)
                    return ranges.map((r, i) => (
                      <div key={r.label} className="flex flex-1 flex-col items-center gap-1">
                        <div className="relative h-12 w-full rounded-md bg-white/[0.04]">
                          <div
                            className="absolute bottom-0 w-full rounded-md bg-blue-500/30"
                            style={{ height: `${(counts[i] / max) * 100}%` }}
                          />
                        </div>
                        <span className="text-[9px] text-white/30">{r.label}</span>
                        <span className="text-[10px] font-bold tabular-nums">{counts[i]}</span>
                      </div>
                    ))
                  })()}
                </div>
              </div>

              <div>
                <p className="mb-2 text-[10px] font-medium uppercase tracking-wider text-white/30">Top Chronic Conditions</p>
                <div className="space-y-1">
                  {(() => {
                    const condMap: Record<string, number> = {}
                    patients.forEach((p) => p.chronicConditions?.forEach((c) => { condMap[c] = (condMap[c] ?? 0) + 1 }))
                    return Object.entries(condMap)
                      .sort(([, a], [, b]) => b - a)
                      .slice(0, 4)
                      .map(([cond, count]) => (
                        <div key={cond} className="flex items-center justify-between rounded-md px-1.5 py-1 transition-colors hover:bg-white/[0.03]">
                          <span className="text-[11px] text-white/60">{cond}</span>
                          <span className="text-[10px] font-bold tabular-nums text-white/40">{count}</span>
                        </div>
                      ))
                  })()}
                </div>
              </div>

              <div>
                <p className="mb-2 text-[10px] font-medium uppercase tracking-wider text-white/30">Gender</p>
                <div className="flex gap-3">
                  {[
                    { label: "Male", count: patients.filter((p) => p.sex === "M").length, color: "text-blue-400" },
                    { label: "Female", count: patients.filter((p) => p.sex === "F").length, color: "text-pink-400" },
                  ].map((g) => (
                    <div key={g.label} className="flex items-center gap-1.5 text-[11px]">
                      <span className={cn("font-bold tabular-nums", g.color)}>{g.count}</span>
                      <span className="text-white/30">{g.label}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </BentoTile>
        </div>
      </div>

      {/* Register Modal */}
      <AnimatePresence>
        {showRegister && (
          <AddPatientModal
            schemeOptions={schemeNames}
            smartImportPrefillNonce={patientAddModalOpenNonce}
            registrationError={registerError}
            onClose={() => {
              setShowRegister(false)
              setRegisterError(null)
            }}
            onCreate={handleCreatePatient}
          />
        )}
      </AnimatePresence>

      {/* Patient File Panel */}
      <AnimatePresence>
        {selectedPatient && (
          <PatientFilePanel
            patient={selectedPatient}
            claims={claims}
            onClose={() => setSelectedPatientId(null)}
            onUpdate={(id, update) => updatePatient(id, update)}
          />
        )}
      </AnimatePresence>
    </div>
  )
}

// ── Patient Row ──

function PatientRow({
  patient,
  onBook,
  onScribe,
  onNewVisit,
  onView,
  isSelected,
}: {
  patient: PracticePatient
  onBook: (p: PracticePatient) => void
  onScribe: (p: PracticePatient) => void
  onNewVisit: (p: PracticePatient) => void
  onView: (p: PracticePatient) => void
  isSelected: boolean
}) {
  const status = STATUS_CONFIG[patient.medicalAidStatus]
  return (
    <tr
      className={cn(
        "group cursor-pointer border-b border-white/[0.03] transition-colors hover:bg-white/[0.03]",
        isSelected && "bg-white/[0.05]"
      )}
      onClick={() => onView(patient)}
    >
      <td className="py-2.5 pl-2 pr-3">
        <div className="flex items-center gap-2.5">
          <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-white/[0.06] text-[10px] font-bold text-white/40">
            {patient.name.split(" ").map((n) => n[0]).join("")}
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-1.5">
              <p className="text-xs font-medium text-foreground">{patient.name}</p>
              {patient.profileIncomplete ? (
                <span className="shrink-0 rounded bg-amber-500/15 px-1.5 py-0.5 text-[8px] font-semibold uppercase tracking-wide text-amber-400">
                  Incomplete
                </span>
              ) : null}
            </div>
            <p className="truncate text-[10px] text-white/25">
              {patient.idNumber ?? "No ID"}{patient.medicalAidScheme ? ` · ${patient.medicalAidScheme}` : ""}
            </p>
          </div>
        </div>
      </td>
      <td className="px-3 py-2.5">
        <span className="text-[11px] tabular-nums text-white/50">
          {patient.lastVisit
            ? new Date(patient.lastVisit).toLocaleDateString("en-ZA", { day: "numeric", month: "short" })
            : "—"}
        </span>
      </td>
      <td className="px-3 py-2.5">
        <div className="flex items-center gap-1.5">
          <span className={cn("size-1.5 rounded-full", status.dot)} />
          <span className={cn("text-[10px] font-medium", status.text)}>{status.label}</span>
        </div>
      </td>
      <td className="px-3 py-2.5 text-right">
        <span className={cn("text-[11px] font-bold tabular-nums", patient.outstandingBalance > 0 ? "text-[#FFC107]" : "text-white/30")}>
          {patient.outstandingBalance > 0 ? `R${patient.outstandingBalance.toLocaleString()}` : "—"}
        </span>
      </td>
      <td className="px-3 py-2.5 text-right">
        <div className="flex items-center justify-end gap-1 opacity-0 transition-opacity group-hover:opacity-100">
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onBook(patient) }}
            className="rounded-md border border-white/[0.06] px-2 py-1 text-[10px] text-white/50 transition-colors hover:bg-white/[0.06] hover:text-white"
            title="Book appointment"
          >
            <CalendarBlank className="size-3" weight="bold" />
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              onNewVisit(patient)
            }}
            className="rounded-md border border-white/[0.06] px-2 py-1 text-[10px] text-white/50 transition-colors hover:bg-sky-500/10 hover:text-sky-400"
            title="New visit — fresh encounter"
          >
            <PlusCircle className="size-3" weight="bold" />
          </button>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onScribe(patient) }}
            className="rounded-md border border-white/[0.06] px-2 py-1 text-[10px] text-white/50 transition-colors hover:bg-[#00E676]/10 hover:text-[#00E676]"
            title="Resume last visit / scribe"
          >
            <Stethoscope className="size-3" weight="bold" />
          </button>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onView(patient) }}
            className="rounded-md border border-white/[0.06] px-2 py-1 text-[10px] text-white/50 transition-colors hover:bg-white/[0.06] hover:text-white"
            title="View patient file"
          >
            <Eye className="size-3" weight="bold" />
          </button>
        </div>
      </td>
    </tr>
  )
}

// ── Stat Card ──

function StatCard({ label, value, accent }: { label: string; value: number; accent?: string }) {
  return (
    <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-3">
      <p className="text-[10px] text-white/30">{label}</p>
      <p className={cn("mt-0.5 text-xl font-bold tabular-nums", accent ?? "text-foreground")}>{value}</p>
    </div>
  )
}

// ── Funnel Row ──

function FunnelRow({ label, value, total, color }: { label: string; value: number; total: number; color: string }) {
  const pct = total > 0 ? (value / total) * 100 : 0
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-[11px]">
        <span className="text-white/50">{label}</span>
        <span className="font-bold tabular-nums">{value}</span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/[0.04]">
        <div className={cn("h-full rounded-full transition-all", color)} style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

// ── Add Patient Modal ──

type ModalTab = "manual" | "scan"

interface ManualFormState {
  title: string
  firstName: string
  lastName: string
  idNumber: string
  dateOfBirth: string
  sex: string
  phone: string
  email: string
  address: string
  hasMedicalAid: boolean
  scheme: string
  plan: string
  memberNumber: string
  dependentCode: string
  mainMemberName: string
  emergencyName: string
  emergencyRelationship: string
  emergencyPhone: string
  allergies: string
  chronicConditions: string
}

const INITIAL_FORM: ManualFormState = {
  title: "",
  firstName: "",
  lastName: "",
  idNumber: "",
  dateOfBirth: "",
  sex: "",
  phone: "+27 ",
  email: "",
  address: "",
  hasMedicalAid: false,
  scheme: "",
  plan: "",
  memberNumber: "",
  dependentCode: "",
  mainMemberName: "",
  emergencyName: "",
  emergencyRelationship: "",
  emergencyPhone: "",
  allergies: "",
  chronicConditions: "",
}

function registrationPrefillToManualForm(p: PatientRegistrationPrefill): Partial<ManualFormState> {
  const out: Partial<ManualFormState> = {}
  if (p.title !== undefined) out.title = p.title
  if (p.firstName !== undefined) out.firstName = p.firstName
  if (p.lastName !== undefined) out.lastName = p.lastName
  if (p.idNumber !== undefined) out.idNumber = p.idNumber.replace(/\D/g, "").slice(0, 13)
  if (p.dateOfBirth !== undefined) out.dateOfBirth = p.dateOfBirth
  if (p.sex !== undefined) out.sex = p.sex
  if (p.email !== undefined) out.email = p.email
  if (p.scheme !== undefined) out.scheme = p.scheme
  if (p.plan !== undefined) out.plan = p.plan
  if (p.memberNumber !== undefined) out.memberNumber = p.memberNumber
  if (p.dependentCode !== undefined) out.dependentCode = p.dependentCode
  if (p.mainMemberName !== undefined) out.mainMemberName = p.mainMemberName
  if (p.hasMedicalAid !== undefined) {
    out.hasMedicalAid = p.hasMedicalAid
  } else if (p.scheme || p.memberNumber) {
    out.hasMedicalAid = true
  }
  if (p.phone !== undefined) {
    const ph = p.phone.trim()
    if (ph.startsWith("+")) out.phone = ph
    else if (ph.replace(/\D/g, "").length >= 9) {
      const d = ph.replace(/\D/g, "")
      out.phone = d.startsWith("27") ? `+${d}` : `+27${d.replace(/^0/, "")}`
    }
  }
  return out
}

function AddPatientModal({
  onClose,
  onCreate,
  schemeOptions,
  smartImportPrefillNonce = 0,
  registrationError,
}: {
  onClose: () => void
  onCreate: (p: PracticePatientDraft) => void | Promise<void>
  schemeOptions: string[]
  smartImportPrefillNonce?: number
  registrationError?: string | null
}) {
  const [tab, setTab] = useState<ModalTab>("manual")
  const [form, setForm] = useState<ManualFormState>(INITIAL_FORM)
  const [schemeOpen, setSchemeOpen] = useState(false)
  const schemeRef = useRef<HTMLDivElement>(null)

  // Smart Scan state
  const [scanStage, setScanStage] = useState<"idle" | "scanning" | "confirm">("idle")
  const [scanData, setScanData] = useState<Partial<ManualFormState> | null>(null)

  useEffect(() => {
    if (smartImportPrefillNonce <= 0) return
    const prefill = useWorkspaceStore.getState().patientAddModalPrefill
    if (!prefill) return
    setForm((f) => ({
      ...INITIAL_FORM,
      ...registrationPrefillToManualForm(prefill),
    }))
    setTab("manual")
    useWorkspaceStore.getState().clearPatientAddModalPrefill()
  }, [smartImportPrefillNonce])

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (schemeRef.current && !schemeRef.current.contains(e.target as Node)) setSchemeOpen(false)
    }
    document.addEventListener("mousedown", handleClick)
    return () => document.removeEventListener("mousedown", handleClick)
  }, [])

  const set = useCallback(<K extends keyof ManualFormState>(key: K, value: ManualFormState[K]) => {
    setForm((f) => ({ ...f, [key]: value }))
  }, [])

  const handleIdChange = useCallback((val: string) => {
    const digits = val.replace(/\D/g, "").slice(0, 13)
    setForm((f) => {
      const next = { ...f, idNumber: digits }
      if (digits.length >= 6) {
        const dob = extractDobFromSaId(digits)
        if (dob) {
          next.dateOfBirth = dob
        }
      }
      if (digits.length >= 10) {
        const sex = extractSexFromSaId(digits)
        if (sex) next.sex = sex
      }
      return next
    })
  }, [])

  const schemeFiltered = useMemo(
    () => schemeOptions.filter((s) => s.toLowerCase().includes(form.scheme.toLowerCase())),
    [form.scheme, schemeOptions]
  )

  const canCreate = form.firstName.trim() && form.lastName.trim()

  const handleCreate = useCallback(() => {
    const name = [form.title, form.firstName, form.lastName].filter(Boolean).join(" ")
    const dob = form.dateOfBirth || undefined
    const age = dob ? calculateAge(dob) : undefined
    const allergies = form.allergies.split(",").map((s) => s.trim()).filter(Boolean)
    const chronic = form.chronicConditions.split(",").map((s) => s.trim()).filter(Boolean)

    const draft: PracticePatientDraft = {
      name,
      idNumber: form.idNumber || undefined,
      dateOfBirth: dob,
      age,
      sex: (form.sex as "M" | "F" | "Other") || undefined,
      phone: form.phone.trim() !== "+27" ? form.phone : undefined,
      email: form.email || undefined,
      address: form.address || undefined,
      emergencyContact: form.emergencyName
        ? { name: form.emergencyName, relationship: form.emergencyRelationship, phone: form.emergencyPhone }
        : undefined,
      medicalAidStatus: form.hasMedicalAid ? "pending" : "unknown",
      medicalAidScheme: form.hasMedicalAid ? form.scheme || undefined : undefined,
      medicalAidPlan: form.hasMedicalAid ? form.plan || undefined : undefined,
      memberNumber: form.hasMedicalAid ? form.memberNumber || undefined : undefined,
      dependentCode: form.hasMedicalAid ? form.dependentCode || undefined : undefined,
      mainMemberName: form.hasMedicalAid ? form.mainMemberName || undefined : undefined,
      chronicConditions: chronic.length > 0 ? chronic : undefined,
      allergies: allergies.length > 0 ? allergies : undefined,
      outstandingBalance: 0,
      registeredAt: new Date().toISOString().slice(0, 10),
      profileIncomplete: isPracticePatientProfileIncomplete({
        phone: form.phone,
        email: form.email,
        address: form.address,
      }),
    }
    void onCreate(draft)
  }, [form, onCreate])

  const handleScan = useCallback(() => {
    setScanStage("scanning")
    setTimeout(() => {
      setScanData({
        title: "Mrs",
        firstName: "Thandi",
        lastName: "Mokoena",
        idNumber: "8806150234089",
        dateOfBirth: "1988-06-15",
        sex: "F",
        hasMedicalAid: true,
        scheme: "Discovery",
        memberNumber: "DH-88061500",
        dependentCode: "00",
      })
      setScanStage("confirm")
    }, 2200)
  }, [])

  const handleConfirmScan = useCallback(() => {
    if (!scanData) return
    setForm((f) => ({ ...f, ...scanData }))
    setTab("manual")
    setScanStage("idle")
  }, [scanData])

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 8 }}
        transition={{ type: "spring", stiffness: 400, damping: 30 }}
        className="max-h-[85vh] w-full max-w-xl overflow-hidden rounded-2xl border border-white/[0.08] bg-[#0a0a0a] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-white/[0.06] px-6 py-4">
          <h3 className="text-sm font-semibold">Register New Patient</h3>
          <button type="button" onClick={onClose} className="rounded-md p-1 text-white/30 hover:text-white">
            <X className="size-4" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-white/[0.06]">
          {(["manual", "scan"] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={cn(
                "flex-1 py-2.5 text-xs font-medium transition-colors",
                tab === t ? "border-b-2 border-white/60 text-white" : "text-white/30 hover:text-white/60"
              )}
            >
              {t === "manual" ? "Manual Entry" : "Smart Scan"}
            </button>
          ))}
        </div>

        {registrationError ? (
          <p className="border-b border-white/[0.06] bg-red-500/10 px-6 py-2 text-[11px] text-red-300">
            {registrationError}
          </p>
        ) : null}

        {/* Body */}
        <div className="max-h-[calc(85vh-140px)] overflow-y-auto p-6" style={{ scrollbarWidth: "thin" }}>
          {tab === "manual" ? (
            <div className="space-y-4">
              {/* Personal Info */}
              <SectionLabel>Personal Information</SectionLabel>
              <div className="grid grid-cols-[80px_1fr_1fr] gap-3">
                <div>
                  <FieldLabel>Title</FieldLabel>
                  <select
                    value={form.title}
                    onChange={(e) => set("title", e.target.value)}
                    className="w-full rounded-lg border border-white/[0.06] bg-white/[0.02] px-2 py-2 text-xs text-foreground focus:border-white/[0.12] focus:outline-none"
                  >
                    <option value="">—</option>
                    {["Mr", "Mrs", "Ms", "Dr"].map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <Field label="First Name" value={form.firstName} onChange={(v) => set("firstName", v)} placeholder="First name" required />
                <Field label="Last Name" value={form.lastName} onChange={(v) => set("lastName", v)} placeholder="Last name" required />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <FieldLabel>ID Number (SA 13-digit)</FieldLabel>
                  <input
                    type="text"
                    value={form.idNumber}
                    onChange={(e) => handleIdChange(e.target.value)}
                    placeholder="e.g. 8501015012083"
                    maxLength={13}
                    className="w-full rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2 text-xs text-foreground placeholder:text-white/15 focus:border-white/[0.12] focus:outline-none"
                  />
                  {form.idNumber.length > 0 && form.idNumber.length < 13 && (
                    <p className="mt-1 text-[9px] text-[#FFC107]/60">{13 - form.idNumber.length} digits remaining</p>
                  )}
                </div>
                <Field label="Date of Birth" value={form.dateOfBirth} onChange={(v) => set("dateOfBirth", v)} placeholder="YYYY-MM-DD" />
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <FieldLabel>Sex</FieldLabel>
                  <select
                    value={form.sex}
                    onChange={(e) => set("sex", e.target.value)}
                    className="w-full rounded-lg border border-white/[0.06] bg-white/[0.02] px-2 py-2 text-xs text-foreground focus:border-white/[0.12] focus:outline-none"
                  >
                    <option value="">—</option>
                    <option value="M">Male</option>
                    <option value="F">Female</option>
                    <option value="Other">Other</option>
                  </select>
                </div>
                <Field label="Phone" value={form.phone} onChange={(v) => set("phone", v)} placeholder="+27 82 123 4567" />
                <Field label="Email" value={form.email} onChange={(v) => set("email", v)} placeholder="patient@email.com" />
              </div>

              <Field label="Address (optional)" value={form.address} onChange={(v) => set("address", v)} placeholder="Street, city, postal code" />

              {/* Medical Aid */}
              <div className="mt-2 flex items-center justify-between">
                <SectionLabel>Medical Aid</SectionLabel>
                <button
                  type="button"
                  onClick={() => set("hasMedicalAid", !form.hasMedicalAid)}
                  className="flex items-center gap-1.5 text-xs text-white/40 transition-colors hover:text-white/60"
                >
                  {form.hasMedicalAid ? (
                    <ToggleRight className="size-5 text-[#00E676]" weight="fill" />
                  ) : (
                    <ToggleLeft className="size-5" weight="bold" />
                  )}
                  Has Medical Aid
                </button>
              </div>

              <AnimatePresence>
                {form.hasMedicalAid && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    className="overflow-hidden"
                  >
                    <div className="space-y-3 rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
                      <div className="grid grid-cols-2 gap-3">
                        <div ref={schemeRef} className="relative">
                          <FieldLabel>Scheme</FieldLabel>
                          <input
                            type="text"
                            value={form.scheme}
                            onChange={(e) => { set("scheme", e.target.value); setSchemeOpen(true) }}
                            onFocus={() => setSchemeOpen(true)}
                            placeholder="Start typing..."
                            className="w-full rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2 text-xs text-foreground placeholder:text-white/15 focus:border-white/[0.12] focus:outline-none"
                          />
                          {schemeOpen && schemeFiltered.length > 0 && (
                            <div className="absolute left-0 top-full z-20 mt-1 w-full rounded-lg border border-white/[0.08] bg-[#111] py-1 shadow-xl">
                              {schemeFiltered.map((s) => (
                                <button
                                  key={s}
                                  type="button"
                                  onClick={() => { set("scheme", s); setSchemeOpen(false) }}
                                  className="block w-full px-3 py-1.5 text-left text-xs text-white/60 transition-colors hover:bg-white/[0.06] hover:text-white"
                                >
                                  {s}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                        <Field label="Plan" value={form.plan} onChange={(v) => set("plan", v)} placeholder="e.g. KeyCare Plus" />
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <Field label="Member Number" value={form.memberNumber} onChange={(v) => set("memberNumber", v)} placeholder="e.g. DH-12345678" />
                        <Field label="Dependent Code" value={form.dependentCode} onChange={(v) => set("dependentCode", v)} placeholder="e.g. 00" />
                      </div>
                      <Field label="Main Member Name" value={form.mainMemberName} onChange={(v) => set("mainMemberName", v)} placeholder="If dependent, enter main member name" />
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Emergency Contact */}
              <SectionLabel>Emergency Contact</SectionLabel>
              <div className="grid grid-cols-3 gap-3">
                <Field label="Name" value={form.emergencyName} onChange={(v) => set("emergencyName", v)} placeholder="Contact name" />
                <Field label="Relationship" value={form.emergencyRelationship} onChange={(v) => set("emergencyRelationship", v)} placeholder="e.g. Spouse" />
                <Field label="Phone" value={form.emergencyPhone} onChange={(v) => set("emergencyPhone", v)} placeholder="+27 ..." />
              </div>

              {/* Clinical */}
              <SectionLabel>Clinical</SectionLabel>
              <Field label="Allergies (comma-separated)" value={form.allergies} onChange={(v) => set("allergies", v)} placeholder="e.g. Penicillin, Sulfa" />
              <Field label="Chronic Conditions (comma-separated)" value={form.chronicConditions} onChange={(v) => set("chronicConditions", v)} placeholder="e.g. Hypertension, Diabetes" />
            </div>
          ) : (
            /* Smart Scan Tab */
            <div className="flex flex-col items-center gap-6 py-4">
              {scanStage === "idle" && (
                <>
                  <div className="flex size-32 flex-col items-center justify-center rounded-2xl border-2 border-dashed border-white/[0.1] text-white/20">
                    <Camera className="mb-2 size-10" />
                    <p className="text-[10px]">ID / MA Card</p>
                  </div>
                  <p className="max-w-xs text-center text-xs text-white/30">
                    Take a photo or upload an image of the patient&apos;s ID document or medical aid card to auto-fill registration fields.
                  </p>
                  <div className="flex gap-3">
                    <button
                      type="button"
                      onClick={handleScan}
                      className="flex items-center gap-2 rounded-lg bg-white/[0.06] px-4 py-2.5 text-xs font-medium text-white/70 transition-colors hover:bg-white/[0.1] hover:text-white"
                    >
                      <Camera className="size-4" weight="bold" />
                      Capture
                    </button>
                    <button
                      type="button"
                      onClick={handleScan}
                      className="flex items-center gap-2 rounded-lg border border-white/[0.08] px-4 py-2.5 text-xs font-medium text-white/50 transition-colors hover:bg-white/[0.04] hover:text-white"
                    >
                      <Upload className="size-4" weight="bold" />
                      Upload
                    </button>
                  </div>
                </>
              )}

              {scanStage === "scanning" && (
                <div className="flex flex-col items-center gap-4 py-8">
                  <Spinner className="size-8 animate-spin text-white/40" />
                  <p className="text-xs text-white/40">Extracting information from document...</p>
                </div>
              )}

              {scanStage === "confirm" && scanData && (
                <div className="w-full space-y-4">
                  <p className="text-center text-xs font-medium text-[#00E676]">Fields extracted successfully</p>
                  <div className="space-y-2 rounded-xl border border-[#00E676]/20 bg-[#00E676]/[0.03] p-4">
                    {Object.entries(scanData)
                      .filter(([, v]) => typeof v === "string" && v)
                      .map(([key, value]) => (
                        <div key={key} className="flex items-center justify-between text-xs">
                          <span className="text-white/40">{key.replace(/([A-Z])/g, " $1").replace(/^./, (s) => s.toUpperCase())}</span>
                          <span className="font-medium text-white/80">{String(value)}</span>
                        </div>
                      ))}
                  </div>
                  <div className="flex justify-center gap-3">
                    <button
                      type="button"
                      onClick={() => { setScanStage("idle"); setScanData(null) }}
                      className="rounded-lg px-4 py-2 text-xs text-white/40 hover:text-white"
                    >
                      Retry
                    </button>
                    <button
                      type="button"
                      onClick={handleConfirmScan}
                      className="flex items-center gap-1.5 rounded-lg bg-[#00E676]/10 px-4 py-2 text-xs font-medium text-[#00E676] transition-colors hover:bg-[#00E676]/20"
                    >
                      <Check className="size-3.5" weight="bold" />
                      Confirm & Edit
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        {tab === "manual" && (
          <div className="flex justify-end gap-2 border-t border-white/[0.06] px-6 py-4">
            <button type="button" onClick={onClose} className="rounded-lg px-4 py-2 text-xs text-white/40 hover:text-white">
              Cancel
            </button>
            <button
              type="button"
              disabled={!canCreate}
              onClick={handleCreate}
              className="flex items-center gap-1.5 rounded-lg bg-white/[0.08] px-4 py-2 text-xs font-medium text-white transition-colors hover:bg-white/[0.14] disabled:opacity-30"
            >
              <Check className="size-3.5" weight="bold" />
              Create Patient
            </button>
          </div>
        )}
      </motion.div>
    </motion.div>
  )
}

// ── Patient File Panel ──

/** Aligned with bento-calendar day grid (08:00–18:00, 30-minute slots). */
const CAL_DAY_START = 8
const CAL_DAY_END = 18
const SLOT_MINUTES = 30

function patientToMedikreditPayload(p: PracticePatient) {
  return {
    id: p.id,
    name: p.name,
    idNumber: p.idNumber,
    memberNumber: p.memberNumber,
    medicalAidScheme: p.medicalAidScheme,
    dependentCode: p.dependentCode,
    mainMemberName: p.mainMemberName,
    dateOfBirth: p.dateOfBirth,
    sex: p.sex,
  }
}

function padTime(n: number): string {
  return String(n).padStart(2, "0")
}

function fmtLocalYmd(d: Date): string {
  return `${d.getFullYear()}-${padTime(d.getMonth() + 1)}-${padTime(d.getDate())}`
}

function timeStrHm(h: number, m: number): string {
  return `${padTime(h)}:${padTime(m)}`
}

function addClockMinutes(h: number, mi: number, add: number): { h: number; m: number } {
  let t = h * 60 + mi + add
  const hh = Math.floor(t / 60)
  const mm = t % 60
  return { h: hh, m: mm }
}

function iterDaySlots(): { hour: number; minute: number }[] {
  const n = (CAL_DAY_END - CAL_DAY_START) * 2
  return Array.from({ length: n }, (_, i) => ({
    hour: CAL_DAY_START + Math.floor(i / 2),
    minute: (i % 2) * 30,
  }))
}

function slotIsBlocked(appointments: PracticeAppointment[], dateStr: string, hour: number, minute: number): boolean {
  return appointments.some(
    (a) =>
      a.date === dateStr &&
      a.hour === hour &&
      a.minute === minute &&
      !["cancelled", "no_show", "completed"].includes(a.status)
  )
}

function findBookedTodayForPatient(
  appointments: PracticeAppointment[],
  patientId: string,
  todayStr: string
): PracticeAppointment | null {
  const candidates = appointments.filter(
    (a) =>
      a.patientId === patientId &&
      a.date === todayStr &&
      (a.status === "booked" || a.status === "confirmed")
  )
  if (candidates.length === 0) return null
  candidates.sort((a, b) => a.hour * 60 + a.minute - (b.hour * 60 + b.minute))
  return candidates[0]
}

/**
 * Next free slot from “now” onward: prefers the current 30-minute window if still empty,
 * otherwise the next free slot (today, then rolling forward up to 14 days).
 */
function findNextWalkInSlot(appointments: PracticeAppointment[], now: Date): { dateStr: string; hour: number; minute: number } | null {
  const slots = iterDaySlots()
  let day = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const nowMin = now.getHours() * 60 + now.getMinutes()

  for (let dayOffset = 0; dayOffset < 14; dayOffset++) {
    const dateStr = fmtLocalYmd(day)
    const isToday = dayOffset === 0

    for (const { hour, minute } of slots) {
      const start = hour * 60 + minute
      const end = start + SLOT_MINUTES
      if (isToday && end <= nowMin) continue
      if (!slotIsBlocked(appointments, dateStr, hour, minute)) {
        return { dateStr, hour, minute }
      }
    }
    day = new Date(day.getFullYear(), day.getMonth(), day.getDate() + 1)
  }
  return null
}

type PanelTab = "overview" | "history" | "medications" | "billing"

function PatientFilePanel({
  patient,
  claims,
  onClose,
  onUpdate,
}: {
  patient: PracticePatient
  claims: { id: string; patientId: string; patientName: string; totalAmount: number; status: string; createdAt: string; lines: { description: string; amount: number }[] }[]
  onClose: () => void
  onUpdate: (id: string, update: Partial<PracticePatient>) => void
}) {
  const {
    appointments,
    addAppointment,
    updateAppointment,
    practiceProviders,
    activeDoctorId,
    setSelectedDate,
    setAdminTab,
    requestCalendarFocusAppointment,
    openPatient,
    setMode,
  } = useWorkspace()

  const { practiceId, dekKey, unlocked } = usePracticeCrypto()
  const { runEligibility, runFamily, loading: mkLoading, error: mkError } = useEligibilityCheck({ practiceId })

  const [activeTab, setActiveTab] = useState<PanelTab>("overview")
  const [editing, setEditing] = useState(false)
  const [editForm, setEditForm] = useState({
    phone: patient.phone ?? "",
    email: patient.email ?? "",
    address: patient.address ?? "",
    allergies: (patient.allergies ?? []).join(", "),
    chronicConditions: (patient.chronicConditions ?? []).join(", "),
  })

  const [quickPanel, setQuickPanel] = useState<null | "eligibility" | "family">(null)
  const [eligibilityUi, setEligibilityUi] = useState<
    | { phase: "idle" }
    | { phase: "checking" }
    | { phase: "result"; api: EligibilityResponse }
  >({ phase: "idle" })
  const [familyUi, setFamilyUi] = useState<
    | { phase: "idle" }
    | { phase: "checking" }
    | { phase: "result"; api: FamilyEligibilityResponse }
  >({ phase: "idle" })
  const [checkInBusy, setCheckInBusy] = useState(false)
  const [checkInMessage, setCheckInMessage] = useState<string | null>(null)
  const [accreditation, setAccreditation] = useState<null | "eligibility" | "family">(null)
  const [encounterList, setEncounterList] = useState<
    { id: string; status: string; updated_at: string; started_at: string }[]
  >([])
  const [historyLoading, setHistoryLoading] = useState(false)

  useEffect(() => {
    setEditForm({
      phone: patient.phone ?? "",
      email: patient.email ?? "",
      address: patient.address ?? "",
      allergies: (patient.allergies ?? []).join(", "),
      chronicConditions: (patient.chronicConditions ?? []).join(", "),
    })
    setEditing(false)
    setQuickPanel(null)
    setEligibilityUi({ phase: "idle" })
    setFamilyUi({ phase: "idle" })
    setCheckInMessage(null)
    setAccreditation(null)
  }, [patient.id, patient.phone, patient.email, patient.address, patient.allergies, patient.chronicConditions])

  useEffect(() => {
    if (mkError) toast.error(mkError)
  }, [mkError])

  useEffect(() => {
    if (!practiceId || !patient.id) return
    const supabase = createClient()
    if (!supabase) return
    let cancelled = false
    ;(async () => {
      setHistoryLoading(true)
      try {
        const { data, error } = await supabase
          .from("clinical_encounters")
          .select("id, status, updated_at, started_at")
          .eq("practice_id", practiceId)
          .eq("patient_id", patient.id)
          .order("updated_at", { ascending: false })
        if (!cancelled && !error && data)
          setEncounterList(
            data as { id: string; status: string; updated_at: string; started_at: string }[]
          )
        else if (!cancelled && error) setEncounterList([])
      } finally {
        if (!cancelled) setHistoryLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [practiceId, patient.id])

  const runEligibilityCheck = useCallback(async () => {
    setQuickPanel("eligibility")
    setEligibilityUi({ phase: "checking" })
    const payload = patientToMedikreditPayload(patient)
    const api = await runEligibility(payload, true)
    if (api) {
      setEligibilityUi({ phase: "result", api })
      if (api.status === "eligible" && api.ok) {
        onUpdate(patient.id, { medicalAidStatus: "verified" })
      }
    } else {
      setEligibilityUi({ phase: "idle" })
    }
  }, [patient, runEligibility, onUpdate])

  const runFamilyCheck = useCallback(async () => {
    setQuickPanel("family")
    setFamilyUi({ phase: "checking" })
    const payload = patientToMedikreditPayload(patient)
    const api = await runFamily(payload, undefined, true)
    if (api) {
      setFamilyUi({ phase: "result", api })
    } else {
      setFamilyUi({ phase: "idle" })
    }
  }, [patient, runFamily])

  const handleQuickCheckIn = useCallback(() => {
    setCheckInBusy(true)
    setCheckInMessage(null)
    try {
      const todayStr = fmtLocalYmd(new Date())
      const existing = findBookedTodayForPatient(appointments, patient.id, todayStr)
      if (existing) {
        updateAppointment(existing.id, { status: "checked_in" })
        setSelectedDate(existing.date)
        requestCalendarFocusAppointment(existing.id)
        setAdminTab("calendar")
        openPatient(
          createPatientSession({
            patientId: patient.id,
            name: patient.name,
            appointmentReason: existing.reason,
            status: "checked_in",
            medicalAidScheme: patient.medicalAidScheme ?? existing.medicalAid,
            memberNumber: patient.memberNumber ?? existing.memberNumber,
            chronicConditions: patient.chronicConditions ?? [],
            criticalAllergies: patient.allergies ?? [],
            activeMedications: patient.currentMedications ?? [],
          })
        )
        setMode("clinical")
        setCheckInMessage(`Checked in to your ${existing.startTime} appointment today.`)
        return
      }

      const slot = findNextWalkInSlot(appointments, new Date())
      if (!slot) {
        setCheckInMessage("No open slots in the next two weeks. Add an appointment manually on the calendar.")
        return
      }

      const providerId = activeDoctorId ?? practiceProviders[0]?.id ?? "provider-1"
      const end = addClockMinutes(slot.hour, slot.minute, SLOT_MINUTES)
      const id = `appt-${Date.now()}`
      addAppointment({
        id,
        patientId: patient.id,
        patientName: patient.name,
        providerId,
        date: slot.dateStr,
        startTime: timeStrHm(slot.hour, slot.minute),
        endTime: timeStrHm(end.h, end.m),
        hour: slot.hour,
        minute: slot.minute,
        duration: SLOT_MINUTES,
        reason: "Walk-in check-in",
        service: "Consultation",
        status: "checked_in",
        paymentType: patient.medicalAidStatus === "verified" ? "medical_aid" : "cash",
        medicalAid: patient.medicalAidScheme,
        memberNumber: patient.memberNumber,
      })
      setSelectedDate(slot.dateStr)
      requestCalendarFocusAppointment(id)
      setAdminTab("calendar")
      openPatient(
        createPatientSession({
          patientId: patient.id,
          name: patient.name,
          appointmentReason: "Walk-in check-in",
          status: "checked_in",
          medicalAidScheme: patient.medicalAidScheme,
          memberNumber: patient.memberNumber,
          chronicConditions: patient.chronicConditions ?? [],
          criticalAllergies: patient.allergies ?? [],
          activeMedications: patient.currentMedications ?? [],
        })
      )
      setMode("clinical")
      const when =
        slot.dateStr === todayStr ? `today at ${timeStrHm(slot.hour, slot.minute)}` : `${slot.dateStr} ${timeStrHm(slot.hour, slot.minute)}`
      setCheckInMessage(`Checked in — scheduled ${when}.`)
    } finally {
      setCheckInBusy(false)
    }
  }, [
    activeDoctorId,
    addAppointment,
    appointments,
    openPatient,
    patient,
    practiceProviders,
    requestCalendarFocusAppointment,
    setAdminTab,
    setMode,
    setSelectedDate,
    updateAppointment,
  ])

  const handleSaveEdit = useCallback(() => {
    onUpdate(patient.id, {
      phone: editForm.phone || undefined,
      email: editForm.email || undefined,
      address: editForm.address || undefined,
      allergies: editForm.allergies.split(",").map((s) => s.trim()).filter(Boolean),
      chronicConditions: editForm.chronicConditions.split(",").map((s) => s.trim()).filter(Boolean),
    })
    setEditing(false)
  }, [patient.id, editForm, onUpdate])

  const patientClaims = useMemo(
    () => claims.filter((c) => c.patientId === patient.id),
    [claims, patient.id]
  )

  const handleOpenClinicalEncounter = useCallback(
    async (encounterId: string) => {
      if (!practiceId || !dekKey || !unlocked) {
        toast.error("Unlock clinical workspace to open this session")
        return
      }
      const supabase = createClient()
      if (!supabase) return
      const { data, error } = await supabase
        .from("clinical_encounters")
        .select("id, state_ciphertext, state_iv")
        .eq("id", encounterId)
        .eq("practice_id", practiceId)
        .eq("patient_id", patient.id)
        .maybeSingle()
      if (error || !data?.state_ciphertext || !data.state_iv) {
        toast.error("Could not load this encounter")
        return
      }
      try {
        const plain = await decryptJson<EncounterStatePlain>(
          dekKey,
          String(data.state_ciphertext),
          String(data.state_iv)
        )
        if (!plain || plain.v !== 1) throw new Error("Invalid state")
        const fromEncounter = encounterPlainToSessionPartial(plain)
        const session = createPatientSession({
          patientId: patient.id,
          name: patient.name,
          clinicalEncounterId: data.id as string,
          age: patient.age,
          sex: patient.sex,
          medicalAidStatus:
            patient.medicalAidStatus === "verified"
              ? "active"
              : patient.medicalAidStatus === "terminated"
                ? "inactive"
                : patient.medicalAidStatus,
          medicalAidScheme: patient.medicalAidScheme,
          memberNumber: patient.memberNumber,
          chronicConditions: patient.chronicConditions,
          criticalAllergies: patient.allergies,
          activeMedications: patient.currentMedications,
          ...fromEncounter,
        })
        openPatient(session)
        const s = scribePartialFromPlain(plain)
        useWorkspaceStore.setState({
          scribeTranscript: s.transcript,
          scribeSegments: s.segments,
          scribeEntities: s.entities,
          scribeHighlights: s.highlights,
          scribeEntityStatus: s.entityStatus,
        })
        setMode("clinical")
        onClose()
      } catch {
        toast.error("Could not decrypt this session")
      }
    },
    [dekKey, onClose, openPatient, patient, practiceId, setMode, unlocked]
  )

  const tabs: { id: PanelTab; label: string; icon: React.ReactNode }[] = [
    { id: "overview", label: "Overview", icon: <UserCircle className="size-3.5" /> },
    { id: "history", label: "History", icon: <ClockCounterClockwise className="size-3.5" /> },
    { id: "medications", label: "Meds", icon: <Pill className="size-3.5" /> },
    { id: "billing", label: "Billing", icon: <CurrencyDollar className="size-3.5" /> },
  ]

  const status = STATUS_CONFIG[patient.medicalAidStatus]

  const elig = eligibilityUi.phase === "result" ? eligibilityUi.api : null
  const fam = familyUi.phase === "result" ? familyUi.api : null

  return (
    <>
    <motion.div
      initial={{ x: "100%" }}
      animate={{ x: 0 }}
      exit={{ x: "100%" }}
      transition={{ type: "spring", stiffness: 300, damping: 30 }}
      className="fixed right-0 top-0 z-40 flex h-full w-[50%] min-w-[480px] flex-col border-l border-white/[0.08] bg-[#090909] shadow-2xl"
    >
      {/* Panel Header */}
      <div className="flex items-center justify-between border-b border-white/[0.06] px-6 py-4">
        <div className="flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-full bg-white/[0.06] text-sm font-bold text-white/40">
            {patient.name.split(" ").map((n) => n[0]).join("")}
          </div>
          <div>
            <h3 className="text-sm font-semibold">{patient.name}</h3>
            <p className="text-[10px] text-white/30">
              {patient.idNumber ?? "No ID"} · {patient.age ? `${patient.age}y` : "Age unknown"} · {patient.sex ?? "—"}
            </p>
          </div>
        </div>
        <button type="button" onClick={onClose} className="rounded-md p-1.5 text-white/30 transition-colors hover:bg-white/[0.06] hover:text-white">
          <X className="size-4" />
        </button>
      </div>

      {/* Quick actions — eligibility, family, check-in, inbox */}
      <div className="border-b border-white/[0.06] px-6 py-3">
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => {
              setQuickPanel((p) => (p === "eligibility" ? null : "eligibility"))
              if (eligibilityUi.phase === "idle") void runEligibilityCheck()
            }}
            disabled={mkLoading && quickPanel === "eligibility"}
            className={cn(
              "inline-flex flex-1 min-w-[100px] items-center justify-center gap-1.5 rounded-lg border px-2.5 py-2 text-[11px] font-medium transition-all",
              quickPanel === "eligibility"
                ? "border-white/25 bg-white/[0.08] text-white shadow-sm"
                : "border-white/[0.08] bg-white/[0.03] text-white/70 hover:border-white/[0.14] hover:bg-white/[0.06] hover:text-white"
            )}
          >
            <ShieldCheck className="size-3.5 text-emerald-400/90" weight="bold" />
            Eligibility
          </button>
          <button
            type="button"
            onClick={() => {
              setQuickPanel((p) => (p === "family" ? null : "family"))
              if (familyUi.phase === "idle") void runFamilyCheck()
            }}
            disabled={mkLoading && quickPanel === "family"}
            className={cn(
              "inline-flex flex-1 min-w-[100px] items-center justify-center gap-1.5 rounded-lg border px-2.5 py-2 text-[11px] font-medium transition-all",
              quickPanel === "family"
                ? "border-white/25 bg-white/[0.08] text-white shadow-sm"
                : "border-white/[0.08] bg-white/[0.03] text-white/70 hover:border-white/[0.14] hover:bg-white/[0.06] hover:text-white"
            )}
          >
            <UsersThree className="size-3.5 text-sky-400/90" weight="bold" />
            Family
          </button>
          <button
            type="button"
            disabled={checkInBusy || mkLoading}
            onClick={handleQuickCheckIn}
            className={cn(
              "inline-flex flex-[1.2] min-w-[120px] items-center justify-center gap-1.5 rounded-lg border px-2.5 py-2 text-[11px] font-semibold transition-all",
              "border-[#00E676]/35 bg-[#00E676]/12 text-[#00E676] hover:bg-[#00E676]/18 disabled:opacity-50"
            )}
          >
            {checkInBusy ? <SpinnerGap className="size-3.5 animate-spin" /> : <CalendarCheck className="size-3.5" weight="bold" />}
            Quick check-in
          </button>
          <button
            type="button"
            onClick={() => setAdminTab("inbox")}
            className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-white/[0.08] bg-white/[0.03] px-2.5 py-2 text-[11px] font-medium text-white/70 transition-all hover:border-white/[0.14] hover:bg-white/[0.06] hover:text-white"
            title="Open practice inbox"
          >
            <ChatCircle className="size-3.5 text-white/50" weight="bold" />
            Inbox
          </button>
        </div>

        <AnimatePresence initial={false}>
          {quickPanel === "eligibility" && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="overflow-hidden"
            >
              <div className="mt-3 rounded-xl border border-white/[0.08] bg-white/[0.03] p-3">
                {eligibilityUi.phase === "checking" && (
                  <div className="flex items-center gap-2 py-2 text-[11px] text-white/50">
                    <SpinnerGap className="size-4 animate-spin text-emerald-400/80" />
                    Running eligibility for {patient.name}…
                  </div>
                )}
                {eligibilityUi.phase === "result" && elig && (
                  <div>
                    <div className="flex items-center gap-2">
                      {elig.ok && elig.status === "eligible" ? (
                        <CheckCircle className="size-4 text-[#00E676]" weight="fill" />
                      ) : (
                        <XCircle className="size-4 text-[#EF5350]" weight="fill" />
                      )}
                      <span
                        className={cn(
                          "text-xs font-semibold",
                          elig.ok && elig.status === "eligible" ? "text-[#00E676]" : "text-[#EF5350]"
                        )}
                      >
                        {elig.status === "eligible"
                          ? "Eligible"
                          : elig.status === "not_found"
                            ? "Member not found"
                            : elig.status === "pending"
                              ? "Pending"
                              : "Not eligible"}
                      </span>
                    </div>
                    <div className="mt-2 grid grid-cols-2 gap-2 text-[11px]">
                      {patient.medicalAidScheme && (
                        <div>
                          <span className="text-white/35">Scheme</span>
                          <p className="font-medium text-white/75">{patient.medicalAidScheme}</p>
                        </div>
                      )}
                      {patient.memberNumber && (
                        <div>
                          <span className="text-white/35">Member #</span>
                          <p className="font-medium tabular-nums text-white/75">{patient.memberNumber}</p>
                        </div>
                      )}
                      {elig.healthNetworkId && (
                        <div>
                          <span className="text-white/35">HNet / Jiffy</span>
                          <p className="font-medium text-white/75">{elig.healthNetworkId}</p>
                        </div>
                      )}
                      {elig.authNumber && (
                        <div>
                          <span className="text-white/35">Auth #</span>
                          <p className="font-medium tabular-nums text-white/75">{elig.authNumber}</p>
                        </div>
                      )}
                    </div>
                    {(elig.rejectionDescription || elig.responseMessage) && (
                      <p className="mt-2 text-[11px] text-[#EF5350]/90">{elig.rejectionDescription ?? elig.responseMessage}</p>
                    )}
                    {elig.remittanceMessages.length > 0 && (
                      <ul className="mt-2 space-y-0.5 text-[10px] text-amber-200/80">
                        {elig.remittanceMessages.slice(0, 4).map((r, i) => (
                          <li key={i}>
                            {r.code}: {r.description}
                          </li>
                        ))}
                      </ul>
                    )}
                    <div className="mt-2 flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => void runEligibilityCheck()}
                        className="text-[10px] font-medium text-white/45 hover:text-white/70"
                      >
                        Re-check
                      </button>
                      {elig.rawXml && (
                        <button
                          type="button"
                          onClick={() => setAccreditation("eligibility")}
                          className="text-[10px] font-medium text-sky-400/90 hover:text-sky-300"
                        >
                          Accreditation view
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </motion.div>
          )}
          {quickPanel === "family" && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="overflow-hidden"
            >
              <div className="mt-3 rounded-xl border border-white/[0.08] bg-white/[0.03] p-3">
                {familyUi.phase === "checking" && (
                  <div className="flex items-center gap-2 py-2 text-[11px] text-white/50">
                    <SpinnerGap className="size-4 animate-spin text-sky-400/80" />
                    Verifying dependants and household…
                  </div>
                )}
                {familyUi.phase === "result" && fam && (
                  <div className="space-y-2 text-[11px]">
                    <div className="flex items-center gap-2">
                      <UsersThree className="size-4 text-sky-400" weight="bold" />
                      <span className="font-semibold text-white/85">Family check</span>
                    </div>
                    <p className="text-white/55">
                      {fam.dependents.length} PAT record{fam.dependents.length === 1 ? "" : "s"} · TX {fam.res ?? "—"}
                    </p>
                    {patient.dependentCode && (
                      <p className="text-white/40">
                        Dep code <span className="tabular-nums text-white/60">{patient.dependentCode}</span>
                        {patient.mainMemberName ? ` · Main: ${patient.mainMemberName}` : ""}
                      </p>
                    )}
                    {fam.dependents.length > 0 && (
                      <ul className="space-y-1 rounded-lg border border-white/[0.05] bg-black/20 p-2 text-[10px] text-white/50">
                        {fam.dependents.map((d, i) => (
                          <li key={i}>
                            {d.dep_cd ?? "—"} · {d.name ?? d.id_nbr ?? "—"}
                          </li>
                        ))}
                      </ul>
                    )}
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => void runFamilyCheck()}
                        className="text-[10px] font-medium text-white/45 hover:text-white/70"
                      >
                        Re-run family check
                      </button>
                      {fam.rawXml && (
                        <button
                          type="button"
                          onClick={() => setAccreditation("family")}
                          className="text-[10px] font-medium text-sky-400/90 hover:text-sky-300"
                        >
                          Accreditation view
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {checkInMessage && (
          <p className="mt-2 text-[11px] leading-relaxed text-white/45">{checkInMessage}</p>
        )}
      </div>

      {/* Tab Bar */}
      <div className="flex border-b border-white/[0.06] px-6">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setActiveTab(t.id)}
            className={cn(
              "flex items-center gap-1.5 border-b-2 px-3 py-2.5 text-xs font-medium transition-colors",
              activeTab === t.id
                ? "border-white/60 text-white"
                : "border-transparent text-white/30 hover:text-white/60"
            )}
          >
            {t.icon}
            {t.label}
          </button>
        ))}
      </div>

      {/* Panel Content */}
      <div className="flex-1 overflow-y-auto p-6" style={{ scrollbarWidth: "thin" }}>
        {activeTab === "overview" && (
          <div className="space-y-5">
            {/* Demographics */}
            <div className="flex items-center justify-between">
              <SectionLabel>Demographics</SectionLabel>
              <button
                type="button"
                onClick={() => editing ? handleSaveEdit() : setEditing(true)}
                className="flex items-center gap-1 text-[10px] text-white/40 transition-colors hover:text-white"
              >
                {editing ? <Check className="size-3" weight="bold" /> : <PencilSimple className="size-3" />}
                {editing ? "Save" : "Edit"}
              </button>
            </div>

            <div className="space-y-2 rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
              <InfoRow label="Full Name" value={patient.name} />
              <InfoRow label="ID Number" value={patient.idNumber ?? "—"} />
              <InfoRow label="Date of Birth" value={patient.dateOfBirth ?? "—"} />
              <InfoRow label="Age" value={patient.age ? `${patient.age} years` : "—"} />
              <InfoRow label="Sex" value={patient.sex ?? "—"} />
              {editing ? (
                <>
                  <EditableRow label="Phone" value={editForm.phone} onChange={(v) => setEditForm((f) => ({ ...f, phone: v }))} />
                  <EditableRow label="Email" value={editForm.email} onChange={(v) => setEditForm((f) => ({ ...f, email: v }))} />
                  <EditableRow label="Address" value={editForm.address} onChange={(v) => setEditForm((f) => ({ ...f, address: v }))} />
                </>
              ) : (
                <>
                  <InfoRow label="Phone" value={patient.phone ?? "—"} />
                  <InfoRow label="Email" value={patient.email ?? "—"} />
                  <InfoRow label="Address" value={patient.address ?? "—"} />
                </>
              )}
              {patient.emergencyContact && (
                <InfoRow label="Emergency" value={`${patient.emergencyContact.name} (${patient.emergencyContact.relationship}) ${patient.emergencyContact.phone}`} />
              )}
            </div>

            {/* Medical Aid */}
            <SectionLabel>Medical Aid</SectionLabel>
            <div className="space-y-2 rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
              <div className="flex items-center gap-2">
                <span className={cn("size-2 rounded-full", status.dot)} />
                <span className={cn("text-xs font-medium", status.text)}>{status.label}</span>
              </div>
              <InfoRow label="Scheme" value={patient.medicalAidScheme ?? "—"} />
              <InfoRow label="Member #" value={patient.memberNumber ?? "—"} />
              <InfoRow label="Dependent" value={patient.dependentCode ?? "—"} />
              <InfoRow label="Main Member" value={patient.mainMemberName ?? "—"} />
            </div>

            {/* Allergies & Chronic */}
            <SectionLabel>Clinical</SectionLabel>
            <div className="space-y-2 rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
              {editing ? (
                <>
                  <EditableRow label="Allergies" value={editForm.allergies} onChange={(v) => setEditForm((f) => ({ ...f, allergies: v }))} />
                  <EditableRow label="Chronic Conditions" value={editForm.chronicConditions} onChange={(v) => setEditForm((f) => ({ ...f, chronicConditions: v }))} />
                </>
              ) : (
                <>
                  <InfoRow label="Allergies" value={(patient.allergies ?? []).join(", ") || "None recorded"} />
                  <InfoRow label="Chronic" value={(patient.chronicConditions ?? []).join(", ") || "None recorded"} />
                </>
              )}
            </div>
          </div>
        )}

        {activeTab === "history" && (
          <div className="space-y-3">
            <SectionLabel>Clinical Sessions</SectionLabel>
            {historyLoading && (
              <p className="py-4 text-center text-xs text-white/25">Loading sessions…</p>
            )}
            {!historyLoading &&
              encounterList.map((enc) => (
                <button
                  key={enc.id}
                  type="button"
                  onClick={() => void handleOpenClinicalEncounter(enc.id)}
                  className="w-full rounded-xl border border-white/[0.06] bg-white/[0.02] p-4 text-left transition-colors hover:border-white/[0.12] hover:bg-white/[0.04]"
                >
                  <div className="mb-1 flex items-center justify-between">
                    <span className="text-[11px] font-medium text-white/70">
                      {new Date(enc.updated_at).toLocaleDateString("en-ZA", {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                    <span
                      className={cn(
                        "rounded-full px-2 py-0.5 text-[9px] font-medium uppercase",
                        enc.status === "signed" || enc.status === "completed"
                          ? "bg-[#00E676]/10 text-[#00E676]"
                          : enc.status === "in_progress"
                            ? "bg-[#FFC107]/10 text-[#FFC107]"
                            : "bg-white/[0.06] text-white/40"
                      )}
                    >
                      {enc.status.replace(/_/g, " ")}
                    </span>
                  </div>
                  <p className="text-[10px] text-white/35">Open in clinical workspace — full SOAP, vitals, and documents</p>
                </button>
              ))}
            {!historyLoading && encounterList.length === 0 && (
              <p className="py-8 text-center text-xs text-white/20">No clinical sessions recorded</p>
            )}
          </div>
        )}

        {activeTab === "medications" && (
          <div className="space-y-3">
            <SectionLabel>Current Medications</SectionLabel>
            {(patient.currentMedications ?? []).length > 0 ? (
              (patient.currentMedications ?? []).map((med) => (
                <MedicationCard key={med.id} med={med} />
              ))
            ) : (
              <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-8 text-center">
                <Pill className="mx-auto mb-2 size-6 text-white/10" />
                <p className="text-xs text-white/30">No medications on file</p>
              </div>
            )}
          </div>
        )}

        {activeTab === "billing" && (
          <div className="space-y-4">
            <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
              <p className="text-[10px] text-white/30">Outstanding Balance</p>
              <p className={cn("mt-1 text-2xl font-bold tabular-nums", patient.outstandingBalance > 0 ? "text-[#FFC107]" : "text-[#00E676]")}>
                R{patient.outstandingBalance.toLocaleString()}
              </p>
            </div>

            <SectionLabel>Claims</SectionLabel>
            {patientClaims.length > 0 ? (
              patientClaims.map((claim) => (
                <div key={claim.id} className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-[11px] font-medium text-white/60">{claim.id}</span>
                    <span className={cn(
                      "rounded-full px-2 py-0.5 text-[9px] font-medium uppercase",
                      claim.status === "paid" ? "bg-[#00E676]/10 text-[#00E676]"
                        : claim.status === "rejected" ? "bg-[#EF5350]/10 text-[#EF5350]"
                        : "bg-[#FFC107]/10 text-[#FFC107]"
                    )}>
                      {claim.status}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-white/40">{new Date(claim.createdAt).toLocaleDateString("en-ZA", { day: "numeric", month: "short" })}</span>
                    <span className="font-bold tabular-nums text-white/70">R{claim.totalAmount.toLocaleString()}</span>
                  </div>
                  {claim.lines.length > 0 && (
                    <div className="mt-2 space-y-1 border-t border-white/[0.04] pt-2">
                      {claim.lines.slice(0, 3).map((line, idx) => (
                        <div key={idx} className="flex justify-between text-[10px]">
                          <span className="text-white/30">{line.description}</span>
                          <span className="tabular-nums text-white/40">R{line.amount}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))
            ) : (
              <p className="py-8 text-center text-xs text-white/20">No claims for this patient</p>
            )}
          </div>
        )}
      </div>
    </motion.div>

    <MediKreditAccreditationModal
      open={accreditation !== null}
      onClose={() => setAccreditation(null)}
      transactionType={accreditation === "family" ? "famcheck" : "eligibility"}
      title={accreditation === "family" ? "Family eligibility (tx_cd 30)" : "Eligibility (tx_cd 20)"}
      rawXml={accreditation === "family" ? fam?.rawXml : elig?.rawXml}
      res={accreditation === "family" ? fam?.res : elig?.res}
      txNbr={accreditation === "family" ? fam?.txNbr : elig?.txNbr}
      rejectionCode={accreditation === "family" ? fam?.rejectionCode : elig?.rejectionCode}
      rejectionDescription={accreditation === "family" ? fam?.rejectionDescription : elig?.rejectionDescription}
      remittanceMessages={accreditation === "family" ? fam?.remittanceMessages : elig?.remittanceMessages}
      warnings={accreditation === "family" ? fam?.warnings : elig?.warnings}
      dependents={accreditation === "family" ? fam?.dependents : undefined}
    />
    </>
  )
}

// ── Small UI Components ──

function MedicationCard({ med }: { med: PatientMedication }) {
  return (
    <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-white/80">{med.name}</p>
        {med.refillsRemaining !== undefined && (
          <span className={cn(
            "rounded-full px-2 py-0.5 text-[9px] font-medium",
            med.refillsRemaining > 0 ? "bg-white/[0.06] text-white/40" : "bg-[#EF5350]/10 text-[#EF5350]"
          )}>
            {med.refillsRemaining} refills
          </span>
        )}
      </div>
      <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-0.5 text-[10px] text-white/40">
        {med.dosage && <span>{med.dosage}</span>}
        {med.frequency && <span>{med.frequency}</span>}
        {med.prescribedBy && <span>Dr. {med.prescribedBy}</span>}
        <span>Since {new Date(med.startDate).toLocaleDateString("en-ZA", { month: "short", year: "numeric" })}</span>
      </div>
    </div>
  )
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between py-0.5">
      <span className="text-[10px] text-white/30">{label}</span>
      <span className="text-[11px] text-white/60">{value}</span>
    </div>
  )
}

function EditableRow({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex items-center justify-between gap-4 py-0.5">
      <span className="shrink-0 text-[10px] text-white/30">{label}</span>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-2/3 rounded border border-white/[0.08] bg-white/[0.04] px-2 py-1 text-right text-[11px] text-white/70 focus:border-white/[0.15] focus:outline-none"
      />
    </div>
  )
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <p className="text-[10px] font-semibold uppercase tracking-wider text-white/25">{children}</p>
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <label className="mb-1 block text-[10px] font-medium uppercase tracking-wider text-white/30">{children}</label>
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  required,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  placeholder: string
  required?: boolean
}) {
  return (
    <div>
      <FieldLabel>{label}{required && <span className="text-[#EF5350]"> *</span>}</FieldLabel>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2 text-xs text-foreground placeholder:text-white/15 focus:border-white/[0.12] focus:outline-none"
      />
    </div>
  )
}

"use client"

import { useWorkspace, createPatientSession, useWorkspaceStore } from "@/lib/clinical-workspace"
import type {
  PracticePatient,
  PracticeAppointment,
  MedicalAidVerification,
  PatientMedication,
  PatientSession,
  PracticeClaim,
} from "@/lib/clinical-workspace"
import {
  findDuplicatePatient,
  isPracticePatientProfileIncomplete,
  normalizeSaIdDigits,
  type PatientRegistrationPrefill,
} from "@/lib/clinical/smart-import-patient"
import { encryptPatientProfile, usePracticeCrypto } from "@/lib/clinical-workspace/practice-crypto-context"
import {
  encounterPlainToSessionPartial,
  scribePartialFromPlain,
  type EncounterStatePlain,
} from "@/lib/clinical-workspace/encounter-state"
import { fetchLatestEncounterPlain } from "@/lib/clinical-workspace/fetch-latest-encounter"
import { buildEncounterSummarySourceText } from "@/lib/clinical/encounter-summary-source"
import { decryptJson } from "@/lib/crypto/practice-e2ee"
import { createClient } from "@/lib/supabase/client"
import { fetchClient } from "@/lib/fetch"
import { usePatientOverview, usePatientOverviewInvalidation } from "@/lib/patient/use-patient-overview"
import { useUser } from "@/lib/user-store/provider"
import { useEligibilityCheck } from "@/lib/hooks/use-eligibility-check"
import type {
  EligibilityResponse,
  FamilyDependentRow,
  FamilyEligibilityResponse,
} from "@/lib/medikredit/types"
import {
  formatMedikreditYmd,
  medikreditFamilyRowToPrefill,
  normalizeFamilyDepCode,
} from "@/lib/medikredit/family-prefill"
import { buildFamCheckDirectoryUpdateProposal, type FamCheckDirectoryChange } from "@/lib/medikredit/famcheck-directory-update"
import { MediKreditAccreditationModal } from "@/app/components/medikredit/medi-kredit-accreditation-modal"
import { AssistantModalSuppressor } from "@/app/components/assistant/assistant-modal-suppressor"
import { BentoTile } from "./bento-tile"
import { PatientDetailPanel } from "./patient-detail-panel"
import { PatientChartSummary } from "./patient-chart-summary"
import { cn } from "@/lib/utils"
import { toast } from "sonner"
import QRCode from "qrcode"
import type { PatientScanDocument, PatientScanSessionView } from "@/lib/clinical/patient-scan-session"
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
  Sparkle,
  CaretDown,
  CaretRight,
} from "@phosphor-icons/react"
import { useMemo, useState, useCallback, useRef, useEffect } from "react"
import { AnimatePresence, motion } from "motion/react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

type SortKey = "name" | "lastVisit" | "balance" | "status"
type SortDir = "asc" | "desc"

const STATUS_CONFIG: Record<MedicalAidVerification, { label: string; dot: string; text: string }> = {
  verified: { label: "Active", dot: "bg-status-success", text: "text-status-success" },
  pending: { label: "Pending", dot: "bg-status-warning", text: "text-status-warning" },
  terminated: { label: "Terminated", dot: "bg-status-danger", text: "text-status-danger" },
  unknown: { label: "Unknown", dot: "bg-secondary", text: "text-muted-foreground" },
}

const MA_SCHEMES = ["Discovery", "Bonitas", "Momentum", "GEMS", "Medihelp", "Bestmed", "Fedhealth"]

type MedicalSchemeRow = { code: string; name: string; administrator: string | null }

function fallbackMedicalSchemes(): MedicalSchemeRow[] {
  return MA_SCHEMES.map((name) => ({ code: "", name, administrator: null }))
}

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
      className={cn("group flex items-center gap-1 text-[10px] uppercase tracking-wider text-muted-foreground transition-colors hover:text-accent-foreground/60", className)}
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

/** Whether this PAT row is already the open patient, or another record in the directory (by SA ID). */
function resolveFamilyRowInPractice(
  row: FamilyDependentRow,
  current: PracticePatient,
  allPatients: PracticePatient[]
): { state: "self" } | { state: "duplicate"; existing: PracticePatient } | { state: "new" } {
  const rowId = normalizeSaIdDigits(row.id_nbr)
  const curId = normalizeSaIdDigits(current.idNumber)
  if (rowId && curId && rowId === curId) {
    return { state: "self" }
  }

  const dup = findDuplicatePatient(allPatients, { idNumber: row.id_nbr })
  if (dup) {
    if (dup.id === current.id) return { state: "self" }
    return { state: "duplicate", existing: dup }
  }

  const rd = normalizeFamilyDepCode(row.dep_cd)
  const cd = normalizeFamilyDepCode(current.dependentCode)
  if (rd !== undefined && cd !== undefined && rd === cd && !rowId && !curId) {
    return { state: "self" }
  }

  return { state: "new" }
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
    openPatients,
    setActivePatient,
    addPatient,
    updatePatient,
    beginNewVisitForPatient,
  } = useWorkspace()
  const [medicalSchemes, setMedicalSchemes] = useState<MedicalSchemeRow[]>(() => fallbackMedicalSchemes())
  const [search, setSearch] = useState("")
  const [sortKey, setSortKey] = useState<SortKey>("name")
  const [sortDir, setSortDir] = useState<SortDir>("asc")
  const [showRegister, setShowRegister] = useState(false)
  const [selectedPatientId, setSelectedPatientId] = useState<string | null>(null)
  const [openPatientFileId, setOpenPatientFileId] = useState<string | null>(null)
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
      .select("code,name,administrator")
      .order("name")
      .then(({ data }) => {
        if (cancelled || !data?.length) return
        setMedicalSchemes(
          data.map((r) => ({
            code: String((r as MedicalSchemeRow).code ?? ""),
            name: String((r as MedicalSchemeRow).name ?? ""),
            administrator: (r as MedicalSchemeRow).administrator ?? null,
          }))
        )
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
  const filePatient = useMemo(
    () => patients.find((p) => p.id === openPatientFileId) ?? null,
    [patients, openPatientFileId]
  )
  const selectedPatientDraft = useMemo(
    () =>
      openPatients.find(
        (session) => session.patientId === selectedPatientId && !session.consultSigned
      ) ?? null,
    [openPatients, selectedPatientId]
  )
  const activeOverviewPatientId = openPatientFileId ?? selectedPatientId
  const activeOverviewQuery = usePatientOverview(activeOverviewPatientId)
  usePatientOverviewInvalidation(activeOverviewPatientId, activeOverviewQuery.data ?? null)

  const handleBookAppointment = useCallback(
    () => {
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

  const handleOpenPatientFile = useCallback((patient: PracticePatient) => {
    setSelectedPatientId(patient.id)
    setOpenPatientFileId(patient.id)
  }, [])

  const handlePatientPersist = useCallback(
    async (id: string, update: Partial<PracticePatient>) => {
      const current = useWorkspaceStore.getState().patients.find((p) => p.id === id)
      if (!current) return
      const merged: PracticePatient = { ...current, ...update }
      updatePatient(id, update)
      const supabase = createClient()
      if (!practiceId || !dekKey || !unlocked || !supabase) {
        if (!dekKey || !unlocked) toast.error("Unlock the session to save patient changes to the server")
        return
      }
      try {
        const payload: Partial<PracticePatient> = { ...merged }
        delete payload.id
        const { ciphertext, iv } = await encryptPatientProfile(dekKey, payload as Record<string, unknown>)
        const { error } = await supabase
          .from("practice_patients")
          .update({
            profile_ciphertext: ciphertext,
            profile_iv: iv,
            display_name_hint: merged.name,
            updated_at: new Date().toISOString(),
          })
          .eq("id", id)
          .eq("practice_id", practiceId)
        if (error) throw error
      } catch (e) {
        console.warn("[PatientDirectory] persist patient", e)
        toast.error("Could not save patient to the server")
      }
    },
    [practiceId, dekKey, unlocked, updatePatient]
  )

  const handleCreatePatient = useCallback(
    async (draft: PracticePatientDraft, dependents: PracticePatientDraft[] = []) => {
      setRegisterError(null)
      const allDrafts = [draft, ...dependents]
      for (const d of allDrafts) {
        const dup = findDuplicatePatient(patients, {
          idNumber: d.idNumber,
          passportNumber: d.passportNumber,
        })
        if (dup) {
          setRegisterError(
            `This practice already has a patient with this SA ID or passport number (${dup.name}). Open their file or use a different identifier.`
          )
          return
        }
      }
      const supabase = createClient()
      if (!practiceId || !dekKey || !unlocked || !supabase || !user?.id) {
        setRegisterError(
          "Unlock the encrypted clinical workspace before registering a patient. Patient records cannot be saved only on this device."
        )
        return
      }
      try {
        for (const d of allDrafts) {
          const profile = { ...d } as Record<string, unknown>
          const { ciphertext, iv } = await encryptPatientProfile(dekKey, profile)
          const { data, error } = await supabase
            .from("practice_patients")
            .insert({
              practice_id: practiceId,
              profile_ciphertext: ciphertext,
              profile_iv: iv,
              display_name_hint: d.name,
              created_by: user.id,
            })
            .select("id")
            .single()
          if (!error && data?.id) {
            addPatient({ ...d, id: data.id as string })
          } else {
            console.warn("[PatientDirectory] insert practice_patients", error)
            setRegisterError("Could not save one or more patients")
            return
          }
        }
        setShowRegister(false)
        if (dependents.length > 0) {
          toast.success(`Registered ${draft.name} + ${dependents.length} family member(s)`)
        }
      } catch (e) {
        console.warn("[PatientDirectory] persist patient", e)
        setRegisterError("Could not encrypt and save the patient record")
      }
    },
    [addPatient, dekKey, patients, practiceId, unlocked, user?.id]
  )

  return (
    <div className="flex h-full flex-col gap-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">Patient Directory</h2>
          <p className="text-[11px] text-muted-foreground">{stats.total} registered patients</p>
        </div>
        <button
          type="button"
          onClick={() => setShowRegister(true)}
          className="flex items-center gap-1.5 rounded-lg border border-panel-border bg-panel-muted px-3 py-1.5 text-xs font-medium text-foreground/70 transition-colors hover:bg-secondary hover:text-accent-foreground"
        >
          <Plus className="size-3.5" weight="bold" />
          Add Patient
        </button>
      </div>

      {/* Top Stats */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <StatCard label="Total Patients" value={stats.total} />
        <StatCard label="Verified MA" value={stats.verified} accent="text-status-success" />
        <StatCard label="Pending Verification" value={stats.pending} accent="text-status-warning" />
        <StatCard label="Chronic Conditions" value={stats.chronic} accent="text-blue-400" />
        <StatCard
          label="Incomplete profiles"
          value={stats.incompleteProfiles}
          accent={stats.incompleteProfiles > 0 ? "text-amber-400" : "text-muted-foreground"}
        />
      </div>

      {/* Bento Grid */}
      <div className="grid min-h-0 flex-1 grid-cols-[1fr_280px] gap-4">
        {/* Main Table */}
        <BentoTile className="min-h-0 flex-col">
          <div className="mb-3 flex items-center gap-2">
            <div className="relative flex-1">
              <MagnifyingGlass className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by name, ID, member number..."
                className="w-full rounded-lg border border-panel-border bg-panel-muted/50 py-2 pl-8 pr-3 text-xs text-foreground placeholder:text-muted-foreground/50 focus:border-ring focus:outline-none"
              />
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-auto" style={{ scrollbarWidth: "none" }}>
            <table className="w-full text-left">
              <thead className="sticky top-0 z-10 bg-background/80 backdrop-blur-sm">
                <tr className="border-b border-panel-border">
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
                    <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Actions</span>
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
                    onOpenFile={handleOpenPatientFile}
                    isSelected={patient.id === selectedPatientId}
                  />
                ))}
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={5} className="py-16 text-center">
                      <UserCircle className="mx-auto mb-2 size-8 text-muted-foreground" />
                      <p className="text-xs text-muted-foreground">
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
          {selectedPatient ? (
            <PatientDetailPanel
              patient={selectedPatient}
              onClose={() => setSelectedPatientId(null)}
              onNewVisit={() => selectedPatient && handleStartNewVisit(selectedPatient)}
              onContinueDraft={
                selectedPatientDraft
                  ? () => {
                      setActivePatient(selectedPatientDraft.patientId)
                      setMode("clinical")
                    }
                  : undefined
              }
              onScribe={() => selectedPatient && handleStartScribe(selectedPatient)}
              onOpenFile={() => selectedPatient && handleOpenPatientFile(selectedPatient)}
            />
          ) : (
            <>
              <BentoTile
                title="Registration Funnel"
                subtitle="Onboarding status"
                icon={<IdentificationCard className="size-4" />}
                glow={stats.pending > 0 ? "amber" : undefined}
              >
                <div className="space-y-3">
                  <FunnelRow label="Complete Profiles" value={stats.verified} total={stats.total} color="bg-status-success" />
                  <FunnelRow label="Missing ID/MA Photo" value={stats.pending} total={stats.total} color="bg-status-warning" />
                  <FunnelRow label="Never Visited" value={patients.filter((p) => !p.lastVisit).length} total={stats.total} color="bg-status-danger" />
                </div>
              </BentoTile>

              <BentoTile
                title="Demographic Pulse"
                subtitle="Patient base overview"
                icon={<Heartbeat className="size-4" />}
              >
                <div className="space-y-4">
                  <div>
                    <p className="mb-2 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Age Groups</p>
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
                            <div className="relative h-12 w-full rounded-md bg-panel-muted">
                              <div
                                className="absolute bottom-0 w-full rounded-md bg-blue-500/30"
                                style={{ height: `${(counts[i] / max) * 100}%` }}
                              />
                            </div>
                            <span className="text-[9px] text-muted-foreground">{r.label}</span>
                            <span className="text-[10px] font-bold tabular-nums">{counts[i]}</span>
                          </div>
                        ))
                      })()}
                    </div>
                  </div>

                  <div>
                    <p className="mb-2 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Top Chronic Conditions</p>
                    <div className="space-y-1">
                      {(() => {
                        const condMap: Record<string, number> = {}
                        patients.forEach((p) => p.chronicConditions?.forEach((c) => { condMap[c] = (condMap[c] ?? 0) + 1 }))
                        return Object.entries(condMap)
                          .sort(([, a], [, b]) => b - a)
                          .slice(0, 4)
                          .map(([cond, count]) => (
                            <div key={cond} className="flex items-center justify-between rounded-md px-1.5 py-1 transition-colors hover:bg-panel-muted">
                              <span className="text-[11px] text-muted-foreground/80">{cond}</span>
                              <span className="text-[10px] font-bold tabular-nums text-muted-foreground">{count}</span>
                            </div>
                          ))
                      })()}
                    </div>
                  </div>

                  <div>
                    <p className="mb-2 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Gender</p>
                    <div className="flex gap-3">
                      {[
                        { label: "Male", count: patients.filter((p) => p.sex === "M").length, color: "text-blue-400" },
                        { label: "Female", count: patients.filter((p) => p.sex === "F").length, color: "text-pink-400" },
                      ].map((g) => (
                        <div key={g.label} className="flex items-center gap-1.5 text-[11px]">
                          <span className={cn("font-bold tabular-nums", g.color)}>{g.count}</span>
                          <span className="text-muted-foreground">{g.label}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </BentoTile>
            </>
          )}
        </div>
      </div>

      {/* Register Modal */}
      <AnimatePresence>
        {showRegister && (
          <AddPatientModal
            medicalSchemes={medicalSchemes}
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
        {filePatient && (
          <PatientFilePanel
            patient={filePatient}
            directoryPatients={patients}
            claims={claims}
            medicalSchemes={medicalSchemes}
            onClose={() => setOpenPatientFileId(null)}
            onUpdate={handlePatientPersist}
            onSelectPatientInDirectory={(id) => {
              setSelectedPatientId(id)
              setOpenPatientFileId(id)
            }}
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
  onOpenFile,
  isSelected,
}: {
  patient: PracticePatient
  onBook: (p: PracticePatient) => void
  onScribe: (p: PracticePatient) => void
  onNewVisit: (p: PracticePatient) => void
  onView: (p: PracticePatient) => void
  onOpenFile: (p: PracticePatient) => void
  isSelected: boolean
}) {
  const status = STATUS_CONFIG[patient.medicalAidStatus]
  return (
    <tr
      className={cn(
        "group cursor-pointer border-b border-panel-border transition-colors hover:bg-panel-muted",
        isSelected && "bg-panel-muted"
      )}
      onClick={() => onView(patient)}
    >
      <td className="py-2.5 pl-2 pr-3">
        <div className="flex items-center gap-2.5">
          <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-secondary text-[10px] font-bold text-muted-foreground">
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
            <p className="truncate text-[10px] text-muted-foreground">
              {patient.idNumber ?? "No ID"}{patient.medicalAidScheme ? ` · ${patient.medicalAidScheme}` : ""}
            </p>
          </div>
        </div>
      </td>
      <td className="px-3 py-2.5">
        <span className="text-[11px] tabular-nums text-muted-foreground/70">
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
        <span className={cn("text-[11px] font-bold tabular-nums", patient.outstandingBalance > 0 ? "text-status-warning" : "text-muted-foreground")}>
          {patient.outstandingBalance > 0 ? `R${patient.outstandingBalance.toLocaleString()}` : "—"}
        </span>
      </td>
      <td className="px-3 py-2.5 text-right">
        <div className="flex items-center justify-end gap-1 opacity-0 transition-opacity group-hover:opacity-100">
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onBook(patient) }}
            className="rounded-md border border-panel-border px-2 py-1 text-[10px] text-muted-foreground/70 transition-colors hover:bg-secondary hover:text-accent-foreground"
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
            className="rounded-md border border-panel-border px-2 py-1 text-[10px] text-muted-foreground/70 transition-colors hover:bg-sky-500/10 hover:text-sky-400"
            title="New visit — fresh encounter"
          >
            <PlusCircle className="size-3" weight="bold" />
          </button>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onScribe(patient) }}
            className="rounded-md border border-panel-border px-2 py-1 text-[10px] text-muted-foreground/70 transition-colors hover:bg-status-success/10 hover:text-status-success"
            title="Resume last visit / scribe"
          >
            <Stethoscope className="size-3" weight="bold" />
          </button>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onOpenFile(patient) }}
            className="rounded-md border border-panel-border px-2 py-1 text-[10px] text-muted-foreground/70 transition-colors hover:bg-secondary hover:text-accent-foreground"
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
    <div className="rounded-xl border border-panel-border bg-panel-muted/50 px-4 py-3">
      <p className="text-[10px] text-muted-foreground">{label}</p>
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
        <span className="text-muted-foreground/70">{label}</span>
        <span className="font-bold tabular-nums">{value}</span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-panel-muted">
        <div className={cn("h-full rounded-full transition-all", color)} style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

// ── Add Patient Modal ──

type ModalTab = "manual" | "scan"

type ScanSessionRow = {
  id: string
  status: string
  expires_at: string
  documents?: PatientScanDocument[]
  extracted_fields?: Record<string, string>
  prefill?: PatientRegistrationPrefill
  missing_fields?: string[]
  error?: string | null
}

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
  /** Set when user picks a row from `medical_schemes`; empty if free text */
  medicalAidSchemeCode: string
  memberNumber: string
  dependentCode: string
  mainMemberName: string
  /** Benefit plan label from MediKredit (PLAN pln_descr) — often filled from eligibility prefill */
  medicalAidPlan: string
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
  medicalAidSchemeCode: "",
  memberNumber: "",
  dependentCode: "",
  mainMemberName: "",
  medicalAidPlan: "",
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
  if (p.memberNumber !== undefined) out.memberNumber = p.memberNumber
  if (p.dependentCode !== undefined) out.dependentCode = p.dependentCode
  if (p.mainMemberName !== undefined) out.mainMemberName = p.mainMemberName
  if (p.medicalAidPlan !== undefined) out.medicalAidPlan = p.medicalAidPlan
  if (p.medicalAidSchemeCode !== undefined) out.medicalAidSchemeCode = p.medicalAidSchemeCode
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

function normalizeScanSession(row: ScanSessionRow, scanUrl?: string): PatientScanSessionView {
  return {
    id: row.id,
    status: row.status as PatientScanSessionView["status"],
    expiresAt: row.expires_at,
    scanUrl,
    documents: Array.isArray(row.documents) ? row.documents : [],
    extractedFields: row.extracted_fields ?? {},
    prefill: row.prefill ?? {},
    missingFields: Array.isArray(row.missing_fields) ? row.missing_fields : [],
    error: row.error ?? null,
  }
}

function familyDepRowKey(d: FamilyDependentRow, i: number) {
  return [d.dep_cd, d.id_nbr, d.name, d.dobYmd, String(i)].filter(Boolean).join(":")
}

function AddPatientModal({
  onClose,
  onCreate,
  medicalSchemes,
  smartImportPrefillNonce = 0,
  registrationError,
}: {
  onClose: () => void
  onCreate: (p: PracticePatientDraft, dependents?: PracticePatientDraft[]) => void | Promise<void>
  medicalSchemes: MedicalSchemeRow[]
  smartImportPrefillNonce?: number
  registrationError?: string | null
}) {
  const { practiceId } = usePracticeCrypto()
  const { patients } = useWorkspace()
  const [tab, setTab] = useState<ModalTab>("manual")
  const [form, setForm] = useState<ManualFormState>(INITIAL_FORM)
  const [schemeOpen, setSchemeOpen] = useState(false)
  const schemeRef = useRef<HTMLDivElement>(null)
  const { practiceId: modalPracticeId } = usePracticeCrypto()
  const [maCheckBusy, setMaCheckBusy] = useState(false)
  const [maCheckHint, setMaCheckHint] = useState<string | null>(null)
  const [famDependents, setFamDependents] = useState<FamilyDependentRow[]>([])
  const [selectedFamKeys, setSelectedFamKeys] = useState<Set<string>>(new Set())

  const [scanSession, setScanSession] = useState<PatientScanSessionView | null>(null)
  const [scanQrUrl, setScanQrUrl] = useState<string | null>(null)
  const [scanBusy, setScanBusy] = useState(false)
  const [scanError, setScanError] = useState<string | null>(null)

  useEffect(() => {
    if (smartImportPrefillNonce <= 0) return
    const prefill = useWorkspaceStore.getState().patientAddModalPrefill
    if (!prefill) return
    const partial = registrationPrefillToManualForm(prefill)
    setForm({ ...INITIAL_FORM, ...partial, medicalAidSchemeCode: "" })
    setTab("manual")
    useWorkspaceStore.getState().clearPatientAddModalPrefill()
  }, [smartImportPrefillNonce])

  /** When the catalog loads after open, attach option code if scheme name matches a row */
  useEffect(() => {
    setForm((f) => {
      if (!f.hasMedicalAid || !f.scheme.trim() || !medicalSchemes.length) return f
      if (f.medicalAidSchemeCode.trim()) return f
      const m = medicalSchemes.find((s) => s.name.toLowerCase() === f.scheme.trim().toLowerCase())
      if (!m?.code) return f
      return { ...f, medicalAidSchemeCode: m.code }
    })
  }, [medicalSchemes])

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

  const schemeFiltered = useMemo(() => {
    const schemeQuery = form.scheme.trim().toLowerCase()
    if (!schemeQuery) return medicalSchemes.slice(0, 80)
    return medicalSchemes.filter((s) => {
      const name = s.name.toLowerCase()
      const code = s.code.toLowerCase()
      const adm = (s.administrator ?? "").toLowerCase()
      return name.includes(schemeQuery) || code.includes(schemeQuery) || adm.includes(schemeQuery)
    })
  }, [form.scheme, medicalSchemes])

  useEffect(() => {
    let cancelled = false
    async function makeQr() {
      if (!scanSession?.scanUrl) {
        setScanQrUrl(null)
        return
      }
      try {
        const dataUrl = await QRCode.toDataURL(scanSession.scanUrl, {
          margin: 1,
          width: 256,
          color: { dark: "#052e2b", light: "#ffffff" },
        })
        if (!cancelled) setScanQrUrl(dataUrl)
      } catch {
        if (!cancelled) setScanQrUrl(null)
      }
    }
    void makeQr()
    return () => {
      cancelled = true
    }
  }, [scanSession?.scanUrl])

  useEffect(() => {
    if (!scanSession?.id) return
    const supabase = createClient()
    if (!supabase) return
    const channel = supabase
      .channel(`patient_scan_sessions:id=eq.${scanSession.id}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "patient_scan_sessions",
          filter: `id=eq.${scanSession.id}`,
        },
        (payload) => {
          setScanSession((current) =>
            normalizeScanSession(payload.new as ScanSessionRow, current?.scanUrl)
          )
        }
      )
      .subscribe()
    return () => {
      void supabase.removeChannel(channel)
    }
  }, [scanSession?.id])

  const scanForm = useMemo(
    () => (scanSession?.prefill ? registrationPrefillToManualForm(scanSession.prefill) : null),
    [scanSession?.prefill]
  )
  const scanDuplicate = useMemo(
    () =>
      scanSession?.prefill
        ? findDuplicatePatient(patients, { idNumber: scanSession.prefill.idNumber })
        : undefined,
    [patients, scanSession?.prefill]
  )
  const scanExpiresIn = useMemo(() => {
    if (!scanSession?.expiresAt) return null
    const diff = new Date(scanSession.expiresAt).getTime() - Date.now()
    if (diff <= 0) return "Expired"
    return `${Math.max(1, Math.ceil(diff / 60000))} min`
  }, [scanSession?.expiresAt, scanSession?.status])

  const canCreate = form.firstName.trim() && form.lastName.trim()

  const runMedAidCheck = useCallback(async () => {
    if (!modalPracticeId || !form.hasMedicalAid || !form.memberNumber.trim() || !form.scheme.trim()) {
      setMaCheckHint("Enter scheme and member number first")
      return
    }
    setMaCheckBusy(true)
    setMaCheckHint(null)
    setFamDependents([])
    setSelectedFamKeys(new Set())
    try {
      const synthetic = {
        id: "00000000-0000-4000-8000-000000000001",
        name: [form.firstName, form.lastName].filter(Boolean).join(" ").trim() || "Registration",
        memberNumber: form.memberNumber.trim(),
        medicalAidScheme: form.scheme.trim(),
        medicalAidSchemeCode: form.medicalAidSchemeCode.trim() || undefined,
        dependentCode: form.dependentCode.trim() || "00",
        idNumber: form.idNumber || undefined,
      }
      const elRes = await fetchClient("/api/clinical/medikredit/eligibility", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ practiceId: modalPracticeId, patient: synthetic, persist: false }),
      })
      const elJ = (await elRes.json()) as { result?: { planDescription?: string }; error?: string }
      if (!elRes.ok) throw new Error(elJ.error || "Eligibility failed")
      const plan = elJ.result?.planDescription?.trim()
      if (plan) setForm((f) => ({ ...f, medicalAidPlan: plan }))

      const famRes = await fetchClient("/api/clinical/medikredit/family", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ practiceId: modalPracticeId, patient: synthetic, persist: false }),
      })
      const famJ = (await famRes.json()) as { result?: { dependents?: FamilyDependentRow[] }; error?: string }
      if (!famRes.ok) throw new Error(famJ.error || "Family check failed")
      const deps = famJ.result?.dependents ?? []
      setFamDependents(deps)
      setMaCheckHint(
        plan ? `Active · ${plan}` : deps.length ? `${deps.length} dependant(s) on file` : "Scheme responded"
      )
    } catch (e) {
      setMaCheckHint(e instanceof Error ? e.message : "Check failed")
    } finally {
      setMaCheckBusy(false)
    }
  }, [modalPracticeId, form])

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
      medicalAidSchemeCode:
        form.hasMedicalAid && form.medicalAidSchemeCode.trim()
          ? form.medicalAidSchemeCode.trim()
          : undefined,
      medicalAidPlan: form.hasMedicalAid && form.medicalAidPlan.trim() ? form.medicalAidPlan.trim() : undefined,
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

    const depDrafts: PracticePatientDraft[] = []
    for (let i = 0; i < famDependents.length; i++) {
      const d = famDependents[i]!
      const key = familyDepRowKey(d, i)
      if (!selectedFamKeys.has(key)) continue
      const depName =
        d.name?.trim() ||
        [d.firstNames, d.surname].filter(Boolean).join(" ").trim() ||
        `Dependant ${d.dep_cd ?? i + 1}`
      let sex: "M" | "F" | "Other" | undefined
      if (d.gender === "1") sex = "M"
      else if (d.gender === "2") sex = "F"
      const idDigits = d.id_nbr?.replace(/\D/g, "") ?? ""
      depDrafts.push({
        name: depName,
        idNumber: idDigits.length === 13 ? idDigits : undefined,
        dateOfBirth: d.dateOfBirthIso,
        sex,
        medicalAidStatus: "pending",
        medicalAidScheme: form.scheme || undefined,
        medicalAidSchemeCode: form.medicalAidSchemeCode.trim() || undefined,
        medicalAidPlan: d.planDescription?.trim() || form.medicalAidPlan.trim() || undefined,
        memberNumber: form.memberNumber || undefined,
        dependentCode: d.dep_cd || undefined,
        outstandingBalance: 0,
        registeredAt: new Date().toISOString().slice(0, 10),
        profileIncomplete: true,
      })
    }

    void onCreate(draft, depDrafts)
  }, [form, onCreate, famDependents, selectedFamKeys])

  const startScanSession = useCallback(async () => {
    if (!practiceId) {
      setScanError("Practice is not ready yet. Unlock the workspace and try again.")
      return
    }
    setScanBusy(true)
    setScanError(null)
    try {
      const res = await fetch("/api/clinical/patient-scan-sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ practiceId }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json.error || "Could not create scan session")
      setScanSession(json.session as PatientScanSessionView)
    } catch (e) {
      setScanError(e instanceof Error ? e.message : "Could not create scan session")
    } finally {
      setScanBusy(false)
    }
  }, [practiceId])

  const cancelScanSession = useCallback(async () => {
    if (!scanSession?.id) {
      setScanSession(null)
      return
    }
    const id = scanSession.id
    setScanBusy(true)
    try {
      await fetch(`/api/clinical/patient-scan-sessions/${encodeURIComponent(id)}`, { method: "DELETE" })
    } finally {
      setScanSession(null)
      setScanQrUrl(null)
      setScanBusy(false)
    }
  }, [scanSession?.id])

  const handleConfirmScan = useCallback(() => {
    if (!scanForm) return
    setForm((f) => ({ ...f, ...scanForm }))
    setTab("manual")
  }, [scanForm])

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[130] flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <AssistantModalSuppressor />
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 8 }}
        transition={{ type: "spring", stiffness: 400, damping: 30 }}
        className="max-h-[85vh] w-full max-w-xl overflow-hidden rounded-2xl border border-panel-border bg-panel shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-panel-border px-6 py-4">
          <h3 className="text-sm font-semibold">Register New Patient</h3>
          <button type="button" onClick={onClose} className="rounded-md p-1 text-muted-foreground hover:text-accent-foreground">
            <X className="size-4" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-panel-border">
          {(["manual", "scan"] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={cn(
                "flex-1 py-2.5 text-xs font-medium transition-colors",
                tab === t ? "border-b-2 border-white/60 text-foreground" : "text-muted-foreground hover:text-accent-foreground/60"
              )}
            >
              {t === "manual" ? "Manual Entry" : "Smart Scan"}
            </button>
          ))}
        </div>

        {registrationError ? (
          <p className="border-b border-panel-border bg-red-500/10 px-6 py-2 text-[11px] text-red-300">
            {registrationError}
          </p>
        ) : null}

        {/* Body */}
        <div
          className="max-h-[calc(85vh-140px)] overflow-y-auto p-6 pb-[max(5rem,env(safe-area-inset-bottom))]"
          style={{ scrollbarWidth: "thin" }}
        >
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
                    className="w-full rounded-lg border border-panel-border bg-panel-muted/50 px-2 py-2 text-xs text-foreground focus:border-ring focus:outline-none"
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
                    className="w-full rounded-lg border border-panel-border bg-panel-muted/50 px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground/50 focus:border-ring focus:outline-none"
                  />
                  {form.idNumber.length > 0 && form.idNumber.length < 13 && (
                    <p className="mt-1 text-[9px] text-status-warning/60">{13 - form.idNumber.length} digits remaining</p>
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
                    className="w-full rounded-lg border border-panel-border bg-panel-muted/50 px-2 py-2 text-xs text-foreground focus:border-ring focus:outline-none"
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
                  className="flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-accent-foreground/60"
                >
                  {form.hasMedicalAid ? (
                    <ToggleRight className="size-5 text-status-success" weight="fill" />
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
                    <div className="space-y-3 rounded-xl border border-panel-border bg-panel-muted/50 p-4">
                      <div ref={schemeRef} className="relative">
                        <FieldLabel>Scheme</FieldLabel>
                        <input
                          type="text"
                          value={form.scheme}
                          onChange={(e) => {
                            set("scheme", e.target.value)
                            set("medicalAidSchemeCode", "")
                            setSchemeOpen(true)
                          }}
                          onFocus={() => setSchemeOpen(true)}
                          placeholder="Search by scheme name or option code…"
                          className="w-full rounded-lg border border-panel-border bg-panel-muted/50 px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground/50 focus:border-ring focus:outline-none"
                        />
                        {schemeOpen && schemeFiltered.length > 0 && (
                          <div className="absolute left-0 top-full z-20 mt-1 max-h-56 w-full overflow-y-auto rounded-lg border border-panel-border bg-popover py-1 shadow-xl">
                            {schemeFiltered.map((s) => (
                              <button
                                key={`${s.code}|${s.name}`}
                                type="button"
                                onClick={() => {
                                  set("scheme", s.name)
                                  set("medicalAidSchemeCode", s.code)
                                  setSchemeOpen(false)
                                }}
                                className="flex w-full flex-col gap-0.5 px-3 py-2 text-left transition-colors hover:bg-secondary"
                              >
                                <div className="flex items-baseline gap-2">
                                  {s.code ? (
                                    <span className="shrink-0 font-mono text-[10px] font-medium tabular-nums text-status-success/90">
                                      {s.code}
                                    </span>
                                  ) : null}
                                  <span className="text-xs text-foreground/80">{s.name}</span>
                                </div>
                                {s.administrator ? (
                                  <span className="text-[10px] text-muted-foreground">{s.administrator}</span>
                                ) : null}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <Field label="Member Number" value={form.memberNumber} onChange={(v) => set("memberNumber", v)} placeholder="e.g. DH-12345678" />
                        <Field label="Dependent Code" value={form.dependentCode} onChange={(v) => set("dependentCode", v)} placeholder="e.g. 00" />
                      </div>
                      <Field label="Main Member Name" value={form.mainMemberName} onChange={(v) => set("mainMemberName", v)} placeholder="If dependent, enter main member name" />
                      <Field
                        label="Benefit plan (switch)"
                        value={form.medicalAidPlan}
                        onChange={(v) => set("medicalAidPlan", v)}
                        placeholder="Filled from eligibility — e.g. POLMED MARINE"
                      />
                      <div className="flex flex-col gap-2">
                        <button
                          type="button"
                          disabled={maCheckBusy || !modalPracticeId}
                          onClick={() => void runMedAidCheck()}
                          className="rounded-lg bg-status-success/15 py-2 text-[11px] font-semibold text-status-success hover:bg-status-success/25 disabled:opacity-40"
                        >
                          {maCheckBusy ? "Checking scheme…" : "Quick check · plan + fam"}
                        </button>
                        {maCheckHint ? (
                          <p
                            className={cn(
                              "text-[10px] leading-relaxed",
                              maCheckHint.includes("fail") || maCheckHint.includes("not")
                                ? "text-amber-200/90"
                                : "text-muted-foreground/65"
                            )}
                          >
                            {maCheckHint}
                          </p>
                        ) : null}
                        {famDependents.length > 0 ? (
                          <div className="rounded-lg border border-panel-border bg-panel-muted p-2">
                            <p className="mb-1.5 text-[9px] font-medium uppercase tracking-wider text-muted-foreground">
                              Add dependants to practice
                            </p>
                            <ul className="max-h-36 space-y-1 overflow-y-auto" style={{ scrollbarWidth: "thin" }}>
                              {famDependents.map((d, i) => {
                                const key = familyDepRowKey(d, i)
                                const label =
                                  d.name?.trim() ||
                                  [d.firstNames, d.surname].filter(Boolean).join(" ").trim() ||
                                  `Dep ${d.dep_cd ?? i}`
                                const selected = selectedFamKeys.has(key)
                                return (
                                  <li key={key}>
                                    <label className="flex cursor-pointer items-center gap-2 rounded-md px-1 py-1 hover:bg-panel-muted">
                                      <input
                                        type="checkbox"
                                        checked={selected}
                                        onChange={() => {
                                          setSelectedFamKeys((prev) => {
                                            const next = new Set(prev)
                                            if (next.has(key)) next.delete(key)
                                            else next.add(key)
                                            return next
                                          })
                                        }}
                                        className="rounded border-panel-border"
                                      />
                                      <span className="text-[10px] text-foreground/70">
                                        {label}
                                        {d.dep_cd ? (
                                          <span className="ml-1 font-mono text-[9px] text-muted-foreground">· {d.dep_cd}</span>
                                        ) : null}
                                        {d.dateOfBirthIso ? (
                                          <span className="ml-1 text-[9px] text-muted-foreground">{d.dateOfBirthIso}</span>
                                        ) : null}
                                      </span>
                                    </label>
                                  </li>
                                )
                              })}
                            </ul>
                          </div>
                        ) : null}
                      </div>
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
            <div className="space-y-5 py-1">
              <div className="rounded-2xl border border-emerald-400/15 bg-emerald-400/[0.03] p-4">
                <div className="flex items-start gap-3">
                  <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-emerald-400/10 text-emerald-300">
                    <Camera className="size-5" weight="bold" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-foreground">Smart Scan QR</p>
                    <p className="mt-1 text-xs leading-5 text-muted-foreground">
                      Show this QR code to the patient. Their phone only captures the ID and medical aid card; you
                      confirm or edit everything here before creating the profile.
                    </p>
                  </div>
                </div>
              </div>

              {!scanSession ? (
                <div className="flex flex-col items-center gap-4 rounded-2xl border border-dashed border-panel-border p-6 text-center">
                  <div className="flex size-24 items-center justify-center rounded-3xl bg-panel-muted text-muted-foreground">
                    <Camera className="size-10" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-foreground/80">Start a secure scan session</p>
                    <p className="mt-1 max-w-sm text-xs leading-5 text-muted-foreground">
                      The link expires quickly and pairs this registration modal with one mobile browser.
                    </p>
                  </div>
                  {scanError ? <p className="rounded-xl bg-red-500/10 px-3 py-2 text-xs text-red-300">{scanError}</p> : null}
                  <button
                    type="button"
                    disabled={scanBusy}
                    onClick={() => void startScanSession()}
                    className="flex items-center gap-2 rounded-xl bg-emerald-400/15 px-4 py-2.5 text-xs font-semibold text-emerald-300 transition-colors hover:bg-emerald-400/25 disabled:opacity-50"
                  >
                    {scanBusy ? <Spinner className="size-4 animate-spin" /> : <Camera className="size-4" weight="bold" />}
                    Generate QR code
                  </button>
                </div>
              ) : (
                <div className="grid gap-4 md:grid-cols-[180px_1fr]">
                  <div className="rounded-2xl border border-panel-border bg-panel-muted p-4 text-center">
                    <div className="mx-auto flex size-36 items-center justify-center overflow-hidden rounded-2xl bg-primary p-2">
                      {scanQrUrl ? (
                        <img src={scanQrUrl} alt="Patient scan QR code" className="size-full" />
                      ) : (
                        <Spinner className="size-6 animate-spin text-primary-foreground/50" />
                      )}
                    </div>
                    <p className="mt-3 text-[10px] uppercase tracking-wider text-muted-foreground">Expires in</p>
                    <p className="text-sm font-semibold text-foreground/70">{scanExpiresIn ?? "15 min"}</p>
                    {scanSession.scanUrl ? (
                      <p className="mt-2 break-all text-[9px] leading-4 text-muted-foreground">{scanSession.scanUrl}</p>
                    ) : null}
                  </div>

                  <div className="space-y-3">
                    <div className="flex items-center justify-between rounded-xl border border-panel-border bg-panel-muted px-3 py-2">
                      <div>
                        <p className="text-xs font-medium text-foreground/80">
                          {scanSession.status === "submitted"
                            ? "Ready for review"
                            : scanSession.status === "processing"
                              ? "Processing photos"
                              : scanSession.status === "opened"
                                ? "Phone connected"
                                : scanSession.status === "error"
                                  ? "Needs retry"
                                  : "Waiting for scan"}
                        </p>
                        <p className="mt-0.5 text-[10px] text-muted-foreground">
                          {scanSession.status === "submitted"
                            ? "Review missing details, then confirm into the form."
                            : scanSession.status === "processing"
                              ? "The mobile upload is being read now."
                              : "Ask the patient to open the QR code and send both captures."}
                        </p>
                      </div>
                      {scanSession.status === "processing" ? (
                        <Spinner className="size-4 animate-spin text-emerald-300" />
                      ) : (
                        <span className="rounded-full bg-secondary px-2 py-1 text-[10px] capitalize text-muted-foreground/65">
                          {scanSession.status}
                        </span>
                      )}
                    </div>

                    {scanSession.error ? (
                      <p className="rounded-xl bg-red-500/10 px-3 py-2 text-xs text-red-300">{scanSession.error}</p>
                    ) : null}

                    {scanDuplicate ? (
                      <p className="rounded-xl border border-amber-400/20 bg-amber-400/10 px-3 py-2 text-xs text-amber-200">
                        Possible duplicate: {scanDuplicate.name}. Confirm before creating a new profile.
                      </p>
                    ) : null}

                    {scanSession.missingFields.length > 0 ? (
                      <div className="rounded-xl border border-amber-400/15 bg-amber-400/[0.04] p-3">
                        <p className="text-[10px] font-semibold uppercase tracking-wider text-amber-300/80">Missing information</p>
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {scanSession.missingFields.map((field) => (
                            <span key={field} className="rounded-full bg-amber-400/10 px-2 py-1 text-[10px] text-amber-200">
                              {field}
                            </span>
                          ))}
                        </div>
                      </div>
                    ) : null}

                    {scanSession.documents.length > 0 ? (
                      <div className="space-y-2 rounded-xl border border-panel-border bg-panel-muted/50 p-3">
                        {scanSession.documents.map((doc) => (
                          <div key={doc.kind} className="rounded-lg bg-panel-muted p-2">
                            <div className="flex items-center justify-between gap-2">
                              <p className="text-xs font-medium text-foreground/75">{doc.detectedLabel}</p>
                              <span className="rounded bg-secondary px-1.5 py-0.5 text-[9px] text-muted-foreground">
                                {doc.kind === "id_document" ? "ID" : "Medical aid"}
                              </span>
                            </div>
                            <div className="mt-2 grid gap-1">
                              {Object.entries(doc.fields).slice(0, 5).map(([key, value]) => (
                                <div key={key} className="flex justify-between gap-3 text-[10px]">
                                  <span className="text-muted-foreground">{key}</span>
                                  <span className="text-right text-foreground/70">{value}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : null}

                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        disabled={scanBusy}
                        onClick={() => void cancelScanSession()}
                        className="rounded-lg px-3 py-2 text-xs text-muted-foreground hover:text-accent-foreground disabled:opacity-50"
                      >
                        Cancel session
                      </button>
                      <button
                        type="button"
                        disabled={!scanForm || scanSession.status !== "submitted"}
                        onClick={handleConfirmScan}
                        className="flex items-center gap-1.5 rounded-lg bg-status-success/10 px-4 py-2 text-xs font-medium text-status-success transition-colors hover:bg-status-success/20 disabled:cursor-not-allowed disabled:opacity-35"
                      >
                        <Check className="size-3.5" weight="bold" />
                        Confirm & Edit
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        {tab === "manual" && (
          <div className="flex justify-end gap-2 border-t border-panel-border px-6 py-4">
            <button type="button" onClick={onClose} className="rounded-lg px-4 py-2 text-xs text-muted-foreground hover:text-accent-foreground">
              Cancel
            </button>
            <button
              type="button"
              disabled={!canCreate}
              onClick={handleCreate}
              className="flex items-center gap-1.5 rounded-lg bg-secondary px-4 py-2 text-xs font-medium text-foreground transition-colors hover:bg-secondary disabled:opacity-30"
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
    medicalAidSchemeCode: p.medicalAidSchemeCode,
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
  const t = h * 60 + mi + add
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
  directoryPatients,
  claims,
  medicalSchemes,
  onClose,
  onUpdate,
  onSelectPatientInDirectory,
}: {
  patient: PracticePatient
  /** Full practice list — used to avoid duplicate registrations from family check. */
  directoryPatients: PracticePatient[]
  claims: PracticeClaim[]
  medicalSchemes: MedicalSchemeRow[]
  onClose: () => void
  onUpdate: (id: string, update: Partial<PracticePatient>) => void | Promise<void>
  onSelectPatientInDirectory: (patientId: string) => void
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
  const openPatientAddModalWithPrefill = useWorkspaceStore((s) => s.openPatientAddModalWithPrefill)

  const [activeTab, setActiveTab] = useState<PanelTab>("overview")
  const [editing, setEditing] = useState(false)
  const [saveBusy, setSaveBusy] = useState(false)
  const [schemeOpen, setSchemeOpen] = useState(false)
  const schemeEditRef = useRef<HTMLDivElement>(null)
  const [editForm, setEditForm] = useState({
    phone: patient.phone ?? "",
    email: patient.email ?? "",
    address: patient.address ?? "",
    allergies: (patient.allergies ?? []).join(", "),
    chronicConditions: (patient.chronicConditions ?? []).join(", "),
    medicalAidScheme: patient.medicalAidScheme ?? "",
    medicalAidSchemeCode: patient.medicalAidSchemeCode ?? "",
    memberNumber: patient.memberNumber ?? "",
    dependentCode: patient.dependentCode ?? "",
    mainMemberName: patient.mainMemberName ?? "",
    medicalAidPlan: patient.medicalAidPlan ?? "",
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
  const [famUpdateDialog, setFamUpdateDialog] = useState<{
    target: PracticePatient
    changes: FamCheckDirectoryChange[]
    patch: Partial<PracticePatient>
  } | null>(null)
  const [famUpdateBusy, setFamUpdateBusy] = useState(false)
  const [encounterList, setEncounterList] = useState<
    { id: string; status: string; updated_at: string; started_at: string; appointment_id: string | null }[]
  >([])
  const [encounterSummaryById, setEncounterSummaryById] = useState<
    Record<
      string,
      {
        chief_complaint: string | null
        summary_text: string
        key_findings: string[]
        follow_up: string | null
        created_at: string
      }
    >
  >({})
  const [expandedHistory, setExpandedHistory] = useState<Record<string, boolean>>({})
  const [historyLoading, setHistoryLoading] = useState(false)
  const attemptedSummaryBackfillRef = useRef<Set<string>>(new Set())
  const [encounterSummaryGenErrorById, setEncounterSummaryGenErrorById] = useState<Record<string, string>>({})
  const [summaryBackfillNonce, setSummaryBackfillNonce] = useState(0)
  const [retryingSummaryId, setRetryingSummaryId] = useState<string | null>(null)
  const allergiesEditValue = (patient.allergies ?? []).join(", ")
  const chronicEditValue = (patient.chronicConditions ?? []).join(", ")

  useEffect(() => {
    setEditForm({
      phone: patient.phone ?? "",
      email: patient.email ?? "",
      address: patient.address ?? "",
      allergies: allergiesEditValue,
      chronicConditions: chronicEditValue,
      medicalAidScheme: patient.medicalAidScheme ?? "",
      medicalAidSchemeCode: patient.medicalAidSchemeCode ?? "",
      memberNumber: patient.memberNumber ?? "",
      dependentCode: patient.dependentCode ?? "",
      mainMemberName: patient.mainMemberName ?? "",
      medicalAidPlan: patient.medicalAidPlan ?? "",
    })
  }, [
    allergiesEditValue,
    chronicEditValue,
    patient.address,
    patient.dependentCode,
    patient.email,
    patient.id,
    patient.mainMemberName,
    patient.medicalAidPlan,
    patient.medicalAidScheme,
    patient.medicalAidSchemeCode,
    patient.memberNumber,
    patient.phone,
  ])

  useEffect(() => {
    setEditing(false)
    setSchemeOpen(false)
    setQuickPanel(null)
    setEligibilityUi({ phase: "idle" })
    setFamilyUi({ phase: "idle" })
    setCheckInMessage(null)
    setAccreditation(null)
    setExpandedHistory({})
    setEncounterSummaryById({})
    attemptedSummaryBackfillRef.current.clear()
    setEncounterSummaryGenErrorById({})
    setSummaryBackfillNonce(0)
  }, [patient.id])

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (schemeEditRef.current && !schemeEditRef.current.contains(e.target as Node)) setSchemeOpen(false)
    }
    document.addEventListener("mousedown", handleClick)
    return () => document.removeEventListener("mousedown", handleClick)
  }, [])

  const schemeFilteredEdit = useMemo(() => {
    const q = editForm.medicalAidScheme.trim().toLowerCase()
    if (!q) return medicalSchemes.slice(0, 80)
    return medicalSchemes.filter((s) => {
      const name = s.name.toLowerCase()
      const code = s.code.toLowerCase()
      const adm = (s.administrator ?? "").toLowerCase()
      return name.includes(q) || code.includes(q) || adm.includes(q)
    })
  }, [editForm.medicalAidScheme, medicalSchemes])

  /** When catalog loads, attach option code if scheme label matches a row (same as registration). */
  useEffect(() => {
    setEditForm((f) => {
      if (!f.medicalAidScheme.trim() || !medicalSchemes.length) return f
      if (f.medicalAidSchemeCode.trim()) return f
      const m = medicalSchemes.find((s) => s.name.toLowerCase() === f.medicalAidScheme.trim().toLowerCase())
      if (!m?.code) return f
      return { ...f, medicalAidSchemeCode: m.code }
    })
  }, [medicalSchemes])

  useEffect(() => {
    if (mkError) toast.error(mkError)
  }, [mkError])

  const loadEncounterHistory = useCallback(async () => {
    if (!practiceId || !patient.id) return
    const supabase = createClient()
    if (!supabase) return
    const [{ data: encounters, error: encounterErr }, { data: summaries, error: summaryErr }] = await Promise.all([
      supabase
        .from("clinical_encounters")
        .select("id, status, updated_at, started_at, appointment_id")
        .eq("practice_id", practiceId)
        .eq("patient_id", patient.id)
        .order("updated_at", { ascending: false }),
      supabase
        .from("practice_encounter_summaries")
        .select("encounter_id, chief_complaint, summary_text, key_findings, follow_up, created_at")
        .eq("practice_id", practiceId)
        .eq("patient_id", patient.id)
        .order("created_at", { ascending: false })
        .limit(100),
    ])

    if (encounterErr) {
      setEncounterList([])
    } else {
      setEncounterList(
        ((encounters ?? []) as {
          id: string
          status: string
          updated_at: string
          started_at: string
          appointment_id: string | null
        }[]).map((row) => ({
          id: row.id,
          status: row.status,
          updated_at: row.updated_at,
          started_at: row.started_at,
          appointment_id: row.appointment_id,
        }))
      )
    }

    if (summaryErr) {
      setEncounterSummaryById({})
    } else {
      const next: Record<
        string,
        {
          chief_complaint: string | null
          summary_text: string
          key_findings: string[]
          follow_up: string | null
          created_at: string
        }
      > = {}
      for (const row of ((summaries ?? []) as unknown as {
        encounter_id: string
        chief_complaint: string | null
        summary_text: string
        key_findings: unknown
        follow_up: string | null
        created_at: string
      }[])) {
        next[row.encounter_id] = {
          chief_complaint: row.chief_complaint,
          summary_text: row.summary_text,
          key_findings: Array.isArray(row.key_findings)
            ? row.key_findings.map((item) => String(item ?? "").trim()).filter(Boolean)
            : [],
          follow_up: row.follow_up,
          created_at: row.created_at,
        }
      }
      setEncounterSummaryById(next)
    }
  }, [patient.id, practiceId])

  const generateEncounterSummaryForPatient = useCallback(
    async (encounterId: string): Promise<{ ok: true } | { ok: false; message: string }> => {
      if (!practiceId || !patient.id || !dekKey || !unlocked) {
        return { ok: false, message: "Unlock the clinical workspace to generate visit summaries." }
      }
      const supabase = createClient()
      if (!supabase) return { ok: false, message: "Unable to reach the database." }

      const { data, error } = await supabase
        .from("clinical_encounters")
        .select("id, appointment_id, state_ciphertext, state_iv")
        .eq("practice_id", practiceId)
        .eq("patient_id", patient.id)
        .eq("id", encounterId)
        .maybeSingle()

      if (error || !data?.state_ciphertext || !data?.state_iv) {
        return { ok: false, message: error?.message ?? "Could not load encrypted encounter." }
      }

      try {
        const plain = await decryptJson<EncounterStatePlain>(
          dekKey,
          String(data.state_ciphertext),
          String(data.state_iv)
        )
        if (!plain || plain.v !== 1) {
          return { ok: false, message: "Encounter file is not in a supported format." }
        }
        const sourceText = buildEncounterSummarySourceText(plain).trim()
        if (!sourceText) {
          return { ok: false, message: "Nothing in this visit to summarize (empty chart)." }
        }
        const res = await fetchClient("/api/clinical/encounter-summary", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            encounterId,
            patientId: patient.id,
            appointmentId: data.appointment_id ?? undefined,
            sourceText,
          }),
        })
        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as { error?: string }
          return { ok: false, message: body.error ?? `${res.status} ${res.statusText}` }
        }
        return { ok: true }
      } catch (e) {
        return { ok: false, message: e instanceof Error ? e.message : "Unexpected error" }
      }
    },
    [dekKey, patient.id, practiceId, unlocked]
  )

  const retryEncounterSummary = useCallback(
    async (encounterId: string) => {
      setRetryingSummaryId(encounterId)
      attemptedSummaryBackfillRef.current.delete(encounterId)
      setEncounterSummaryGenErrorById((prev) => {
        const next = { ...prev }
        delete next[encounterId]
        return next
      })
      const result = await generateEncounterSummaryForPatient(encounterId)
      if (!result.ok) {
        setEncounterSummaryGenErrorById((prev) => ({ ...prev, [encounterId]: result.message }))
        toast.error("Could not generate visit summary", { description: result.message })
      } else {
        attemptedSummaryBackfillRef.current.add(encounterId)
        window.dispatchEvent(
          new CustomEvent("fleming:patient-overview-reload", { detail: { patientId: patient.id } })
        )
        await loadEncounterHistory()
        toast.success("Visit summary saved")
      }
      setRetryingSummaryId(null)
    },
    [generateEncounterSummaryForPatient, loadEncounterHistory, patient.id]
  )

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setHistoryLoading(true)
      try {
        await loadEncounterHistory()
      } finally {
        if (!cancelled) setHistoryLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [loadEncounterHistory])

  useEffect(() => {
    if (!practiceId || !patient.id || !dekKey || !unlocked) return
    const missingSigned = encounterList.filter(
      (enc) =>
        (enc.status === "signed" || enc.status === "completed") &&
        !encounterSummaryById[enc.id] &&
        !attemptedSummaryBackfillRef.current.has(enc.id)
    )
    if (missingSigned.length === 0) return

    let cancelled = false
    ;(async () => {
      for (const enc of missingSigned.slice(0, 6)) {
        attemptedSummaryBackfillRef.current.add(enc.id)
        const result = await generateEncounterSummaryForPatient(enc.id)
        if (cancelled) return
        if (!result.ok) {
          setEncounterSummaryGenErrorById((prev) => ({ ...prev, [enc.id]: result.message }))
          continue
        }
        setEncounterSummaryGenErrorById((prev) => {
          const next = { ...prev }
          delete next[enc.id]
          return next
        })
        window.dispatchEvent(
          new CustomEvent("fleming:patient-overview-reload", { detail: { patientId: patient.id } })
        )
      }
      if (!cancelled) {
        await loadEncounterHistory()
      }
    })()

    return () => {
      cancelled = true
    }
  }, [
    dekKey,
    encounterList,
    encounterSummaryById,
    generateEncounterSummaryForPatient,
    loadEncounterHistory,
    patient.id,
    practiceId,
    summaryBackfillNonce,
    unlocked,
  ])

  const runEligibilityCheck = useCallback(async () => {
    setQuickPanel("eligibility")
    setEligibilityUi({ phase: "checking" })
    const payload = patientToMedikreditPayload(patient)
    const api = await runEligibility(payload, true)
    if (api) {
      setEligibilityUi({ phase: "result", api })
      const patch: Partial<PracticePatient> = {}
      if (api.planDescription?.trim()) patch.medicalAidPlan = api.planDescription.trim()
      if (api.status === "eligible" && api.ok) patch.medicalAidStatus = "verified"
      if (Object.keys(patch).length > 0) await onUpdate(patient.id, patch)
    } else {
      setEligibilityUi({ phase: "idle" })
    }
  }, [patient, runEligibility, onUpdate])

  const setEdit = useCallback(<K extends keyof typeof editForm>(key: K, value: (typeof editForm)[K]) => {
    setEditForm((f) => ({ ...f, [key]: value }))
  }, [])

  const runFamilyCheck = useCallback(async () => {
    setQuickPanel("family")
    setFamilyUi({ phase: "checking" })
    const payload = patientToMedikreditPayload(patient)
    const api = await runFamily(payload, undefined, true)
    if (api) {
      setFamilyUi({ phase: "result", api })
      const norm = (s: string | undefined) => (s ?? "").replace(/\D/g, "")
      const plan =
        api.dependents.find((d) => norm(d.id_nbr) && norm(d.id_nbr) === norm(patient.idNumber))?.planDescription ??
        api.dependents.find(
          (d) =>
            (d.dep_cd ?? "").replace(/^0+/, "") === (patient.dependentCode ?? "").replace(/^0+/, "") &&
            (d.dep_cd ?? "") !== ""
        )?.planDescription ??
        api.dependents[0]?.planDescription
      const patch: Partial<PracticePatient> = {}
      if (plan?.trim()) patch.medicalAidPlan = plan.trim()
      if (api.status === "eligible" && api.ok) patch.medicalAidStatus = "verified"
      if (Object.keys(patch).length > 0) await onUpdate(patient.id, patch)
    } else {
      setFamilyUi({ phase: "idle" })
    }
  }, [patient, runFamily, onUpdate])

  /** Opens the strip without toggling closed; runs a new check only from idle (use Re-check after a result). */
  const handleEligibilityButtonClick = useCallback(() => {
    setQuickPanel("eligibility")
    if (eligibilityUi.phase === "idle") void runEligibilityCheck()
  }, [eligibilityUi.phase, runEligibilityCheck])

  const handleFamilyButtonClick = useCallback(() => {
    setQuickPanel("family")
    if (familyUi.phase === "idle") void runFamilyCheck()
  }, [familyUi.phase, runFamilyCheck])

  const openFamCheckUpdateReview = useCallback(
    (row: FamilyDependentRow, resolved: ReturnType<typeof resolveFamilyRowInPractice>) => {
      if (resolved.state === "new") return
      const target = resolved.state === "self" ? patient : resolved.existing
      const { patch, changes } = buildFamCheckDirectoryUpdateProposal(row, patient, target)
      if (changes.length === 0) {
        toast.message("No updates to apply from FamCheck for this patient")
        return
      }
      setFamUpdateDialog({ target, changes, patch })
    },
    [patient]
  )

  const applyFamCheckUpdate = useCallback(async () => {
    if (!famUpdateDialog) return
    setFamUpdateBusy(true)
    try {
      await onUpdate(famUpdateDialog.target.id, famUpdateDialog.patch)
      toast.success("Patient record updated from FamCheck")
      setFamUpdateDialog(null)
    } finally {
      setFamUpdateBusy(false)
    }
  }, [famUpdateDialog, onUpdate])

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
            appointmentId: existing.id,
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
          appointmentId: id,
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

  const handleSaveEdit = useCallback(async () => {
    setSaveBusy(true)
    try {
      await onUpdate(patient.id, {
        phone: editForm.phone.trim() || undefined,
        email: editForm.email.trim() || undefined,
        address: editForm.address.trim() || undefined,
        allergies: editForm.allergies.split(",").map((s) => s.trim()).filter(Boolean),
        chronicConditions: editForm.chronicConditions.split(",").map((s) => s.trim()).filter(Boolean),
        medicalAidScheme: editForm.medicalAidScheme.trim() || undefined,
        medicalAidSchemeCode: editForm.medicalAidSchemeCode.trim() || undefined,
        memberNumber: editForm.memberNumber.trim() || undefined,
        dependentCode: editForm.dependentCode.trim() || undefined,
        mainMemberName: editForm.mainMemberName.trim() || undefined,
        medicalAidPlan: editForm.medicalAidPlan.trim() || undefined,
      })
      toast.success("Patient saved")
      setEditing(false)
    } finally {
      setSaveBusy(false)
    }
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
      className="fixed right-0 top-0 z-40 flex h-full w-full min-w-0 flex-col border-l border-panel-border bg-panel shadow-2xl sm:w-[min(90vw,760px)]"
    >
      {/* Panel Header */}
      <div className="flex items-center justify-between border-b border-panel-border px-6 py-4">
        <div className="flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-full bg-secondary text-sm font-bold text-muted-foreground">
            {patient.name.split(" ").map((n) => n[0]).join("")}
          </div>
          <div>
            <h3 className="text-sm font-semibold">{patient.name}</h3>
            <p className="text-[10px] text-muted-foreground">
              {patient.idNumber ?? "No ID"} · {patient.age ? `${patient.age}y` : "Age unknown"} · {patient.sex ?? "—"}
            </p>
          </div>
        </div>
        <button type="button" onClick={onClose} aria-label="Close patient hub" className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-secondary hover:text-accent-foreground">
          <X className="size-4" />
        </button>
      </div>

      {/* Quick actions — eligibility, family, check-in, inbox */}
      <div className="border-b border-panel-border px-6 py-3">
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={handleEligibilityButtonClick}
            disabled={mkLoading && quickPanel === "eligibility"}
            className={cn(
              "inline-flex flex-1 min-w-[100px] items-center justify-center gap-1.5 rounded-lg border px-2.5 py-2 text-[11px] font-medium transition-all",
              quickPanel === "eligibility"
                ? "border-panel-border bg-secondary text-foreground shadow-sm"
                : "border-panel-border bg-panel-muted text-foreground/70 hover:border-ring hover:bg-secondary hover:text-accent-foreground"
            )}
          >
            <ShieldCheck className="size-3.5 text-emerald-400/90" weight="bold" />
            Eligibility
          </button>
          <button
            type="button"
            onClick={handleFamilyButtonClick}
            disabled={mkLoading && quickPanel === "family"}
            className={cn(
              "inline-flex flex-1 min-w-[100px] items-center justify-center gap-1.5 rounded-lg border px-2.5 py-2 text-[11px] font-medium transition-all",
              quickPanel === "family"
                ? "border-panel-border bg-secondary text-foreground shadow-sm"
                : "border-panel-border bg-panel-muted text-foreground/70 hover:border-ring hover:bg-secondary hover:text-accent-foreground"
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
              "border-status-success/35 bg-status-success/12 text-status-success hover:bg-status-success/18 disabled:opacity-50"
            )}
          >
            {checkInBusy ? <SpinnerGap className="size-3.5 animate-spin" /> : <CalendarCheck className="size-3.5" weight="bold" />}
            Quick check-in
          </button>
          <button
            type="button"
            onClick={() => setAdminTab("front_desk")}
            className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-panel-border bg-panel-muted px-2.5 py-2 text-[11px] font-medium text-foreground/70 transition-all hover:border-ring hover:bg-secondary hover:text-accent-foreground"
            title="Open Front Desk"
          >
            <ChatCircle className="size-3.5 text-muted-foreground/70" weight="bold" />
            Front Desk
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
              <div className="mt-3 overflow-hidden rounded-2xl border border-panel-border bg-gradient-to-b from-white/[0.05] to-transparent shadow-[0_12px_40px_-12px_rgba(0,0,0,0.8)]">
                <div className="flex items-center justify-end border-b border-panel-border px-2 py-1">
                  <button
                    type="button"
                    onClick={() => setQuickPanel(null)}
                    className="rounded px-2 py-0.5 text-[10px] font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-accent-foreground/75"
                  >
                    Collapse
                  </button>
                </div>
                {eligibilityUi.phase === "idle" && (
                  <div className="px-4 py-3 text-[11px] text-muted-foreground/65">
                    Tap <span className="text-foreground/70">Eligibility</span> to run the check again.
                  </div>
                )}
                {eligibilityUi.phase === "checking" && (
                  <div className="flex items-center gap-3 px-4 py-4">
                    <div className="flex size-10 items-center justify-center rounded-xl bg-emerald-500/15">
                      <SpinnerGap className="size-5 animate-spin text-emerald-400" />
                    </div>
                    <div>
                      <p className="text-[11px] font-medium text-foreground/85">Checking eligibility</p>
                      <p className="text-[10px] text-muted-foreground">tx_cd 20 · {patient.name}</p>
                    </div>
                  </div>
                )}
                {eligibilityUi.phase === "result" && elig && (
                  <div className="p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <div
                          className={cn(
                            "flex size-11 shrink-0 items-center justify-center rounded-2xl border",
                            elig.ok && elig.status === "eligible"
                              ? "border-emerald-500/35 bg-emerald-500/15"
                              : "border-rose-500/30 bg-rose-500/10"
                          )}
                        >
                          {elig.ok && elig.status === "eligible" ? (
                            <CheckCircle className="size-6 text-emerald-400" weight="fill" />
                          ) : (
                            <XCircle className="size-6 text-rose-400" weight="fill" />
                          )}
                        </div>
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <span
                              className={cn(
                                "text-sm font-semibold tracking-tight",
                                elig.ok && elig.status === "eligible" ? "text-emerald-300" : "text-rose-200"
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
                            {(elig.res ?? elig.responseCode) ? (
                              <span className="rounded-full border border-panel-border bg-secondary px-2 py-0.5 font-mono text-[10px] text-foreground/70">
                                res={elig.res ?? elig.responseCode}
                              </span>
                            ) : null}
                          </div>
                          <p className="mt-0.5 text-[10px] text-muted-foreground">MediKredit switch · single-member check</p>
                        </div>
                      </div>
                      <Sparkle className="size-4 shrink-0 text-emerald-400/40" weight="fill" />
                    </div>

                    {elig.planDescription ? (
                      <div className="mt-4 rounded-xl border border-emerald-500/20 bg-emerald-500/[0.07] px-3 py-2.5">
                        <p className="text-[9px] font-semibold uppercase tracking-wider text-emerald-200/60">Plan (PLAN pln_descr)</p>
                        <p className="mt-0.5 text-sm font-medium text-emerald-100">{elig.planDescription}</p>
                      </div>
                    ) : null}

                    <div className="mt-4 grid grid-cols-2 gap-3 text-[11px]">
                      {elig.txNbr ? (
                        <div className="rounded-lg border border-panel-border bg-panel-muted px-2.5 py-2">
                          <span className="text-[9px] uppercase tracking-wide text-muted-foreground">Transaction</span>
                          <p className="mt-0.5 font-mono text-[10px] text-foreground/80">{elig.txNbr}</p>
                        </div>
                      ) : null}
                      {patient.medicalAidScheme ? (
                        <div className="rounded-lg border border-panel-border bg-panel-muted px-2.5 py-2">
                          <span className="text-[9px] uppercase tracking-wide text-muted-foreground">Scheme</span>
                          <p className="mt-0.5 text-foreground/80">{patient.medicalAidScheme}</p>
                        </div>
                      ) : null}
                      {patient.memberNumber ? (
                        <div className="rounded-lg border border-panel-border bg-panel-muted px-2.5 py-2">
                          <span className="text-[9px] uppercase tracking-wide text-muted-foreground">Member #</span>
                          <p className="mt-0.5 tabular-nums text-foreground/80">{patient.memberNumber}</p>
                        </div>
                      ) : null}
                      <div className="col-span-2 rounded-lg border border-panel-border bg-panel-muted px-2.5 py-2">
                        <span className="text-[9px] uppercase tracking-wide text-muted-foreground">HNet / Jiffy (AUTHS hnet)</span>
                        <p
                          className={cn(
                            "mt-0.5 break-all font-mono text-[11px]",
                            elig.healthNetworkId ? "text-emerald-300/95" : "text-muted-foreground"
                          )}
                        >
                          {elig.healthNetworkId ?? "—"}
                        </p>
                      </div>
                      {elig.authNumber ? (
                        <div className="rounded-lg border border-panel-border bg-panel-muted px-2.5 py-2">
                          <span className="text-[9px] uppercase tracking-wide text-muted-foreground">Auth #</span>
                          <p className="mt-0.5 tabular-nums text-foreground/80">{elig.authNumber}</p>
                        </div>
                      ) : null}
                    </div>

                    {elig.status !== "eligible" && (elig.rejectionDescription || elig.responseMessage) && (
                      <p className="mt-3 rounded-lg border border-rose-500/25 bg-rose-500/10 px-3 py-2 text-[11px] text-rose-200/95">
                        {elig.rejectionDescription ?? elig.responseMessage}
                      </p>
                    )}
                    {elig.rawXml && (
                      <details className="mt-3 rounded-xl border border-panel-border bg-panel-muted px-3 py-2">
                        <summary className="cursor-pointer text-[10px] font-medium text-muted-foreground/65">Decoded switch reply</summary>
                        <pre
                          className={cn(
                            "mt-2 max-h-28 overflow-auto whitespace-pre-wrap font-mono text-[9px] leading-relaxed",
                            elig.status === "eligible" ? "text-emerald-200/55" : "text-rose-200/50"
                          )}
                        >
                          {elig.rawXml}
                        </pre>
                      </details>
                    )}
                    {elig.responseRaw && (
                      <details className="mt-2 rounded-xl border border-panel-border bg-panel-muted px-3 py-2">
                        <summary className="cursor-pointer text-[10px] font-medium text-muted-foreground/65">Full wire response</summary>
                        <pre className="mt-2 max-h-36 overflow-auto whitespace-pre-wrap font-mono text-[9px] text-muted-foreground">
                          {elig.responseRaw}
                        </pre>
                      </details>
                    )}
                    {elig.remittanceMessages.length > 0 && (
                      <ul className="mt-3 space-y-1 text-[10px] text-amber-200/75">
                        {elig.remittanceMessages.slice(0, 4).map((r, i) => (
                          <li key={i} className="rounded-md bg-amber-500/10 px-2 py-1">
                            <span className="font-mono">{r.code}</span> — {r.description}
                          </li>
                        ))}
                      </ul>
                    )}
                    <div className="mt-4 flex flex-wrap gap-2 border-t border-panel-border pt-3">
                      <button
                        type="button"
                        onClick={() => void runEligibilityCheck()}
                        className="rounded-lg border border-panel-border bg-secondary px-3 py-1.5 text-[10px] font-medium text-foreground/75 transition-colors hover:bg-secondary"
                      >
                        Re-check
                      </button>
                      {elig.rawXml && (
                        <button
                          type="button"
                          onClick={() => setAccreditation("eligibility")}
                          className="rounded-lg border border-sky-500/25 bg-sky-500/10 px-3 py-1.5 text-[10px] font-medium text-sky-300 transition-colors hover:bg-sky-500/15"
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
              <div className="mt-3 rounded-xl border border-panel-border bg-panel-muted/50">
                <div className="flex items-center justify-end border-b border-panel-border px-2 py-1">
                  <button
                    type="button"
                    onClick={() => setQuickPanel(null)}
                    className="rounded px-2 py-0.5 text-[10px] font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-accent-foreground/75"
                  >
                    Collapse
                  </button>
                </div>
                {familyUi.phase === "idle" && (
                  <div className="px-4 py-3 text-[11px] text-muted-foreground/65">
                    Tap <span className="text-foreground/70">Family</span> to run the check again.
                  </div>
                )}
                {familyUi.phase === "checking" && (
                  <div className="flex items-center gap-3 px-4 py-3.5">
                    <SpinnerGap className="size-4 shrink-0 animate-spin text-sky-400/90" />
                    <p className="text-[11px] text-muted-foreground/75">Checking household on scheme…</p>
                  </div>
                )}
                {familyUi.phase === "result" && fam && (
                  <div className="p-4">
                    <div className="flex flex-wrap items-end justify-between gap-3">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <UsersThree className="size-4 text-sky-400/90" weight="bold" />
                          <span className="text-[13px] font-semibold tracking-tight text-foreground/90">Household</span>
                          {(fam.res ?? fam.responseCode) ? (
                            <span className="rounded-md bg-secondary px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground/80">
                              {fam.res ?? fam.responseCode}
                            </span>
                          ) : null}
                        </div>
                        <p className="mt-0.5 text-[10px] text-muted-foreground">
                          {fam.memberDependentCount != null
                            ? `${fam.memberDependentCount} on file`
                            : `${fam.dependents.length} member${fam.dependents.length === 1 ? "" : "s"}`}
                          {fam.txNbr ? ` · ${fam.txNbr}` : ""}
                        </p>
                      </div>
                    </div>

                    <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 border-b border-panel-border pb-3 text-[10px]">
                      <div>
                        <span className="text-muted-foreground">HNet </span>
                        <span
                          className={cn(
                            "font-mono tabular-nums",
                            fam.healthNetworkId ? "text-emerald-400/90" : "text-muted-foreground"
                          )}
                        >
                          {fam.healthNetworkId ?? "—"}
                        </span>
                      </div>
                      {fam.memberChId ? (
                        <div>
                          <span className="text-muted-foreground">ch_id </span>
                          <span className="font-mono text-muted-foreground/75">{fam.memberChId}</span>
                        </div>
                      ) : null}
                    </div>

                    {fam.dependents.length > 0 && (
                      <div className="mt-3">
                        <div className="mb-2 flex items-center justify-between gap-2">
                          <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Dependants</span>
                          <button
                            type="button"
                            onClick={() => {
                              const famCtx = {
                                scheme: patient.medicalAidScheme,
                                schemeCode: patient.medicalAidSchemeCode,
                                memberNumber: patient.memberNumber,
                                mainMemberName: patient.mainMemberName ?? patient.name,
                              }
                              const toAdd = fam.dependents.filter(
                                (row) => resolveFamilyRowInPractice(row, patient, directoryPatients).state === "new"
                              )
                              if (toAdd.length === 0) {
                                toast.message("Everyone on this list is already in the practice")
                                return
                              }
                              for (const row of toAdd) {
                                openPatientAddModalWithPrefill(medikreditFamilyRowToPrefill(row, famCtx))
                              }
                              toast.success(`Opened ${toAdd.length} registration form(s)`)
                            }}
                            className="text-[10px] font-medium text-sky-400/90 transition-colors hover:text-sky-300"
                          >
                            Add missing only
                          </button>
                        </div>
                        <ul className="divide-y divide-white/[0.05] rounded-lg border border-panel-border bg-panel-muted">
                          {fam.dependents.map((d, i) => {
                            const label = (d.name ?? `${d.firstNames ?? ""} ${d.surname ?? ""}`.trim() ?? "Member").trim()
                            const initials = label
                              .split(/\s+/)
                              .map((w) => w[0])
                              .join("")
                              .slice(0, 2)
                              .toUpperCase()
                            const resolved = resolveFamilyRowInPractice(d, patient, directoryPatients)
                            const dobDisplay =
                              d.dateOfBirthIso ??
                              (d.dobYmd ? formatMedikreditYmd(d.dobYmd) ?? d.dobYmd : null)
                            const joinDisplay = d.planJoinDateYmd ? formatMedikreditYmd(d.planJoinDateYmd) : null
                            return (
                              <li key={`${d.dep_cd ?? i}-${d.id_nbr ?? i}`} className="flex gap-3 px-3 py-2.5">
                                <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-secondary text-[10px] font-semibold text-foreground/70">
                                  {initials || "?"}
                                </div>
                                <div className="min-w-0 flex-1">
                                  <div className="flex items-start justify-between gap-2">
                                    <p className="truncate text-[12px] font-medium text-foreground/90">{label}</p>
                                    {resolved.state === "self" ? (
                                      <div className="flex shrink-0 flex-wrap items-center justify-end gap-1">
                                        <span className="inline-flex shrink-0 items-center gap-1 rounded-md bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-300/90">
                                          <CheckCircle className="size-3" weight="bold" />
                                          This patient
                                        </span>
                                        <button
                                          type="button"
                                          onClick={() => openFamCheckUpdateReview(d, resolved)}
                                          className="rounded-md border border-sky-500/30 bg-sky-500/10 px-2 py-0.5 text-[10px] font-medium text-sky-300 transition-colors hover:bg-sky-500/15"
                                        >
                                          Update
                                        </button>
                                      </div>
                                    ) : resolved.state === "duplicate" ? (
                                      <div className="flex shrink-0 flex-wrap items-center justify-end gap-1">
                                        <button
                                          type="button"
                                          onClick={() => openFamCheckUpdateReview(d, resolved)}
                                          className="rounded-md border border-sky-500/30 bg-sky-500/10 px-2 py-0.5 text-[10px] font-medium text-sky-300 transition-colors hover:bg-sky-500/15"
                                        >
                                          Update
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => onSelectPatientInDirectory(resolved.existing.id)}
                                          className="rounded-md border border-panel-border bg-panel-muted px-2 py-0.5 text-[10px] font-medium text-foreground/75 transition-colors hover:bg-secondary"
                                        >
                                          Open
                                        </button>
                                      </div>
                                    ) : (
                                      <button
                                        type="button"
                                        onClick={() => {
                                          openPatientAddModalWithPrefill(
                                            medikreditFamilyRowToPrefill(d, {
                                              scheme: patient.medicalAidScheme,
                                              schemeCode: patient.medicalAidSchemeCode,
                                              memberNumber: patient.memberNumber,
                                              mainMemberName: patient.mainMemberName ?? patient.name,
                                            })
                                          )
                                          toast.success("Registration form opened — review and save")
                                        }}
                                        className="shrink-0 text-[10px] font-medium text-sky-400/90 transition-colors hover:text-sky-300"
                                      >
                                        Add
                                      </button>
                                    )}
                                  </div>
                                  <p className="mt-0.5 text-[10px] text-muted-foreground">
                                    Dep {d.dep_cd ?? "—"}
                                    {d.id_nbr ? <span className="ml-2 font-mono tabular-nums">{d.id_nbr}</span> : null}
                                    {dobDisplay ? <span className="ml-2">{dobDisplay}</span> : null}
                                    {d.gender ? (
                                      <span className="ml-2">{d.gender === "1" ? "M" : d.gender === "2" ? "F" : ""}</span>
                                    ) : null}
                                  </p>
                                  {resolved.state === "duplicate" ? (
                                    <p className="mt-1 text-[10px] text-muted-foreground">
                                      Matches <span className="text-muted-foreground/75">{resolved.existing.name}</span> in directory
                                    </p>
                                  ) : null}
                                  {d.planDescription ? (
                                    <p className="mt-1.5 text-[10px] text-emerald-200/75">
                                      <span className="text-muted-foreground">Plan </span>
                                      {d.planDescription}
                                      {joinDisplay ? (
                                        <span className="text-muted-foreground"> · joined {joinDisplay}</span>
                                      ) : null}
                                    </p>
                                  ) : null}
                                </div>
                              </li>
                            )
                          })}
                        </ul>
                      </div>
                    )}

                    <div className="mt-4 flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => void runFamilyCheck()}
                        className="rounded-lg border border-panel-border bg-panel-muted px-3 py-1.5 text-[10px] font-medium text-foreground/70 transition-colors hover:bg-secondary"
                      >
                        Re-run
                      </button>
                      {fam.rawXml && (
                        <button
                          type="button"
                          onClick={() => setAccreditation("family")}
                          className="rounded-lg border border-panel-border px-3 py-1.5 text-[10px] font-medium text-muted-foreground/65 transition-colors hover:text-accent-foreground/65"
                        >
                          Accreditation
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
          <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground/65">{checkInMessage}</p>
        )}
      </div>

      {/* Tab Bar */}
      <div className="flex overflow-x-auto border-b border-panel-border px-3 sm:px-6" role="tablist" aria-label="Patient hub sections">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={activeTab === t.id}
            onClick={() => setActiveTab(t.id)}
            className={cn(
              "flex items-center gap-1.5 border-b-2 px-3 py-2.5 text-xs font-medium transition-colors",
              activeTab === t.id
                ? "border-white/60 text-foreground"
                : "border-transparent text-muted-foreground hover:text-accent-foreground/60"
            )}
          >
            {t.icon}
            {t.label}
          </button>
        ))}
      </div>

      {/* Panel Content */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-6" style={{ scrollbarWidth: "thin" }}>
        {activeTab === "overview" && (
          <div className="space-y-5">
            <PatientChartSummary
              patient={patient}
              showActions={false}
              onOpenBilling={() => setAdminTab("billing")}
              onOpenCalendar={() => setAdminTab("calendar")}
            />

            <div className="border-t border-panel-border pt-5" />

            {/* Demographics */}
            <div className="flex items-center justify-between">
              <SectionLabel>Demographics</SectionLabel>
              <button
                type="button"
                disabled={saveBusy}
                onClick={() => (editing ? void handleSaveEdit() : setEditing(true))}
                className="flex items-center gap-1 text-[10px] text-muted-foreground transition-colors hover:text-accent-foreground disabled:opacity-40"
              >
                {saveBusy ? (
                  <SpinnerGap className="size-3 animate-spin" weight="bold" />
                ) : editing ? (
                  <Check className="size-3" weight="bold" />
                ) : (
                  <PencilSimple className="size-3" />
                )}
                {saveBusy ? "Saving…" : editing ? "Save" : "Edit"}
              </button>
            </div>

            <div className="space-y-2 rounded-xl border border-panel-border bg-panel-muted/50 p-4">
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
            <div className="space-y-2 rounded-xl border border-panel-border bg-panel-muted/50 p-4">
              <div className="flex items-center gap-2">
                <span className={cn("size-2 rounded-full", status.dot)} />
                <span className={cn("text-xs font-medium", status.text)}>{status.label}</span>
              </div>
              {editing ? (
                <>
                  <div ref={schemeEditRef} className="relative">
                    <FieldLabel>Scheme (search catalog)</FieldLabel>
                    <input
                      type="text"
                      value={editForm.medicalAidScheme}
                      onChange={(e) => {
                        setEdit("medicalAidScheme", e.target.value)
                        setEdit("medicalAidSchemeCode", "")
                        setSchemeOpen(true)
                      }}
                      onFocus={() => setSchemeOpen(true)}
                      placeholder="Name or option code…"
                      className="w-full rounded-lg border border-panel-border bg-panel-muted/50 px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground/50 focus:border-ring focus:outline-none"
                    />
                    {schemeOpen && schemeFilteredEdit.length > 0 && (
                      <div className="absolute left-0 top-full z-20 mt-1 max-h-48 w-full overflow-y-auto rounded-lg border border-panel-border bg-popover py-1 shadow-xl">
                        {schemeFilteredEdit.map((s) => (
                          <button
                            key={`${s.code}|${s.name}`}
                            type="button"
                            onClick={() => {
                              setEdit("medicalAidScheme", s.name)
                              setEdit("medicalAidSchemeCode", s.code)
                              setSchemeOpen(false)
                            }}
                            className="flex w-full flex-col gap-0.5 px-3 py-2 text-left transition-colors hover:bg-secondary"
                          >
                            <div className="flex items-baseline gap-2">
                              {s.code ? (
                                <span className="shrink-0 font-mono text-[10px] font-medium tabular-nums text-status-success/90">
                                  {s.code}
                                </span>
                              ) : null}
                              <span className="text-xs text-foreground/80">{s.name}</span>
                            </div>
                            {s.administrator ? (
                              <span className="text-[10px] text-muted-foreground">{s.administrator}</span>
                            ) : null}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  {editForm.medicalAidSchemeCode ? (
                    <p className="text-[10px] text-status-success/80">
                      Option code (TX plan): <span className="font-mono tabular-nums">{editForm.medicalAidSchemeCode}</span>
                    </p>
                  ) : (
                    <p className="text-[10px] text-amber-400/70">Pick a catalog row to store the 6-digit option code for MediKredit.</p>
                  )}
                  <div className="grid grid-cols-2 gap-2">
                    <EditableRow label="Member #" value={editForm.memberNumber} onChange={(v) => setEdit("memberNumber", v)} />
                    <EditableRow label="Dependent code" value={editForm.dependentCode} onChange={(v) => setEdit("dependentCode", v)} />
                  </div>
                  <EditableRow label="Main member name" value={editForm.mainMemberName} onChange={(v) => setEdit("mainMemberName", v)} />
                  <div>
                    <EditableRow
                      label="Benefit plan (switch)"
                      value={editForm.medicalAidPlan}
                      onChange={(v) => setEdit("medicalAidPlan", v)}
                    />
                    <p className="mt-1 text-[9px] text-muted-foreground">
                      Populated from MediKredit eligibility or family check (PLAN pln_descr). You can clear or edit if needed.
                    </p>
                  </div>
                </>
              ) : (
                <>
                  <InfoRow
                    label="Scheme"
                    value={
                      patient.medicalAidScheme
                        ? `${patient.medicalAidScheme}${patient.medicalAidSchemeCode ? ` · ${patient.medicalAidSchemeCode}` : ""}`
                        : "—"
                    }
                  />
                  <InfoRow label="Member #" value={patient.memberNumber ?? "—"} />
                  <InfoRow label="Dependent" value={patient.dependentCode ?? "—"} />
                  <InfoRow label="Main Member" value={patient.mainMemberName ?? "—"} />
                  <div>
                    <InfoRow label="Benefit plan (switch)" value={patient.medicalAidPlan?.trim() ? patient.medicalAidPlan : "—"} />
                    {!patient.medicalAidPlan?.trim() ? (
                      <p className="mt-1 text-[9px] text-muted-foreground">Run eligibility or family check to pull plan from the switch.</p>
                    ) : null}
                  </div>
                </>
              )}
            </div>

            {/* Allergies & Chronic */}
            <SectionLabel>Clinical</SectionLabel>
            <div className="space-y-2 rounded-xl border border-panel-border bg-panel-muted/50 p-4">
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
              <p className="py-4 text-center text-xs text-muted-foreground">Loading sessions…</p>
            )}
            {!historyLoading &&
              encounterList.map((enc) => (
                <div
                  key={enc.id}
                  className="rounded-xl border border-panel-border bg-panel-muted/50 p-4 transition-colors hover:border-ring hover:bg-panel-muted"
                >
                  <button
                    type="button"
                    onClick={() => setExpandedHistory((current) => ({ ...current, [enc.id]: !current[enc.id] }))}
                    className="w-full text-left"
                  >
                    <div className="mb-1 flex items-center justify-between gap-3">
                      <div className="flex min-w-0 items-center gap-2">
                        {expandedHistory[enc.id] ? (
                          <CaretDown className="size-3.5 shrink-0 text-muted-foreground" />
                        ) : (
                          <CaretRight className="size-3.5 shrink-0 text-muted-foreground" />
                        )}
                        <span className="text-[11px] font-medium text-foreground/70">
                          {new Date(enc.updated_at).toLocaleDateString("en-ZA", {
                            day: "numeric",
                            month: "short",
                            year: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </span>
                      </div>
                      <span
                        className={cn(
                          "rounded-full px-2 py-0.5 text-[9px] font-medium uppercase",
                          enc.status === "signed" || enc.status === "completed"
                            ? "bg-status-success/10 text-status-success"
                            : enc.status === "in_progress"
                              ? "bg-status-warning/10 text-status-warning"
                              : "bg-secondary text-muted-foreground"
                        )}
                      >
                        {enc.status.replace(/_/g, " ")}
                      </span>
                    </div>
                    {!expandedHistory[enc.id] ? (
                      <p className="text-[10px] text-muted-foreground">
                        {encounterSummaryGenErrorById[enc.id] ? (
                          <span className="text-rose-300/85">
                            Summary failed — {encounterSummaryGenErrorById[enc.id]}
                          </span>
                        ) : encounterSummaryById[enc.id]?.chief_complaint ? (
                          encounterSummaryById[enc.id]?.chief_complaint
                        ) : enc.status === "signed" || enc.status === "completed" ? (
                          attemptedSummaryBackfillRef.current.has(enc.id) ? (
                            <span className="text-amber-200/70">Generating AI summary…</span>
                          ) : (
                            "Open to view AI summary and consult details"
                          )
                        ) : (
                          "Open to view AI summary and consult details"
                        )}
                      </p>
                    ) : null}
                  </button>

                  {expandedHistory[enc.id] ? (
                    <div className="mt-3 border-t border-panel-border pt-3">
                      {encounterSummaryById[enc.id] ? (
                        <div className="space-y-2">
                          {encounterSummaryById[enc.id]?.chief_complaint ? (
                            <p className="text-[11px] font-medium text-violet-200/90">
                              {encounterSummaryById[enc.id]?.chief_complaint}
                            </p>
                          ) : null}
                          <p className="text-[11px] leading-relaxed text-foreground/75">
                            {encounterSummaryById[enc.id]?.summary_text}
                          </p>
                          {encounterSummaryById[enc.id]?.key_findings.length ? (
                            <ul className="list-inside list-disc text-[10px] text-muted-foreground/65">
                              {encounterSummaryById[enc.id]?.key_findings.slice(0, 4).map((item, index) => (
                                <li key={`${enc.id}-${index}`}>{item}</li>
                              ))}
                            </ul>
                          ) : null}
                          {encounterSummaryById[enc.id]?.follow_up ? (
                            <p className="text-[10px] text-amber-200/80">
                              Follow-up: {encounterSummaryById[enc.id]?.follow_up}
                            </p>
                          ) : null}
                        </div>
                      ) : enc.status === "signed" || enc.status === "completed" ? (
                        <div className="space-y-2">
                          {encounterSummaryGenErrorById[enc.id] ? (
                            <div className="rounded-lg border border-rose-500/25 bg-rose-500/10 px-3 py-2">
                              <p className="text-[10px] font-medium text-rose-200/95">Could not save AI summary</p>
                              <p className="mt-1 text-[10px] text-rose-200/70">{encounterSummaryGenErrorById[enc.id]}</p>
                              <button
                                type="button"
                                disabled={retryingSummaryId === enc.id}
                                onClick={() => void retryEncounterSummary(enc.id)}
                                className="mt-2 rounded-lg border border-panel-border bg-secondary px-3 py-1.5 text-[10px] font-medium text-foreground/80 transition-colors hover:bg-secondary disabled:opacity-50"
                              >
                                {retryingSummaryId === enc.id ? "Retrying…" : "Retry summary"}
                              </button>
                            </div>
                          ) : attemptedSummaryBackfillRef.current.has(enc.id) ? (
                            <p className="text-[10px] text-amber-200/75">AI summary is being generated for this signed consult.</p>
                          ) : (
                            <div className="rounded-lg border border-panel-border bg-panel-muted/50 px-3 py-2">
                              <p className="text-[10px] text-muted-foreground/65">
                                No AI summary saved yet.{!dekKey || !unlocked ? " Unlock the clinical workspace to generate it." : ""}
                              </p>
                              {(dekKey && unlocked) ? (
                                <button
                                  type="button"
                                  disabled={retryingSummaryId === enc.id}
                                  onClick={() => void retryEncounterSummary(enc.id)}
                                  className="mt-2 rounded-lg border border-sky-500/25 bg-sky-500/10 px-3 py-1.5 text-[10px] font-medium text-sky-300 transition-colors hover:bg-sky-500/15 disabled:opacity-50"
                                >
                                  {retryingSummaryId === enc.id ? "Working…" : "Generate summary"}
                                </button>
                              ) : null}
                            </div>
                          )}
                        </div>
                      ) : (
                        <p className="text-[10px] text-muted-foreground">This consult has not been signed yet, so no AI summary is available.</p>
                      )}

                      <button
                        type="button"
                        onClick={() => void handleOpenClinicalEncounter(enc.id)}
                        className="mt-3 rounded-lg border border-panel-border bg-panel-muted px-3 py-1.5 text-[10px] font-medium text-foreground/70 transition-colors hover:border-ring hover:bg-secondary hover:text-accent-foreground"
                      >
                        Open in clinical workspace
                      </button>
                    </div>
                  ) : null}
                </div>
              ))}
            {!historyLoading && encounterList.length === 0 && (
              <p className="py-8 text-center text-xs text-muted-foreground">No clinical sessions recorded</p>
            )}

            <SectionLabel>Billing timeline</SectionLabel>
            {patientClaims.length > 0 ? (
              patientClaims.slice(0, 10).map((c) => {
                const mr = c.medikreditResponse as { txNbr?: string; patientResponsibility?: number } | undefined
                const pr = typeof mr?.patientResponsibility === "number" ? mr.patientResponsibility : null
                return (
                  <div
                    key={c.id}
                    className="rounded-xl border border-panel-border bg-panel-muted/50 px-3 py-2.5 space-y-0.5"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-[10px] font-medium text-muted-foreground/75">{c.status.replace(/_/g, " ")}</span>
                      <span className="text-[9px] tabular-nums text-muted-foreground">
                        R{c.totalAmount.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                      </span>
                    </div>
                    <p className="text-[9px] text-muted-foreground">
                      {new Date(c.createdAt).toLocaleDateString("en-ZA", { day: "numeric", month: "short", year: "numeric" })}
                      {mr?.txNbr ? <span className="ml-1 font-mono"> · TX {mr.txNbr}</span> : null}
                      {pr != null && pr > 0 ? (
                        <span className="ml-1 text-amber-200/80">· patient liability R{pr.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
                      ) : null}
                    </p>
                  </div>
                )
              })
            ) : (
              <p className="text-[10px] text-muted-foreground">No claims yet — Revenue tab has full ledger.</p>
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
              <div className="rounded-xl border border-panel-border bg-panel-muted/50 p-8 text-center">
                <Pill className="mx-auto mb-2 size-6 text-muted-foreground" />
                <p className="text-xs text-muted-foreground">No medications on file</p>
              </div>
            )}
          </div>
        )}

        {activeTab === "billing" && (
          <div className="space-y-4">
            <div className="rounded-xl border border-panel-border bg-panel-muted/50 p-4">
              <p className="text-[10px] text-muted-foreground">Outstanding Balance</p>
              <p className={cn("mt-1 text-2xl font-bold tabular-nums", patient.outstandingBalance > 0 ? "text-status-warning" : "text-status-success")}>
                R{patient.outstandingBalance.toLocaleString()}
              </p>
            </div>

            <SectionLabel>Claims</SectionLabel>
            {patientClaims.length > 0 ? (
              patientClaims.map((claim) => {
                const med = claim.medikreditResponse
                const mk =
                  med && typeof med === "object"
                    ? (med as { txNbr?: unknown; patientResponsibility?: unknown })
                    : null
                const tx = typeof mk?.txNbr === "string" ? mk.txNbr.trim() : ""
                const pr =
                  typeof mk?.patientResponsibility === "number" && Number.isFinite(mk.patientResponsibility)
                    ? mk.patientResponsibility
                    : undefined
                return (
                <div key={claim.id} className="rounded-xl border border-panel-border bg-panel-muted/50 p-4">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <span className="max-w-[70%] truncate text-[11px] font-medium text-muted-foreground/80">
                      {tx ? <span className="font-mono text-[10px] text-muted-foreground">{tx} · </span> : null}
                      {claim.id}
                    </span>
                    <span className={cn(
                      "shrink-0 rounded-full px-2 py-0.5 text-[9px] font-medium uppercase",
                      claim.status === "paid" ? "bg-status-success/10 text-status-success"
                        : claim.status === "rejected" ? "bg-status-danger/10 text-status-danger"
                        : claim.status === "approved" ? "bg-status-success/10 text-emerald-200"
                        : claim.status === "partial" ? "bg-purple-500/10 text-purple-200"
                        : "bg-status-warning/10 text-status-warning"
                    )}>
                      {claim.status}
                    </span>
                  </div>
                  <div className="flex flex-col gap-0.5 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">{new Date(claim.createdAt).toLocaleDateString("en-ZA", { day: "numeric", month: "short" })}</span>
                      <span className="font-bold tabular-nums text-foreground/70">R{claim.totalAmount.toLocaleString()}</span>
                    </div>
                    {typeof pr === "number" && pr > 0 ? (
                      <p className="text-[10px] text-amber-200/85">Patient shortfall · R{pr.toLocaleString(undefined, { maximumFractionDigits: 2 })}</p>
                    ) : null}
                  </div>
                  {claim.lines.length > 0 && (
                    <div className="mt-2 space-y-1 border-t border-panel-border pt-2">
                      {claim.lines.slice(0, 3).map((line, idx) => (
                        <div key={idx} className="flex justify-between gap-3 text-[10px]">
                          <span className="min-w-0 truncate text-muted-foreground">{line.description}</span>
                          <span className="tabular-nums text-muted-foreground shrink-0">R{line.amount}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                )
              })
            ) : (
              <p className="py-8 text-center text-xs text-muted-foreground">No claims for this patient</p>
            )}
          </div>
        )}
      </div>
    </motion.div>

    <Dialog open={famUpdateDialog !== null} onOpenChange={(open) => !open && setFamUpdateDialog(null)}>
      <DialogContent className="max-h-[90vh] overflow-y-auto border-panel-border bg-popover text-foreground sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-foreground">Update from FamCheck</DialogTitle>
          <DialogDescription className="text-muted-foreground/65">
            {famUpdateDialog ? (
              <>
                Proposed changes for <span className="text-foreground/80">{famUpdateDialog.target.name}</span>. These values
                come from the household check and your scheme context.
              </>
            ) : null}
          </DialogDescription>
        </DialogHeader>
        {famUpdateDialog ? (
          <ul className="max-h-[min(360px,50vh)] space-y-2 overflow-y-auto pr-1">
            {famUpdateDialog.changes.map((c) => (
              <li key={`${c.field}-${c.label}`} className="rounded-lg border border-panel-border bg-background p-2.5">
                <p className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">{c.label}</p>
                <p className="mt-0.5 text-[10px] text-rose-200/65 line-through decoration-white/20">{c.before}</p>
                <p className="text-[11px] font-medium text-emerald-200/95">{c.after}</p>
              </li>
            ))}
          </ul>
        ) : null}
        <DialogFooter className="gap-2 sm:gap-0">
          <button
            type="button"
            onClick={() => setFamUpdateDialog(null)}
            disabled={famUpdateBusy}
            className="rounded-lg border border-panel-border bg-panel-muted px-3 py-2 text-xs font-medium text-foreground/75 transition-colors hover:bg-secondary"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={famUpdateBusy || !famUpdateDialog?.changes.length}
            onClick={() => void applyFamCheckUpdate()}
            className="rounded-lg border border-status-success/35 bg-status-success/15 px-3 py-2 text-xs font-semibold text-status-success transition-colors hover:bg-status-success/22 disabled:opacity-40"
          >
            {famUpdateBusy ? "Saving…" : "Apply updates"}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <MediKreditAccreditationModal
      open={accreditation !== null}
      onClose={() => setAccreditation(null)}
      transactionType={accreditation === "family" ? "famcheck" : "eligibility"}
      title={accreditation === "family" ? "Family eligibility (tx_cd 30)" : "Eligibility (tx_cd 20)"}
      rawXml={accreditation === "family" ? fam?.rawXml : elig?.rawXml}
      requestInnerXml={accreditation === "family" ? fam?.requestInnerXml : elig?.requestInnerXml}
      requestSoapEnvelope={accreditation === "family" ? fam?.requestSoapEnvelope : elig?.requestSoapEnvelope}
      responseRaw={accreditation === "family" ? fam?.responseRaw : elig?.responseRaw}
      res={accreditation === "family" ? fam?.res : elig?.res}
      txNbr={accreditation === "family" ? fam?.txNbr : elig?.txNbr}
      healthNetworkId={accreditation === "family" ? fam?.healthNetworkId : elig?.healthNetworkId}
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
    <div className="rounded-xl border border-panel-border bg-panel-muted/50 p-4">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-foreground/80">{med.name}</p>
        {med.refillsRemaining !== undefined && (
          <span className={cn(
            "rounded-full px-2 py-0.5 text-[9px] font-medium",
            med.refillsRemaining > 0 ? "bg-secondary text-muted-foreground" : "bg-status-danger/10 text-status-danger"
          )}>
            {med.refillsRemaining} refills
          </span>
        )}
      </div>
      <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-0.5 text-[10px] text-muted-foreground">
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
      <span className="text-[10px] text-muted-foreground">{label}</span>
      <span className="text-[11px] text-muted-foreground/80">{value}</span>
    </div>
  )
}

function EditableRow({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex items-center justify-between gap-4 py-0.5">
      <span className="shrink-0 text-[10px] text-muted-foreground">{label}</span>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-2/3 rounded border border-panel-border bg-panel-muted px-2 py-1 text-right text-[11px] text-foreground/70 focus:border-ring focus:outline-none"
      />
    </div>
  )
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{children}</p>
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <label className="mb-1 block text-[10px] font-medium uppercase tracking-wider text-muted-foreground">{children}</label>
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
      <FieldLabel>{label}{required && <span className="text-status-danger"> *</span>}</FieldLabel>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-lg border border-panel-border bg-panel-muted/50 px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground/50 focus:border-ring focus:outline-none"
      />
    </div>
  )
}

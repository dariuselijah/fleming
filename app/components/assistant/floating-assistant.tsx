"use client"

import { useChat } from "ai/react"
import {
  useWorkspace,
  useWorkspaceStore,
  createPatientSession,
  type AdminTab,
  type ClinicalDocType,
  type WorkspaceMode,
} from "@/lib/clinical-workspace"
import { prepareSessionDocumentForGeneration } from "@/lib/clinical-workspace/pending-session-document"
import { tryExecAdminSlashLine } from "@/lib/command-bar/exec-admin-slash"
import { useAssistantStore } from "./assistant-store"
import { MentionInput } from "./mention-input"
import { transcribeBlob } from "@/lib/scribe/transcribe-blob"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { AnimatePresence, motion } from "motion/react"
import { ArrowUp, CalendarBlank, Microphone, Paperclip, Sparkle, User, X } from "@phosphor-icons/react"
import {
  buildSmartSuggestionPrompts,
  patientDisplayNameForPrompts,
  type AssistantPatientContext,
} from "@/lib/assistant/smart-context-prompts"
import { formatDayHeadingLong } from "@/lib/practice/calendar-date-display"
import { cn } from "@/lib/utils"
import { glassSurface, overlaySurface } from "@/lib/theme/surfaces"
import { usePracticeCrypto } from "@/lib/clinical-workspace/practice-crypto-context"
import { fetchClient } from "@/lib/fetch"
import { buildPatientRegistrationPrefill } from "@/lib/clinical/smart-import-patient"
import { requestAppointmentsRefresh } from "@/lib/clinical-workspace/appointments-refresh-bus"
import { requestPatientsRefresh } from "@/lib/clinical-workspace/patients-refresh-bus"
import { AvailableSlotsCard, type SlotOption } from "./available-slots-card"
import { AppointmentActionCard } from "./appointment-action-card"
import { BookingFlowCard } from "./booking-flow-card"
import { RescheduleFlowCard, type RescheduleFlowState } from "./reschedule-flow-card"
import { PatientEditConfirmCard, type ProposedChange } from "./patient-edit-confirm-card"
import { ReminderResultCard, type ReminderResult } from "./reminder-result-card"
import { ToolInvocationSummary } from "./tool-result-card"
import {
  AttachmentConfirmCard,
  UploadRequestCard,
  type AttachmentCategory,
} from "./attachment-cards"
import { toast } from "sonner"
import { useAssistantOverlayOptional } from "./assistant-overlay-context"
import { AssistantMessageMarkdown } from "./assistant-message-markdown"
import {
  EligibilityCheckCard,
  FamilyCheckCard,
  type EligibilityUiPayload,
} from "./eligibility-result-cards"
import type { FamilyDependentRow } from "@/lib/medikredit/types"

type MessagePart = {
  type?: string
  text?: string
  toolInvocation?: {
    toolName?: string
    toolCallId?: string
    state?: string
    result?: unknown
    args?: unknown
  }
}

function extractMessageText(message: {
  role?: string
  content?: unknown
  parts?: MessagePart[]
}): string {
  const parts = message.parts ?? []
  const fromParts = parts
    .filter((p) => p.type === "text" && typeof p.text === "string")
    .map((p) => p.text!)
    .join("")
  if (fromParts.trim()) return fromParts

  const content = message.content
  if (typeof content === "string") return content
  if (Array.isArray(content)) {
    return content
      .map((block) => {
        if (typeof block === "string") return block
        if (block && typeof block === "object" && "type" in block) {
          const b = block as { type?: string; text?: string }
          if (b.type === "text" && typeof b.text === "string") return b.text
        }
        return ""
      })
      .join("")
  }
  return ""
}

type SlotsResult = {
  ok: boolean
  error?: string
  slots?: SlotOption[]
  durationMinutes?: number
  windowFrom?: string
  windowTo?: string
  /** Present when slots are for rescheduling (exclude self from busy times). */
  excludeAppointmentId?: string
}

type AppointmentMutationResult = {
  ok: boolean
  error?: string
  appointment?: Record<string, unknown>
  cancelledAppointment?: Record<string, unknown>
  appointmentId?: string
  apptDate?: string
  startTime?: string
  endTime?: string
  alreadyBooked?: boolean
  clientSource?: string
}

type ClientAction = {
  type?: string
  patientId?: string | null
  appointmentId?: string
  patientName?: string
  apptDate?: string
  startTime?: string
  endTime?: string | null
  durationMinutes?: number | null
  providerStaffId?: string | null
  service?: string | null
  paymentType?: string | null
  medicalAid?: string | null
  memberNumber?: string | null
  mode?: WorkspaceMode
  adminTab?: AdminTab
  prefill?: Record<string, unknown>
  context?: string
  description?: string | null
  hint?: string | null
}

function hhmmStart(time: string): string {
  const t = (time ?? "").trim()
  const m = t.match(/^(\d{2}):(\d{2})/)
  return m ? `${m[1]}:${m[2]}` : t.slice(0, 5)
}

function bookSuccessKey(patientId: string, apptDate: string, startTime: string): string {
  return `${patientId}|${apptDate}|${hhmmStart(startTime)}`
}

function bookKeyFromToolArgs(args: unknown): string | null {
  if (!args || typeof args !== "object") return null
  const o = args as Record<string, unknown>
  const pid = typeof o.patientId === "string" ? o.patientId : null
  const d = typeof o.apptDate === "string" ? o.apptDate : null
  const st = typeof o.startTime === "string" ? o.startTime : null
  if (!pid || !d || !st) return null
  return bookSuccessKey(pid, d, st)
}

function collectBookSuccessKeys(messages: Array<{ role?: string; parts?: MessagePart[] }>): Set<string> {
  const keys = new Set<string>()
  for (const m of messages) {
    if (m.role !== "assistant") continue
    const parts = m.parts
    if (!Array.isArray(parts)) continue
    for (const p of parts) {
      if (p.type !== "tool-invocation" || !p.toolInvocation?.result || typeof p.toolInvocation.result !== "object")
        continue
      if (p.toolInvocation.toolName !== "book_appointment") continue
      const r = p.toolInvocation.result as Record<string, unknown>
      if (!r.ok || !r.appointment || typeof r.appointment !== "object") continue
      const a = r.appointment as Record<string, unknown>
      const pid = typeof a.patient_id === "string" ? a.patient_id : null
      const d = typeof a.appt_date === "string" ? a.appt_date : null
      const st = typeof a.start_time === "string" ? a.start_time : null
      if (pid && d && st) keys.add(bookSuccessKey(pid, d, st))
    }
  }
  return keys
}

export function FloatingAssistant() {
  const { practiceId } = usePracticeCrypto()
  const {
    mode,
    activePatient,
    activeAdminTab,
    setMode,
    setAdminTab,
    openPatient,
    patients,
    submitClaim,
    requestInboxScrollTo,
    openPatientAddModalWithPrefill,
    practiceProviders,
    requestInventoryImportPanelOpen,
  } = useWorkspace()

  const pillOpen = useAssistantStore((s) => s.pillOpen)
  const setPillOpen = useAssistantStore((s) => s.setPillOpen)
  const historyOpen = useAssistantStore((s) => s.historyOpen)
  const focused = useAssistantStore((s) => s.focused)
  const setHistoryOpen = useAssistantStore((s) => s.setHistoryOpen)
  const setFocused = useAssistantStore((s) => s.setFocused)

  const assistantOverlay = useAssistantOverlayOptional()
  const modalOverlaySuppressed = (assistantOverlay?.suppressedCount ?? 0) > 0
  useEffect(() => {
    if (!modalOverlaySuppressed) return
    setHistoryOpen(false)
    setFocused(false)
    setPillOpen(false)
  }, [modalOverlaySuppressed, setHistoryOpen, setFocused, setPillOpen])

  const [patientContext, setPatientContext] = useState<AssistantPatientContext[]>([])
  const patientContextRef = useRef(patientContext)
  useEffect(() => {
    patientContextRef.current = patientContext
  }, [patientContext])

  const patientsById = useMemo(() => new Map(patients.map((p) => [p.id, p])), [patients])
  const patientsRef = useRef(patients)
  useEffect(() => {
    patientsRef.current = patients
  }, [patients])

  const addPatientContext = useCallback((item: AssistantPatientContext) => {
    setPatientContext((prev) => {
      const key = `${item.kind}:${item.id}`
      if (prev.some((x) => `${x.kind}:${x.id}` === key)) return prev
      return [...prev, item]
    })
  }, [])

  useEffect(() => {
    if (mode !== "clinical" || !activePatient?.patientId) return
    addPatientContext({
      kind: "patient",
      id: activePatient.patientId,
      name: activePatient.name,
    })
  }, [mode, activePatient?.patientId, activePatient?.name, addPatientContext])

  const removePatientContext = useCallback((kind: AssistantPatientContext["kind"], id: string) => {
    setPatientContext((prev) => prev.filter((x) => !(x.id === id && x.kind === kind)))
  }, [])

  const threadIdRef = useRef<string>("")
  if (typeof window !== "undefined" && !threadIdRef.current) {
    const k = "fleming_assistant_thread"
    let t = sessionStorage.getItem(k)
    if (!t) {
      t = crypto.randomUUID()
      sessionStorage.setItem(k, t)
    }
    threadIdRef.current = t
  }

  const { messages, setMessages, input, setInput, handleSubmit, append, status, stop } = useChat({
    api: "/api/assistant/admin",
    maxSteps: 8,
    experimental_prepareRequestBody: ({ messages: msgs }) => {
      const threadId = threadIdRef.current || crypto.randomUUID()
      const ctx = patientContextRef.current
      const pmap = new Map(patientsRef.current.map((p) => [p.id, p]))
      const patientSnapshots: Record<string, Record<string, unknown>> = {}
      for (const c of ctx) {
        if (c.kind !== "patient") continue
        const p = pmap.get(c.id)
        if (!p) continue
        const schemeLabel =
          p.medicalAidScheme?.trim() || p.medicalAidPlan?.trim() || undefined
        patientSnapshots[c.id] = {
          id: p.id,
          name: p.name,
          idNumber: p.idNumber,
          memberNumber: p.memberNumber,
          medicalAidScheme: schemeLabel,
          medicalAidSchemeCode: p.medicalAidSchemeCode,
          dependentCode: p.dependentCode,
          mainMemberName: p.mainMemberName,
          dateOfBirth: p.dateOfBirth,
          sex: p.sex,
          phone: p.phone,
          email: p.email,
        }
      }
      return {
        messages: msgs,
        threadId,
        activeAdminTab,
        mode,
        activePatientId: activePatient?.patientId ?? null,
        clinicalSnapshot:
          mode === "clinical" && activePatient
            ? {
                patientId: activePatient.patientId,
                name: activePatient.name,
                consultSigned: activePatient.consultSigned,
                appointmentId: activePatient.appointmentId ?? null,
              }
            : undefined,
        patientContext: ctx.map((c) => ({ id: c.id, name: c.name, kind: c.kind })),
        ...(Object.keys(patientSnapshots).length > 0 ? { patientSnapshots } : {}),
      } as Record<string, unknown>
    },
  })

  const busy = status === "submitted" || status === "streaming"

  const successfulBookingKeys = useMemo(
    () => collectBookSuccessKeys(messages as Array<{ role?: string; parts?: MessagePart[] }>),
    [messages]
  )

  const filePickerRef = useRef<HTMLInputElement>(null)
  const [filePickerCtx, setFilePickerCtx] = useState<{
    patientId?: string
    context: "attachment" | "smart_import"
    description?: string | null
  } | null>(null)
  const [attachmentPrompt, setAttachmentPrompt] = useState<{ patientId: string; hint: string | null } | null>(null)
  const [pendingAttachment, setPendingAttachment] = useState<{ file: File; patientId: string } | null>(null)
  const [attachmentCategory, setAttachmentCategory] = useState<AttachmentCategory>("")
  const [attachBusy, setAttachBusy] = useState(false)
  const [attachErr, setAttachErr] = useState<string | null>(null)
  const [dragOver, setDragOver] = useState(false)

  const [pendingSlotKey, setPendingSlotKey] = useState<string | null>(null)
  const [bookingFlow, setBookingFlow] = useState<SlotOption | null>(null)
  const bookingCardRef = useRef<HTMLDivElement>(null)
  const [rescheduleFlow, setRescheduleFlow] = useState<RescheduleFlowState | null>(null)
  const [rescheduleSlot, setRescheduleSlot] = useState<SlotOption | null>(null)
  const [pendingRescheduleSlotKey, setPendingRescheduleSlotKey] = useState<string | null>(null)
  const rescheduleCardRef = useRef<HTMLDivElement>(null)
  const [collapsedSlotPickers, setCollapsedSlotPickers] = useState<
    Record<string, { date: string; startTime: string; endTime: string; patientLabel?: string }>
  >({})

  const applyClientAction = useCallback(
    (result: Record<string, unknown>) => {
      const ca = result.clientAction as ClientAction | undefined
      if (!ca?.type) return
      if (ca.type === "navigate") {
        if (ca.mode) setMode(ca.mode)
        if (ca.adminTab) setAdminTab(ca.adminTab)
      }
      if (ca.type === "open_inventory_import") {
        requestInventoryImportPanelOpen()
      }
      if (ca.type === "open_patient" && ca.patientId) {
        const p = patients.find((x) => x.id === ca.patientId)
        if (p) {
          openPatient(
            createPatientSession({
              patientId: p.id,
              name: p.name,
              age: p.age,
              sex: p.sex,
              medicalAidStatus:
                p.medicalAidStatus === "verified"
                  ? "active"
                  : p.medicalAidStatus === "terminated"
                    ? "inactive"
                    : p.medicalAidStatus,
              medicalAidScheme: p.medicalAidScheme,
              memberNumber: p.memberNumber,
              chronicConditions: p.chronicConditions ?? [],
              criticalAllergies: p.allergies ?? [],
              activeMedications: p.currentMedications ?? [],
            })
          )
          setMode("clinical")
        }
      }
      if (ca.type === "scan_id") {
        setMode("admin")
        setAdminTab("front_desk")
        requestInboxScrollTo("smart-import")
      }
      if (ca.type === "submit_claim" && ca.patientId) {
        submitClaim(ca.patientId)
      }
      if (ca.type === "open_file_picker") {
        setFilePickerCtx({
          patientId: ca.patientId ?? undefined,
          context: (ca.context as "attachment" | "smart_import") || "attachment",
          description: ca.description ?? null,
        })
        requestAnimationFrame(() => filePickerRef.current?.click())
      }
      if (ca.type === "open_patient_add_modal" && ca.prefill && typeof ca.prefill === "object") {
        openPatientAddModalWithPrefill(ca.prefill as never)
        setMode("admin")
        setAdminTab("patients")
      }
      if (ca.type === "refresh_appointments") {
        requestAppointmentsRefresh()
      }
      if (ca.type === "upsert_session_document" && ca.patientId) {
        const docType = (ca as { docType?: string }).docType as ClinicalDocType | undefined
        const title = (ca as { title?: string }).title
        const content = (ca as { content?: string }).content
        if (docType && title && content) {
          const store = useWorkspaceStore.getState()
          const patient = store.openPatients.find((p) => p.patientId === ca.patientId)
          const pending = prepareSessionDocumentForGeneration(patient?.sessionDocuments, docType)
          store.upsertSessionDocument(ca.patientId, {
            ...pending,
            document: {
              ...pending.document,
              title,
              content,
              isStreaming: false,
            },
          })
          window.dispatchEvent(
            new CustomEvent("fleming:focus-document-tab", { detail: { docId: pending.id } })
          )
          setMode("clinical")
          toast.success(`${title} updated in chart`)
        }
      }
      if (ca.type === "request_attachment" && ca.patientId) {
        setAttachmentPrompt({ patientId: ca.patientId, hint: ca.hint ?? null })
      }
      if (ca.type === "assistant_open_booking_card" && ca.patientId && ca.apptDate && ca.startTime) {
        const startMin = (() => {
          const [h, m] = ca.startTime.split(":")
          return Number(h) * 60 + Number(m)
        })()
        const duration =
          typeof ca.durationMinutes === "number" && ca.durationMinutes > 0 ? ca.durationMinutes : 30
        const endHours = Math.floor((startMin + duration) / 60)
        const endMins = (startMin + duration) % 60
        const endTime =
          ca.endTime && /^\d{2}:\d{2}/.test(ca.endTime)
            ? ca.endTime
            : `${String(endHours).padStart(2, "0")}:${String(endMins).padStart(2, "0")}`
        setHistoryOpen(true)
        setRescheduleFlow(null)
        setRescheduleSlot(null)
        setPendingRescheduleSlotKey(null)
        setPendingSlotKey(`${ca.apptDate}T${ca.startTime}`)
        setBookingFlow({
          date: ca.apptDate,
          startTime: ca.startTime,
          endTime,
          durationMinutes: duration,
          providerStaffId: ca.providerStaffId ?? null,
        })
        if (ca.patientId) {
          addPatientContext({
            kind: "patient",
            id: ca.patientId,
            name: String(ca.patientName ?? "Patient"),
          })
        }
        requestAnimationFrame(() => {
          bookingCardRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" })
        })
      }
      if (ca.type === "assistant_begin_reschedule" && ca.appointmentId) {
        setHistoryOpen(true)
        setBookingFlow(null)
        setPendingSlotKey(null)
        setRescheduleSlot(null)
        setPendingRescheduleSlotKey(null)
        setRescheduleFlow({
          appointmentId: ca.appointmentId,
          patientId: typeof ca.patientId === "string" ? ca.patientId : null,
          patientName: String(ca.patientName ?? "Patient"),
          apptDate: String(ca.apptDate ?? ""),
          startTime: String(ca.startTime ?? ""),
          endTime: String(ca.endTime ?? ""),
          durationMinutes: typeof ca.durationMinutes === "number" ? ca.durationMinutes : 30,
          providerStaffId: ca.providerStaffId ?? null,
          service: typeof ca.service === "string" ? ca.service : null,
        })
        if (typeof ca.patientId === "string" && ca.patientId) {
          addPatientContext({
            kind: "patient",
            id: ca.patientId,
            name: String(ca.patientName ?? "Patient"),
          })
        }
      }
    },
    [
      addPatientContext,
      setHistoryOpen,
      openPatient,
      patients,
      requestInboxScrollTo,
      setAdminTab,
      setMode,
      submitClaim,
      openPatientAddModalWithPrefill,
      requestInventoryImportPanelOpen,
    ]
  )

  const confirmAttachmentUpload = useCallback(async () => {
    if (!pendingAttachment) return
    setAttachBusy(true)
    setAttachErr(null)
    try {
      const fd = new FormData()
      fd.append("file", pendingAttachment.file)
      if (attachmentCategory) fd.append("category", attachmentCategory)
      const res = await fetchClient(`/api/patients/${pendingAttachment.patientId}/attachments`, {
        method: "POST",
        body: fd,
      })
      const j = (await res.json().catch(() => ({}))) as { error?: string }
      if (!res.ok) throw new Error(j.error || res.statusText)
      requestPatientsRefresh()
      const pname =
        patientsById.get(pendingAttachment.patientId)?.name ?? "the patient"
      void append({
        role: "assistant",
        content: `Attached «${pendingAttachment.file.name}» to ${pname}.`,
      })
      setPendingAttachment(null)
      setAttachmentCategory("")
      setAttachmentPrompt(null)
    } catch (e) {
      setAttachErr(e instanceof Error ? e.message : "Upload failed")
    } finally {
      setAttachBusy(false)
    }
  }, [pendingAttachment, attachmentCategory, patientsById, append])

  const onAssistantFile: React.ChangeEventHandler<HTMLInputElement> = async (ev) => {
    const file = ev.target.files?.[0]
    ev.target.value = ""
    const ctx = filePickerCtx
    setFilePickerCtx(null)
    if (!file || !ctx) return

    if (ctx.context === "smart_import") {
      const fd = new FormData()
      fd.append("file", file)
      fd.append("stream", "false")
      try {
        const res = await fetchClient("/api/clinical/smart-import/extract", { method: "POST", body: fd })
        const j = (await res.json()) as { fields?: Record<string, string>; error?: string }
        if (!res.ok || !j.fields) return
        openPatientAddModalWithPrefill(buildPatientRegistrationPrefill(j.fields))
        setMode("admin")
        setAdminTab("patients")
      } catch {
        /* ignore */
      }
      return
    }

    if (ctx.patientId && practiceId && ctx.context === "attachment") {
      setAttachmentCategory("")
      setPendingAttachment({ file: file as File, patientId: ctx.patientId })
      setAttachErr(null)
    }
  }

  const processedMessageIds = useRef(new Set<string>())
  const [dismissedProposals, setDismissedProposals] = useState<string[]>([])
  const dismissProposal = useCallback((key: string) => {
    setDismissedProposals((prev) => (prev.includes(key) ? prev : [...prev, key]))
  }, [])

  const primaryPatient = useMemo(
    () => patientContext.find((c) => c.kind === "patient"),
    [patientContext]
  )
  const primaryPatientId = primaryPatient?.id

  const primaryPatientName = useMemo(() => {
    if (!primaryPatient) return undefined
    const p = patientsById.get(primaryPatient.id)
    return patientDisplayNameForPrompts(p, primaryPatient.name)
  }, [primaryPatient, patientsById])

  const handlePickRescheduleSlot = useCallback(
    (slot: SlotOption) => {
      if (!rescheduleFlow) return
      setHistoryOpen(true)
      setBookingFlow(null)
      setPendingSlotKey(null)
      setPendingRescheduleSlotKey(`${slot.date}T${slot.startTime}`)
      setRescheduleSlot(slot)
      requestAnimationFrame(() => {
        rescheduleCardRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" })
      })
    },
    [rescheduleFlow, setHistoryOpen]
  )

  const handlePickSlot = useCallback(
    (slot: SlotOption) => {
      if (!primaryPatientId) {
        setInput((prev) => (prev.trim() ? prev : "@mention a patient first, then pick a time slot."))
        return
      }
      setHistoryOpen(true)
      setRescheduleFlow(null)
      setRescheduleSlot(null)
      setPendingRescheduleSlotKey(null)
      setPendingSlotKey(`${slot.date}T${slot.startTime}`)
      setBookingFlow(slot)
      requestAnimationFrame(() => {
        bookingCardRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" })
      })
    },
    [primaryPatientId, setHistoryOpen, setInput]
  )

  const clearChat = useCallback(() => {
    stop()
    setMessages([])
    setInput("")
    setPatientContext([])
    processedMessageIds.current.clear()
    setHistoryOpen(false)
    setBookingFlow(null)
    setPendingSlotKey(null)
    setRescheduleFlow(null)
    setRescheduleSlot(null)
    setPendingRescheduleSlotKey(null)
    setCollapsedSlotPickers({})
    setDismissedProposals([])
    setAttachmentPrompt(null)
    setPendingAttachment(null)
    setAttachmentCategory("")
    setAttachErr(null)
  }, [stop, setMessages, setInput, setHistoryOpen])

  useEffect(() => {
    for (const m of messages) {
      if (m.role !== "assistant") continue
      const id = (m as { id?: string }).id
      if (!id || processedMessageIds.current.has(id)) continue

      const parts = (m as { parts?: Array<{ type?: string; toolInvocation?: { result?: unknown } }> }).parts
      if (parts) {
        for (const p of parts) {
          if (p.type === "tool-invocation" && p.toolInvocation?.result && typeof p.toolInvocation.result === "object") {
            applyClientAction(p.toolInvocation.result as Record<string, unknown>)
          }
        }
      }
      processedMessageIds.current.add(id)
    }
  }, [messages, applyClientAction])

  useEffect(() => {
    if (messages.length > 0 && !historyOpen) setHistoryOpen(true)
  }, [messages.length, historyOpen, setHistoryOpen])

  useEffect(() => {
    if (status !== "ready" && status !== "error") return
    // Keep the highlighted slot while the user completes booking in the flow card.
    if (bookingFlow) return
    if (rescheduleSlot) return
    setPendingSlotKey(null)
    setPendingRescheduleSlotKey(null)
  }, [status, bookingFlow, rescheduleSlot])

  useEffect(() => {
    if (status !== "ready" && status !== "error") return
    if (messages.length <= 60) return
    setMessages((prev) => (prev.length > 60 ? prev.slice(-50) : prev))
  }, [status, messages.length, setMessages])

  const suggestionChips = useMemo(
    () => buildSmartSuggestionPrompts(activeAdminTab, patientsById, patientContext, mode),
    [activeAdminTab, patientsById, patientContext, mode]
  )

  const onFormSubmit = (e?: React.FormEvent) => {
    e?.preventDefault?.()
    if (bookingFlow || rescheduleFlow) return
    const line = input.trim()
    if (
      line &&
      tryExecAdminSlashLine(
        line,
        {
          setMode,
          setAdminTab,
          requestInboxScrollTo,
        },
        {
          submitAssistantPrompt: (text) => {
            void append({ role: "user", content: text })
          },
          openAddPatientModal: () => openPatientAddModalWithPrefill({} as never),
          openInventoryImport: () => requestInventoryImportPanelOpen(),
        }
      )
    ) {
      setInput("")
      return
    }
    if (!line && patientContext.length > 0) {
      const primary = patientContext.find((c) => c.kind === "patient")
      const pRecord = primary ? patientsById.get(primary.id) : undefined
      const who = patientDisplayNameForPrompts(pRecord, primary?.name ?? patientContext[0]!.name)
      void append({
        role: "user",
        content: `What are the most helpful next steps for ${who}?`,
      })
      setInput("")
      return
    }
    if (!line) return
    if (e) handleSubmit(e)
    else handleSubmit()
  }

  const micRef = useRef<HTMLInputElement>(null)
  const [micBusy, setMicBusy] = useState(false)

  const onMicFile: React.ChangeEventHandler<HTMLInputElement> = async (ev) => {
    const f = ev.target.files?.[0]
    ev.target.value = ""
    if (!f) return
    setMicBusy(true)
    try {
      const r = await transcribeBlob(f)
      if (r.transcript) setInput((prev) => (prev ? `${prev} ` : "") + r.transcript.trim())
    } finally {
      setMicBusy(false)
    }
  }

  const hasInput = input.trim().length > 0 || patientContext.length > 0
  const flowAwaitingConfirm = !!bookingFlow || !!rescheduleFlow
  const showChips =
    (focused || hasInput || messages.length > 0) &&
    !flowAwaitingConfirm &&
    !pendingAttachment

  const chipHue = useCallback((id: string) => {
    let h = 0
    for (let i = 0; i < id.length; i++) h = (h + id.charCodeAt(i) * 17) % 360
    return h
  }, [])

  if (!practiceId) return null

  const showExpandedBar = pillOpen && !modalOverlaySuppressed

  if (!showExpandedBar) {
    return (
      <div
        className="pointer-events-none fixed inset-x-0 bottom-0 z-[110] flex justify-center"
        style={{ paddingBottom: "max(1rem, env(safe-area-inset-bottom, 0px))" }}
      >
        <div className="pointer-events-auto px-4 pb-4">
          <button
            type="button"
            onClick={() => {
              setPillOpen(true)
              setFocused(true)
            }}
            className="mx-auto flex h-8 min-w-[140px] items-center justify-center gap-1.5 rounded-full border border-glass-border bg-glass px-3 text-[11px] text-muted-foreground shadow-glass backdrop-blur-xl hover:text-foreground"
          >
            <Sparkle className="size-3.5" weight="fill" />
            Ask Fleming
            <kbd className="rounded border border-border px-1 font-sans text-[9px] text-muted-foreground">⌘J</kbd>
          </button>
        </div>
        <input ref={filePickerRef} type="file" className="hidden" onChange={onAssistantFile} accept="image/*,application/pdf" />
      </div>
    )
  }

  return (
    <div
      className="pointer-events-none fixed inset-x-0 bottom-0 z-[110] flex justify-center"
      style={{ paddingBottom: "max(1rem, env(safe-area-inset-bottom, 0px))" }}
    >
      <div className="pointer-events-auto w-full max-w-[640px] px-4">
        <input ref={filePickerRef} type="file" className="hidden" onChange={onAssistantFile} accept="image/*,application/pdf" />
        <AnimatePresence>
          {historyOpen &&
            (messages.length > 0 || bookingFlow || rescheduleFlow) && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 8 }}
              transition={{ type: "spring", stiffness: 420, damping: 36 }}
              className={cn("mb-2 max-h-[min(52vh,480px)] overflow-y-auto rounded-[22px]", overlaySurface)}
              style={{ scrollbarWidth: "none" }}
            >
              <div className="space-y-5 px-4 pb-4 pt-3">
                {messages.map((m, i) => {
                  const id = (m as { id?: string }).id ?? `m-${i}`
                  const parts = ((m as { parts?: MessagePart[] }).parts ?? []) as MessagePart[]
                  const toolParts = parts.filter(
                    (p) => p.type === "tool-invocation" && p.toolInvocation?.result && typeof p.toolInvocation.result === "object"
                  )
                  const textFromParts = parts
                    .filter((p) => p.type === "text" && typeof p.text === "string")
                    .map((p) => p.text!)
                    .join("")
                  const text = textFromParts || extractMessageText(m as { content?: unknown; parts?: MessagePart[] })
                  const failedBookKeys = toolParts
                    .filter((tp) => tp.toolInvocation?.toolName === "book_appointment")
                    .map((tp) => {
                      const br = tp.toolInvocation?.result as Record<string, unknown> | undefined
                      if (br && br.ok === true) return null
                      return bookKeyFromToolArgs(tp.toolInvocation?.args)
                    })
                    .filter((k): k is string => k != null)
                  const suppressForBookNoise =
                    m.role === "assistant" &&
                    failedBookKeys.length > 0 &&
                    failedBookKeys.some((k) => successfulBookingKeys.has(k))
                  const suppressAssistantText =
                    !text.trim() &&
                    m.role === "assistant" &&
                    toolParts.some((tp) => {
                      if (tp.toolInvocation?.toolName !== "find_available_slots") return false
                      const r = tp.toolInvocation.result as SlotsResult
                      return r.ok === true
                    })
                  const displayText = suppressForBookNoise || suppressAssistantText ? "" : text
                  const isUser = m.role === "user"
                  return (
                    <div key={id} className="flex flex-col gap-2">
                      <span className="text-[10px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
                        {isUser ? "You" : "Fleming"}
                      </span>
                      {displayText ? (
                        <div
                          className={cn(
                            isUser &&
                              "rounded-2xl border border-border/45 bg-muted/55 px-3.5 py-2.5 shadow-sm"
                          )}
                        >
                          <AssistantMessageMarkdown
                            variant={isUser ? "user" : "assistant"}
                            className="whitespace-normal"
                          >
                            {displayText}
                          </AssistantMessageMarkdown>
                        </div>
                      ) : null}
                      {m.role === "assistant" && toolParts.length > 0 ? (
                        <div className="flex flex-col gap-2">
                          {toolParts.map((tp, idx) => {
                            const name = tp.toolInvocation?.toolName ?? ""
                            const result = tp.toolInvocation?.result as Record<string, unknown>
                            if (name === "find_available_slots") {
                              const r = result as unknown as SlotsResult
                              if (!r.ok) {
                                return (
                                  <div
                                    key={`${id}-slots-${idx}`}
                                    className="rounded-2xl border border-status-warning/20 bg-status-warning/[0.08] px-3.5 py-2.5 text-[12px] text-status-warning-foreground dark:text-status-warning"
                                  >
                                    {r.error ?? "Could not load availability."}
                                  </div>
                                )
                              }
                              const rescheduleSlots = !!r.excludeAppointmentId
                              if (bookingFlow && !rescheduleSlots) {
                                return null
                              }
                              if (rescheduleSlot && rescheduleSlots) {
                                return null
                              }
                              const slotCallId =
                                typeof tp.toolInvocation?.toolCallId === "string" &&
                                tp.toolInvocation.toolCallId.trim().length > 0
                                  ? tp.toolInvocation.toolCallId
                                  : `${id}-slots-${idx}`
                              const collapsed = collapsedSlotPickers[slotCallId]
                              if (collapsed) {
                                return (
                                  <div
                                    key={`${id}-slots-${idx}-${slotCallId}`}
                                    className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-panel-border bg-panel px-3.5 py-2.5"
                                  >
                                    <p className="min-w-0 text-[12px] text-foreground/75">
                                      <span className="text-muted-foreground">
                                        {rescheduleSlots ? "New time" : "Selected"} ·{" "}
                                      </span>
                                      <span className="font-medium text-foreground">
                                        {formatDayHeadingLong(collapsed.date)} · {collapsed.startTime}–
                                        {collapsed.endTime}
                                      </span>
                                      {collapsed.patientLabel ? (
                                        <span className="text-muted-foreground"> · {collapsed.patientLabel}</span>
                                      ) : null}
                                    </p>
                                    <button
                                      type="button"
                                      onMouseDown={(e) => e.preventDefault()}
                                      onClick={() =>
                                        setCollapsedSlotPickers((prev) => {
                                          const next = { ...prev }
                                          delete next[slotCallId]
                                          return next
                                        })
                                      }
                                      className="shrink-0 rounded-lg px-2 py-1 text-[10px] font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
                                    >
                                      Change
                                    </button>
                                  </div>
                                )
                              }
                              return (
                                <AvailableSlotsCard
                                  key={`${id}-slots-${idx}-${slotCallId}`}
                                  slots={r.slots ?? []}
                                  durationMinutes={r.durationMinutes}
                                  windowFrom={r.windowFrom}
                                  windowTo={r.windowTo}
                                  patientName={primaryPatientName}
                                  pendingKey={rescheduleSlots ? pendingRescheduleSlotKey : pendingSlotKey}
                                  onPick={(slot) => {
                                    setCollapsedSlotPickers((prev) => ({
                                      ...prev,
                                      [slotCallId]: {
                                        date: slot.date,
                                        startTime: slot.startTime,
                                        endTime: slot.endTime,
                                        patientLabel: primaryPatientName,
                                      },
                                    }))
                                    if (rescheduleSlots) handlePickRescheduleSlot(slot)
                                    else handlePickSlot(slot)
                                  }}
                                />
                              )
                            }
                            if (name === "book_appointment") {
                              const r = result as unknown as AppointmentMutationResult
                              if (r.alreadyBooked) return null
                              if (r.ok && r.appointment) {
                                const a = r.appointment
                                const who =
                                  primaryPatientName ??
                                  (typeof a.patient_name_snapshot === "string"
                                    ? a.patient_name_snapshot
                                    : null) ??
                                  "Patient"
                                return (
                                  <AppointmentActionCard
                                    key={`${id}-book-${idx}`}
                                    kind="booked"
                                    ok
                                    title="Booked"
                                    patientName={who}
                                    date={typeof a.appt_date === "string" ? a.appt_date : undefined}
                                    startTime={typeof a.start_time === "string" ? a.start_time : undefined}
                                    endTime={typeof a.end_time === "string" ? a.end_time : undefined}
                                  />
                                )
                              }
                              if (r.ok) return null
                              const failKey = bookKeyFromToolArgs(tp.toolInvocation?.args)
                              if (failKey && successfulBookingKeys.has(failKey)) return null
                              return (
                                <AppointmentActionCard
                                  key={`${id}-book-${idx}`}
                                  kind="booked"
                                  ok={false}
                                  error={r.error}
                                  title="Couldn't book appointment"
                                  patientName={primaryPatientName}
                                />
                              )
                            }
                            if (name === "cancel_appointment") {
                              const r = result as unknown as AppointmentMutationResult & {
                                cancelled?: boolean
                              }
                              const appt = (r.cancelledAppointment ?? {}) as Record<string, unknown>
                              return (
                                <AppointmentActionCard
                                  key={`${id}-cancel-${idx}`}
                                  kind="cancelled"
                                  ok={!!r.ok && r.cancelled !== false}
                                  error={r.error}
                                  title={r.ok ? "Appointment cancelled" : "Couldn't cancel appointment"}
                                  patientName={(appt.patient_name_snapshot as string | undefined) ?? primaryPatientName}
                                  date={appt.appt_date as string | undefined}
                                  startTime={appt.start_time as string | undefined}
                                />
                              )
                            }
                            if (name === "reschedule_appointment") {
                              const r = result as unknown as AppointmentMutationResult & {
                                patientNameSnapshot?: string
                              }
                              return (
                                <AppointmentActionCard
                                  key={`${id}-resched-${idx}`}
                                  kind="rescheduled"
                                  ok={!!r.ok}
                                  error={r.error}
                                  title={r.ok ? "Appointment rescheduled" : "Couldn't reschedule"}
                                  patientName={r.patientNameSnapshot ?? primaryPatientName}
                                  date={r.apptDate}
                                  startTime={r.startTime}
                                  endTime={r.endTime}
                                />
                              )
                            }
                            if (name === "propose_patient_edit") {
                              const r = result as unknown as {
                                ok?: boolean
                                patientId?: string
                                changes?: ProposedChange[]
                                requireTypedConfirm?: boolean
                              }
                              const pkey = `${id}-propose-${idx}`
                              if (
                                !r.ok ||
                                !r.patientId ||
                                !Array.isArray(r.changes) ||
                                dismissedProposals.includes(pkey)
                              ) {
                                return null
                              }
                              return (
                                <PatientEditConfirmCard
                                  key={pkey}
                                  patientId={r.patientId}
                                  changes={r.changes}
                                  requireTypedConfirm={!!r.requireTypedConfirm}
                                  onDismiss={() => dismissProposal(pkey)}
                                />
                              )
                            }
                            if (name === "send_appointment_reminder") {
                              return (
                                <ReminderResultCard
                                  key={`${id}-remind-${idx}`}
                                  result={result as unknown as ReminderResult}
                                  patientName={primaryPatientName}
                                />
                              )
                            }
                            if (name === "send_patient_email" || name === "send_patient_sms") {
                              const r = result as { ok?: boolean; error?: string; channel?: string; to?: string; phoneMasked?: string }
                              return (
                                <div
                                  key={`${id}-msg-${idx}`}
                                  className={cn(
                                    "rounded-xl border px-3 py-2 text-xs",
                                    r.ok
                                      ? "border-emerald-500/30 bg-emerald-500/5 text-emerald-800 dark:text-emerald-200"
                                      : "border-destructive/30 bg-destructive/5 text-destructive"
                                  )}
                                >
                                  {r.ok ? (
                                    <>
                                      <span className="font-semibold">
                                        {name === "send_patient_email" ? "Email sent" : "SMS sent"}
                                      </span>
                                      {r.to ? <span className="ml-1 text-muted-foreground">→ {r.to}</span> : null}
                                      {r.phoneMasked ? (
                                        <span className="ml-1 text-muted-foreground">→ {r.phoneMasked}</span>
                                      ) : null}
                                    </>
                                  ) : (
                                    r.error ?? "Message failed"
                                  )}
                                </div>
                              )
                            }
                            if (name === "upsert_session_document") {
                              const r = result as { ok?: boolean; clientAction?: { title?: string } }
                              if (!r.ok) return null
                              return (
                                <div
                                  key={`${id}-doc-${idx}`}
                                  className="rounded-xl border border-primary/25 bg-primary/5 px-3 py-2 text-xs text-primary"
                                >
                                  Chart document updated
                                  {r.clientAction?.title ? `: ${r.clientAction.title}` : ""}
                                </div>
                              )
                            }
                            if (name === "list_outstanding_invoices" || name === "get_cash_drawer_status") {
                              return (
                                <ToolInvocationSummary
                                  key={`${id}-bill-${idx}`}
                                  part={{ toolName: name, result }}
                                />
                              )
                            }
                            if (name === "run_eligibility_check") {
                              const r = result as unknown as {
                                ok?: boolean
                                error?: string
                                patientId?: string
                                eligibility?: EligibilityUiPayload
                              }
                              const pid = r.patientId
                              const pname =
                                (pid ? patientsById.get(pid)?.name : undefined) ??
                                primaryPatientName ??
                                "Patient"
                              return (
                                <EligibilityCheckCard
                                  key={`${id}-elig-${idx}`}
                                  patientName={pname}
                                  eligibility={r.ok ? r.eligibility : undefined}
                                  error={r.ok ? undefined : (r.error ?? "Eligibility check failed")}
                                />
                              )
                            }
                            if (name === "run_family_check") {
                              const r = result as unknown as {
                                ok?: boolean
                                error?: string
                                patientId?: string
                                principal?: {
                                  name?: string
                                  scheme?: string
                                  schemeCode?: string
                                  memberNumber?: string
                                  mainMemberName?: string
                                }
                                dependents?: FamilyDependentRow[]
                              }
                              const pid = r.patientId
                              const pname =
                                (pid ? patientsById.get(pid)?.name : undefined) ??
                                primaryPatientName ??
                                "Patient"
                              return (
                                <FamilyCheckCard
                                  key={`${id}-fam-${idx}`}
                                  patientName={pname}
                                  principal={r.principal ?? {}}
                                  dependents={r.ok && Array.isArray(r.dependents) ? r.dependents : []}
                                  error={r.ok ? undefined : (r.error ?? "Family check failed")}
                                  onAddDependent={(prefill) => {
                                    openPatientAddModalWithPrefill(prefill as never)
                                    setMode("admin")
                                    setAdminTab("patients")
                                  }}
                                />
                              )
                            }
                            return null
                          })}
                        </div>
                      ) : null}
                    </div>
                  )
                })}
                {bookingFlow && primaryPatientId && primaryPatientName ? (
                  <div ref={bookingCardRef} className="flex scroll-mt-3 flex-col gap-2">
                    <span className="text-[10px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
                      Fleming
                    </span>
                    <BookingFlowCard
                      slot={bookingFlow}
                      patientId={primaryPatientId}
                      patientName={primaryPatientName}
                      patientProfile={patientsById.get(primaryPatientId) ?? null}
                      practiceProviders={practiceProviders.map((p) => ({ id: p.id, name: p.name }))}
                      onDismiss={() => {
                        setBookingFlow(null)
                        setPendingSlotKey(null)
                      }}
                      onBooked={(res) => {
                        if (res.ok) requestAppointmentsRefresh()
                        if (res.ok && res.appointment) {
                          const a = res.appointment
                          const pid =
                            (typeof a.patient_id === "string" ? a.patient_id : null) ?? primaryPatientId ?? ""
                          setMessages((prev) => [
                            ...prev,
                            {
                              id: `ui-book-${crypto.randomUUID()}`,
                              role: "assistant",
                              content: "",
                              parts: [
                                {
                                  type: "tool-invocation",
                                  toolInvocation: {
                                    toolName: "book_appointment",
                                    toolCallId: `ui-book-${Date.now()}`,
                                    state: "result",
                                    args: {
                                      patientId: pid,
                                      apptDate: String(a.appt_date ?? ""),
                                      startTime: String(a.start_time ?? ""),
                                    },
                                    result: {
                                      ok: true,
                                      appointment: a,
                                      clientSource: "booking_flow",
                                    },
                                  },
                                },
                              ],
                            } as never,
                          ])
                          setHistoryOpen(true)
                        }
                        if (res.ok) {
                          setBookingFlow(null)
                          setPendingSlotKey(null)
                        }
                      }}
                    />
                  </div>
                ) : null}
                {rescheduleFlow ? (
                  <div ref={rescheduleCardRef} className="flex scroll-mt-3 flex-col gap-2">
                    <span className="text-[10px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
                      Fleming
                    </span>
                    <RescheduleFlowCard
                      flow={rescheduleFlow}
                      newSlot={rescheduleSlot}
                      onDismiss={() => {
                        setRescheduleFlow(null)
                        setRescheduleSlot(null)
                        setPendingRescheduleSlotKey(null)
                      }}
                      onRescheduled={(res) => {
                        if (!res.ok) return
                        requestAppointmentsRefresh()
                        const pname = rescheduleFlow.patientName
                        const d = res.apptDate ?? ""
                        const st = res.startTime ?? ""
                        const en = res.endTime ?? ""
                        setMessages((prev) => [
                          ...prev,
                          {
                            id: `ui-resched-${crypto.randomUUID()}`,
                            role: "assistant",
                            content: "",
                            parts: [
                              {
                                type: "tool-invocation",
                                toolInvocation: {
                                  toolName: "reschedule_appointment",
                                  toolCallId: `ui-resched-${Date.now()}`,
                                  state: "result",
                                  result: {
                                    ok: true,
                                    apptDate: d,
                                    startTime: st,
                                    endTime: en,
                                    clientSource: "reschedule_flow",
                                    patientNameSnapshot: pname,
                                  },
                                },
                              },
                            ],
                          } as never,
                        ])
                        setHistoryOpen(true)
                        setRescheduleFlow(null)
                        setRescheduleSlot(null)
                        setPendingRescheduleSlotKey(null)
                      }}
                    />
                  </div>
                ) : null}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <motion.form
          onSubmit={onFormSubmit}
          initial={false}
          animate={{ scale: focused ? 1 : 0.995 }}
          transition={{ type: "spring", stiffness: 420, damping: 36 }}
          onDragOver={(e) => {
            e.preventDefault()
            e.stopPropagation()
            setDragOver(true)
          }}
          onDragLeave={(e) => {
            e.preventDefault()
            setDragOver(false)
          }}
          onDrop={(e) => {
            e.preventDefault()
            e.stopPropagation()
            setDragOver(false)
            const pid = patientContext.find((c) => c.kind === "patient")?.id
            if (!pid) {
              setAttachErr("Add a patient chip before dropping a file.")
              return
            }
            const f = e.dataTransfer.files?.[0]
            if (f) {
              setAttachmentCategory("")
              setPendingAttachment({ file: f, patientId: pid })
              setAttachErr(null)
            }
          }}
          className={cn(
            /* overflow-visible so @mention dropdown (positioned above input) is not clipped */
            "relative overflow-visible rounded-[26px]",
            glassSurface,
            dragOver && "border-status-info/35 ring-1 ring-status-info/20",
            focused
              ? "border-glass-border bg-glass"
              : "hover:border-glass-border/80"
          )}
        >
          <div className="flex items-center justify-between gap-2 border-b border-border/70 px-3 py-1.5">
            <span className="text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground">Assistant</span>
            <div className="flex items-center gap-1">
              {messages.length > 0 ? (
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => clearChat()}
                  className="rounded-full px-2 py-1 text-[10px] text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                >
                  Clear chat
                </button>
              ) : null}
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => setPillOpen(false)}
                className="rounded-full p-1 text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                title="Minimize bar"
              >
                <X className="size-3.5" />
              </button>
            </div>
          </div>
          {flowAwaitingConfirm ? (
            <p className="px-3 pt-2 text-[10.5px] leading-snug text-muted-foreground">
              Confirm or close the {bookingFlow ? "booking" : "reschedule"} card above to continue chatting.
            </p>
          ) : null}
          {patientContext.length > 0 ? (
            <div className="flex flex-wrap items-center gap-1 px-3 pt-2">
              {patientContext.map((c) => (
                <div
                  key={`${c.kind}:${c.id}`}
                  className="group inline-flex max-w-[220px] items-center gap-1.5 rounded-full bg-muted py-0.5 pl-0.5 pr-1.5 transition-colors hover:bg-accent"
                >
                  <span
                    className="flex size-[18px] shrink-0 items-center justify-center rounded-full text-[9px] font-semibold text-white"
                    style={{
                      background: `hsla(${chipHue(c.id)}, 36%, 42%, 0.95)`,
                    }}
                  >
                    {c.kind === "appointment" ? (
                      <CalendarBlank className="size-2.5 text-white" weight="bold" />
                    ) : (
                      <User className="size-2.5 text-white" weight="bold" />
                    )}
                  </span>
                  <span className="min-w-0 truncate text-[11px] font-medium leading-none text-foreground/85">{c.name}</span>
                  <button
                    type="button"
                    onMouseDown={(ev) => ev.preventDefault()}
                    onClick={() => removePatientContext(c.kind, c.id)}
                    className="-mr-0.5 flex size-4 items-center justify-center rounded-full text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                    aria-label={`Remove ${c.name}`}
                  >
                    <X className="size-2.5" weight="bold" />
                  </button>
                </div>
              ))}
            </div>
          ) : null}
          {attachmentPrompt && !pendingAttachment ? (
            <div className="mx-3 mt-2">
              <UploadRequestCard
                patientName={patientsById.get(attachmentPrompt.patientId)?.name ?? "Patient"}
                hint={attachmentPrompt.hint}
                onDismiss={() => setAttachmentPrompt(null)}
                onFile={(file) => {
                  setAttachmentCategory("")
                  setPendingAttachment({ file, patientId: attachmentPrompt.patientId })
                  setAttachErr(null)
                }}
              />
            </div>
          ) : null}
          {pendingAttachment ? (
            <div className="mx-3 mt-2">
              <AttachmentConfirmCard
                fileName={pendingAttachment.file.name}
                sizeBytes={pendingAttachment.file.size}
                mimeType={pendingAttachment.file.type || "unknown"}
                patientName={patientsById.get(pendingAttachment.patientId)?.name ?? "Patient"}
                category={attachmentCategory}
                onCategoryChange={setAttachmentCategory}
                busy={attachBusy}
                error={attachErr}
                onCancel={() => {
                  setPendingAttachment(null)
                  setAttachmentCategory("")
                  setAttachErr(null)
                }}
                onConfirm={() => void confirmAttachmentUpload()}
              />
            </div>
          ) : null}
          <div className="flex items-center gap-2 px-3 py-2.5">
            <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
              <Sparkle className="size-4" weight="fill" />
            </div>
            <div className="min-w-0 flex-1">
              <MentionInput
                value={input}
                onChange={setInput}
                onContextAdd={addPatientContext}
                placeholder={
                  patientContext.length > 0
                    ? "Ask about them, or pick a suggestion…"
                    : "Ask anything, or @mention a patient…"
                }
                rows={1}
                disabled={busy}
                onFocus={() => setFocused(true)}
                onBlur={() => setFocused(false)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault()
                    if (bookingFlow || rescheduleFlow) return
                    onFormSubmit()
                  }
                }}
                className="min-h-[22px] border-0 bg-transparent px-0 py-1 text-[14px] leading-[1.5] shadow-none placeholder:text-muted-foreground/50 focus:border-0 focus:ring-0"
              />
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <input ref={micRef} type="file" accept="audio/*" className="hidden" onChange={onMicFile} />
              <button
                type="button"
                disabled={busy || !primaryPatientId}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  if (!primaryPatientId) {
                    setInput((prev) => (prev.trim() ? prev : "@mention a patient to attach files."))
                    return
                  }
                  setFilePickerCtx({ patientId: primaryPatientId, context: "attachment", description: null })
                  requestAnimationFrame(() => filePickerRef.current?.click())
                }}
                className="flex size-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground disabled:opacity-40"
                title="Attach file"
              >
                <Paperclip className="size-4" />
              </button>
              <button
                type="button"
                disabled={micBusy || busy}
                onClick={() => micRef.current?.click()}
                className="flex size-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground disabled:opacity-40"
                title="Voice"
              >
                <Microphone className="size-4" />
              </button>
              <motion.button
                type="submit"
                disabled={busy || !hasInput || flowAwaitingConfirm}
                whileTap={{ scale: 0.92 }}
                className={cn(
                  "flex size-8 items-center justify-center rounded-full transition-all",
                  hasInput && !busy
                    ? "bg-primary text-primary-foreground shadow-sm hover:bg-primary/90"
                    : "bg-muted text-muted-foreground"
                )}
                title="Send"
              >
                <ArrowUp className="size-4" weight="bold" />
              </motion.button>
            </div>
          </div>

          <AnimatePresence initial={false}>
            {showChips && (
              <motion.div
                key="chips"
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.16, ease: "easeOut" }}
                className="overflow-hidden border-t border-border"
              >
                <div className="flex items-center gap-1.5 px-3 py-1.5">
                  <div className="flex flex-1 flex-wrap gap-1">
                    {suggestionChips.map((c) => (
                      <button
                        key={c}
                        type="button"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() =>
                          setInput((prev) => {
                            const t = prev.trim()
                            if (!t) return c
                            return `${t}${t.endsWith(" ") ? "" : " "}${c}`
                          })
                        }
                        className="rounded-full bg-muted px-2.5 py-1 text-[11px] text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
                      >
                        {c}
                      </button>
                    ))}
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    {messages.length > 0 ? (
                      <button
                        type="button"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => setHistoryOpen(!historyOpen)}
                        className="rounded-full px-2 py-1 text-[10px] text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                      >
                        {historyOpen ? "Hide" : `${messages.length} msg`}
                      </button>
                    ) : null}
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.form>
      </div>
    </div>
  )
}

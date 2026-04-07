"use client"

import { create } from "zustand"
import { persist, createJSONStorage } from "zustand/middleware"

export type ChecklistStepId =
  | "profile"
  | "services"
  | "whatsapp"
  | "voice"
  | "labs"
  | "medikredit"
  | "ai_settings"

export type StepStatus = "pending" | "in_progress" | "done" | "waiting"

export interface ChecklistStep {
  id: ChecklistStepId
  label: string
  description: string
  status: StepStatus
  /** For async steps: when we started waiting. */
  waitingSince?: string
  /** For async steps: estimated days until resolution. */
  waitDays?: number
}

const DEFAULT_STEPS: ChecklistStep[] = [
  {
    id: "profile",
    label: "Practice profile",
    description: "BHF number, HPCSA, practice details",
    status: "pending",
  },
  {
    id: "services",
    label: "Services & pricing",
    description: "Upload a spreadsheet or add manually",
    status: "pending",
  },
  {
    id: "whatsapp",
    label: "WhatsApp agent",
    description: "Connect WhatsApp for patient comms",
    status: "pending",
  },
  {
    id: "voice",
    label: "AI voice agent",
    description: "Outbound check-ins & inbound bookings",
    status: "pending",
  },
  {
    id: "labs",
    label: "Lab connections",
    description: "Lancet, Ampath, X-ray partners",
    status: "pending",
  },
  {
    id: "medikredit",
    label: "Medikredit verification",
    description: "Submit for billing switch clearance",
    status: "pending",
  },
  {
    id: "ai_settings",
    label: "AI & connectors",
    description: "Clinical AI behaviour, integrations",
    status: "pending",
  },
]

interface ChecklistState {
  steps: ChecklistStep[]
  expandedStep: ChecklistStepId | null
  /** Full-screen / large modal for comfortable data entry */
  panelOpen: boolean
  minimized: boolean
  setStepStatus: (id: ChecklistStepId, status: StepStatus, extra?: Partial<ChecklistStep>) => void
  setExpandedStep: (id: ChecklistStepId | null) => void
  openPanel: (stepId?: ChecklistStepId | null) => void
  closePanel: () => void
  setMinimized: (v: boolean) => void
  resetChecklist: () => void
  completedCount: () => number
  totalCount: () => number
}

export const useChecklistStore = create<ChecklistState>()(
  persist(
    (set, get) => ({
      steps: DEFAULT_STEPS,
      expandedStep: null,
      panelOpen: false,
      minimized: false,

      setStepStatus: (id, status, extra) =>
        set((s) => ({
          steps: s.steps.map((step) =>
            step.id === id ? { ...step, status, ...extra } : step
          ),
        })),

      setExpandedStep: (id) => set({ expandedStep: id, minimized: false }),

      openPanel: (stepId) =>
        set((s) => {
          const nextId =
            stepId ??
            s.steps.find((st) => st.status !== "done" && st.status !== "waiting")?.id ??
            s.steps[0]?.id ??
            null
          return {
            panelOpen: true,
            expandedStep: nextId,
            minimized: false,
          }
        }),

      closePanel: () => set({ panelOpen: false }),

      setMinimized: (v) =>
        set((s) => ({
          minimized: v,
          ...(v ? { panelOpen: false } : {}),
        })),

      resetChecklist: () =>
        set({ steps: DEFAULT_STEPS, expandedStep: null, minimized: false, panelOpen: false }),

      completedCount: () => {
        const s = get().steps
        return s.filter((x) => x.status === "done" || x.status === "waiting").length
      },
      totalCount: () => get().steps.length,
    }),
    {
      name: "fleming:onboarding-checklist",
      storage: createJSONStorage(() => {
        if (typeof window !== "undefined") return localStorage
        return {
          getItem: () => null,
          setItem: () => {},
          removeItem: () => {},
          length: 0,
          clear: () => {},
          key: () => null,
        } satisfies Storage
      }),
      partialize: (s) => ({
        steps: s.steps,
        minimized: s.minimized,
      }),
    }
  )
)

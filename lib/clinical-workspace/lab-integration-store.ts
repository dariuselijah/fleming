"use client"

import { create } from "zustand"
import { persist, createJSONStorage } from "zustand/middleware"

export type LabIntegrationStatus = "active" | "pending" | "inactive"

export const LAB_PARTNER_DEFS = [
  { id: "lancet", label: "Lancet" },
  { id: "ampath", label: "Ampath" },
  { id: "pathcare", label: "PathCare" },
] as const

export type LabPartnerId = (typeof LAB_PARTNER_DEFS)[number]["id"]

const DEFAULT_STATUSES: Record<LabPartnerId, LabIntegrationStatus> = {
  lancet: "pending",
  ampath: "pending",
  pathcare: "pending",
}

interface LabIntegrationState {
  statuses: Record<string, LabIntegrationStatus>
  setPartnerStatus: (id: string, status: LabIntegrationStatus) => void
}

export const useLabIntegrationStore = create<LabIntegrationState>()(
  persist(
    (set) => ({
      statuses: { ...DEFAULT_STATUSES },
      setPartnerStatus: (id, status) =>
        set((s) => ({
          statuses: { ...s.statuses, [id]: status },
        })),
    }),
    {
      name: "fleming:lab-integrations",
      storage: createJSONStorage(() => localStorage),
    }
  )
)

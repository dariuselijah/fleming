"use client"

import { create } from "zustand"
import { subscribeWithSelector } from "zustand/middleware"
import { useWorkspaceStore } from "@/lib/clinical-workspace"
import { fetchClient } from "@/lib/fetch"
import type { FrontDeskInvoiceRow } from "./front-desk-invoice"
import {
  assembleWorkQueueItems,
  buildClaimChildItems,
  computePracticePulse,
  filterCounts,
  filterWorkQueueItems,
  flattenWorkQueueList,
} from "./work-queue-assembler"
import { onWorkQueueThreadsRefresh } from "./work-queue-refresh-bus"
import type {
  CommsThreadRow,
  ImportPayload,
  PracticePulseCounts,
  WorkQueueFilter,
  WorkQueueItem,
} from "./work-queue-types"

interface WorkQueueState {
  filter: WorkQueueFilter
  selectedId: string | null
  threads: CommsThreadRow[]
  threadsLoading: boolean
  threadsError: string | null
  importItems: ImportPayload[]
  invoices: FrontDeskInvoiceRow[]
  invoicesLoading: boolean
  resolvedIds: Set<string>
  expandedGroupIds: Set<string>
  panelWidth: number
  aiResolvedToday: number
  importModalOpen: boolean
  smsComposeOpen: boolean
  smsComposePrefill: {
    patientId?: string
    phone?: string
    message?: string
  } | null
  channelStatus: {
    smsConnected: boolean
    voiceConnected: boolean
    emailConnected: boolean
    loaded: boolean
  }

  setFilter: (filter: WorkQueueFilter) => void
  selectItem: (id: string | null) => void
  toggleGroupExpanded: (groupId: string) => void
  setPanelWidth: (width: number) => void
  resolveItem: (id: string) => void
  addImportItem: (item: ImportPayload) => void
  refreshThreads: () => Promise<void>
  refreshInvoices: () => Promise<void>
  refreshChannelStatus: () => Promise<void>
  incrementAiResolved: () => void
  setImportModalOpen: (open: boolean) => void
  setSmsComposeOpen: (
    open: boolean,
    prefill?: { patientId?: string; phone?: string; message?: string } | null
  ) => void
}

const DEFAULT_PANEL_WIDTH = 400
const MIN_PANEL_WIDTH = 300
const MAX_PANEL_WIDTH = 560

export const useWorkQueueStore = create<WorkQueueState>()(
  subscribeWithSelector((set, get) => ({
    filter: "all",
    selectedId: null,
    threads: [],
    threadsLoading: true,
    threadsError: null,
    importItems: [],
    invoices: [],
    invoicesLoading: false,
    resolvedIds: new Set<string>(),
    expandedGroupIds: new Set<string>(),
    panelWidth: DEFAULT_PANEL_WIDTH,
    aiResolvedToday: 0,
    importModalOpen: false,
    smsComposeOpen: false,
    smsComposePrefill: null,
    channelStatus: {
      smsConnected: false,
      voiceConnected: false,
      emailConnected: false,
      loaded: false,
    },

    setFilter: (filter) => set({ filter }),
    selectItem: (id) => set({ selectedId: id }),

    toggleGroupExpanded: (groupId) => {
      set((s) => {
        const expandedGroupIds = new Set(s.expandedGroupIds)
        if (expandedGroupIds.has(groupId)) expandedGroupIds.delete(groupId)
        else expandedGroupIds.add(groupId)
        return { expandedGroupIds }
      })
    },

    setPanelWidth: (width) =>
      set({ panelWidth: Math.min(MAX_PANEL_WIDTH, Math.max(MIN_PANEL_WIDTH, width)) }),

    resolveItem: (id) => {
      set((s) => {
        const resolvedIds = new Set(s.resolvedIds)
        resolvedIds.add(id)
        return { resolvedIds, selectedId: s.selectedId === id ? null : s.selectedId }
      })
    },

    addImportItem: (item) => {
      set((s) => ({
        importItems: [item, ...s.importItems.filter((i) => i.importId !== item.importId)],
      }))
    },

    incrementAiResolved: () => set((s) => ({ aiResolvedToday: s.aiResolvedToday + 1 })),

    setImportModalOpen: (open) => set({ importModalOpen: open }),
    setSmsComposeOpen: (open, prefill = null) =>
      set({ smsComposeOpen: open, smsComposePrefill: open ? (prefill ?? null) : null }),

    refreshChannelStatus: async () => {
      try {
        const [provRes, emailRes] = await Promise.all([
          fetch("/api/comms/provision/status"),
          fetch("/api/comms/email/settings"),
        ])
        let smsConnected = false
        let voiceConnected = false
        if (provRes.ok) {
          const j = (await provRes.json()) as { channels?: { channel_type: string; status: string; phone_number_sid?: string }[] }
          for (const ch of j.channels ?? []) {
            const live = ch.status === "active" || Boolean(ch.phone_number_sid)
            if (ch.channel_type === "rcs" || ch.channel_type === "sms") smsConnected = smsConnected || live
            if (ch.channel_type === "voice") voiceConnected = voiceConnected || live
          }
        }
        let emailConnected = false
        if (emailRes.ok) {
          const j = (await emailRes.json()) as { enabled?: boolean }
          emailConnected = Boolean(j.enabled)
        }
        set({
          channelStatus: { smsConnected, voiceConnected, emailConnected, loaded: true },
        })
      } catch {
        set((s) => ({ channelStatus: { ...s.channelStatus, loaded: true } }))
      }
    },

    refreshThreads: async () => {
      set({ threadsLoading: get().threads.length === 0, threadsError: null })
      try {
        const res = await fetch("/api/comms/threads")
        if (!res.ok) {
          const j = (await res.json().catch(() => ({}))) as { error?: string }
          set({ threadsError: j.error || `Could not load threads (${res.status})`, threadsLoading: false })
          return
        }
        const data = (await res.json()) as { threads?: CommsThreadRow[] }
        set({ threads: data.threads ?? [], threadsLoading: false, threadsError: null })
      } catch {
        set({ threadsError: "Network error loading conversations", threadsLoading: false })
      }
    },

    refreshInvoices: async () => {
      set({ invoicesLoading: true })
      try {
        const res = await fetchClient("/api/billing/invoices")
        if (res.ok) {
          const j = (await res.json()) as { invoices?: FrontDeskInvoiceRow[] }
          set({ invoices: j.invoices ?? [], invoicesLoading: false })
        } else {
          set({ invoicesLoading: false })
        }
      } catch {
        set({ invoicesLoading: false })
      }
    },
  }))
)

let threadRefreshBound = false

export function bindWorkQueueThreadRefresh(): () => void {
  if (typeof window === "undefined") return () => {}
  if (!threadRefreshBound) {
    threadRefreshBound = true
    onWorkQueueThreadsRefresh(() => {
      void useWorkQueueStore.getState().refreshThreads()
    })
  }
  return () => {}
}

export function useWorkQueueDerived(): {
  items: WorkQueueItem[]
  filtered: WorkQueueItem[]
  displayList: WorkQueueItem[]
  pulse: PracticePulseCounts
  counts: Record<WorkQueueFilter, number>
  selected: WorkQueueItem | null
} {
  const threads = useWorkQueueStore((s) => s.threads)
  const importItems = useWorkQueueStore((s) => s.importItems)
  const invoices = useWorkQueueStore((s) => s.invoices)
  const resolvedIds = useWorkQueueStore((s) => s.resolvedIds)
  const expandedGroupIds = useWorkQueueStore((s) => s.expandedGroupIds)
  const filter = useWorkQueueStore((s) => s.filter)
  const selectedId = useWorkQueueStore((s) => s.selectedId)

  const inboxMessages = useWorkspaceStore((s) => s.inboxMessages)
  const claims = useWorkspaceStore((s) => s.claims)
  const notifications = useWorkspaceStore((s) => s.notifications)
  const patients = useWorkspaceStore((s) => s.patients)
  const inventory = useWorkspaceStore((s) => s.inventory)
  const appointments = useWorkspaceStore((s) => s.appointments)

  const items = assembleWorkQueueItems({
    threads,
    inboxMessages,
    claims,
    notifications,
    importItems,
    patients,
    inventory,
    appointments,
    invoices,
    resolvedIds,
  })
  const filtered = filterWorkQueueItems(items, filter)
  const displayList = flattenWorkQueueList(filtered, expandedGroupIds)
  const pulse = computePracticePulse(items, claims, inventory, patients)
  const counts = filterCounts(items)
  const selected = selectedId
    ? items.find((i) => i.id === selectedId) ??
      displayList.find((i) => i.id === selectedId) ??
      (() => {
        for (const item of items) {
          if (item.type === "claim_group") {
            const child = buildClaimChildItems(item).find((c) => c.id === selectedId)
            if (child) return child
          }
        }
        return null
      })()
    : null

  return { items, filtered, displayList, pulse, counts, selected }
}

export { MIN_PANEL_WIDTH, MAX_PANEL_WIDTH, DEFAULT_PANEL_WIDTH }

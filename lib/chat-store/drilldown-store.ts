"use client"

import type { ChartDrilldownPayload } from "@/app/components/charts/chat-chart"
import type { EvidenceCitation } from "@/lib/evidence/types"
import { create } from "zustand"
import { createJSONStorage, persist } from "zustand/middleware"

export type DrilldownCacheEntry = {
  pointId: string
  payload: ChartDrilldownPayload
  query: string
  response: string
  citations: EvidenceCitation[]
  cachedAt: number
  isAddedToDiscussion: boolean
}

type DrilldownCacheStore = {
  entries: Record<string, DrilldownCacheEntry>
  latestAddedPointId: string | null
  setEntry: (entry: Omit<DrilldownCacheEntry, "isAddedToDiscussion"> & {
    isAddedToDiscussion?: boolean
  }) => void
  markAddedToDiscussion: (pointId: string, value: boolean) => void
  touchLatestAdded: (pointId: string | null) => void
  clearEntry: (pointId: string) => void
}

const STORAGE_KEY = "chat:drilldown-cache:v2"

export const useDrilldownCacheStore = create<DrilldownCacheStore>()(
  persist(
    (set, get) => ({
      entries: {},
      latestAddedPointId: null,
      setEntry: (entry) => {
        set((state) => {
          const existing = state.entries[entry.pointId]
          const nextEntry: DrilldownCacheEntry = {
            pointId: entry.pointId,
            payload: entry.payload,
            query: entry.query,
            response: entry.response,
            citations: Array.isArray(entry.citations) ? entry.citations : [],
            cachedAt:
              typeof entry.cachedAt === "number" && Number.isFinite(entry.cachedAt)
                ? entry.cachedAt
                : Date.now(),
            isAddedToDiscussion:
              typeof entry.isAddedToDiscussion === "boolean"
                ? entry.isAddedToDiscussion
                : existing?.isAddedToDiscussion || false,
          }
          return {
            entries: {
              ...state.entries,
              [entry.pointId]: nextEntry,
            },
            latestAddedPointId:
              nextEntry.isAddedToDiscussion && !state.latestAddedPointId
                ? entry.pointId
                : state.latestAddedPointId,
          }
        })
      },
      markAddedToDiscussion: (pointId, value) => {
        const existing = get().entries[pointId]
        if (!existing) return
        set((state) => ({
          entries: {
            ...state.entries,
            [pointId]: {
              ...existing,
              isAddedToDiscussion: value,
            },
          },
          latestAddedPointId: value
            ? pointId
            : state.latestAddedPointId === pointId
              ? null
              : state.latestAddedPointId,
        }))
      },
      touchLatestAdded: (pointId) => {
        set(() => ({
          latestAddedPointId: pointId,
        }))
      },
      clearEntry: (pointId) => {
        set((state) => {
          const nextEntries = { ...state.entries }
          delete nextEntries[pointId]
          return {
            entries: nextEntries,
            latestAddedPointId:
              state.latestAddedPointId === pointId ? null : state.latestAddedPointId,
          }
        })
      },
    }),
    {
      name: STORAGE_KEY,
      storage: createJSONStorage(() => sessionStorage),
      partialize: (state) => ({
        entries: state.entries,
        latestAddedPointId: state.latestAddedPointId,
      }),
    }
  )
)

function normalizeScalar(value: unknown): string {
  if (typeof value === "number" && Number.isFinite(value)) return String(value)
  if (typeof value === "string") return value.trim().toLowerCase()
  return ""
}

export function buildDataPointId(payload: ChartDrilldownPayload): string {
  const chart = normalizeScalar(payload.chartTitle || payload.chartType || "chart")
  const xKey = normalizeScalar(payload.xKey || "x")
  const xValue = normalizeScalar(payload.xValue)
  const series = normalizeScalar(payload.seriesKey || payload.seriesLabel || "series")
  const value = normalizeScalar(payload.value)
  const source = normalizeScalar(payload.source || "source")
  return [chart, source, xKey, xValue, series, value].join("|")
}

export function getDrilldownCacheEntry(pointId: string): DrilldownCacheEntry | null {
  return useDrilldownCacheStore.getState().entries[pointId] || null
}

export function setDrilldownCacheEntry(
  entry: Omit<DrilldownCacheEntry, "isAddedToDiscussion"> & {
    isAddedToDiscussion?: boolean
  }
): void {
  useDrilldownCacheStore.getState().setEntry(entry)
}

export function markDrilldownEntryAdded(pointId: string, added = true): void {
  useDrilldownCacheStore.getState().markAddedToDiscussion(pointId, added)
}

export function getLatestAddedDrilldownEntry(): DrilldownCacheEntry | null {
  const state = useDrilldownCacheStore.getState()
  if (!state.latestAddedPointId) return null
  return state.entries[state.latestAddedPointId] || null
}

export function clearDrilldownCacheEntry(pointId: string): void {
  useDrilldownCacheStore.getState().clearEntry(pointId)
}

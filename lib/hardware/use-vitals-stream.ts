"use client"

import { useCallback, useEffect, useRef } from "react"
import { useWorkspaceStore } from "@/lib/clinical-workspace/workspace-store"
import { createVitalsBus, type VitalsBusEvent } from "./vitals-bus"

interface UseVitalsStreamOptions {
  patientId: string | null
  enabled: boolean
  simulate?: boolean
  simulationIntervalMs?: number
}

/**
 * Connects the VitalsBus hardware abstraction to the workspace store.
 * Incoming readings are automatically added to the active patient's vitals.
 */
export function useVitalsStream({
  patientId,
  enabled,
  simulate = false,
  simulationIntervalMs = 10000,
}: UseVitalsStreamOptions) {
  const busRef = useRef(createVitalsBus())

  useEffect(() => {
    if (!enabled || !patientId) return

    const bus = busRef.current

    const unsubscribe = bus.on((event: VitalsBusEvent) => {
      if (event.type === "reading") {
        useWorkspaceStore.getState().addVitalReading(patientId, event.reading)
      }
    })

    if (simulate) {
      bus.startSimulation(simulationIntervalMs)
    }

    return () => {
      unsubscribe()
      bus.stopSimulation()
    }
  }, [enabled, patientId, simulate, simulationIntervalMs])

  const triggerManualReading = useCallback(
    (overrides: Partial<Parameters<typeof busRef.current.simulateReading>[0]> = {}) => {
      return busRef.current.simulateReading(overrides)
    },
    []
  )

  return { triggerManualReading, bus: busRef.current }
}

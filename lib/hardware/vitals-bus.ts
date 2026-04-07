import type { VitalReading } from "@/lib/clinical-workspace/types"

export type VitalsBusEvent = {
  type: "reading"
  reading: VitalReading
}

type VitalsBusListener = (event: VitalsBusEvent) => void

/**
 * VitalsBus — abstraction for receiving vitals from hardware devices.
 *
 * In a Tauri/Electron desktop build, this would bridge to native BLE/USB APIs.
 * On the web, it provides a simulation interface for demo and testing.
 *
 * Usage:
 *   const bus = createVitalsBus()
 *   bus.on((event) => { ... })
 *   bus.simulateReading({ type: 'heart_rate', value: 72, ... })
 *   bus.destroy()
 */
class VitalsBus {
  private listeners = new Set<VitalsBusListener>()
  private simulationTimer: NodeJS.Timeout | null = null

  on(listener: VitalsBusListener): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  private emit(event: VitalsBusEvent) {
    this.listeners.forEach((fn) => fn(event))
  }

  simulateReading(overrides: Partial<VitalReading> = {}) {
    const reading: VitalReading = {
      id: `hw-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      type: "heart_rate",
      value: 72 + Math.floor(Math.random() * 20 - 10),
      unit: "bpm",
      timestamp: new Date(),
      source: "device",
      deviceName: "Simulated BLE Monitor",
      committed: false,
      ...overrides,
    }
    this.emit({ type: "reading", reading })
    return reading
  }

  /**
   * Start a continuous simulation that emits periodic vitals.
   * Useful for demos and testing the floating pill UI.
   */
  startSimulation(intervalMs = 8000) {
    this.stopSimulation()

    const types: Array<{
      type: VitalReading["type"]
      value: () => number
      secondaryValue?: () => number
      unit: string
    }> = [
      { type: "heart_rate", value: () => 68 + Math.floor(Math.random() * 20), unit: "bpm" },
      {
        type: "blood_pressure",
        value: () => 115 + Math.floor(Math.random() * 20),
        secondaryValue: () => 72 + Math.floor(Math.random() * 10),
        unit: "mmHg",
      },
      { type: "spo2", value: () => 95 + Math.floor(Math.random() * 5), unit: "%" },
      { type: "temperature", value: () => 36.4 + Math.random() * 1.2, unit: "°C" },
      { type: "respiratory_rate", value: () => 14 + Math.floor(Math.random() * 6), unit: "/min" },
    ]

    let index = 0
    this.simulationTimer = setInterval(() => {
      const spec = types[index % types.length]
      this.simulateReading({
        type: spec.type,
        value: Math.round(spec.value() * 10) / 10,
        secondaryValue: spec.secondaryValue
          ? Math.round(spec.secondaryValue() * 10) / 10
          : undefined,
        unit: spec.unit,
      })
      index++
    }, intervalMs)
  }

  stopSimulation() {
    if (this.simulationTimer) {
      clearInterval(this.simulationTimer)
      this.simulationTimer = null
    }
  }

  destroy() {
    this.stopSimulation()
    this.listeners.clear()
  }
}

let busInstance: VitalsBus | null = null

export function createVitalsBus(): VitalsBus {
  if (!busInstance) {
    busInstance = new VitalsBus()
  }
  return busInstance
}

export function getVitalsBus(): VitalsBus | null {
  return busInstance
}

/** Representative devices and integration paths — for UI catalog (not live pairing yet). */

export type VitalsDeviceCategory = "bp" | "spo2" | "thermometer" | "scale" | "glucose" | "ecg"

export interface VitalsDeviceCatalogEntry {
  id: string
  category: VitalsDeviceCategory
  name: string
  manufacturer: string
  connection: string
  notes?: string
}

export const VITALS_DEVICE_CATALOG: VitalsDeviceCatalogEntry[] = [
  {
    id: "omron-evolv",
    category: "bp",
    name: "Omron Evolv / M7 Intelli IT",
    manufacturer: "Omron",
    connection: "Bluetooth LE (custom app bridge) · some models Continua",
    notes: "Often paired via vendor mobile SDK; Web Bluetooth limited without bridge.",
  },
  {
    id: "withings-bpm",
    category: "bp",
    name: "Withings BPM Connect",
    manufacturer: "Withings",
    connection: "Wi‑Fi / Bluetooth · Health data API",
  },
  {
    id: "contour-next",
    category: "glucose",
    name: "Contour Next One",
    manufacturer: "Ascensia",
    connection: "Bluetooth LE · vendor app",
  },
  {
    id: "nonin-3230",
    category: "spo2",
    name: "Nonin 3230 OEM",
    manufacturer: "Nonin",
    connection: "Serial / USB · BLE on select models",
  },
  {
    id: "braun-thermo",
    category: "thermometer",
    name: "Braun ThermoScan Pro",
    manufacturer: "Braun",
    connection: "Bluetooth on Pro models · manual entry fallback",
  },
  {
    id: "withings-body",
    category: "scale",
    name: "Withings Body+",
    manufacturer: "Withings",
    connection: "Wi‑Fi · Withings API / Apple Health export",
  },
  {
    id: "apple-watch",
    category: "spo2",
    name: "Apple Watch (SpO₂ / HR)",
    manufacturer: "Apple",
    connection: "HealthKit (iOS) · export to FHIR / app",
  },
  {
    id: "generic-ble-bp",
    category: "bp",
    name: "Standard BLE blood pressure (IEEE 11073 / custom GATT)",
    manufacturer: "Various",
    connection: "Web Bluetooth (Chromium) · user gesture required",
  },
]

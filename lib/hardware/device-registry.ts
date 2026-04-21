export type DeviceType =
  | "blood_pressure_monitor"
  | "pulse_oximeter"
  | "thermometer"
  | "glucometer"
  | "ecg_monitor"
  | "weight_scale"
  | "multi_parameter"

export type ConnectionType = "bluetooth" | "usb" | "wifi" | "simulated"

export interface DeviceProfile {
  id: string
  name: string
  manufacturer: string
  type: DeviceType
  connection: ConnectionType
  vitalTypes: string[]
  protocol?: string
}

const KNOWN_DEVICES: DeviceProfile[] = [
  {
    id: "omron-m7",
    name: "Omron M7 Intelli IT",
    manufacturer: "Omron",
    type: "blood_pressure_monitor",
    connection: "bluetooth",
    vitalTypes: ["blood_pressure", "heart_rate"],
    protocol: "BLE GATT Blood Pressure Profile",
  },
  {
    id: "contec-08a",
    name: "Contec CMS50D+",
    manufacturer: "Contec",
    type: "pulse_oximeter",
    connection: "usb",
    vitalTypes: ["spo2", "heart_rate"],
    protocol: "Serial",
  },
  {
    id: "braun-thermo",
    name: "Braun ThermoScan 7",
    manufacturer: "Braun",
    type: "thermometer",
    connection: "bluetooth",
    vitalTypes: ["temperature"],
    protocol: "BLE GATT Health Thermometer",
  },
  {
    id: "accu-chek",
    name: "Accu-Chek Guide",
    manufacturer: "Roche",
    type: "glucometer",
    connection: "bluetooth",
    vitalTypes: ["glucose"],
    protocol: "BLE GATT Glucose Profile",
  },
  {
    id: "withings-bpm",
    name: "Withings BPM Connect",
    manufacturer: "Withings",
    type: "blood_pressure_monitor",
    connection: "wifi",
    vitalTypes: ["blood_pressure", "heart_rate"],
    protocol: "Withings API",
  },
  {
    id: "sim-multiparameter",
    name: "Simulated Multi-Parameter Monitor",
    manufacturer: "Fleming",
    type: "multi_parameter",
    connection: "simulated",
    vitalTypes: ["heart_rate", "blood_pressure", "spo2", "temperature", "respiratory_rate"],
    protocol: "VitalsBus Simulation",
  },
]

export function getKnownDevices(): DeviceProfile[] {
  return KNOWN_DEVICES
}

export function getDeviceById(id: string): DeviceProfile | undefined {
  return KNOWN_DEVICES.find((d) => d.id === id)
}

export function getDevicesByType(type: DeviceType): DeviceProfile[] {
  return KNOWN_DEVICES.filter((d) => d.type === type)
}

export function getDevicesByVitalType(vitalType: string): DeviceProfile[] {
  return KNOWN_DEVICES.filter((d) => d.vitalTypes.includes(vitalType))
}

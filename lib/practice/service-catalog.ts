/** Shared catalog for appointment services (CPT + ZAR price + default slot duration). Used by calendar modal + assistant booking + slot finder. */
export type ServiceCatalogEntry = {
  name: string
  cpt: string
  price: number
  defaultDurationMinutes: 15 | 30 | 45 | 60
}

export const SERVICE_CATALOG: ServiceCatalogEntry[] = [
  { name: "Consultation", cpt: "0191", price: 580, defaultDurationMinutes: 30 },
  { name: "Follow-up", cpt: "0190", price: 420, defaultDurationMinutes: 15 },
  { name: "Extended Consultation", cpt: "0192", price: 780, defaultDurationMinutes: 45 },
  { name: "Procedure", cpt: "0193", price: 950, defaultDurationMinutes: 45 },
  { name: "ECG", cpt: "3744", price: 180, defaultDurationMinutes: 30 },
  { name: "Blood Draw", cpt: "3739", price: 120, defaultDurationMinutes: 15 },
]

/** Resolve slot/booking duration from a catalog service name, or 30 min default. */
export function durationMinutesForCatalogService(serviceName: string | undefined | null): number {
  if (!serviceName?.trim()) return 30
  const s = SERVICE_CATALOG.find((x) => x.name === serviceName.trim())
  return s?.defaultDurationMinutes ?? 30
}

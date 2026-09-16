export const INVENTORY_WRITE_ROLES = new Set(["owner", "admin", "nurse"])

export type InventoryInput = {
  name?: unknown
  nappiCode?: unknown
  category?: unknown
  currentStock?: unknown
  minStock?: unknown
  unit?: unknown
  unitPrice?: unknown
  costPrice?: unknown
  supplier?: unknown
  expiresAt?: unknown
  lastRestocked?: unknown
}

function finiteNumber(value: unknown, fallback = 0): number {
  const parsed = typeof value === "number" ? value : Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

export function inventoryInsert(input: InventoryInput, practiceId: string) {
  const name = typeof input.name === "string" ? input.name.trim() : ""
  if (!name) return null
  return {
    practice_id: practiceId,
    name,
    nappi_code: typeof input.nappiCode === "string" && input.nappiCode.trim() ? input.nappiCode.trim() : null,
    category: typeof input.category === "string" ? input.category.trim() : "",
    current_stock: Math.max(0, Math.trunc(finiteNumber(input.currentStock))),
    min_stock: Math.max(0, Math.trunc(finiteNumber(input.minStock))),
    unit: typeof input.unit === "string" && input.unit.trim() ? input.unit.trim() : "unit",
    unit_price: Math.max(0, finiteNumber(input.unitPrice)),
    cost_price: input.costPrice == null || input.costPrice === "" ? null : Math.max(0, finiteNumber(input.costPrice)),
    supplier: typeof input.supplier === "string" && input.supplier.trim() ? input.supplier.trim() : null,
    expires_at: typeof input.expiresAt === "string" && input.expiresAt ? input.expiresAt : null,
    last_restocked:
      typeof input.lastRestocked === "string" && input.lastRestocked
        ? input.lastRestocked
        : new Date().toISOString().slice(0, 10),
    updated_at: new Date().toISOString(),
  }
}

export function inventoryDto(row: Record<string, unknown>) {
  return {
    id: String(row.id),
    name: String(row.name ?? ""),
    nappiCode: row.nappi_code ? String(row.nappi_code) : undefined,
    category: String(row.category ?? ""),
    currentStock: Number(row.current_stock ?? 0),
    minStock: Number(row.min_stock ?? 0),
    unit: String(row.unit ?? "unit"),
    unitPrice: Number(row.unit_price ?? 0),
    costPrice: row.cost_price == null ? undefined : Number(row.cost_price),
    supplier: row.supplier ? String(row.supplier) : undefined,
    expiresAt: row.expires_at ? String(row.expires_at) : undefined,
    lastRestocked: row.last_restocked
      ? String(row.last_restocked)
      : new Date().toISOString().slice(0, 10),
  }
}

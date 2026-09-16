import { NextResponse } from "next/server"
import { getAuthenticatedPracticeContextWithRole } from "@/lib/billing/context"
import {
  INVENTORY_WRITE_ROLES,
  inventoryDto,
  inventoryInsert,
  type InventoryInput,
} from "@/lib/admin/inventory-server"

export const runtime = "nodejs"

export async function GET() {
  const ctx = await getAuthenticatedPracticeContextWithRole()
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { data, error } = await ctx.supabase
    .from("practice_inventory_items")
    .select("*")
    .eq("practice_id", ctx.practiceId)
    .order("name", { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ items: (data ?? []).map((row) => inventoryDto(row as Record<string, unknown>)) })
}

export async function POST(req: Request) {
  const ctx = await getAuthenticatedPracticeContextWithRole()
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (!INVENTORY_WRITE_ROLES.has(ctx.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  let body: InventoryInput | { items?: InventoryInput[] }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  const inputs = Array.isArray((body as { items?: InventoryInput[] }).items)
    ? (body as { items: InventoryInput[] }).items.slice(0, 1000)
    : [body as InventoryInput]
  const rows = inputs.map((item) => inventoryInsert(item, ctx.practiceId))
  if (rows.some((row) => !row)) {
    return NextResponse.json({ error: "Every inventory item requires a name" }, { status: 400 })
  }

  const { data, error } = await ctx.supabase
    .from("practice_inventory_items")
    .insert(rows as NonNullable<(typeof rows)[number]>[])
    .select("*")

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  const items = (data ?? []).map((row) => inventoryDto(row as Record<string, unknown>))
  return NextResponse.json({ items, item: items[0] ?? null }, { status: 201 })
}

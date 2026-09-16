import { NextResponse } from "next/server"
import { getAuthenticatedPracticeContextWithRole } from "@/lib/billing/context"
import {
  INVENTORY_WRITE_ROLES,
  inventoryDto,
  inventoryInsert,
  type InventoryInput,
} from "@/lib/admin/inventory-server"

export const runtime = "nodejs"

type Ctx = { params: Promise<{ id: string }> }

export async function PATCH(req: Request, context: Ctx) {
  const ctx = await getAuthenticatedPracticeContextWithRole()
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (!INVENTORY_WRITE_ROLES.has(ctx.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  let body: InventoryInput
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }
  const full = inventoryInsert(body, ctx.practiceId)
  if (!full) return NextResponse.json({ error: "Inventory item requires a name" }, { status: 400 })

  const patch = { ...full }
  Reflect.deleteProperty(patch, "practice_id")
  const { id } = await context.params
  const { data, error } = await ctx.supabase
    .from("practice_inventory_items")
    .update(patch)
    .eq("id", id)
    .eq("practice_id", ctx.practiceId)
    .select("*")
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data) return NextResponse.json({ error: "Inventory item not found" }, { status: 404 })
  return NextResponse.json({ item: inventoryDto(data as Record<string, unknown>) })
}

export async function DELETE(_req: Request, context: Ctx) {
  const ctx = await getAuthenticatedPracticeContextWithRole()
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (!INVENTORY_WRITE_ROLES.has(ctx.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const { id } = await context.params
  const { data, error } = await ctx.supabase
    .from("practice_inventory_items")
    .delete()
    .eq("id", id)
    .eq("practice_id", ctx.practiceId)
    .select("id")
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data) return NextResponse.json({ error: "Inventory item not found" }, { status: 404 })
  return NextResponse.json({ ok: true })
}

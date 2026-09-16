import { NextResponse } from "next/server"
import { getAuthenticatedPracticeContext } from "@/lib/billing/context"

export const runtime = "nodejs"

/** PATCH /api/practice/inbox/[id] — mark read / resolved */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getAuthenticatedPracticeContext()
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id } = await params
  let body: { read?: boolean }
  try {
    body = await req.json()
  } catch {
    body = {}
  }

  const patch: Record<string, unknown> = {}
  if (body.read === true) patch.read_flag = true

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "No updates" }, { status: 400 })
  }

  const { error } = await ctx.supabase
    .from("practice_inbox_messages")
    .update(patch)
    .eq("id", id)
    .eq("practice_id", ctx.practiceId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

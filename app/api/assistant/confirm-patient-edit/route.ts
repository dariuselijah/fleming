import { NextResponse } from "next/server"
import { getAuthenticatedPracticeContextWithRole } from "@/lib/billing/context"
import { insertAssistantEvent } from "@/lib/ai/assistant-audit"

export const runtime = "nodejs"

export async function POST(req: Request) {
  const ctx = await getAuthenticatedPracticeContextWithRole()
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  let body: { patientId?: string; changes?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }
  const patientId = typeof body.patientId === "string" ? body.patientId : ""
  if (!patientId) return NextResponse.json({ error: "patientId required" }, { status: 400 })

  await insertAssistantEvent(ctx.supabase, {
    practiceId: ctx.practiceId,
    actorUserId: ctx.userId,
    threadId: "patient-edit-confirm",
    roleAtEvent: ctx.role,
    kind: "tool_result",
    toolName: "patient_edit_confirmed",
    toolArgs: { patientId, changes: body.changes },
    toolResult: { ok: true },
    toolStatus: "succeeded",
    content: null,
    model: null,
  })

  return NextResponse.json({ ok: true })
}

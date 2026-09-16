import { NextResponse } from "next/server"
import { getAuthenticatedPracticeContext } from "@/lib/billing/context"
import { issueAndSendInvoiceSms } from "@/lib/billing/invoice-delivery"

export const runtime = "nodejs"

type Ctx = { params: Promise<{ id: string }> }

export async function POST(req: Request, context: Ctx) {
  const ctx = await getAuthenticatedPracticeContext()
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const { id: invoiceId } = await context.params

  let body: { channels?: string[]; issueFirst?: boolean; phoneE164?: string }
  try {
    body = await req.json()
  } catch {
    body = {}
  }

  const channels = body.channels ?? ["sms"]
  if (!channels.includes("sms")) {
    return NextResponse.json({ error: "Only SMS channel is supported" }, { status: 400 })
  }

  const result = await issueAndSendInvoiceSms(ctx.supabase, {
    practiceId: ctx.practiceId,
    invoiceId,
    actorUserId: ctx.userId,
    fallbackPhone: typeof body.phoneE164 === "string" ? body.phoneE164 : undefined,
  })

  if (!result.ok) {
    if (result.reason === "not_found") {
      return NextResponse.json({ error: "Invoice not found" }, { status: 404 })
    }
    if (result.reason === "no_phone") {
      return NextResponse.json(
        { error: "Patient has no phone on file. Add a mobile number before sending SMS." },
        { status: 400 }
      )
    }
    return NextResponse.json({ error: result.message ?? "Could not send invoice" }, { status: 500 })
  }

  return NextResponse.json({ ok: true, portalUrl: result.portalUrl })
}

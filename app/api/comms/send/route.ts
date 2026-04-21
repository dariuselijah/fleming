/**
 * Staff outbound patient message (SMS/RCS-capable via Twilio Messaging).
 */
import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { sendSmsMessage, getPracticeMessagingNumber, getOrCreateThread, appendMessage } from "@/lib/comms"
import { BUILTIN_TEMPLATES, interpolateTemplate, sendTemplateMessage } from "@/lib/comms/templates"
import { normalizePhoneE164Za } from "@/lib/comms/patient-phone"

function isBuiltinTemplateKey(k: string): k is keyof typeof BUILTIN_TEMPLATES {
  return k in BUILTIN_TEMPLATES
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    if (!supabase) return NextResponse.json({ error: "Unavailable" }, { status: 500 })

    const {
      data: { user },
      error: authErr,
    } = await supabase.auth.getUser()
    if (authErr || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const { data: membership } = await supabase
      .from("practice_members")
      .select("practice_id")
      .eq("user_id", user.id)
      .limit(1)
      .maybeSingle()

    if (!membership) return NextResponse.json({ error: "No practice found" }, { status: 403 })
    const practiceId = membership.practice_id

    const body = await req.json()
    const { threadId, patientPhone, message, templateKey, variables } = body as {
      threadId?: string
      patientPhone?: string
      message?: string
      templateKey?: string
      variables?: Record<string, string>
    }

    if (!message && !templateKey) {
      return NextResponse.json({ error: "message or templateKey required" }, { status: 400 })
    }
    if (!threadId && !patientPhone) {
      return NextResponse.json({ error: "threadId or patientPhone required" }, { status: 400 })
    }

    const practiceNumber = await getPracticeMessagingNumber(practiceId)
    if (!practiceNumber) {
      return NextResponse.json({ error: "Messaging (RCS/SMS) not configured for this practice" }, { status: 400 })
    }

    let resolvedThreadId = threadId
    let targetPhone = patientPhone ? normalizePhoneE164Za(patientPhone) : ""

    if (threadId && !patientPhone) {
      const db = createAdminClient()
      const { data: thread } = await db
        .from("conversation_threads")
        .select("external_party")
        .eq("id", threadId)
        .single()
      if (!thread) return NextResponse.json({ error: "Thread not found" }, { status: 404 })
      targetPhone = thread.external_party
    }

    if (!resolvedThreadId && targetPhone) {
      const thread = await getOrCreateThread(practiceId, "rcs", targetPhone.replace(/^whatsapp:/, ""))
      resolvedThreadId = thread.id
    }

    const to = targetPhone.replace(/^whatsapp:/, "")

    if (templateKey) {
      if (!isBuiltinTemplateKey(templateKey)) {
        return NextResponse.json({ error: "Unknown templateKey" }, { status: 400 })
      }
      const tmpl = BUILTIN_TEMPLATES[templateKey]
      const n = tmpl.variables.length
      const vars: Record<string, string> = {}
      for (let i = 1; i <= n; i++) {
        const key = String(i)
        const raw = variables?.[key]?.trim()
        if (!raw) {
          return NextResponse.json(
            { error: `Missing template variable ${key} (${tmpl.variables[i - 1] ?? "field"})` },
            { status: 400 }
          )
        }
        vars[key] = raw
      }

      const text = interpolateTemplate(tmpl.body, vars)
      const messageSid = await sendTemplateMessage({
        practiceId,
        from: practiceNumber,
        to,
        templateKey,
        variables: vars,
      })

      await appendMessage({
        threadId: resolvedThreadId!,
        practiceId,
        direction: "outbound",
        senderType: "staff",
        body: text,
        templateName: tmpl.name,
        providerMessageId: messageSid,
        deliveryStatus: "sent",
      })

      return NextResponse.json({ ok: true, messageSid, threadId: resolvedThreadId })
    }

    const text = message!
    const { messageSid } = await sendSmsMessage({
      from: practiceNumber,
      to,
      body: text,
    })

    await appendMessage({
      threadId: resolvedThreadId!,
      practiceId,
      direction: "outbound",
      senderType: "staff",
      body: text,
      providerMessageId: messageSid,
      deliveryStatus: "sent",
    })

    return NextResponse.json({ ok: true, messageSid, threadId: resolvedThreadId })
  } catch (err) {
    console.error("[comms/send] Error:", err)
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}

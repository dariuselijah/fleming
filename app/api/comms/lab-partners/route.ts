import { NextRequest, NextResponse } from "next/server"
import { randomBytes } from "node:crypto"
import { createClient } from "@/lib/supabase/server"
import {
  LAB_PARTNER_DEFS,
  buildLabOutreachEmail,
  labOutreachRecipient,
  sendLabOutreachViaResend,
  type LabPartnerId,
} from "@/lib/comms/lab-partners"

function baseUrlFromRequest(req: NextRequest): string {
  const env = process.env.NEXT_PUBLIC_APP_URL?.trim()
  if (env) return env.replace(/\/$/, "")
  const host = req.headers.get("x-forwarded-host") || req.headers.get("host")
  const proto = req.headers.get("x-forwarded-proto") || "https"
  return host ? `${proto}://${host}` : "http://127.0.0.1:3000"
}

export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient()
    if (!supabase) return NextResponse.json({ error: "Unavailable" }, { status: 500 })

    const { data: { user }, error: authErr } = await supabase.auth.getUser()
    if (authErr || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const { data: membership } = await supabase
      .from("practice_members")
      .select("practice_id")
      .eq("user_id", user.id)
      .limit(1)
      .maybeSingle()

    if (!membership) {
      return NextResponse.json({ partners: LAB_PARTNER_DEFS.map((p) => ({ ...p, row: null })), baseUrl: baseUrlFromRequest(req) })
    }

    const { data: rows } = await supabase
      .from("lab_partner_connections")
      .select(
        "lab_partner, status, inbound_auth_token, last_outreach_at, last_outreach_to, last_outreach_error, updated_at"
      )
      .eq("practice_id", membership.practice_id)

    const byLab = new Map((rows ?? []).map((r) => [r.lab_partner, r]))

    const baseUrl = baseUrlFromRequest(req)
    const partners = LAB_PARTNER_DEFS.map((p) => {
      const row = byLab.get(p.id)
      const inboundUrl = row?.inbound_auth_token
        ? `${baseUrl}/api/integrations/lab/inbound`
        : null
      return {
        ...p,
        row: row
          ? {
              status: row.status,
              inboundUrl,
              bearerToken: row.inbound_auth_token,
              lastOutreachAt: row.last_outreach_at,
              lastOutreachTo: row.last_outreach_to,
              lastOutreachError: row.last_outreach_error,
              updatedAt: row.updated_at,
            }
          : null,
      }
    })

    return NextResponse.json({ partners, baseUrl })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    if (!supabase) return NextResponse.json({ error: "Unavailable" }, { status: 500 })

    const { data: { user }, error: authErr } = await supabase.auth.getUser()
    if (authErr || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const body = (await req.json().catch(() => ({}))) as {
      action?: string
      labPartner?: LabPartnerId
      status?: string
    }

    const { data: membership } = await supabase
      .from("practice_members")
      .select("practice_id")
      .eq("user_id", user.id)
      .limit(1)
      .maybeSingle()

    if (!membership) {
      return NextResponse.json({ error: "No practice membership" }, { status: 400 })
    }

    const practiceId = membership.practice_id

    if (body.action === "set_status" && body.labPartner && body.status) {
      const { error } = await supabase.from("lab_partner_connections").upsert(
        {
          practice_id: practiceId,
          lab_partner: body.labPartner,
          status: body.status,
          doctor_snapshot: [],
          updated_at: new Date().toISOString(),
        },
        { onConflict: "practice_id,lab_partner" }
      )
      if (error) return NextResponse.json({ error: error.message }, { status: 400 })
      return NextResponse.json({ ok: true })
    }

    if (body.action !== "request_outreach" || !body.labPartner) {
      return NextResponse.json({ error: "Invalid action" }, { status: 400 })
    }

    const labPartner = body.labPartner
    if (!LAB_PARTNER_DEFS.some((p) => p.id === labPartner)) {
      return NextResponse.json({ error: "Unknown lab" }, { status: 400 })
    }

    const to = labOutreachRecipient(labPartner)
    if (!to) {
      return NextResponse.json(
        {
          error:
            "No recipient email configured. Set LAB_OUTREACH_*_EMAIL or LAB_INTEGRATIONS_OPS_EMAIL.",
        },
        { status: 400 }
      )
    }

    const from = process.env.LAB_INTEGRATIONS_FROM_EMAIL?.trim()
    if (!from) {
      return NextResponse.json(
        { error: "Set LAB_INTEGRATIONS_FROM_EMAIL (verified sender in Resend)." },
        { status: 400 }
      )
    }

    const { data: practice } = await supabase
      .from("practices")
      .select("name")
      .eq("id", practiceId)
      .single()

    const { data: staff } = await supabase
      .from("practice_staff")
      .select("display_name, role, email")
      .eq("practice_id", practiceId)
      .order("created_at")

    const token = randomBytes(32).toString("hex")
    const doctorSnapshot = (staff ?? []).map((s) => ({
      display_name: s.display_name ?? "Clinician",
      role: s.role,
      email: s.email,
    }))

    const baseUrl = baseUrlFromRequest(req)
    const inboundUrl = `${baseUrl}/api/integrations/lab/inbound`

    const labMeta = LAB_PARTNER_DEFS.find((p) => p.id === labPartner)!
    const { subject, text } = buildLabOutreachEmail({
      practiceName: practice?.name ?? "Practice",
      labLabel: labMeta.label,
      inboundUrl,
      bearerToken: token,
      doctors: doctorSnapshot,
    })

    const send = await sendLabOutreachViaResend({
      from,
      to: [to],
      subject,
      text,
    })

    const now = new Date().toISOString()
    const { error: upErr } = await supabase.from("lab_partner_connections").upsert(
      {
        practice_id: practiceId,
        lab_partner: labPartner,
        status: send.ok ? "outreach_sent" : "not_started",
        inbound_auth_token: token,
        doctor_snapshot: doctorSnapshot,
        last_outreach_at: send.ok ? now : null,
        last_outreach_to: to,
        last_outreach_error: send.ok ? null : send.error,
        updated_at: now,
      },
      { onConflict: "practice_id,lab_partner" }
    )

    if (upErr) return NextResponse.json({ error: upErr.message }, { status: 400 })

    if (!send.ok) {
      return NextResponse.json({
        ok: false,
        emailed: false,
        error: send.error,
        inboundUrl,
      })
    }

    return NextResponse.json({ ok: true, emailed: true, inboundUrl })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}

import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"

/**
 * Lab partner HL7 / result payload ingress (authenticated per practice via Bearer token).
 * Configure this URL + Authorization header in partner routing rules after outreach is approved.
 */
export async function POST(req: Request) {
  const auth = req.headers.get("authorization")
  const token = auth?.replace(/^Bearer\s+/i, "").trim()
  if (!token) {
    return NextResponse.json({ error: "Missing Authorization: Bearer <token>" }, { status: 401 })
  }

  let admin
  try {
    admin = createAdminClient()
  } catch {
    return NextResponse.json({ error: "Server misconfigured" }, { status: 503 })
  }

  const { data: row, error } = await admin
    .from("lab_partner_connections")
    .select("id, practice_id, lab_partner, status")
    .eq("inbound_auth_token", token)
    .maybeSingle()

  if (error || !row) {
    return NextResponse.json({ error: "Invalid token" }, { status: 401 })
  }

  const raw = await req.text()

  // TODO: parse HL7, match patient, enqueue practice_inbox / clinical chart updates.
  return NextResponse.json({
    ok: true,
    receivedBytes: raw.length,
    practiceId: row.practice_id,
    labPartner: row.lab_partner,
    integrationStatus: row.status,
  })
}

export async function GET() {
  return NextResponse.json({
    message: "POST HL7 or partner payload with Authorization: Bearer <token> from lab_partner_connections.",
  })
}

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

  return NextResponse.json(
    {
      ok: false,
      status: "unavailable",
      error:
        "Lab inbound ingestion is not enabled. Supported payload parsing, patient matching, audit logging, and inbox creation must be released together.",
      labPartner: row.lab_partner,
    },
    { status: 503 }
  )
}

export async function GET() {
  return NextResponse.json(
    {
      ok: false,
      status: "unavailable",
      message: "Lab inbound ingestion is not currently available.",
    },
    { status: 503 }
  )
}

import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { createRequestLogger } from "@/lib/observability/server"
import { createHash } from "crypto"

export const runtime = "nodejs"

export async function GET(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const log = createRequestLogger(req, "/api/verify/rx/[token]")
  const { token } = await params
  if (!token?.trim()) {
    return log.withRequestId(
      NextResponse.json({ valid: false, error: "Missing token" }, { status: 400 })
    )
  }

  if (
    process.env.E2E_DISABLE_EXTERNAL_SERVICES === "1" &&
    process.env.NODE_ENV !== "production"
  ) {
    log.info("prescription_verification_test_miss")
    return log.withRequestId(
      NextResponse.json({ valid: false, error: "Not found" })
    )
  }

  const tokenHash = createHash("sha256").update(token).digest("hex")
  let supabase: ReturnType<typeof createAdminClient>
  try {
    supabase = createAdminClient()
  } catch (error) {
    log.error("prescription_verification_unavailable", { error })
    return log.withRequestId(
      NextResponse.json({ valid: false, error: "Verification unavailable" }, { status: 503 })
    )
  }

  const { data: row, error } = await supabase
    .from("practice_prescription_verifications")
    .select("id, practice_id, prescriber_name, issued_at, expires_at, status")
    .eq("token_hash", tokenHash)
    .maybeSingle()

  if (error || !row) {
    log.info("prescription_verification_miss", { databaseError: Boolean(error) })
    return log.withRequestId(
      NextResponse.json({ valid: false, error: "Not found" })
    )
  }

  const expired = new Date(String(row.expires_at)).getTime() < Date.now()
  const revoked = row.status === "revoked"
  const dispensed = row.status === "dispensed"
  const valid = !expired && !revoked && row.status === "active"

  const { data: practice } = await supabase
    .from("practices")
    .select("name")
    .eq("id", row.practice_id)
    .maybeSingle()

  const practiceName = (practice?.name as string | undefined) ?? "Medical practice"

  log.info("prescription_verification_complete", {
    valid,
    expired,
    dispensed,
    revoked,
  })
  return log.withRequestId(
    NextResponse.json({
      valid,
      expired,
      dispensed,
      revoked,
      practiceName,
      prescriberName: row.prescriber_name ?? undefined,
      issuedAt: row.issued_at,
      status: row.status,
    })
  )
}

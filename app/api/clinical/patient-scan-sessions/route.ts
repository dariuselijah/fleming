import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import {
  hashPatientScanToken,
  newPatientScanTokenRaw,
  normalizePatientScanSessionRow,
  patientScanUrlForToken,
} from "@/lib/clinical/patient-scan-session"

const SESSION_TTL_MINUTES = 15

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    if (!supabase) {
      return NextResponse.json({ error: "Supabase unavailable" }, { status: 500 })
    }

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = (await request.json().catch(() => ({}))) as { practiceId?: string }
    const practiceId = body.practiceId?.trim()
    if (!practiceId) {
      return NextResponse.json({ error: "practiceId is required" }, { status: 400 })
    }

    const rawToken = newPatientScanTokenRaw()
    const tokenHash = hashPatientScanToken(rawToken)
    const expiresAt = new Date(Date.now() + SESSION_TTL_MINUTES * 60 * 1000).toISOString()
    const db = supabase as any

    const { data, error } = await db
      .from("patient_scan_sessions")
      .insert({
        practice_id: practiceId,
        created_by: user.id,
        token_hash: tokenHash,
        expires_at: expiresAt,
      })
      .select("id,status,documents,extracted_fields,prefill,missing_fields,error,expires_at")
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    const scanUrl = patientScanUrlForToken(rawToken)
    return NextResponse.json({ session: normalizePatientScanSessionRow(data, scanUrl) })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not create scan session" },
      { status: 500 }
    )
  }
}

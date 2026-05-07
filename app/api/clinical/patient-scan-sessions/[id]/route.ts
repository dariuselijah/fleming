import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { normalizePatientScanSessionRow } from "@/lib/clinical/patient-scan-session"

type RouteContext = {
  params: Promise<{ id: string }>
}

export async function GET(_request: Request, context: RouteContext) {
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

    const { id } = await context.params
    const db = supabase as any
    const { data, error } = await db
      .from("patient_scan_sessions")
      .select("id,status,documents,extracted_fields,prefill,missing_fields,error,expires_at")
      .eq("id", id)
      .maybeSingle()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    if (!data) return NextResponse.json({ error: "Scan session not found" }, { status: 404 })

    return NextResponse.json({ session: normalizePatientScanSessionRow(data) })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not load scan session" },
      { status: 500 }
    )
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
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

    const { id } = await context.params
    const db = supabase as any
    const { error } = await db
      .from("patient_scan_sessions")
      .update({ status: "cancelled" })
      .eq("id", id)
      .in("status", ["created", "opened", "processing", "error"])

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json({ success: true })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not cancel scan session" },
      { status: 500 }
    )
  }
}

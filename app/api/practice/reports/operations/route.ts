import { NextResponse } from "next/server"
import { getAuthenticatedPracticeContextWithRole } from "@/lib/billing/context"
import { mapPracticeClaimRow } from "@/lib/clinical-workspace/map-practice-claim"

export const runtime = "nodejs"

export async function GET() {
  const ctx = await getAuthenticatedPracticeContextWithRole()
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const since = new Date()
  since.setMonth(since.getMonth() - 13)

  const [{ data: patientRows, error: patientError }, claimResult] = await Promise.all([
    ctx.supabase
      .from("practice_patients")
      .select("id, display_name_hint")
      .eq("practice_id", ctx.practiceId),
    ctx.supabase
      .from("practice_claims")
      .select("*", { count: "exact" })
      .eq("practice_id", ctx.practiceId)
      .gte("created_at", since.toISOString())
      .order("created_at", { ascending: false })
      .limit(5000),
  ])

  if (patientError) return NextResponse.json({ error: patientError.message }, { status: 500 })
  if (claimResult.error) return NextResponse.json({ error: claimResult.error.message }, { status: 500 })

  const names = new Map(
    (patientRows ?? []).map((row) => [String(row.id), row.display_name_hint?.trim() || undefined])
  )
  const claims = (claimResult.data ?? []).map((row) => {
    const record = row as Record<string, unknown>
    return mapPracticeClaimRow(record, names.get(String(record.patient_id ?? "")))
  })

  return NextResponse.json(
    {
      claims,
      source: "practice_claims",
      generatedAt: new Date().toISOString(),
      returnedCount: claims.length,
      totalCount: claimResult.count ?? claims.length,
      truncated: (claimResult.count ?? claims.length) > claims.length,
      rangeStart: since.toISOString(),
    },
    { headers: { "Cache-Control": "private, no-store" } }
  )
}

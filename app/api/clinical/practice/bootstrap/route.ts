import { createAdminClient } from "@/lib/supabase/admin"
import { createClient } from "@/lib/supabase/server"
import { NextRequest, NextResponse } from "next/server"

/**
 * Creates a practice row and owner membership for the signed-in user.
 * Uses the service role for inserts: `practices` often has RLS without an authenticated INSERT policy,
 * while `practice_members` is easier to bootstrap after the practice exists.
 */
export async function POST(req: NextRequest) {
  const supabase = await createClient()
  if (!supabase) {
    return NextResponse.json({ error: "Database unavailable" }, { status: 500 })
  }
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  let name = "Clinical practice"
  try {
    const b = await req.json()
    if (typeof b?.name === "string" && b.name.trim()) name = b.name.trim()
  } catch {
    /* default name */
  }

  const { data: existing } = await supabase
    .from("practice_members")
    .select("practice_id")
    .eq("user_id", user.id)
    .limit(1)
    .maybeSingle()

  if (existing?.practice_id) {
    return NextResponse.json({ practiceId: existing.practice_id, already: true })
  }

  let admin: ReturnType<typeof createAdminClient>
  try {
    admin = createAdminClient()
  } catch (e) {
    console.error("[clinical bootstrap] admin client", e)
    return NextResponse.json(
      {
        error:
          "Server missing SUPABASE_SERVICE_ROLE_KEY. Set it to allow automatic practice creation, or create a practice row and practice_members row in Supabase.",
      },
      { status: 503 }
    )
  }

  const { data: practice, error: pErr } = await admin.from("practices").insert({ name }).select("id").single()

  if (pErr || !practice?.id) {
    console.error("[clinical bootstrap] practices insert", pErr)
    return NextResponse.json(
      { error: pErr?.message || "Failed to create practice" },
      { status: 400 }
    )
  }

  const { error: mErr } = await admin.from("practice_members").insert({
    practice_id: practice.id,
    user_id: user.id,
    role: "owner",
  })
  if (mErr) {
    console.error("[clinical bootstrap] practice_members insert", mErr)
    return NextResponse.json({ error: mErr.message }, { status: 400 })
  }

  const { error: mkErr } = await admin.from("medikredit_providers").upsert(
    {
      practice_id: practice.id,
      extra_settings: {},
      use_test_provider: false,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "practice_id" }
  )
  if (mkErr) {
    console.warn("[clinical bootstrap] medikredit_providers upsert (apply migration 20260409180000 if missing):", mkErr.message)
  }

  return NextResponse.json({ practiceId: practice.id, already: false })
}

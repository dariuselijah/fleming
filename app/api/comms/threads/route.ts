import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

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

    // 200 + empty list: avoids noisy 403s while PracticeIdBootstrap is still creating membership (RLS blocks user-side practice insert).
    if (!membership) return NextResponse.json({ threads: [], noPractice: true })

    const url = new URL(req.url)
    const status = url.searchParams.get("status")
    const channel = url.searchParams.get("channel")
    const limit = parseInt(url.searchParams.get("limit") || "50")

    let query = supabase
      .from("conversation_threads")
      .select("*, practice_patients(display_name_hint)")
      .eq("practice_id", membership.practice_id)
      .order("last_message_at", { ascending: false })
      .limit(limit)

    if (status) query = query.eq("status", status)
    if (channel) query = query.eq("channel", channel)

    const { data, error } = await query

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    const threads = (data || []).map((t) => ({
      id: t.id,
      channel: t.channel,
      externalParty: t.external_party,
      patientId: t.patient_id,
      patientName: (t.practice_patients as { display_name_hint?: string } | null)?.display_name_hint?.split(" | ")[0] || t.external_party,
      status: t.status,
      priority: t.priority,
      currentFlow: t.current_flow,
      lastMessageAt: t.last_message_at,
      unreadCount: t.unread_count,
      createdAt: t.created_at,
    }))

    return NextResponse.json({ threads })
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}

import { createClient } from "@/lib/supabase/server"
import { NextRequest, NextResponse } from "next/server"

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  try {
    const { sessionId } = await params
    const supabase = await createClient()

    if (!supabase) {
      return new Response(
        JSON.stringify({ error: "Supabase not available in this deployment." }),
        { status: 200 }
      )
    }

    const { data: authData } = await supabase.auth.getUser()

    if (!authData?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // First, verify the session belongs to the user
    const { data: session, error: sessionError } = await supabase
      .from("study_sessions")
      .select("id")
      .eq("id", sessionId)
      .eq("user_id", authData.user.id)
      .single()

    if (sessionError || !session) {
      return NextResponse.json({ error: "Study session not found" }, { status: 404 })
    }

    // Get materials associated with this session
    const { data, error } = await supabase
      .from("study_materials")
      .select(`
        *,
        study_session_materials!inner(session_id)
      `)
      .eq("study_session_materials.session_id", sessionId)
      .eq("user_id", authData.user.id)
      .order("created_at", { ascending: false })

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json(data)
  } catch (err: unknown) {
    console.error("Error fetching study session materials:", err)
    return new Response(
      JSON.stringify({
        error: (err as Error).message || "Internal server error",
      }),
      { status: 500 }
    )
  }
} 
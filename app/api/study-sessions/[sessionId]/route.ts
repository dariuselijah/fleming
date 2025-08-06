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

    const { data, error } = await supabase
      .from("study_sessions")
      .select("*")
      .eq("id", sessionId)
      .eq("user_id", authData.user.id)
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    if (!data) {
      return NextResponse.json({ error: "Study session not found" }, { status: 404 })
    }

    return NextResponse.json(data)
  } catch (err: unknown) {
    console.error("Error in study session endpoint:", err)
    return new Response(
      JSON.stringify({
        error: (err as Error).message || "Internal server error",
      }),
      { status: 500 }
    )
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  try {
    const { sessionId } = await params
    const { title, discipline, description } = await request.json()

    if (!title?.trim()) {
      return NextResponse.json(
        { error: "Study session title is required" },
        { status: 400 }
      )
    }

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

    const updateData: any = { title: title.trim() }
    if (discipline) updateData.discipline = discipline
    if (description !== undefined) updateData.description = description?.trim() || null

    const { data, error } = await supabase
      .from("study_sessions")
      .update(updateData)
      .eq("id", sessionId)
      .eq("user_id", authData.user.id)
      .select()
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    if (!data) {
      return NextResponse.json({ error: "Study session not found" }, { status: 404 })
    }

    return NextResponse.json(data)
  } catch (err: unknown) {
    console.error("Error updating study session:", err)
    return new Response(
      JSON.stringify({
        error: (err as Error).message || "Internal server error",
      }),
      { status: 500 }
    )
  }
}

export async function DELETE(
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

    // First, delete related study content
    const { error: contentError } = await supabase
      .from("study_content")
      .delete()
      .eq("session_id", sessionId)
      .eq("user_id", authData.user.id)

    if (contentError) {
      console.error("Error deleting study content:", contentError)
    }

    // Then, delete related study session materials
    const { error: materialsError } = await supabase
      .from("study_session_materials")
      .delete()
      .eq("session_id", sessionId)

    if (materialsError) {
      console.error("Error deleting study session materials:", materialsError)
    }

    // Finally, delete the study session
    const { error } = await supabase
      .from("study_sessions")
      .delete()
      .eq("id", sessionId)
      .eq("user_id", authData.user.id)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (err: unknown) {
    console.error("Error deleting study session:", err)
    return new Response(
      JSON.stringify({
        error: (err as Error).message || "Internal server error",
      }),
      { status: 500 }
    )
  }
} 
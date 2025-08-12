import { createClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"

export async function POST(request: Request) {
  try {
    const supabase = await createClient()

    if (!supabase) {
      return new Response(
        JSON.stringify({ error: "Supabase not available in this deployment." }),
        { status: 200 }
      )
    }

    const { data: authData } = await supabase.auth.getUser()

    if (!authData?.user?.id) {
      return new Response(JSON.stringify({ error: "Missing userId" }), {
        status: 400,
      })
    }

    const userId = authData.user.id

    const { title, discipline, description } = await request.json()

    if (!title?.trim()) {
      return NextResponse.json(
        { error: "Study session title is required" },
        { status: 400 }
      )
    }

    if (!discipline) {
      return NextResponse.json(
        { error: "Study session discipline is required" },
        { status: 400 }
      )
    }

    const { data, error } = await supabase
      .from("study_sessions")
      .insert({ 
        name: title.trim(), 
        discipline,
        description: description?.trim() || null,
        user_id: userId 
      })
      .select()
      .single()

    if (error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(data)
  } catch (err: unknown) {
    console.error("Error in study sessions endpoint:", err)

    return new Response(
      JSON.stringify({
        error: (err as Error).message || "Internal server error",
      }),
      { status: 500 }
    )
  }
}

export async function GET() {
  const supabase = await createClient()

  if (!supabase) {
    return new Response(
      JSON.stringify({ error: "Supabase not available in this deployment." }),
      { status: 200 }
    )
  }

  const { data: authData } = await supabase.auth.getUser()

  const userId = authData?.user?.id
  if (!userId)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { data, error } = await supabase
    .from("study_sessions")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
} 
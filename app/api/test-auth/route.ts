import { createClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"
import { authorizeDevelopmentRoute } from "@/lib/auth/internal-route"

export async function GET(request: Request) {
  const denied = authorizeDevelopmentRoute(request)
  if (denied) return denied

  try {
    const supabase = await createClient()

    if (!supabase) {
      return NextResponse.json(
        { error: "Supabase not available" },
        { status: 500 }
      )
    }

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError) {
      return NextResponse.json(
        { error: authError.message },
        { status: 401 }
      )
    }

    if (!user) {
      return NextResponse.json(
        { error: "No user found" },
        { status: 401 }
      )
    }

    return NextResponse.json({
      authenticated: true,
      user: {
        id: user.id,
      },
    })
  } catch (error) {
    console.error("Auth test error:", error)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
} 
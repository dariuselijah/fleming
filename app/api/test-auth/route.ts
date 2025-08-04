import { createClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"

export async function GET() {
  try {
    console.log("Testing authentication...")
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

    console.log("Auth test result:", { 
      user: user ? { id: user.id, email: user.email } : null, 
      error: authError?.message 
    })

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
        email: user.email,
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
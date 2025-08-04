import { createClient } from "@/lib/supabase/server"
import { NextRequest, NextResponse } from "next/server"
import { convertFromApiFormat, convertToApiFormat } from "@/lib/user-preference-store/utils"

export async function GET() {
  try {
    const supabase = await createClient()

    if (!supabase) {
      console.error("Database connection failed")
      return NextResponse.json(
        { error: "Database connection failed" },
        { status: 500 }
      )
    }

    // Get the current user
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError) {
      console.error("Auth error:", authError)
      return NextResponse.json({ error: "Authentication error" }, { status: 401 })
    }

    if (!user) {
      console.error("No user found")
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Get the user's preferences
    const { data: preferences, error } = await supabase
      .from("user_preferences")
      .select("*")
      .eq("user_id", user.id)
      .single()

    if (error && error.code !== "PGRST116") {
      console.error("Error fetching user preferences:", error)
      return NextResponse.json(
        { error: "Failed to fetch user preferences" },
        { status: 500 }
      )
    }

    if (!preferences) {
      // Return default preferences if none exist
      return NextResponse.json(convertToApiFormat({}))
    }

    return NextResponse.json(preferences)
  } catch (error) {
    console.error("Error in user-preferences GET API:", error)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}

export async function PUT(request: NextRequest) {
  try {
    const supabase = await createClient()

    if (!supabase) {
      console.error("Database connection failed")
      return NextResponse.json(
        { error: "Database connection failed" },
        { status: 500 }
      )
    }

    // Get the current user
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError) {
      console.error("Auth error:", authError)
      return NextResponse.json({ error: "Authentication error" }, { status: 401 })
    }

    if (!user) {
      console.error("No user found")
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Parse the request body
    const body = await request.json()
    const apiData = convertToApiFormat(body)

    // Check if preferences exist
    const { data: existingPreferences, error: checkError } = await supabase
      .from("user_preferences")
      .select("user_id")
      .eq("user_id", user.id)
      .single()

    if (checkError && checkError.code !== "PGRST116") {
      console.error("Error checking existing preferences:", checkError)
      return NextResponse.json(
        { error: "Failed to check existing preferences" },
        { status: 500 }
      )
    }

    if (existingPreferences) {
      // Update existing preferences
      const { data, error } = await supabase
        .from("user_preferences")
        .update({
          ...apiData,
          updated_at: new Date().toISOString()
        })
        .eq("user_id", user.id)
        .select()
        .single()

      if (error) {
        console.error("Error updating user preferences:", error)
        return NextResponse.json(
          { error: "Failed to update user preferences" },
          { status: 500 }
        )
      }

      return NextResponse.json(data)
    } else {
      // Create new preferences
      const { data, error } = await supabase
        .from("user_preferences")
        .insert({
          user_id: user.id,
          ...apiData,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .select()
        .single()

      if (error) {
        console.error("Error creating user preferences:", error)
        return NextResponse.json(
          { error: "Failed to create user preferences" },
          { status: 500 }
        )
      }

      return NextResponse.json(data)
    }
  } catch (error) {
    console.error("Error in user-preferences PUT API:", error)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}

import { createClient } from "@/lib/supabase/server"
import { NextRequest, NextResponse } from "next/server"
import { convertFromApiFormat, convertToApiFormat, defaultPreferences } from "@/lib/user-preference-store/utils"

export async function GET(request: NextRequest) {
  console.log("GET /api/user-preferences called")
  
  try {
    const supabase = await createClient()
    console.log("Supabase client created:", !!supabase)

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

    console.log("Auth result:", { user: !!user, authError, userId: user?.id })

    if (authError) {
      console.error("Auth error:", authError)
      return NextResponse.json({ error: "Authentication error" }, { status: 401 })
    }

    if (!user) {
      console.error("No user found")
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    console.log("User authenticated:", user.id)

    // Fetch user preferences from database
    const { data: preferences, error } = await supabase
      .from("user_preferences")
      .select("*")
      .eq("user_id", user.id)
      .single()

    console.log("Fetched preferences:", preferences)
    console.log("Fetch error:", error)

    if (error && error.code !== "PGRST116") {
      console.error("Error fetching user preferences:", error)
      return NextResponse.json(
        { error: "Failed to fetch user preferences" },
        { status: 500 }
      )
    }

    if (!preferences) {
      console.log("No preferences found, returning defaults")
      return NextResponse.json(convertToApiFormat(defaultPreferences))
    }

    console.log("Returning user preferences:", preferences)
    return NextResponse.json(preferences)
  } catch (error) {
    console.error("Unexpected error in GET /api/user-preferences:", error)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}

export async function PUT(request: NextRequest) {
  console.log("PUT /api/user-preferences called")
  console.log("Request headers:", Object.fromEntries(request.headers.entries()))
  
  try {
    const supabase = await createClient()
    console.log("Supabase client created:", !!supabase)

    if (!supabase) {
      console.error("Database connection failed - Supabase not enabled or misconfigured")
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

    console.log("Auth result:", { user: !!user, authError, userId: user?.id })

    if (authError) {
      console.error("Auth error:", authError)
      return NextResponse.json({ error: "Authentication error" }, { status: 401 })
    }

    if (!user) {
      console.error("No user found")
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    console.log("User authenticated:", user.id)

    // Parse the request body
    const body = await request.json()
    console.log("PUT request body received:", body)
    const apiData = body
    console.log("API data received:", apiData)
    console.log("User role being set to:", apiData.user_role)

    // Check if preferences exist
    const { data: existingPreferences, error: checkError } = await supabase
      .from("user_preferences")
      .select("user_id, user_role")
      .eq("user_id", user.id)
      .single()

    console.log("Existing preferences check:", { existingPreferences, checkError })

    if (checkError && checkError.code !== "PGRST116") {
      console.error("Error checking existing preferences:", checkError)
      return NextResponse.json(
        { error: "Failed to check existing preferences" },
        { status: 500 }
      )
    }

    if (existingPreferences) {
      // Update existing preferences
      console.log("Updating user preferences:", apiData)
      const { data, error } = await supabase
        .from("user_preferences")
        .update({
          ...apiData,
          updated_at: new Date().toISOString()
        })
        .eq("user_id", user.id)
        .select()
        .single()

      console.log("Update result:", { data, error })

      if (error) {
        console.error("Error updating user preferences:", error)
        return NextResponse.json(
          { error: "Failed to update user preferences" },
          { status: 500 }
        )
      }

      console.log("Updated user preferences response:", data)
      return NextResponse.json(data)
    } else {
      // Create new preferences
      console.log("Creating new user preferences:", apiData)
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

      console.log("Create result:", { data, error })

      if (error) {
        console.error("Error creating user preferences:", error)
        return NextResponse.json(
          { error: "Failed to create user preferences" },
          { status: 500 }
        )
      }

      console.log("Created user preferences response:", data)
      return NextResponse.json(data)
    }
  } catch (error) {
    console.error("Error in user-preferences PUT API:", error)
    console.error("Error details:", {
      message: error instanceof Error ? error.message : "Unknown error",
      stack: error instanceof Error ? error.stack : undefined,
      name: error instanceof Error ? error.name : undefined
    })
    return NextResponse.json(
      { 
        error: "Internal server error",
        details: error instanceof Error ? error.message : "Unknown error"
      },
      { status: 500 }
    )
  }
}

import { createClient } from "@/lib/supabase/server"
import { NextRequest, NextResponse } from "next/server"
import { convertFromApiFormat, convertToApiFormat, defaultPreferences } from "@/lib/user-preference-store/utils"
import { encryptHealthData, decryptHealthData, isEncryptionEnabled } from "@/lib/encryption"

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

    // Fetch user preferences from database (including IV columns for encrypted data)
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

    // Decrypt health data if encrypted
    if (isEncryptionEnabled()) {
      const prefs = preferences as any
      if (prefs.health_context && prefs.health_context_iv) {
        prefs.health_context = decryptHealthData(prefs.health_context, prefs.health_context_iv)
      }
      if (prefs.health_conditions && prefs.health_conditions_iv) {
        prefs.health_conditions = decryptHealthData(prefs.health_conditions, prefs.health_conditions_iv)
      }
      if (prefs.medications && prefs.medications_iv) {
        prefs.medications = decryptHealthData(prefs.medications, prefs.medications_iv)
      }
      if (prefs.allergies && prefs.allergies_iv) {
        prefs.allergies = decryptHealthData(prefs.allergies, prefs.allergies_iv)
      }
      if (prefs.family_history && prefs.family_history_iv) {
        prefs.family_history = decryptHealthData(prefs.family_history, prefs.family_history_iv)
      }
      if (prefs.lifestyle_factors && prefs.lifestyle_factors_iv) {
        prefs.lifestyle_factors = decryptHealthData(prefs.lifestyle_factors, prefs.lifestyle_factors_iv)
      }
      console.log("🔓 Health data decrypted during retrieval")
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
    let apiData = body
    console.log("API data received:", apiData)
    console.log("User role being set to:", apiData.user_role)

    // Encrypt health data before storing (if encryption is enabled)
    if (isEncryptionEnabled()) {
      const encryptedData: any = { ...apiData }
      
      if (apiData.health_context) {
        const encrypted = encryptHealthData(apiData.health_context)
        encryptedData.health_context = encrypted.encrypted
        encryptedData.health_context_iv = encrypted.iv
      }
      if (apiData.health_conditions) {
        const encrypted = encryptHealthData(apiData.health_conditions)
        encryptedData.health_conditions = encrypted.encrypted
        encryptedData.health_conditions_iv = encrypted.iv
      }
      if (apiData.medications) {
        const encrypted = encryptHealthData(apiData.medications)
        encryptedData.medications = encrypted.encrypted
        encryptedData.medications_iv = encrypted.iv
      }
      if (apiData.allergies) {
        const encrypted = encryptHealthData(apiData.allergies)
        encryptedData.allergies = encrypted.encrypted
        encryptedData.allergies_iv = encrypted.iv
      }
      if (apiData.family_history) {
        const encrypted = encryptHealthData(apiData.family_history)
        encryptedData.family_history = encrypted.encrypted
        encryptedData.family_history_iv = encrypted.iv
      }
      if (apiData.lifestyle_factors) {
        const encrypted = encryptHealthData(apiData.lifestyle_factors)
        encryptedData.lifestyle_factors = encrypted.encrypted
        encryptedData.lifestyle_factors_iv = encrypted.iv
      }
      
      apiData = encryptedData
      console.log("🔒 Health data encrypted before storage")
    }

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

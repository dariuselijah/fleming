import { createClient } from "@/lib/supabase/server"
import { NextRequest, NextResponse } from "next/server"
import { convertFromApiFormat, convertToApiFormat, defaultPreferences } from "@/lib/user-preference-store/utils"
import { encryptHealthData, decryptHealthData, isEncryptionEnabled } from "@/lib/encryption"

const OPTIONAL_ONBOARDING_COLUMNS = [
  "student_school",
  "student_year",
  "clinician_name",
  "practice_profile_completed",
  "practice_setup_guide_dismissed",
] as const

function stripOptionalOnboardingColumns(payload: Record<string, unknown>) {
  const nextPayload = { ...payload }
  let removed = false

  for (const column of OPTIONAL_ONBOARDING_COLUMNS) {
    if (column in nextPayload) {
      delete nextPayload[column]
      removed = true
    }
  }

  return { payload: nextPayload, removed }
}

function hasMissingOptionalColumnError(error: unknown): boolean {
  const message = String((error as { message?: string } | undefined)?.message || "")
  return OPTIONAL_ONBOARDING_COLUMNS.some((column) => message.includes(column))
}

function decryptHealthFieldsForResponse<T extends Record<string, any> | null | undefined>(row: T): T {
  if (!row || !isEncryptionEnabled()) return row

  const next = { ...row } as Record<string, any>
  const fieldMappings: Array<{ key: string; ivKey: string }> = [
    { key: "health_context", ivKey: "health_context_iv" },
    { key: "health_conditions", ivKey: "health_conditions_iv" },
    { key: "medications", ivKey: "medications_iv" },
    { key: "allergies", ivKey: "allergies_iv" },
    { key: "family_history", ivKey: "family_history_iv" },
    { key: "lifestyle_factors", ivKey: "lifestyle_factors_iv" },
  ]

  for (const { key, ivKey } of fieldMappings) {
    if (!next[key]) continue
    const iv = next[ivKey]
    if (typeof iv === "string" || Array.isArray(iv)) {
      next[key] = decryptHealthData(next[key], iv)
    }
  }

  return next as T
}

export async function GET(request: NextRequest) {
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

    // Fetch user preferences from database (including IV columns for encrypted data)
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
      return NextResponse.json(convertToApiFormat(defaultPreferences))
    }

    const responsePreferences = decryptHealthFieldsForResponse(preferences as Record<string, any>)
    return NextResponse.json(responsePreferences)
  } catch (error) {
    console.error("Unexpected error in GET /api/user-preferences:", error)
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
    let apiData = body

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
    }

    // Check if preferences exist
    const { data: existingPreferences, error: checkError } = await supabase
      .from("user_preferences")
      .select("user_id, user_role")
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
        const stripped = stripOptionalOnboardingColumns(apiData as Record<string, unknown>)
        if (stripped.removed && hasMissingOptionalColumnError(error)) {
          console.warn(
            "Retrying user preferences update without optional onboarding columns"
          )
          const retry = await supabase
            .from("user_preferences")
            .update({
              ...stripped.payload,
              updated_at: new Date().toISOString()
            })
            .eq("user_id", user.id)
            .select()
            .single()

          if (!retry.error) {
            const responseData = decryptHealthFieldsForResponse(retry.data as Record<string, any>)
            return NextResponse.json(responseData)
          }
          console.error("Retry error updating user preferences:", retry.error)
        } else {
          console.error("Error updating user preferences:", error)
        }

        return NextResponse.json(
          { error: "Failed to update user preferences" },
          { status: 500 }
        )
      }

      const responseData = decryptHealthFieldsForResponse(data as Record<string, any>)
      return NextResponse.json(responseData)
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
        const stripped = stripOptionalOnboardingColumns(apiData as Record<string, unknown>)
        if (stripped.removed && hasMissingOptionalColumnError(error)) {
          console.warn(
            "Retrying user preferences create without optional onboarding columns"
          )
          const retry = await supabase
            .from("user_preferences")
            .insert({
              user_id: user.id,
              ...stripped.payload,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString()
            })
            .select()
            .single()

          if (!retry.error) {
            const responseData = decryptHealthFieldsForResponse(retry.data as Record<string, any>)
            return NextResponse.json(responseData)
          }
          console.error("Retry error creating user preferences:", retry.error)
        } else {
          console.error("Error creating user preferences:", error)
        }

        return NextResponse.json(
          { error: "Failed to create user preferences" },
          { status: 500 }
        )
      }

      const responseData = decryptHealthFieldsForResponse(data as Record<string, any>)
      return NextResponse.json(responseData)
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

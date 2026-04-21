import { isSupabaseEnabled } from "@/lib/supabase/config"
import { createClient } from "@/lib/supabase/server"
import { decryptHealthData, isEncryptionEnabled } from "@/lib/encryption"
import {
  convertFromApiFormat,
  defaultPreferences,
} from "@/lib/user-preference-store/utils"
import type { UserProfile } from "./types"

function decryptHealthFields<T extends Record<string, any> | null | undefined>(row: T): T {
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

export async function getSupabaseUser() {
  const supabase = await createClient()
  if (!supabase) return { supabase: null, user: null }

  const { data } = await supabase.auth.getUser()
  return {
    supabase,
    user: data.user ?? null,
  }
}

export async function getUserProfile(): Promise<UserProfile | null> {
  if (!isSupabaseEnabled) {
    // return fake user profile for no supabase
    return {
      id: "guest",
      email: "guest@fleming.chat",
      display_name: "Guest",
      profile_image: "",
      anonymous: true,
      preferences: defaultPreferences,
    } as UserProfile
  }

  const { supabase, user } = await getSupabaseUser()
  if (!supabase || !user) return null

  const { data: userProfileData } = await supabase
    .from("users")
    .select("*, user_preferences(*)")
    .eq("id", user.id)
    .single()

  // Don't load anonymous users in the user store
  if (userProfileData?.anonymous) return null

  // Format user preferences if they exist
  const formattedPreferences = userProfileData?.user_preferences
    ? convertFromApiFormat(decryptHealthFields(userProfileData.user_preferences))
    : undefined

  return {
    ...userProfileData,
    profile_image: user.user_metadata?.avatar_url ?? "",
    display_name: user.user_metadata?.name ?? "",
    preferences: formattedPreferences,
  } as UserProfile
}

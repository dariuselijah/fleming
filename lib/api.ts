import { APP_DOMAIN } from "@/lib/config"
import type { UserProfile } from "@/lib/user/types"
import { SupabaseClient } from "@supabase/supabase-js"
import { API_ROUTE_CREATE_GUEST, API_ROUTE_UPDATE_CHAT_MODEL } from "./routes"

/**
 * Creates a guest user record on the server
 */
export async function createGuestUser(guestId: string) {
  try {
    const res = await fetch(API_ROUTE_CREATE_GUEST, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: guestId }),
    })
    const responseData = await res.json()
    if (!res.ok) {
      throw new Error(
        responseData.error ||
          `Failed to create guest user: ${res.status} ${res.statusText}`
      )
    }

    return responseData
  } catch (err) {
    console.error("Error creating guest user:", err)
    throw err
  }
}

export class UsageLimitError extends Error {
  code: string
  constructor(message: string) {
    super(message)
    this.code = "DAILY_LIMIT_REACHED"
  }
}

/**
 * Checks the user's daily usage and increments both overall and daily counters.
 * Resets the daily counter if a new day (UTC) is detected.
 * Uses the `anonymous` flag from the user record to decide which daily limit applies.
 *
 * @param supabase - Your Supabase client.
 * @param userId - The ID of the user.
 * @returns The remaining daily limit.
 */
export async function checkRateLimits(
  userId: string,
  isAuthenticated: boolean
) {
  try {
    const res = await fetch(
      `/api/rate-limits?userId=${userId}&isAuthenticated=${isAuthenticated}`,
      {
        method: "GET",
        headers: { "Content-Type": "application/json" },
      }
    )
    const responseData = await res.json()
    if (!res.ok) {
      throw new Error(
        responseData.error ||
          `Failed to check rate limits: ${res.status} ${res.statusText}`
      )
    }
    return responseData
  } catch (err) {
    console.error("Error checking rate limits:", err)
    throw err
  }
}

/**
 * Updates the model for an existing chat
 */
export async function updateChatModel(chatId: string, model: string) {
  try {
    const res = await fetch(API_ROUTE_UPDATE_CHAT_MODEL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chatId, model }),
    })
    const responseData = await res.json()

    if (!res.ok) {
      throw new Error(
        responseData.error ||
          `Failed to update chat model: ${res.status} ${res.statusText}`
      )
    }

    return responseData
  } catch (error) {
    console.error("Error updating chat model:", error)
    throw error
  }
}

/**
 * Signs in user with Google OAuth via Supabase
 */
export async function signInWithGoogle(supabase: SupabaseClient) {
  try {
    const isDev = process.env.NODE_ENV === "development"

    // Get base URL dynamically (will work in both browser and server environments)
    const baseUrl = isDev
      ? "http://localhost:3000"
      : typeof window !== "undefined"
        ? window.location.origin
        : process.env.NEXT_PUBLIC_VERCEL_URL
          ? `https://${process.env.NEXT_PUBLIC_VERCEL_URL}`
          : APP_DOMAIN

    console.log("Signing in with Google, redirect URL:", `${baseUrl}/auth/callback`)

    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${baseUrl}/auth/callback`,
        queryParams: {
          access_type: "offline",
          prompt: "consent",
        },
      },
    })

    if (error) {
      console.error("OAuth error:", error)
      throw error
    }

    console.log("OAuth initiated successfully")
    // Return the provider URL
    return data
  } catch (err) {
    console.error("Error signing in with Google:", err)
    throw err
  }
}

export const getOrCreateGuestUserId = async (
  user: UserProfile | null
): Promise<string | null> => {
  if (user?.id) return user.id

  // Require authentication - no anonymous users allowed
  console.warn("Authentication required. Please sign in to continue.")
  return null
}

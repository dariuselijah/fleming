import { APP_DOMAIN } from "@/lib/config"
import type { UserProfile } from "@/lib/user/types"
import { SupabaseClient } from "@supabase/supabase-js"
import { fetchClient } from "./fetch"
import { API_ROUTE_CREATE_GUEST, API_ROUTE_UPDATE_CHAT_MODEL } from "./routes"
import { createClient } from "./supabase/client"

/**
 * Creates a guest user record on the server
 */
export async function createGuestUser(guestId: string) {
  try {
    const res = await fetchClient(API_ROUTE_CREATE_GUEST, {
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
    const res = await fetchClient(
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
    const res = await fetchClient(API_ROUTE_UPDATE_CHAT_MODEL, {
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
 * Origin for OAuth `redirectTo` (`/auth/callback`). In the browser we always use
 * `window.location.origin` so the redirect matches the tab (dev server port,
 * `npm run start` on localhost, etc.). Supabase must list this origin under
 * Authentication → URL Configuration → Redirect URLs or it will fall back to the
 * project Site URL (often production).
 */
function getOAuthRedirectOrigin(): string {
  if (typeof window !== "undefined") {
    return window.location.origin
  }
  const explicit = process.env.NEXT_PUBLIC_APP_URL?.trim()
  if (explicit) {
    return explicit.replace(/\/$/, "")
  }
  if (process.env.NODE_ENV === "development") {
    return "http://localhost:3000"
  }
  if (process.env.NEXT_PUBLIC_VERCEL_URL) {
    return `https://${process.env.NEXT_PUBLIC_VERCEL_URL}`
  }
  return APP_DOMAIN
}

function buildAuthCallbackUrl(opts?: { next?: string }) {
  const baseUrl = getOAuthRedirectOrigin()
  const rawNext = opts?.next?.trim()
  const nextPath =
    rawNext?.startsWith("/") && !rawNext.includes("//") ? rawNext : "/"
  return `${baseUrl}/auth/callback?next=${encodeURIComponent(nextPath)}`
}

async function signInWithOAuthProvider(
  supabase: SupabaseClient,
  provider: "google" | "apple",
  opts?: { next?: string }
) {
  try {
    const callbackUrl = buildAuthCallbackUrl(opts)

    console.log(`Signing in with ${provider}, redirect URL:`, callbackUrl)

    const { data, error } = await supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo: callbackUrl,
        ...(provider === "google"
          ? {
              queryParams: {
                access_type: "offline",
                prompt: "consent",
              },
            }
          : {}),
      },
    })

    if (error) {
      console.error("OAuth error:", error)
      throw error
    }

    console.log("OAuth initiated successfully")
    return data
  } catch (err) {
    console.error(`Error signing in with ${provider}:`, err)
    throw err
  }
}

/**
 * Signs in user with Google OAuth via Supabase.
 * @param next - Path to redirect after OAuth (must start with `/`). Passed to `/auth/callback?next=`.
 */
export async function signInWithGoogle(
  supabase: SupabaseClient,
  opts?: { next?: string }
) {
  return signInWithOAuthProvider(supabase, "google", opts)
}

export async function signInWithApple(
  supabase: SupabaseClient,
  opts?: { next?: string }
) {
  return signInWithOAuthProvider(supabase, "apple", opts)
}

export async function signInWithEmail(
  supabase: SupabaseClient,
  email: string,
  opts?: { next?: string }
) {
  const callbackUrl = buildAuthCallbackUrl(opts)
  const { data, error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: callbackUrl,
      shouldCreateUser: true,
    },
  })

  if (error) throw error
  return data
}

export const getOrCreateGuestUserId = async (
  user: UserProfile | null
): Promise<string | null> => {
  if (user?.id) return user.id

  // Require authentication - no anonymous users allowed
  console.warn("Authentication required. Please sign in to continue.")
  return null
}

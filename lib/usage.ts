import { UsageLimitError } from "@/lib/api"
import {
  AUTH_DAILY_MESSAGE_LIMIT,
  AUTH_HOURLY_MESSAGE_LIMIT,
  DAILY_LIMIT_PRO_MODELS,
  FREE_MODELS_IDS,
  NON_AUTH_DAILY_MESSAGE_LIMIT,
  NON_AUTH_HOURLY_MESSAGE_LIMIT,
} from "@/lib/config"
import { SupabaseClient } from "@supabase/supabase-js"

const isFreeModel = (modelId: string) => FREE_MODELS_IDS.includes(modelId)
const isProModel = (modelId: string) => !isFreeModel(modelId)

/**
 * Checks the user's daily usage to see if they've reached their limit.
 * Uses the `anonymous` flag from the user record to decide which daily limit applies.
 *
 * @param supabase - Your Supabase client.
 * @param userId - The ID of the user.
 * @param trackDaily - Whether to track the daily message count (default is true)
 * @throws UsageLimitError if the daily limit is reached, or a generic Error if checking fails.
 * @returns User data including message counts and reset date
 */
export async function checkUsage(supabase: SupabaseClient, userId: string) {
  const { data: userData, error: userDataError } = await supabase
    .from("users")
    .select(
      "message_count, daily_message_count, daily_reset, anonymous, premium"
    )
    .eq("id", userId)
    .maybeSingle()

  if (userDataError) {
    throw new Error("Error fetchClienting user data: " + userDataError.message)
  }
  if (!userData) {
    throw new Error("User record not found for id: " + userId)
  }

  // Decide which daily limit to use.
  const isAnonymous = userData.anonymous
  // (Assuming these are imported from your config)
  const dailyLimit = isAnonymous
    ? NON_AUTH_DAILY_MESSAGE_LIMIT
    : AUTH_DAILY_MESSAGE_LIMIT

  // Reset the daily counter if the day has changed (using UTC).
  const now = new Date()
  let dailyCount = userData.daily_message_count || 0
  const lastReset = userData.daily_reset ? new Date(userData.daily_reset) : null

  const isNewDay =
    !lastReset ||
    now.getUTCFullYear() !== lastReset.getUTCFullYear() ||
    now.getUTCMonth() !== lastReset.getUTCMonth() ||
    now.getUTCDate() !== lastReset.getUTCDate()

  if (isNewDay) {
    dailyCount = 0
    const { error: resetError } = await supabase
      .from("users")
      .update({ daily_message_count: 0, daily_reset: now.toISOString() })
      .eq("id", userId)

    if (resetError) {
      throw new Error("Failed to reset daily count: " + resetError.message)
    }
  }

  // Check if the daily limit is reached.
  if (dailyCount >= dailyLimit) {
    throw new UsageLimitError("Daily message limit reached.")
  }

  return {
    userData,
    dailyCount,
    dailyLimit,
  }
}

/**
 * Increments both overall and daily message counters for a user.
 *
 * @param supabase - Your Supabase client.
 * @param userId - The ID of the user.
 * @param currentCounts - Current message counts (optional, will be fetchCliented if not provided)
 * @param trackDaily - Whether to track the daily message count (default is true)
 * @throws Error if updating fails.
 */
export async function incrementUsage(
  supabase: SupabaseClient,
  userId: string
): Promise<void> {
  const { data: userData, error: userDataError } = await supabase
    .from("users")
    .select("message_count, daily_message_count")
    .eq("id", userId)
    .maybeSingle()

  if (userDataError || !userData) {
    throw new Error(
      "Error fetchClienting user data: " +
        (userDataError?.message || "User not found")
    )
  }

  const messageCount = userData.message_count || 0
  const dailyCount = userData.daily_message_count || 0

  // Increment both overall and daily message counts.
  const newOverallCount = messageCount + 1
  const newDailyCount = dailyCount + 1

  const { error: updateError } = await supabase
    .from("users")
    .update({
      message_count: newOverallCount,
      daily_message_count: newDailyCount,
      last_active_at: new Date().toISOString(),
    })
    .eq("id", userId)

  if (updateError) {
    throw new Error("Failed to update usage data: " + updateError.message)
  }
}

export async function checkProUsage(supabase: SupabaseClient, userId: string) {
  const { data: userData, error: userDataError } = await supabase
    .from("users")
    .select("daily_pro_message_count, daily_pro_reset")
    .eq("id", userId)
    .maybeSingle()

  if (userDataError) {
    throw new Error("Error fetching user data: " + userDataError.message)
  }
  if (!userData) {
    throw new Error("User not found for ID: " + userId)
  }

  let dailyProCount = userData.daily_pro_message_count || 0
  const now = new Date()
  const lastReset = userData.daily_pro_reset
    ? new Date(userData.daily_pro_reset)
    : null

  const isNewDay =
    !lastReset ||
    now.getUTCFullYear() !== lastReset.getUTCFullYear() ||
    now.getUTCMonth() !== lastReset.getUTCMonth() ||
    now.getUTCDate() !== lastReset.getUTCDate()

  if (isNewDay) {
    dailyProCount = 0
    const { error: resetError } = await supabase
      .from("users")
      .update({
        daily_pro_message_count: 0,
        daily_pro_reset: now.toISOString(),
      })
      .eq("id", userId)

    if (resetError) {
      throw new Error("Failed to reset pro usage: " + resetError.message)
    }
  }

  if (dailyProCount >= DAILY_LIMIT_PRO_MODELS) {
    throw new UsageLimitError("Daily Pro model limit reached.")
  }

  return {
    dailyProCount,
    limit: DAILY_LIMIT_PRO_MODELS,
  }
}

export async function incrementProUsage(
  supabase: SupabaseClient,
  userId: string
) {
  const { data, error } = await supabase
    .from("users")
    .select("daily_pro_message_count")
    .eq("id", userId)
    .maybeSingle()

  if (error || !data) {
    throw new Error("Failed to fetch user usage for increment")
  }

  const count = data.daily_pro_message_count || 0

  const { error: updateError } = await supabase
    .from("users")
    .update({
      daily_pro_message_count: count + 1,
      last_active_at: new Date().toISOString(),
    })
    .eq("id", userId)

  if (updateError) {
    throw new Error("Failed to increment pro usage: " + updateError.message)
  }
}

/**
 * Checks hourly rate limits (ChatGPT-style)
 * Returns wait time in seconds if limit is reached
 */
export async function checkHourlyUsage(
  supabase: SupabaseClient,
  userId: string,
  isAuthenticated: boolean
): Promise<{ hourlyCount: number; hourlyLimit: number; waitTimeSeconds: number | null }> {
  const { data: userData, error: userDataError } = await supabase
    .from("users")
    .select("hourly_message_count, hourly_reset, anonymous")
    .eq("id", userId)
    .maybeSingle()

  if (userDataError) {
    throw new Error("Error fetching user data: " + userDataError.message)
  }
  if (!userData) {
    throw new Error("User record not found for id: " + userId)
  }

  const isAnonymous = userData.anonymous || !isAuthenticated
  const hourlyLimit = isAnonymous
    ? NON_AUTH_HOURLY_MESSAGE_LIMIT
    : AUTH_HOURLY_MESSAGE_LIMIT

  const now = new Date()
  let hourlyCount = userData.hourly_message_count || 0
  const lastReset = userData.hourly_reset ? new Date(userData.hourly_reset) : null

  // Check if an hour has passed (using UTC)
  const isNewHour =
    !lastReset ||
    now.getTime() - lastReset.getTime() >= 60 * 60 * 1000 // 1 hour in milliseconds

  if (isNewHour) {
    hourlyCount = 0
    const { error: resetError } = await supabase
      .from("users")
      .update({ hourly_message_count: 0, hourly_reset: now.toISOString() })
      .eq("id", userId)

    if (resetError) {
      throw new Error("Failed to reset hourly count: " + resetError.message)
    }
  }

  // Calculate wait time if limit is reached
  let waitTimeSeconds: number | null = null
  if (hourlyCount >= hourlyLimit && lastReset) {
    const timeSinceReset = now.getTime() - new Date(lastReset).getTime()
    const timeUntilReset = 60 * 60 * 1000 - timeSinceReset // 1 hour - time elapsed
    waitTimeSeconds = Math.ceil(timeUntilReset / 1000)
  }

  return {
    hourlyCount,
    hourlyLimit,
    waitTimeSeconds,
  }
}

/**
 * Increments hourly message counter
 */
export async function incrementHourlyUsage(
  supabase: SupabaseClient,
  userId: string
): Promise<void> {
  const { data: userData, error: userDataError } = await supabase
    .from("users")
    .select("hourly_message_count, hourly_reset")
    .eq("id", userId)
    .maybeSingle()

  if (userDataError || !userData) {
    throw new Error(
      "Error fetching user data: " +
        (userDataError?.message || "User not found")
    )
  }

  const now = new Date()
  const lastReset = userData.hourly_reset ? new Date(userData.hourly_reset) : null
  const isNewHour =
    !lastReset ||
    now.getTime() - lastReset.getTime() >= 60 * 60 * 1000

  const hourlyCount = isNewHour ? 1 : (userData.hourly_message_count || 0) + 1

  const { error: updateError } = await supabase
    .from("users")
    .update({
      hourly_message_count: hourlyCount,
      hourly_reset: isNewHour ? now.toISOString() : userData.hourly_reset,
      last_active_at: now.toISOString(),
    })
    .eq("id", userId)

  if (updateError) {
    throw new Error("Failed to update hourly usage data: " + updateError.message)
  }
}

export async function checkUsageByModel(
  supabase: SupabaseClient,
  userId: string,
  modelId: string,
  isAuthenticated: boolean
) {
  // First check hourly limits (ChatGPT-style)
  const hourlyUsage = await checkHourlyUsage(supabase, userId, isAuthenticated)
  if (hourlyUsage.hourlyCount >= hourlyUsage.hourlyLimit) {
    const error = new UsageLimitError(
      `Rate limit exceeded. Please wait ${Math.ceil((hourlyUsage.waitTimeSeconds || 3600) / 60)} minutes.`
    )
    ;(error as any).waitTimeSeconds = hourlyUsage.waitTimeSeconds
    ;(error as any).limitType = "hourly"
    throw error
  }

  if (isProModel(modelId)) {
    if (!isAuthenticated) {
      throw new UsageLimitError("You must log in to use this model.")
    }
    return await checkProUsage(supabase, userId)
  }

  return await checkUsage(supabase, userId)
}

export async function incrementUsageByModel(
  supabase: SupabaseClient,
  userId: string,
  modelId: string,
  isAuthenticated: boolean
) {
  // Increment hourly usage
  await incrementHourlyUsage(supabase, userId)

  if (isProModel(modelId)) {
    if (!isAuthenticated) return
    return await incrementProUsage(supabase, userId)
  }

  return await incrementUsage(supabase, userId)
}

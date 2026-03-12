import { UsageLimitError } from "@/lib/api"
import {
  AUTH_DAILY_MESSAGE_LIMIT,
  AUTH_HOURLY_ATTACHMENT_LIMIT,
  AUTH_HOURLY_MESSAGE_LIMIT,
  DAILY_LIMIT_PRO_MODELS,
  FREE_MODELS_IDS,
  NON_AUTH_DAILY_MESSAGE_LIMIT,
  NON_AUTH_HOURLY_ATTACHMENT_LIMIT,
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

function normalizeAttachmentArray(value: unknown): unknown[] {
  if (Array.isArray(value)) return value
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value)
      return Array.isArray(parsed) ? parsed : []
    } catch {
      return []
    }
  }
  return []
}

function countAttachmentsFromMessageValue(value: unknown): number {
  return normalizeAttachmentArray(value).filter(Boolean).length
}

export async function checkHourlyAttachmentUsage(
  supabase: SupabaseClient,
  userId: string,
  isAuthenticated: boolean
): Promise<{
  hourlyAttachmentCount: number
  hourlyAttachmentLimit: number
  waitTimeSeconds: number | null
}> {
  const { data: userData, error: userDataError } = await supabase
    .from("users")
    .select("anonymous")
    .eq("id", userId)
    .maybeSingle()

  if (userDataError) {
    throw new Error("Error fetching user data: " + userDataError.message)
  }
  if (!userData) {
    throw new Error("User record not found for id: " + userId)
  }

  const isAnonymous = userData.anonymous || !isAuthenticated
  const hourlyAttachmentLimit = isAnonymous
    ? NON_AUTH_HOURLY_ATTACHMENT_LIMIT
    : AUTH_HOURLY_ATTACHMENT_LIMIT

  const now = Date.now()
  const oneHourAgoIso = new Date(now - 60 * 60 * 1000).toISOString()
  const { data: recentMessages, error: messagesError } = await supabase
    .from("messages")
    .select("experimental_attachments, created_at")
    .eq("user_id", userId)
    .eq("role", "user")
    .gte("created_at", oneHourAgoIso)
    .order("created_at", { ascending: true })

  if (messagesError) {
    throw new Error("Error fetching recent message attachments: " + messagesError.message)
  }

  let hourlyAttachmentCount = 0
  let earliestAttachmentTimestamp: number | null = null
  ;(recentMessages || []).forEach((row: any) => {
    const attachmentCount = countAttachmentsFromMessageValue(row?.experimental_attachments)
    if (attachmentCount <= 0) return
    hourlyAttachmentCount += attachmentCount
    if (earliestAttachmentTimestamp === null && row?.created_at) {
      earliestAttachmentTimestamp = new Date(row.created_at).getTime()
    }
  })

  let waitTimeSeconds: number | null = null
  if (hourlyAttachmentCount >= hourlyAttachmentLimit && earliestAttachmentTimestamp) {
    const timeElapsed = now - earliestAttachmentTimestamp
    const timeUntilReset = Math.max(0, 60 * 60 * 1000 - timeElapsed)
    waitTimeSeconds = Math.ceil(timeUntilReset / 1000)
  }

  return {
    hourlyAttachmentCount,
    hourlyAttachmentLimit,
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
  isAuthenticated: boolean,
  options?: {
    attachmentCount?: number
  }
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

  const requestedAttachmentCount = Math.max(
    0,
    Math.floor(options?.attachmentCount || 0)
  )
  if (requestedAttachmentCount > 0) {
    const hourlyAttachmentUsage = await checkHourlyAttachmentUsage(
      supabase,
      userId,
      isAuthenticated
    )
    if (requestedAttachmentCount > hourlyAttachmentUsage.hourlyAttachmentLimit) {
      const error = new UsageLimitError(
        `You can include up to ${hourlyAttachmentUsage.hourlyAttachmentLimit} images/files in a single message.`
      )
      ;(error as any).code = "ATTACHMENT_LIMIT_EXCEEDED"
      ;(error as any).limitType = "hourly"
      ;(error as any).waitTimeSeconds = hourlyAttachmentUsage.waitTimeSeconds
      throw error
    }
    if (
      hourlyAttachmentUsage.hourlyAttachmentCount + requestedAttachmentCount >
      hourlyAttachmentUsage.hourlyAttachmentLimit
    ) {
      const error = new UsageLimitError(
        `Hourly attachment limit reached. You can include up to ${hourlyAttachmentUsage.hourlyAttachmentLimit} images/files per hour.`
      )
      ;(error as any).code = "HOURLY_ATTACHMENT_LIMIT_REACHED"
      ;(error as any).limitType = "hourly"
      ;(error as any).waitTimeSeconds = hourlyAttachmentUsage.waitTimeSeconds
      throw error
    }
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

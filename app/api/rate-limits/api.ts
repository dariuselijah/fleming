import {
  AUTH_DAILY_MESSAGE_LIMIT,
  AUTH_HOURLY_MESSAGE_LIMIT,
  DAILY_LIMIT_PRO_MODELS,
  NON_AUTH_DAILY_MESSAGE_LIMIT,
  NON_AUTH_HOURLY_MESSAGE_LIMIT,
} from "@/lib/config"
import { validateUserIdentity } from "@/lib/server/api"
import { checkHourlyUsage } from "@/lib/usage"

export async function getMessageUsage(
  userId: string,
  isAuthenticated: boolean
) {
  const supabase = await validateUserIdentity(userId, isAuthenticated)
  if (!supabase) return null

  const { data, error } = await supabase
    .from("users")
    .select("daily_message_count, daily_pro_message_count, anonymous")
    .eq("id", userId)
    .maybeSingle()

  if (error) {
    console.error("Error fetching message usage:", error)
    // Consider returning a default/error state instead of throwing
    return {
      dailyCount: 0,
      dailyProCount: 0,
      dailyLimit: isAuthenticated ? AUTH_DAILY_MESSAGE_LIMIT : NON_AUTH_DAILY_MESSAGE_LIMIT,
      remaining: isAuthenticated ? AUTH_DAILY_MESSAGE_LIMIT : NON_AUTH_DAILY_MESSAGE_LIMIT,
      remainingPro: DAILY_LIMIT_PRO_MODELS,
      hourlyCount: 0,
      hourlyLimit: isAuthenticated ? AUTH_HOURLY_MESSAGE_LIMIT : NON_AUTH_HOURLY_MESSAGE_LIMIT,
      remainingHourly: isAuthenticated ? AUTH_HOURLY_MESSAGE_LIMIT : NON_AUTH_HOURLY_MESSAGE_LIMIT,
      waitTimeSeconds: null,
    }
  }

  // If data is null (e.g., new user), return default values
  if (!data) {
    return {
      dailyCount: 0,
      dailyProCount: 0,
      dailyLimit: isAuthenticated ? AUTH_DAILY_MESSAGE_LIMIT : NON_AUTH_DAILY_MESSAGE_LIMIT,
      remaining: isAuthenticated ? AUTH_DAILY_MESSAGE_LIMIT : NON_AUTH_DAILY_MESSAGE_LIMIT,
      remainingPro: DAILY_LIMIT_PRO_MODELS,
      hourlyCount: 0,
      hourlyLimit: isAuthenticated ? AUTH_HOURLY_MESSAGE_LIMIT : NON_AUTH_HOURLY_MESSAGE_LIMIT,
      remainingHourly: isAuthenticated ? AUTH_HOURLY_MESSAGE_LIMIT : NON_AUTH_HOURLY_MESSAGE_LIMIT,
      waitTimeSeconds: null,
    }
  }

  const dailyLimit = isAuthenticated
    ? AUTH_DAILY_MESSAGE_LIMIT
    : NON_AUTH_DAILY_MESSAGE_LIMIT

  const dailyCount = data.daily_message_count || 0
  const dailyProCount = data.daily_pro_message_count || 0

  // Get hourly usage
  let hourlyUsage = {
    hourlyCount: 0,
    hourlyLimit: isAuthenticated ? AUTH_HOURLY_MESSAGE_LIMIT : NON_AUTH_HOURLY_MESSAGE_LIMIT,
    waitTimeSeconds: null as number | null,
  }

  try {
    hourlyUsage = await checkHourlyUsage(supabase, userId, isAuthenticated)
  } catch (err) {
    console.error("Error fetching hourly usage:", err)
  }

  return {
    dailyCount,
    dailyProCount,
    dailyLimit,
    remaining: dailyLimit - dailyCount,
    remainingPro: DAILY_LIMIT_PRO_MODELS - dailyProCount,
    hourlyCount: hourlyUsage.hourlyCount,
    hourlyLimit: hourlyUsage.hourlyLimit,
    remainingHourly: hourlyUsage.hourlyLimit - hourlyUsage.hourlyCount,
    waitTimeSeconds: hourlyUsage.waitTimeSeconds,
  }
}

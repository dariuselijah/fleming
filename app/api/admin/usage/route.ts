import { NextRequest, NextResponse } from "next/server"
import { createGuestServerClient } from "@/lib/supabase/server-guest"
import { validateAdminPassword } from "@/lib/admin/password"

const TOKEN_APPROX_CHARS_PER_TOKEN = 4
const MAX_MESSAGES_LOOKBACK = 50000

type MessageRow = {
  created_at: string | null
  user_id?: string | null
  role: "system" | "user" | "assistant" | "data"
  content: string | null
  parts: unknown
}

type DailyBucket = {
  date: string
  requestCount: number
  estimatedTokens: number
  dailyUsers: number
}

function estimateTextTokens(value: string): number {
  if (!value.trim()) return 0
  return Math.max(1, Math.ceil(value.length / TOKEN_APPROX_CHARS_PER_TOKEN))
}

function estimateMessageTokens(message: MessageRow): number {
  if (typeof message.content === "string" && message.content.trim().length > 0) {
    return estimateTextTokens(message.content)
  }

  if (message.parts == null) return 0
  try {
    return estimateTextTokens(JSON.stringify(message.parts))
  } catch {
    return 0
  }
}

export async function POST(request: NextRequest) {
  try {
    const { password } = await request.json()

    if (password === "authenticated") {
      // Allow session-based refresh requests.
    } else if (!password) {
      return NextResponse.json({ error: "Password required" }, { status: 400 })
    } else {
      const isValidPassword = await validateAdminPassword(password)
      if (!isValidPassword) {
        return NextResponse.json({ error: "Invalid password" }, { status: 401 })
      }
    }

    const supabase = await createGuestServerClient()
    if (!supabase) {
      return NextResponse.json({ error: "Database connection failed" }, { status: 500 })
    }

    const now = new Date()
    const startOfToday = new Date(now)
    startOfToday.setUTCHours(0, 0, 0, 0)

    const startOf7d = new Date(startOfToday)
    startOf7d.setUTCDate(startOf7d.getUTCDate() - 6)

    const [totalUsersResult, totalRequestsResult, totalMessagesResult, messagesResult] = await Promise.all([
      supabase.from("users").select("id", { count: "exact", head: true }),
      supabase
        .from("messages")
        .select("id", { count: "exact", head: true })
        .eq("role", "user"),
      supabase.from("messages").select("id", { count: "exact", head: true }),
      supabase
        .from("messages")
        .select("created_at,user_id,role,content,parts")
        .gte("created_at", startOf7d.toISOString())
        .order("created_at", { ascending: true })
        .limit(MAX_MESSAGES_LOOKBACK),
    ])

    if (messagesResult.error) {
      throw messagesResult.error
    }

    const messages = (messagesResult.data || []) as MessageRow[]
    const todayKey = startOfToday.toISOString().slice(0, 10)

    const dailyUsersTodaySet = new Set<string>()
    let requestsToday = 0
    let estimatedInputTokensToday = 0
    let estimatedOutputTokensToday = 0
    let sampledMessageCount = 0
    let sampledTokenCount = 0

    const perDayMap = new Map<string, { requestCount: number; estimatedTokens: number; dailyUsersSet: Set<string> }>()

    for (let i = 0; i < 7; i += 1) {
      const day = new Date(startOf7d)
      day.setUTCDate(startOf7d.getUTCDate() + i)
      const key = day.toISOString().slice(0, 10)
      perDayMap.set(key, { requestCount: 0, estimatedTokens: 0, dailyUsersSet: new Set<string>() })
    }

    for (const message of messages) {
      if (!message.created_at) continue
      const dayKey = message.created_at.slice(0, 10)
      const bucket = perDayMap.get(dayKey)
      if (!bucket) continue

      const tokenEstimate = estimateMessageTokens(message)
      sampledMessageCount += 1
      sampledTokenCount += tokenEstimate
      bucket.estimatedTokens += tokenEstimate

      if (message.role === "user") {
        bucket.requestCount += 1
        if (message.user_id) {
          bucket.dailyUsersSet.add(message.user_id)
        }
      }

      if (dayKey === todayKey) {
        if (message.role === "user") {
          requestsToday += 1
          estimatedInputTokensToday += tokenEstimate
          if (message.user_id) {
            dailyUsersTodaySet.add(message.user_id)
          }
        } else if (message.role === "assistant") {
          estimatedOutputTokensToday += tokenEstimate
        }
      }
    }

    const dailySeries: DailyBucket[] = Array.from(perDayMap.entries()).map(([date, bucket]) => ({
      date,
      requestCount: bucket.requestCount,
      estimatedTokens: bucket.estimatedTokens,
      dailyUsers: bucket.dailyUsersSet.size,
    }))

    const lifetimeRequests = totalRequestsResult.count || 0
    const lifetimeMessages = totalMessagesResult.count || 0
    const sampledAvgTokensPerMessage =
      sampledMessageCount > 0 ? sampledTokenCount / sampledMessageCount : 0
    const sampledAvgTokensPerRequest =
      requestsToday > 0
        ? (estimatedInputTokensToday + estimatedOutputTokensToday) / requestsToday
        : sampledAvgTokensPerMessage
    const lifetimeEstimatedTokens = Math.round(lifetimeMessages * sampledAvgTokensPerMessage)

    const metrics = {
      users: {
        total: totalUsersResult.count || 0,
        dailyActive: dailyUsersTodaySet.size,
      },
      requests: {
        today: requestsToday,
        avgPerDailyUser: dailyUsersTodaySet.size > 0 ? Math.round((requestsToday / dailyUsersTodaySet.size) * 100) / 100 : 0,
      },
      tokens: {
        estimatedInputToday: estimatedInputTokensToday,
        estimatedOutputToday: estimatedOutputTokensToday,
        estimatedTotalToday: estimatedInputTokensToday + estimatedOutputTokensToday,
        avgPerRequest: requestsToday > 0
          ? Math.round(((estimatedInputTokensToday + estimatedOutputTokensToday) / requestsToday) * 100) / 100
          : 0,
      },
      lifetime: {
        requests: lifetimeRequests,
        estimatedTokens: lifetimeEstimatedTokens,
        avgEstimatedTokensPerRequest: Math.round(sampledAvgTokensPerRequest * 100) / 100,
      },
      dailySeries,
      sampled: messages.length >= MAX_MESSAGES_LOOKBACK,
      lastUpdated: now.toISOString(),
    }

    return NextResponse.json(metrics)
  } catch (error) {
    console.error("Usage dashboard API error:", error)
    return NextResponse.json({ error: "Failed to fetch usage metrics" }, { status: 500 })
  }
}

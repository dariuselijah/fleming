import { validateUserIdentity } from "@/lib/server/api"
import { checkHourlyAttachmentUsage } from "@/lib/usage"
import { NextRequest, NextResponse } from "next/server"

export async function POST(request: NextRequest) {
  try {
    const { userId } = await request.json()

    if (!userId) {
      return NextResponse.json({ error: "userId is required" }, { status: 400 })
    }

    const supabase = await validateUserIdentity(userId, true)
    if (!supabase) {
      return NextResponse.json({ error: "Supabase not available" }, { status: 500 })
    }

    const usage = await checkHourlyAttachmentUsage(
      supabase,
      userId,
      true
    )

    return NextResponse.json({
      success: true,
      count: usage.hourlyAttachmentCount,
      hourlyLimit: usage.hourlyAttachmentLimit,
      remaining: Math.max(0, usage.hourlyAttachmentLimit - usage.hourlyAttachmentCount),
      waitTimeSeconds: usage.waitTimeSeconds,
    })

  } catch (error) {
    console.error("Check file upload limit error:", error)
    const errorMessage = error instanceof Error ? error.message : "Internal server error"
    if (
      errorMessage.includes("authenticated user") ||
      errorMessage.includes("User ID does not match")
    ) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
} 
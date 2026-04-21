import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { StudyReviewService } from "@/lib/student-workspace/review"

export async function GET(request: Request) {
  try {
    const supabase = await createClient()
    if (!supabase) {
      return NextResponse.json({ error: "Supabase unavailable" }, { status: 500 })
    }
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const url = new URL(request.url)
    const limit = Number(url.searchParams.get("limit") || "32")
    const service = new StudyReviewService(supabase)
    const queue = await service.getDueQueue(user.id, Number.isFinite(limit) ? limit : 32)

    return NextResponse.json(queue)
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to load due review queue",
      },
      { status: 500 }
    )
  }
}

import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { StudyReviewService } from "@/lib/student-workspace/review"

export async function GET() {
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

    const service = new StudyReviewService(supabase)
    const stats = await service.getReviewStats(user.id)
    return NextResponse.json({ stats })
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to load review stats",
      },
      { status: 500 }
    )
  }
}

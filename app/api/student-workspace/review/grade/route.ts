import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { StudyReviewService } from "@/lib/student-workspace/review"

type Body = {
  reviewItemId?: string
  score?: number
  responseTimeMs?: number
  notes?: string
}

export async function POST(request: Request) {
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

    const body = (await request.json()) as Body
    if (!body.reviewItemId || typeof body.score !== "number") {
      return NextResponse.json({ error: "reviewItemId and score are required" }, { status: 400 })
    }

    const service = new StudyReviewService(supabase)
    const item = await service.gradeReviewItem({
      userId: user.id,
      reviewItemId: body.reviewItemId,
      score: body.score,
      responseTimeMs: body.responseTimeMs,
      notes: body.notes,
    })

    if (!item) {
      return NextResponse.json({ error: "Review item not found" }, { status: 404 })
    }

    return NextResponse.json({ item })
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to grade review item",
      },
      { status: 500 }
    )
  }
}

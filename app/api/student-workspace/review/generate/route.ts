import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { StudyReviewService } from "@/lib/student-workspace/review"

type Body = {
  limit?: number
  uploadIds?: string[]
  courseIds?: string[]
  topicLabels?: string[]
  graphNodeIds?: string[]
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

    const body = (await request.json().catch(() => ({}))) as Body
    const service = new StudyReviewService(supabase)
    const items = await service.generateReviewItems({
      userId: user.id,
      limit: body.limit,
      uploadIds: Array.isArray(body.uploadIds) ? body.uploadIds : undefined,
      courseIds: Array.isArray(body.courseIds) ? body.courseIds : undefined,
      topicLabels: Array.isArray(body.topicLabels) ? body.topicLabels : undefined,
      graphNodeIds: Array.isArray(body.graphNodeIds) ? body.graphNodeIds : undefined,
    })

    return NextResponse.json({ items, generated: items.length })
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to generate review items",
      },
      { status: 500 }
    )
  }
}

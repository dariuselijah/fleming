import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { StudyPlannerService } from "@/lib/student-workspace/planner"

type GeneratePlannerBody = {
  title?: string
  timezone?: string
  startDate?: string
  endDate?: string
  hoursPerDay?: number
  collectionId?: string
  uploadIds?: string[]
  courseIds?: string[]
  topicLabels?: string[]
  graphNodeIds?: string[]
}

function defaultDateRange() {
  const now = new Date()
  const start = now.toISOString().slice(0, 10)
  const endDate = new Date(now)
  endDate.setUTCDate(endDate.getUTCDate() + 14)
  const end = endDate.toISOString().slice(0, 10)
  return { start, end }
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

    const body = (await request.json().catch(() => ({}))) as GeneratePlannerBody
    const defaults = defaultDateRange()
    const service = new StudyPlannerService(supabase)
    const plan = await service.generatePlan({
      userId: user.id,
      title: body.title,
      timezone: body.timezone,
      startDate: body.startDate || defaults.start,
      endDate: body.endDate || defaults.end,
      hoursPerDay: body.hoursPerDay,
      collectionId: body.collectionId,
      uploadIds: Array.isArray(body.uploadIds) ? body.uploadIds : undefined,
      courseIds: Array.isArray(body.courseIds) ? body.courseIds : undefined,
      topicLabels: Array.isArray(body.topicLabels) ? body.topicLabels : undefined,
      graphNodeIds: Array.isArray(body.graphNodeIds) ? body.graphNodeIds : undefined,
    })

    return NextResponse.json(plan)
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to generate plan",
      },
      { status: 500 }
    )
  }
}

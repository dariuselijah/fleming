import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { StudyPlannerService } from "@/lib/student-workspace/planner"

type RouteContext = {
  params: Promise<{
    planId: string
  }>
}

export async function GET(_request: Request, context: RouteContext) {
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

    const { planId } = await context.params
    const service = new StudyPlannerService(supabase)
    const plan = await service.getPlanWithBlocks(user.id, planId)
    if (!plan) {
      return NextResponse.json({ error: "Plan not found" }, { status: 404 })
    }

    return NextResponse.json(plan)
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to load plan",
      },
      { status: 500 }
    )
  }
}

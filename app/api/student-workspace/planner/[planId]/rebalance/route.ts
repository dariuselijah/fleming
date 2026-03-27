import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { StudyPlannerService } from "@/lib/student-workspace/planner"

type RouteContext = {
  params: Promise<{
    planId: string
  }>
}

type RebalanceBody = {
  missedBlockIds?: string[]
}

export async function POST(request: Request, context: RouteContext) {
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

    const body = (await request.json().catch(() => ({}))) as RebalanceBody
    const { planId } = await context.params
    const service = new StudyPlannerService(supabase)
    const nextPlan = await service.rebalancePlan({
      userId: user.id,
      planId,
      missedBlockIds: body.missedBlockIds,
    })
    if (!nextPlan) {
      return NextResponse.json({ error: "Plan not found" }, { status: 404 })
    }

    return NextResponse.json(nextPlan)
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to rebalance plan",
      },
      { status: 500 }
    )
  }
}

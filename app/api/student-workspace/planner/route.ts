import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { StudyPlannerService } from "@/lib/student-workspace/planner"

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

    const service = new StudyPlannerService(supabase)
    const plans = await service.listPlans(user.id)
    return NextResponse.json({ plans })
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to list plans",
      },
      { status: 500 }
    )
  }
}

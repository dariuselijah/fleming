import { readHealthSummaryForUser } from "@/lib/health-connectors/data-store"
import { createClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"

function clampScore(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.max(0, Math.min(100, Math.round(value)))
}

function computeOverviewFromMetrics(latestMetrics: Record<string, number>) {
  const steps = latestMetrics.steps || 0
  const sleepHours =
    latestMetrics.sleep_hours ||
    latestMetrics.sleep_score ||
    0
  const readinessSignal =
    latestMetrics.readiness_score ||
    latestMetrics.recovery_score ||
    latestMetrics.strain_score ||
    0

  const activityScore = clampScore(Math.min(steps / 120, 100))
  const sleepScore = clampScore(
    sleepHours > 20 ? sleepHours : sleepHours * 12.5
  )
  const readinessScore = clampScore(
    readinessSignal > 0
      ? readinessSignal
      : (activityScore * 0.45 + sleepScore * 0.55)
  )

  return {
    readinessScore,
    sleepScore,
    activityScore,
    steps,
    sleepHours,
    readinessSignal,
  }
}

export async function GET() {
  try {
    const supabase = await createClient()
    if (!supabase) {
      return NextResponse.json(
        {
          authenticated: false,
          summary: null,
        },
        { status: 200 }
      )
    }

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()
    if (authError || !user?.id) {
      return NextResponse.json(
        {
          authenticated: false,
          summary: null,
        },
        { status: 200 }
      )
    }

    const data = await readHealthSummaryForUser(user.id)
    const overview = computeOverviewFromMetrics(data.latestMetrics)
    return NextResponse.json(
      {
        authenticated: true,
        summary: {
          ...overview,
          latestMetrics: data.latestMetrics,
          metricSampleCount: data.metricSampleCount,
          recentClinicalRecordCount: data.recentClinicalRecordCount,
        },
      },
      { status: 200 }
    )
  } catch (error) {
    return NextResponse.json(
      {
        error: "Failed to load health summary",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    )
  }
}

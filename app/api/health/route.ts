import { readHealthSummaryForUser } from "@/lib/health-connectors/data-store"
import { createClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"

function clampScore(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.max(0, Math.min(100, Math.round(value)))
}

function computeOverview(latestMetrics: Record<string, number>) {
  const steps = latestMetrics.steps || 0
  const sleepHours = latestMetrics.sleep_hours || latestMetrics.sleep_score || 0
  const readinessSignal =
    latestMetrics.readiness_score ||
    latestMetrics.recovery_score ||
    latestMetrics.strain_score ||
    0

  const activityScore = clampScore(Math.min(steps / 120, 100))
  const sleepScore = clampScore(sleepHours > 20 ? sleepHours : sleepHours * 12.5)
  const readinessScore = clampScore(
    readinessSignal > 0
      ? readinessSignal
      : activityScore * 0.45 + sleepScore * 0.55
  )

  return {
    readinessScore,
    sleepScore,
    activityScore,
  }
}

export async function GET() {
  let summary: Record<string, unknown> | null = null
  try {
    const supabase = await createClient()
    if (supabase) {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (user?.id) {
        const data = await readHealthSummaryForUser(user.id)
        summary = {
          ...computeOverview(data.latestMetrics),
          latestMetrics: data.latestMetrics,
          metricSampleCount: data.metricSampleCount,
          recentClinicalRecordCount: data.recentClinicalRecordCount,
        }
      }
    }
  } catch {
    summary = null
  }

  return NextResponse.json(
    {
      status: "ok",
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      summary,
    },
    { status: 200 }
  )
}
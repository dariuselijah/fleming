import { syncAllConnectedConnectorsForUser, syncConnectorForUser } from "@/lib/health-connectors/sync-engine"
import type { HealthConnectorId } from "@/lib/health-connectors/types"
import { createClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as {
      connectorId?: string
      all?: boolean
    }

    const supabase = await createClient()
    if (!supabase) {
      return NextResponse.json(
        { error: "Supabase is not configured" },
        { status: 500 }
      )
    }

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()
    if (authError || !user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    if (body.all === true) {
      const summaries = await syncAllConnectedConnectorsForUser(user.id)
      return NextResponse.json(
        {
          mode: "all",
          count: summaries.length,
          summaries,
        },
        { status: 200 }
      )
    }

    if (!body.connectorId) {
      return NextResponse.json(
        { error: "connectorId is required when all=false" },
        { status: 400 }
      )
    }

    const summary = await syncConnectorForUser(user.id, body.connectorId as HealthConnectorId)
    return NextResponse.json(
      {
        mode: "single",
        summary,
      },
      { status: 200 }
    )
  } catch (error) {
    return NextResponse.json(
      {
        error: "Failed to sync connector",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    )
  }
}

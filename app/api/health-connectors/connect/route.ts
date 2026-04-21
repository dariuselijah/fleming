import { getHealthConnectorById } from "@/lib/health-connectors/catalog"
import { startOAuth1aConnectorAuthorization } from "@/lib/health-connectors/oauth1a"
import {
  setConnectorStatusForUser,
  startConnectorConnect,
} from "@/lib/health-connectors/server"
import type { HealthConnectorId } from "@/lib/health-connectors/types"
import { createClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { connectorId?: string }
    const connectorId = body.connectorId

    if (!connectorId) {
      return NextResponse.json(
        { error: "connectorId is required" },
        { status: 400 }
      )
    }

    const connector = getHealthConnectorById(connectorId)
    if (!connector) {
      return NextResponse.json(
        { error: "Unknown connector" },
        { status: 404 }
      )
    }

    const supabase = await createClient()
    if (!supabase) {
      return NextResponse.json(
        {
          connectorId,
          status: connector.availability === "coming_soon" ? "coming_soon" : "error",
          message:
            connector.availability === "coming_soon"
              ? connector.comingSoonReason || "Connector is coming soon."
              : "Database connection is not configured.",
        },
        { status: 200 }
      )
    }

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    if (connector.protocol === "oauth1a") {
      const oauth1aResult = await startOAuth1aConnectorAuthorization(
        user.id,
        connector.id as HealthConnectorId
      )
      return NextResponse.json(oauth1aResult, { status: 200 })
    }

    const result = startConnectorConnect(connector.id, user.id)

    if (result.status === "pending" || result.status === "connected") {
      await setConnectorStatusForUser(
        user.id,
        connector.id as HealthConnectorId,
        result.status,
        { metadata: { initiatedAt: new Date().toISOString() } }
      )
    } else if (result.status === "error") {
      await setConnectorStatusForUser(
        user.id,
        connector.id as HealthConnectorId,
        "error",
        { lastError: result.message || "Connector startup failed." }
      )
    } else if (result.status === "coming_soon") {
      await setConnectorStatusForUser(
        user.id,
        connector.id as HealthConnectorId,
        "coming_soon"
      )
    }

    return NextResponse.json(result, { status: 200 })
  } catch (error) {
    return NextResponse.json(
      {
        error: "Failed to start connector connection",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    )
  }
}

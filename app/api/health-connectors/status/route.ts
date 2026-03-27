import { getHealthConnectorCatalog } from "@/lib/health-connectors/catalog"
import { listConnectorStatusesForUser } from "@/lib/health-connectors/server"
import { createClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"

export async function GET() {
  try {
    const supabase = await createClient()
    if (!supabase) {
      const fallback = getHealthConnectorCatalog().reduce(
        (acc, connector) => {
          acc[connector.id] = {
            connectorId: connector.id,
            status: connector.availability === "coming_soon" ? "coming_soon" : "not_connected",
          }
          return acc
        },
        {} as Record<string, { connectorId: string; status: string }>
      )
      return NextResponse.json(
        {
          authenticated: false,
          statuses: fallback,
        },
        { status: 200 }
      )
    }

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user?.id) {
      const fallback = getHealthConnectorCatalog().reduce(
        (acc, connector) => {
          acc[connector.id] = {
            connectorId: connector.id,
            status: connector.availability === "coming_soon" ? "coming_soon" : "not_connected",
          }
          return acc
        },
        {} as Record<string, { connectorId: string; status: string }>
      )
      return NextResponse.json(
        {
          authenticated: false,
          statuses: fallback,
        },
        { status: 200 }
      )
    }

    const statuses = await listConnectorStatusesForUser(user.id)
    return NextResponse.json(
      {
        authenticated: true,
        statuses,
      },
      { status: 200 }
    )
  } catch (error) {
    return NextResponse.json(
      {
        error: "Failed to fetch connector statuses",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    )
  }
}

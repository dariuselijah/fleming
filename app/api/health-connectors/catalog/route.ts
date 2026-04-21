import { getHealthConnectorCatalog } from "@/lib/health-connectors/catalog"
import { NextResponse } from "next/server"

export async function GET() {
  const connectors = getHealthConnectorCatalog()
  return NextResponse.json(
    {
      connectors,
      generatedAt: new Date().toISOString(),
    },
    { status: 200 }
  )
}

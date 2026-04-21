import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { listPluginStatusesForUser } from "@/lib/plugins/server"
import { getStudentPluginCatalog } from "@/lib/plugins/catalog"

export async function GET() {
  try {
    const supabase = await createClient()
    if (!supabase) {
      return NextResponse.json(
        {
          authenticated: false,
          statuses: getStudentPluginCatalog().reduce(
            (acc, plugin) => {
              acc[plugin.id] = {
                pluginId: plugin.id,
                status: plugin.availability === "coming_soon" ? "coming_soon" : "not_connected",
              }
              return acc
            },
            {} as Record<string, { pluginId: string; status: string }>
          ),
        },
        { status: 200 }
      )
    }

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const statuses = await listPluginStatusesForUser(user.id)
    return NextResponse.json({ authenticated: true, statuses })
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to load plugin statuses",
      },
      { status: 500 }
    )
  }
}

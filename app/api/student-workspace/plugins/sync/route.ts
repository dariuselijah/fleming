import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { isStudentPluginId } from "@/lib/plugins/catalog"
import { runPluginSync } from "@/lib/plugins/server"

type Body = {
  pluginId?: string
  metadata?: Record<string, unknown>
}

export async function POST(request: Request) {
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

    const body = (await request.json()) as Body
    if (!body.pluginId || !isStudentPluginId(body.pluginId)) {
      return NextResponse.json({ error: "Valid pluginId is required" }, { status: 400 })
    }

    const result = await runPluginSync(user.id, body.pluginId, body.metadata)
    return NextResponse.json(result)
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to run plugin sync",
      },
      { status: 500 }
    )
  }
}

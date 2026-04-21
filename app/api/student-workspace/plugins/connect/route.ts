import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { isStudentPluginId } from "@/lib/plugins/catalog"
import { setPluginStatusForUser, startPluginConnect } from "@/lib/plugins/server"

type Body = {
  pluginId?: string
  connection?: {
    baseUrl?: string
    accessToken?: string
    courseIds?: string[]
  }
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

    const result = await startPluginConnect(body.pluginId, {
      connection: body.connection,
    })
    await setPluginStatusForUser(user.id, body.pluginId, result.status, {
      lastError: result.status === "error" ? result.message : null,
      metadata: {
        initiatedAt: new Date().toISOString(),
        ...(result.metadata || {}),
      },
    })

    return NextResponse.json(result)
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to connect plugin",
      },
      { status: 500 }
    )
  }
}

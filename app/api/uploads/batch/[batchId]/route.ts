import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { UploadBatchService } from "@/lib/uploads/batch"

type RouteContext = {
  params: Promise<{
    batchId: string
  }>
}

export async function GET(_request: Request, context: RouteContext) {
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

    const { batchId } = await context.params
    const service = new UploadBatchService(supabase)
    const status = await service.getBatchStatus(user.id, batchId)
    if (!status) {
      return NextResponse.json({ error: "Batch not found" }, { status: 404 })
    }

    return NextResponse.json(status, {
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
      },
    })
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to fetch batch status",
      },
      { status: 500 }
    )
  }
}

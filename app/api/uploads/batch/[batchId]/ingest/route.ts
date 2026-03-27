import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { UploadBatchService } from "@/lib/uploads/batch"
import { invalidateUploadRetrievalPreflightCacheForUser } from "@/lib/uploads/retrieval-preflight-cache"

type RouteContext = {
  params: Promise<{
    batchId: string
  }>
}

type IngestBody = {
  maxConcurrency?: number
  reprocessFailed?: boolean
}

export async function POST(request: Request, context: RouteContext) {
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
    const body = (await request.json().catch(() => ({}))) as IngestBody
    const service = new UploadBatchService(supabase)

    invalidateUploadRetrievalPreflightCacheForUser(user.id)
    setTimeout(() => {
      void service
        .startBatchIngest(user.id, batchId, {
          maxConcurrency:
            typeof body.maxConcurrency === "number" && Number.isFinite(body.maxConcurrency)
              ? body.maxConcurrency
              : undefined,
          reprocessFailed: body.reprocessFailed === true,
        })
        .catch((error) => {
          console.error(
            `[UPLOAD BATCH] Background batch ingest failed for ${batchId}:`,
            error instanceof Error ? error.message : error
          )
        })
    }, 0)

    const status = await service.getBatchStatus(user.id, batchId)
    if (!status) {
      return NextResponse.json({ error: "Batch not found" }, { status: 404 })
    }

    return NextResponse.json({ accepted: true, ...status }, { status: 202 })
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to start batch ingest",
      },
      { status: 500 }
    )
  }
}

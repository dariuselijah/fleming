import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { UserUploadService } from "@/lib/uploads/server"
import { invalidateUploadRetrievalPreflightCacheForUser } from "@/lib/uploads/retrieval-preflight-cache"

type RouteContext = {
  params: Promise<{
    uploadId: string
  }>
}

export async function POST(_request: Request, context: RouteContext) {
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

    const { uploadId } = await context.params
    const service = new UserUploadService(supabase)
    invalidateUploadRetrievalPreflightCacheForUser(user.id)
    setTimeout(() => {
      void service.reprocessUpload(user.id, uploadId).catch((error) => {
        console.error(
          `[UPLOAD REPROCESS] Background reprocess failed for ${uploadId}:`,
          error instanceof Error ? error.message : error
        )
      })
    }, 0)

    const upload = await service.getUploadListItem(user.id, uploadId)

    return NextResponse.json({ upload, accepted: true }, { status: 202 })
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to reprocess upload",
      },
      { status: 500 }
    )
  }
}

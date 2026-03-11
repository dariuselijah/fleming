import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { UserUploadService } from "@/lib/uploads/server"
import { invalidateUploadRetrievalPreflightCacheForUser } from "@/lib/uploads/retrieval-preflight-cache"

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

    const body = await request.json()
    const service = new UserUploadService(supabase)
    const pendingUpload = await service.createPendingUpload({
      userId: user.id,
      fileName: String(body.fileName || ""),
      mimeType: String(body.mimeType || "application/octet-stream"),
      fileSize: Number(body.fileSize || 0),
      title: typeof body.title === "string" ? body.title : undefined,
    })
    invalidateUploadRetrievalPreflightCacheForUser(user.id)

    return NextResponse.json({ upload: pendingUpload })
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to initialize upload",
      },
      { status: 500 }
    )
  }
}

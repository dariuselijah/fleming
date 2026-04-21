import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { UploadBatchService } from "@/lib/uploads/batch"
import { invalidateUploadRetrievalPreflightCacheForUser } from "@/lib/uploads/retrieval-preflight-cache"

type BatchInitRequestBody = {
  collectionName?: string
  description?: string
  maxConcurrency?: number
  files?: Array<{
    fileName?: string
    mimeType?: string
    fileSize?: number
    title?: string
  }>
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

    const body = (await request.json()) as BatchInitRequestBody
    if (!Array.isArray(body.files) || body.files.length === 0) {
      return NextResponse.json({ error: "At least one file is required" }, { status: 400 })
    }

    const normalizedFiles = body.files.map((file) => ({
      fileName: String(file.fileName || "").trim(),
      mimeType: String(file.mimeType || "application/octet-stream"),
      fileSize: Number(file.fileSize || 0),
      title: typeof file.title === "string" ? file.title : undefined,
    }))

    if (normalizedFiles.some((file) => !file.fileName || !Number.isFinite(file.fileSize) || file.fileSize <= 0)) {
      return NextResponse.json({ error: "Each file requires fileName and fileSize" }, { status: 400 })
    }

    const service = new UploadBatchService(supabase)
    const payload = await service.createBatchInit({
      userId: user.id,
      collectionName: body.collectionName?.trim() || "Bulk upload collection",
      description: body.description,
      files: normalizedFiles,
      maxConcurrency:
        typeof body.maxConcurrency === "number" && Number.isFinite(body.maxConcurrency)
          ? body.maxConcurrency
          : undefined,
    })

    invalidateUploadRetrievalPreflightCacheForUser(user.id)
    return NextResponse.json(payload, { status: 200 })
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to initialize batch upload",
      },
      { status: 500 }
    )
  }
}

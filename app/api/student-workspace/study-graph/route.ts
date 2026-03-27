/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { StudyGraphService } from "@/lib/student-workspace/study-graph"
import type { StudyExtractionMetadata } from "@/lib/student-workspace/types"

export async function GET(request: Request) {
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

    const url = new URL(request.url)
    const query = url.searchParams.get("q") || undefined
    const uploadId = url.searchParams.get("uploadId") || undefined
    const limitRaw = Number(url.searchParams.get("limit") || "24")
    const limit = Number.isFinite(limitRaw) ? limitRaw : 24

    const service = new StudyGraphService(supabase)
    const [overview, nodes, edges] = await Promise.all([
      service.getOverview(user.id),
      service.searchNodes({ userId: user.id, query, uploadId, limit }),
      service.listEdges(user.id),
    ])

    return NextResponse.json({
      overview,
      nodes,
      edges,
    })
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to load study graph",
      },
      { status: 500 }
    )
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

    const body = (await request.json()) as {
      uploadId?: string
      uploadTitle?: string
      extraction?: StudyExtractionMetadata
    }

    if (!body.uploadId) {
      return NextResponse.json({ error: "uploadId is required" }, { status: 400 })
    }

    let extraction = body.extraction || null
    let uploadTitle = body.uploadTitle || "Uploaded material"
    let sourceMetadata: Record<string, unknown> = {}
    if (!extraction) {
      const { data: upload, error: uploadError } = await (supabase as any)
        .from("user_uploads")
        .select("title, metadata")
        .eq("id", body.uploadId)
        .eq("user_id", user.id)
        .maybeSingle()

      if (uploadError) {
        return NextResponse.json({ error: uploadError.message }, { status: 500 })
      }
      if (!upload) {
        return NextResponse.json({ error: "Upload not found" }, { status: 404 })
      }

      uploadTitle = upload.title || uploadTitle
      extraction = upload.metadata?.studyExtraction || null
      sourceMetadata =
        upload.metadata && typeof upload.metadata === "object"
          ? (upload.metadata as Record<string, unknown>)
          : {}
    }

    if (!extraction) {
      return NextResponse.json(
        { error: "No structured parser metadata found for this upload" },
        { status: 400 }
      )
    }

    const service = new StudyGraphService(supabase)
    const result = await service.rebuildGraphFromUpload({
      userId: user.id,
      uploadId: body.uploadId,
      uploadTitle,
      extraction,
      sourceMetadata,
    })

    return NextResponse.json({
      success: true,
      ...result,
    })
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to rebuild study graph",
      },
      { status: 500 }
    )
  }
}

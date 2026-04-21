/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { deriveStudyExtractionMetadata } from "@/lib/student-workspace/parser"
import type { ParsedSourceUnit } from "@/lib/rag/types"

type Body = {
  uploadId?: string
}

function normalizeExtraction(value: Record<string, unknown>) {
  return {
    ...value,
    topicLabels: Array.isArray(value.topicLabels) ? value.topicLabels : [],
    objectives: Array.isArray(value.objectives) ? value.objectives : [],
    actionables: Array.isArray(value.actionables) ? value.actionables : [],
    lectureSummary: typeof value.lectureSummary === "string" ? value.lectureSummary : null,
    timetableEntries: Array.isArray(value.timetableEntries) ? value.timetableEntries : [],
    ocrSuggested: value.ocrSuggested === true,
    hasImageHeavyUnits: value.hasImageHeavyUnits === true,
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
    if (!body.uploadId) {
      return NextResponse.json({ error: "uploadId is required" }, { status: 400 })
    }

    const { data: upload, error: uploadError } = await (supabase as any)
      .from("user_uploads")
      .select("id, title, upload_kind, metadata")
      .eq("id", body.uploadId)
      .eq("user_id", user.id)
      .maybeSingle()

    if (uploadError) {
      throw new Error(uploadError.message || "Failed to load upload")
    }
    if (!upload) {
      return NextResponse.json({ error: "Upload not found" }, { status: 404 })
    }

    const existingExtraction = upload.metadata?.studyExtraction
    if (existingExtraction) {
      return NextResponse.json({
        extraction: normalizeExtraction(existingExtraction as Record<string, unknown>),
        source: "cached",
      })
    }

    const { data: sourceUnits, error: unitsError } = await (supabase as any)
      .from("user_upload_source_units")
      .select("unit_type, unit_number, title, extracted_text, ocr_status, metadata, width, height")
      .eq("upload_id", body.uploadId)
      .eq("user_id", user.id)
      .order("unit_number", { ascending: true })

    if (unitsError) {
      throw new Error(unitsError.message || "Failed to load source units")
    }

    const parsedUnits: ParsedSourceUnit[] = ((sourceUnits || []) as any[]).map((unit) => ({
      unitType: unit.unit_type,
      unitNumber: unit.unit_number,
      title: unit.title || undefined,
      extractedText: unit.extracted_text || "",
      figures: [],
      ocrStatus: unit.ocr_status || "not_required",
      metadata: unit.metadata || {},
      width: unit.width || undefined,
      height: unit.height || undefined,
    }))

    const extraction = deriveStudyExtractionMetadata({
      uploadTitle: upload.title || "Uploaded material",
      uploadKind: upload.upload_kind || "other",
      sourceUnits: parsedUnits,
    })

    return NextResponse.json({ extraction: normalizeExtraction(extraction as Record<string, unknown>), source: "on_demand" })
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to parse study materials",
      },
      { status: 500 }
    )
  }
}

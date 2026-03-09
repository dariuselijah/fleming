import { NextResponse } from "next/server"
import { z } from "zod"
import { createClient } from "@/lib/supabase/server"
import {
  buildExportFileName,
  exportDocumentArtifact,
  type DocumentExportFormat,
} from "@/lib/documents/export"
import type { DocumentArtifact } from "@/lib/uploads/artifacts"

const exportRequestSchema = z.object({
  format: z.enum(["pdf", "docx"]),
  artifact: z.object({
    artifactType: z.literal("document"),
    artifactId: z.string(),
    title: z.string(),
    query: z.string(),
    citationStyle: z.enum(["harvard", "apa", "vancouver"]),
    markdown: z.string(),
    sections: z.array(
      z.object({
        heading: z.string(),
        content: z.string(),
      })
    ),
    bibliography: z.array(
      z.object({
        index: z.number(),
        entry: z.string(),
      })
    ),
    citations: z.array(z.any()),
    warnings: z.array(z.string()),
    uploadId: z.string().nullable().optional(),
    uploadTitle: z.string().nullable().optional(),
    generatedAt: z.string(),
  }),
})

export const runtime = "nodejs"

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

    const json = await request.json()
    const parsed = exportRequestSchema.safeParse(json)
    if (!parsed.success) {
      return NextResponse.json(
        {
          error: "Invalid export payload",
          details: parsed.error.flatten(),
        },
        { status: 400 }
      )
    }

    const format = parsed.data.format as DocumentExportFormat
    const artifact = parsed.data.artifact as DocumentArtifact
    const result = await exportDocumentArtifact(artifact, format)
    const fileName = buildExportFileName(artifact, format)

    return new Response(Buffer.from(result.bytes), {
      status: 200,
      headers: {
        "Content-Type": result.mimeType,
        "Content-Disposition": `attachment; filename="${fileName}"`,
        "Cache-Control": "no-store",
      },
    })
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to export document artifact",
      },
      { status: 500 }
    )
  }
}

import { NextRequest } from "next/server"
import { createClient } from "@/lib/supabase/server"
import {
  assertSmartImportFileSize,
  readSmartImportDocument,
  structureSmartImport,
  type SmartImportClientMode,
} from "@/lib/clinical/smart-import-extract"

export const runtime = "nodejs"
export const maxDuration = 300

function ndjsonLine(obj: unknown): Uint8Array {
  return new TextEncoder().encode(`${JSON.stringify(obj)}\n`)
}

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  if (!supabase) {
    return new Response(JSON.stringify({ error: "Service unavailable" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    })
  }

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError || !user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    })
  }

  const form = await request.formData()
  const file = form.get("file")
  const modeRaw = (form.get("mode") as string) || "auto"
  const streamRaw = form.get("stream")
  const wantStream = streamRaw !== "0" && streamRaw !== "false"

  if (!(file instanceof File)) {
    return new Response(JSON.stringify({ error: "Missing file" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    })
  }

  const mode: SmartImportClientMode =
    modeRaw === "patient_file" || modeRaw === "attach" ? modeRaw : "auto"

  const buffer = Buffer.from(await file.arrayBuffer())

  try {
    assertSmartImportFileSize(buffer.length)
  } catch (e) {
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "File too large" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    })
  }

  if (!wantStream) {
    try {
      const read = await readSmartImportDocument(
        buffer,
        file.type || "application/octet-stream",
        file.name
      )
      const structured = await structureSmartImport({
        mode,
        text: read.text,
        fileName: file.name,
        pageCount: read.pageCount,
        imageBuffer: read.mimeType.startsWith("image/") ? buffer : undefined,
        imageMime: read.mimeType.startsWith("image/") ? read.mimeType : undefined,
      })
      return Response.json({
        detected: structured.detectedLabel,
        fields: structured.fields,
        warnings: read.warnings,
      })
    } catch (e) {
      console.error("[smart-import/extract]", e)
      return Response.json(
        { error: e instanceof Error ? e.message : "Extraction failed" },
        { status: 500 }
      )
    }
  }

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (obj: unknown) => controller.enqueue(ndjsonLine(obj))
      try {
        send({ type: "stage", stage: "read", message: "Reading document…" })
        const read = await readSmartImportDocument(
          buffer,
          file.type || "application/octet-stream",
          file.name,
          (progress) => {
            if (progress === "pdf_text") {
              send({ type: "stage", stage: "pdf", message: "Extracting PDF text…" })
            } else {
              send({
                type: "stage",
                stage: "vision",
                message: "Reading scan with GPT-5.2 vision…",
              })
            }
          }
        )

        send({ type: "stage", stage: "structure", message: "Parsing fields with AI…" })
        const structured = await structureSmartImport({
          mode,
          text: read.text,
          fileName: file.name,
          pageCount: read.pageCount,
          imageBuffer: read.mimeType.startsWith("image/") ? buffer : undefined,
          imageMime: read.mimeType.startsWith("image/") ? read.mimeType : undefined,
        })

        send({
          type: "done",
          detected: structured.detectedLabel,
          fields: structured.fields,
          warnings: read.warnings,
        })
      } catch (e) {
        console.error("[smart-import/extract stream]", e)
        send({
          type: "error",
          message: e instanceof Error ? e.message : "Extraction failed",
        })
      } finally {
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store",
    },
  })
}

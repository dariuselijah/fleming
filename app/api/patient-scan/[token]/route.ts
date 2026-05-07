import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import {
  assertSmartImportFileSize,
  readSmartImportDocument,
  structureSmartImport,
} from "@/lib/clinical/smart-import-extract"
import {
  buildPatientScanResult,
  hashPatientScanToken,
  normalizePatientScanSessionRow,
  type PatientScanDocument,
  type PatientScanDocumentKind,
} from "@/lib/clinical/patient-scan-session"

type RouteContext = {
  params: Promise<{ token: string }>
}

const FILE_FIELDS: Array<{ field: string; kind: PatientScanDocumentKind; label: string }> = [
  { field: "idDocument", kind: "id_document", label: "ID document" },
  { field: "medicalAidCard", kind: "medical_aid_card", label: "Medical aid card" },
]

function isExpired(expiresAt: string): boolean {
  return new Date(expiresAt).getTime() <= Date.now()
}

async function findSessionByToken(rawToken: string) {
  const admin = createAdminClient() as any
  const tokenHash = hashPatientScanToken(rawToken)
  const { data, error } = await admin
    .from("patient_scan_sessions")
    .select("id,status,documents,extracted_fields,prefill,missing_fields,error,expires_at")
    .eq("token_hash", tokenHash)
    .maybeSingle()
  if (error) throw new Error(error.message)
  return data as Record<string, unknown> | null
}

async function expireSession(id: string) {
  const admin = createAdminClient() as any
  await admin.from("patient_scan_sessions").update({ status: "expired" }).eq("id", id)
}

export async function GET(_request: NextRequest, context: RouteContext) {
  try {
    const { token } = await context.params
    const session = await findSessionByToken(decodeURIComponent(token))
    if (!session) {
      return NextResponse.json({ error: "Scan link not found" }, { status: 404 })
    }

    if (isExpired(String(session.expires_at))) {
      await expireSession(String(session.id))
      return NextResponse.json({ error: "Scan link expired" }, { status: 410 })
    }

    if (session.status === "cancelled") {
      return NextResponse.json({ error: "Scan session was cancelled" }, { status: 410 })
    }

    if (session.status === "created") {
      const admin = createAdminClient() as any
      await admin
        .from("patient_scan_sessions")
        .update({ status: "opened", connected_at: new Date().toISOString() })
        .eq("id", session.id)
    }

    return NextResponse.json({ session: normalizePatientScanSessionRow(session) })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not load scan session" },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest, context: RouteContext) {
  let sessionId: string | null = null

  try {
    const admin = createAdminClient() as any
    const { token } = await context.params
    const session = await findSessionByToken(decodeURIComponent(token))
    if (!session) {
      return NextResponse.json({ error: "Scan link not found" }, { status: 404 })
    }

    sessionId = String(session.id)
    if (isExpired(String(session.expires_at))) {
      await expireSession(sessionId)
      return NextResponse.json({ error: "Scan link expired" }, { status: 410 })
    }

    if (session.status === "cancelled") {
      return NextResponse.json({ error: "Scan session was cancelled" }, { status: 410 })
    }

    await admin
      .from("patient_scan_sessions")
      .update({ status: "processing", error: null, connected_at: new Date().toISOString() })
      .eq("id", sessionId)

    const formData = await request.formData()
    const nextDocuments: PatientScanDocument[] = Array.isArray(session.documents)
      ? [...(session.documents as PatientScanDocument[])]
      : []

    for (const spec of FILE_FIELDS) {
      const file = formData.get(spec.field)
      if (!(file instanceof File) || file.size === 0) continue

      assertSmartImportFileSize(file.size)
      const buffer = Buffer.from(await file.arrayBuffer())
      const read = await readSmartImportDocument(
        buffer,
        file.type || "application/octet-stream",
        file.name || spec.label,
        undefined,
        "patient_file"
      )
      const structured = await structureSmartImport({
        mode: "patient_file",
        text: read.text,
        fileName: file.name || spec.label,
        pageCount: read.pageCount,
        imageBuffer: buffer,
        imageMime: read.mimeType,
      })

      const existingIndex = nextDocuments.findIndex((doc) => doc.kind === spec.kind)
      const document: PatientScanDocument = {
        kind: spec.kind,
        fileName: file.name || spec.label,
        detectedLabel: structured.detectedLabel,
        fields: structured.fields,
        warnings: read.warnings,
      }
      if (existingIndex >= 0) nextDocuments[existingIndex] = document
      else nextDocuments.push(document)
    }

    if (nextDocuments.length === 0) {
      await admin
        .from("patient_scan_sessions")
        .update({ status: "error", error: "Upload at least one ID or medical aid image." })
        .eq("id", sessionId)
      return NextResponse.json({ error: "Upload at least one image" }, { status: 400 })
    }

    const result = buildPatientScanResult(nextDocuments)
    const { data, error } = await admin
      .from("patient_scan_sessions")
      .update({
        status: "submitted",
        documents: nextDocuments,
        extracted_fields: result.extractedFields,
        prefill: result.prefill,
        missing_fields: result.missingFields,
        submitted_at: new Date().toISOString(),
        error: null,
      })
      .eq("id", sessionId)
      .select("id,status,documents,extracted_fields,prefill,missing_fields,error,expires_at")
      .single()

    if (error) throw new Error(error.message)

    return NextResponse.json({ session: normalizePatientScanSessionRow(data) })
  } catch (error) {
    if (sessionId) {
      const admin = createAdminClient() as any
      await admin
        .from("patient_scan_sessions")
        .update({
          status: "error",
          error: error instanceof Error ? error.message : "Could not process scan",
        })
        .eq("id", sessionId)
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not process scan" },
      { status: 500 }
    )
  }
}

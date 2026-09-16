import { NextResponse } from "next/server"
import { requirePracticePermission } from "@/lib/auth/guard"
import { createAdminClient } from "@/lib/supabase/admin"
import { randomUUID } from "crypto"

export const runtime = "nodejs"

const BUCKET = "patient-attachments"
const MAX_BYTES = 20 * 1024 * 1024
const ALLOWED_MIME = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "text/plain",
])

type Ctx = { params: Promise<{ id: string }> }

export async function GET(_req: Request, context: Ctx) {
  const guard = await requirePracticePermission("patients:access")
  if (!guard.ok) return guard.response
  const { supabase, activePracticeId: practiceId } = guard.context
  const patientId = (await context.params).id

  const { data: p } = await supabase
    .from("practice_patients")
    .select("id")
    .eq("id", patientId)
    .eq("practice_id", practiceId)
    .maybeSingle()
  if (!p) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const { data, error } = await supabase
    .from("patient_attachments")
    .select("id, storage_path, mime, size_bytes, description, category, created_at")
    .eq("practice_id", practiceId)
    .eq("patient_id", patientId)
    .order("created_at", { ascending: false })
    .limit(100)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const admin = createAdminClient()
  const rows = (data ?? []) as {
    id: string
    storage_path: string
    mime: string
    size_bytes: number
    description: string | null
    category: string | null
    created_at: string
  }[]
  const withUrls = await Promise.all(
    rows.map(async (row) => {
      const { data: signed } = await admin.storage.from(BUCKET).createSignedUrl(row.storage_path, 600)
      return { ...row, signedUrl: signed?.signedUrl ?? null }
    })
  )

  return NextResponse.json({ attachments: withUrls })
}

export async function POST(req: Request, context: Ctx) {
  const guard = await requirePracticePermission("patients:access")
  if (!guard.ok) return guard.response
  const {
    supabase,
    userId,
    activePracticeId: practiceId,
  } = guard.context
  const patientId = (await context.params).id

  const { data: p } = await supabase
    .from("practice_patients")
    .select("id")
    .eq("id", patientId)
    .eq("practice_id", practiceId)
    .maybeSingle()
  if (!p) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const form = await req.formData()
  const file = form.get("file")
  const description = (form.get("description") as string | null)?.trim() ?? null
  const rawCat = (form.get("category") as string | null)?.trim().toLowerCase() ?? ""
  const category =
    rawCat === "lab" || rawCat === "id" || rawCat === "referral" || rawCat === "script" || rawCat === "other"
      ? rawCat
      : null
  if (!(file instanceof Blob)) {
    return NextResponse.json({ error: "file required (multipart field 'file')" }, { status: 400 })
  }

  const buf = Buffer.from(await file.arrayBuffer())
  if (buf.length > MAX_BYTES) {
    return NextResponse.json({ error: "file too large (max 20MB)" }, { status: 400 })
  }
  const mime = file.type || "application/octet-stream"
  if (!ALLOWED_MIME.has(mime)) {
    return NextResponse.json({ error: `unsupported type: ${mime}` }, { status: 400 })
  }
  const origName = (file as File & { name?: string }).name || "upload"
  const safe = origName.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 120)
  const path = `${practiceId}/${patientId}/${randomUUID()}-${safe}`

  const admin = createAdminClient()
  const { error: upErr } = await admin.storage.from(BUCKET).upload(path, buf, {
    contentType: mime,
    upsert: false,
  })
  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 })

  const { data: row, error: insErr } = await supabase
    .from("patient_attachments")
    .insert({
      practice_id: practiceId,
      patient_id: patientId,
      uploader_user_id: userId,
      storage_path: path,
      mime,
      size_bytes: buf.length,
      description,
      category,
    })
    .select("id")
    .single()

  if (insErr || !row) {
    return NextResponse.json({ error: insErr?.message ?? "insert failed" }, { status: 500 })
  }

  const inserted = row as { id: string }
  const { data: signed } = await admin.storage.from(BUCKET).createSignedUrl(path, 600)
  return NextResponse.json({ id: inserted.id, signedUrl: signed?.signedUrl ?? null })
}

export async function DELETE(req: Request, context: Ctx) {
  const guard = await requirePracticePermission("patients:access")
  if (!guard.ok) return guard.response
  const { supabase, activePracticeId: practiceId } = guard.context
  const patientId = (await context.params).id
  const attachmentId = new URL(req.url).searchParams.get("attachmentId")?.trim()
  if (!attachmentId) {
    return NextResponse.json({ error: "attachmentId required" }, { status: 400 })
  }

  const { data: row, error: lookupError } = await supabase
    .from("patient_attachments")
    .select("id, storage_path")
    .eq("id", attachmentId)
    .eq("patient_id", patientId)
    .eq("practice_id", practiceId)
    .maybeSingle()

  if (lookupError) return NextResponse.json({ error: lookupError.message }, { status: 500 })
  if (!row) return NextResponse.json({ error: "Attachment not found" }, { status: 404 })

  const admin = createAdminClient()
  const { error: storageError } = await admin.storage
    .from(BUCKET)
    .remove([String(row.storage_path)])
  if (storageError) {
    return NextResponse.json({ error: storageError.message }, { status: 500 })
  }

  const { error: deleteError } = await supabase
    .from("patient_attachments")
    .delete()
    .eq("id", attachmentId)
    .eq("patient_id", patientId)
    .eq("practice_id", practiceId)
  if (deleteError) return NextResponse.json({ error: deleteError.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}

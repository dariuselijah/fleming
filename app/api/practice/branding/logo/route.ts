import { NextResponse } from "next/server"
import type { SupabaseClient } from "@supabase/supabase-js"
import { getAuthenticatedPracticeContext } from "@/lib/billing/context"

export const runtime = "nodejs"

export async function POST(req: Request) {
  const ctx = await getAuthenticatedPracticeContext()
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const db = ctx.supabase as unknown as SupabaseClient
  const form = await req.formData().catch(() => null)
  const file = form?.get("file")
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Upload a logo file." }, { status: 400 })
  }
  if (!file.type.startsWith("image/")) {
    return NextResponse.json({ error: "Logo must be an image." }, { status: 400 })
  }

  const ext = file.type.includes("jpeg") ? "jpg" : file.type.includes("png") ? "png" : "png"
  const path = `${ctx.practiceId}/logo.${ext}`
  const bytes = new Uint8Array(await file.arrayBuffer())
  const { error: uploadError } = await db.storage
    .from("practice-branding")
    .upload(path, bytes, { contentType: file.type, upsert: true })
  if (uploadError) return NextResponse.json({ error: uploadError.message }, { status: 500 })

  const { error: updateError } = await db
    .from("practices")
    .update({ logo_storage_path: path })
    .eq("id", ctx.practiceId)
  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 })

  return NextResponse.json({ logoStoragePath: path })
}

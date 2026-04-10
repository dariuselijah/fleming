import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { NextRequest, NextResponse } from "next/server"
import { generateEmbedding } from "@/lib/rag/embeddings"

type ChunkIn = { text: string; sourceType: string; chunkKey?: string; chunkIndex: number }

async function deleteEncounterChunks(encounterId: string, userSupabase: Awaited<ReturnType<typeof createClient>>) {
  if (!userSupabase) return
  try {
    const admin = createAdminClient()
    const { error } = await admin.from("clinical_rag_chunks").delete().eq("encounter_id", encounterId)
    if (!error) return
    console.warn("[rag index] admin delete", error)
  } catch (e) {
    console.warn(
      "[rag index] admin delete skipped",
      e instanceof Error ? e.message : e
    )
  }
  const { error } = await userSupabase.from("clinical_rag_chunks").delete().eq("encounter_id", encounterId)
  if (error) {
    console.warn("[rag index] user delete", error)
  }
}

/**
 * Rebuilds RAG chunks for an encounter (server-side embedding; plaintext visible to API route only).
 */
export async function POST(req: NextRequest) {
  const supabase = await createClient()
  if (!supabase) {
    return NextResponse.json({ error: "Database unavailable" }, { status: 500 })
  }
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  let body: {
    encounterId?: string
    practiceId?: string
    patientId?: string
    chunks?: ChunkIn[]
  }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }
  const { encounterId, practiceId, patientId, chunks } = body
  if (!encounterId || !practiceId || !patientId || !Array.isArray(chunks)) {
    return NextResponse.json({ error: "encounterId, practiceId, patientId, chunks required" }, { status: 400 })
  }

  const { data: enc, error: eErr } = await supabase
    .from("clinical_encounters")
    .select("id, practice_id, patient_id")
    .eq("id", encounterId)
    .maybeSingle()
  if (eErr || !enc || enc.practice_id !== practiceId || enc.patient_id !== patientId) {
    return NextResponse.json({ error: "Encounter not found" }, { status: 404 })
  }

  await deleteEncounterChunks(encounterId, supabase)

  type Row = {
    practice_id: string
    patient_id: string
    encounter_id: string
    chunk_index: number
    source_type: string
    chunk_key: string | null
    embedding: string
    chunk_body: string
  }

  const byIndex = new Map<number, Row>()

  for (const c of chunks) {
    if (!c.text?.trim()) continue
    let embedding: number[]
    try {
      embedding = await generateEmbedding(c.text.slice(0, 8000))
    } catch (e) {
      console.warn("[rag index] embed skip", e)
      continue
    }
    const vec = `[${embedding.join(",")}]`
    byIndex.set(c.chunkIndex, {
      practice_id: practiceId,
      patient_id: patientId,
      encounter_id: encounterId,
      chunk_index: c.chunkIndex,
      source_type: c.sourceType,
      chunk_key: c.chunkKey ?? null,
      embedding: vec,
      chunk_body: c.text.slice(0, 12000),
    })
  }

  const rows = [...byIndex.values()]
  if (rows.length === 0) {
    return NextResponse.json({ ok: true, indexed: 0 })
  }

  const { error: insErr } = await supabase.from("clinical_rag_chunks").insert(rows)
  if (insErr) {
    console.error("[rag index] insert", insErr)
    if (insErr.code === "23505") {
      const { error: upErr } = await supabase.from("clinical_rag_chunks").upsert(rows, {
        onConflict: "encounter_id,chunk_index",
      })
      if (upErr) {
        console.error("[rag index] upsert fallback", upErr)
        return NextResponse.json({ error: upErr.message }, { status: 500 })
      }
    } else {
      return NextResponse.json({ error: insErr.message }, { status: 500 })
    }
  }

  await supabase
    .from("clinical_encounters")
    .update({ last_indexed_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq("id", encounterId)

  return NextResponse.json({ ok: true, indexed: rows.length })
}

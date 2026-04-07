import { createClient } from "@/lib/supabase/server"
import { NextRequest, NextResponse } from "next/server"
import { generateEmbedding } from "@/lib/rag/embeddings"

type ChunkIn = { text: string; sourceType: string; chunkKey?: string; chunkIndex: number }

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

  await supabase.from("clinical_rag_chunks").delete().eq("encounter_id", encounterId)

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
    const { error: upErr } = await supabase.from("clinical_rag_chunks").insert({
      practice_id: practiceId,
      patient_id: patientId,
      encounter_id: encounterId,
      chunk_index: c.chunkIndex,
      source_type: c.sourceType,
      chunk_key: c.chunkKey ?? null,
      embedding: vec as unknown as string,
      chunk_body: c.text.slice(0, 12000),
    })
    if (upErr) {
      console.error("[rag index] insert", upErr)
    }
  }

  return NextResponse.json({ ok: true, indexed: chunks.length })
}

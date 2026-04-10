import { createClient } from "@/lib/supabase/server"
import { NextRequest, NextResponse } from "next/server"
import { decryptPracticeAesGcm, vaultOpenDek } from "@/lib/server/clinical-vault"
import type { MedicalBlock } from "@/lib/clinical-workspace/types"

async function loadVaultDek(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  practiceId: string
): Promise<string | null> {
  if (!supabase) return null
  const { data, error } = await supabase
    .from("clinical_session_keys")
    .select("enc_dek, dek_iv, expires_at")
    .eq("user_id", userId)
    .eq("practice_id", practiceId)
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error || !data?.enc_dek || !data?.dek_iv) return null
  return vaultOpenDek(data.enc_dek, data.dek_iv)
}

export type PatientDocumentListItem = {
  id: string
  encounterId: string
  kind: "session_document" | "block"
  title: string
  category: "notes" | "labs" | "imaging" | "prescriptions" | "other"
  preview: string
  updatedAt: string
  content: string
}

function categorizeBlock(b: MedicalBlock): PatientDocumentListItem["category"] {
  if (b.type === "LAB") return "labs"
  if (b.type === "IMAGING") return "imaging"
  if (b.type === "PRESCRIPTION") return "prescriptions"
  return "notes"
}

function categorizeDocType(t: string): PatientDocumentListItem["category"] {
  if (t === "prescribe") return "prescriptions"
  if (t === "soap" || t === "summary" || t === "refer" || t === "evidence") return "notes"
  return "notes"
}

/**
 * GET aggregated decrypted documents/blocks across encounters for a patient.
 */
export async function GET(req: NextRequest) {
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

  const { searchParams } = new URL(req.url)
  const patientId = searchParams.get("patientId")
  const practiceId = searchParams.get("practiceId")
  if (!patientId || !practiceId) {
    return NextResponse.json({ error: "patientId and practiceId required" }, { status: 400 })
  }

  const dek = await loadVaultDek(supabase, user.id, practiceId)
  if (!dek) {
    return NextResponse.json(
      { error: "Practice vault locked — unlock in clinical workspace." },
      { status: 403 }
    )
  }

  const { data: encRows, error: encErr } = await supabase
    .from("clinical_encounters")
    .select("id, updated_at, state_ciphertext, state_iv")
    .eq("patient_id", patientId)
    .eq("practice_id", practiceId)
    .order("updated_at", { ascending: false })
    .limit(80)

  if (encErr) {
    return NextResponse.json({ error: encErr.message }, { status: 500 })
  }

  const items: PatientDocumentListItem[] = []

  for (const row of encRows ?? []) {
    const encId = row.id as string
    const updatedAt = String(row.updated_at ?? new Date().toISOString())
    if (!row.state_ciphertext || !row.state_iv) continue
    const json = decryptPracticeAesGcm(dek, row.state_ciphertext, row.state_iv)
    if (!json) continue
    try {
      const state = JSON.parse(json) as {
        sessionDocuments?: { id: string; document?: { title?: string; type?: string; content?: string } }[]
        blocks?: MedicalBlock[]
      }
      for (const sd of state.sessionDocuments ?? []) {
        const doc = sd.document
        if (!doc?.content && !doc?.title) continue
        const title = doc.title?.trim() || "Session document"
        const content = String(doc.content ?? "")
        items.push({
          id: `sd-${sd.id}`,
          encounterId: encId,
          kind: "session_document",
          title,
          category: categorizeDocType(String(doc.type ?? "summary")),
          preview: content.slice(0, 280).replace(/\s+/g, " ").trim(),
          updatedAt,
          content: content.slice(0, 24000),
        })
      }
      for (const b of state.blocks ?? []) {
        const bits = [b.title, b.summary, JSON.stringify(b.metadata ?? {})].filter(Boolean).join(" — ")
        if (!bits.trim()) continue
        items.push({
          id: `blk-${b.id}`,
          encounterId: encId,
          kind: "block",
          title: b.title || b.type,
          category: categorizeBlock(b),
          preview: bits.slice(0, 280),
          updatedAt,
          content: bits.slice(0, 12000),
        })
      }
    } catch {
      /* skip bad state */
    }
  }

  items.sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1))

  return NextResponse.json({ items })
}

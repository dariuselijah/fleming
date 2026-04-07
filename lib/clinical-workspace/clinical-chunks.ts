import type { EncounterStatePlain } from "./encounter-state"

export type RagChunkPayload = {
  text: string
  sourceType: string
  chunkKey?: string
  chunkIndex: number
}

export function buildRagChunksFromEncounterState(state: EncounterStatePlain): RagChunkPayload[] {
  const out: RagChunkPayload[] = []
  let idx = 0
  const push = (text: string, sourceType: string, chunkKey?: string) => {
    const t = text.trim()
    if (t.length < 8) return
    out.push({
      text: t.slice(0, 8000),
      sourceType,
      chunkKey,
      chunkIndex: idx++,
    })
  }

  const sn = state.soapNote
  if (sn) {
    push(sn.subjective ?? "", "soap:subjective")
    push(sn.objective ?? "", "soap:objective")
    push(sn.assessment ?? "", "soap:assessment")
    push(sn.plan ?? "", "soap:plan")
  }

  for (const b of state.blocks ?? []) {
    const bits = [b.type, b.title, b.summary, JSON.stringify(b.metadata ?? {})].filter(Boolean).join(" ")
    push(bits, `block:${b.type}`, b.id)
  }

  for (const d of state.sessionDocuments ?? []) {
    if (d.document?.content) push(String(d.document.content), "session_document", d.id)
  }

  if (state.scribeTranscript?.trim()) {
    push(state.scribeTranscript, "scribe:transcript")
  }

  return out
}

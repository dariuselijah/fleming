import { stripUploadReferenceTokens } from "@/lib/uploads/reference-tokens"

/**
 * Start markers for client-injected consult context (see buildClinicalContextXml).
 * Anything from the first marker onward is for the model only — hide in the UI.
 */
const INJECTED_CONTEXT_MARKERS = [
  "\n\n<patient_context",
  "\n<patient_context",
  "\n\n<scribe_transcript",
  "\n<scribe_transcript",
  "\n\n<extracted_entities",
  "\n<extracted_entities",
  "\n\n===",
  "\n===",
] as const

/**
 * Strips client-side prompt injection (XML blocks, prescription appendix markers, etc.)
 * so user bubbles and copy/paste never show the full consult payload after refresh.
 */
export function stripClientPromptContextForDisplay(raw: string): string {
  let t = stripUploadReferenceTokens(raw)
  if (t.startsWith("{")) t = t.slice(1).trimStart()

  const ts = t.trimStart()
  if (ts.startsWith("Chart document attached")) {
    const anchor = t.indexOf("Chart document attached")
    const firstNl = t.indexOf("\n", anchor)
    if (firstNl > 0) {
      t = t.slice(0, firstNl).trimEnd()
    }
  }

  let cut = -1
  for (const m of INJECTED_CONTEXT_MARKERS) {
    const i = t.indexOf(m)
    if (i >= 0 && (cut < 0 || i < cut)) cut = i
  }
  if (cut >= 0) {
    t = t.slice(0, cut).trimEnd()
  }

  return t
}

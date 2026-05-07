import type { ExtractedEntities } from "@/lib/scribe/entity-highlighter"

export interface ContextAssessment {
  shouldPrompt: boolean
  prompts: string[]
}

export function assessClinicalContext(
  transcript: string,
  entities: ExtractedEntities
): ContextAssessment {
  const trimmed = transcript.trim()
  const words = trimmed.split(/\s+/).filter(Boolean).length
  const cc = entities.chief_complaint?.length ?? 0
  const symptoms = entities.symptoms?.length ?? 0
  const thin =
    words < 35 || (cc === 0 && symptoms === 0 && trimmed.length < 120)

  if (!thin) {
    return { shouldPrompt: false, prompts: [] }
  }

  return {
    shouldPrompt: true,
    prompts: [
      "Add a one-line chief complaint",
      "Note key vitals or exam findings if known",
      "List relevant allergies or chronic medications",
    ],
  }
}

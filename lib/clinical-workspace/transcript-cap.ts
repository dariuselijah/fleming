/** Shared transcript tail cap for client + server clinical context builders. */
export const CLINICAL_TRANSCRIPT_CAP = 5000

export function trimClinicalTranscript(transcript: string): string {
  const t = transcript.trim()
  if (!t) return ""
  return t.length > CLINICAL_TRANSCRIPT_CAP ? t.slice(-CLINICAL_TRANSCRIPT_CAP) : t
}

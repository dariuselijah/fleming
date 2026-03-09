export const UPLOAD_REFERENCE_TOKEN_REGEX = /\[UPLOAD_REF:([0-9a-f-]{36})\]/gi

export function buildUploadReferenceTokens(uploadIds: string[]): string {
  const unique = Array.from(
    new Set(
      uploadIds
        .map((id) => id.trim().toLowerCase())
        .filter((id) =>
          /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
            id
          )
        )
    )
  )
  if (unique.length === 0) return ""
  return unique.map((id) => `[UPLOAD_REF:${id}]`).join(" ")
}

export function extractUploadReferenceIds(text: string): string[] {
  const ids: string[] = []
  if (!text) return ids
  let match: RegExpExecArray | null
  while ((match = UPLOAD_REFERENCE_TOKEN_REGEX.exec(text)) !== null) {
    if (match[1]) {
      ids.push(match[1].toLowerCase())
    }
  }
  return Array.from(new Set(ids))
}

export function stripUploadReferenceTokens(text: string): string {
  if (!text) return ""
  return text
    .replace(UPLOAD_REFERENCE_TOKEN_REGEX, "")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim()
}

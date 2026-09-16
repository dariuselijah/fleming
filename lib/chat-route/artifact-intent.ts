/** Detect requests for multiple artifacts in one turn (document generation only). */
export function detectExplicitMultiArtifactRequest(query: string): boolean {
  if (!query || typeof query !== "string") return false
  const normalized = query.toLowerCase()
  if (
    /\b(?:make|create|generate|produce)\s+\d+\s+(?:documents?|artifacts?)\b/.test(normalized)
  ) {
    return true
  }
  if (
    /\b(?:two|three|four|multiple|several|pair|double)\s+(?:documents?|artifacts?)\b/.test(
      normalized
    )
  ) {
    return true
  }
  return /\b(?:more than one|multiple versions|separate documents)\b/.test(normalized)
}

export type ArtifactType = "document"

export function parseArtifactTypeFromToolResultPayload(payload: unknown): ArtifactType | null {
  if (!payload || typeof payload !== "object") return null
  const candidate = payload as Record<string, unknown>
  if (candidate.artifactType === "document") return "document"
  return null
}

export function detectArtifactTypeFromMessage(message: unknown): ArtifactType | null {
  if (!message || typeof message !== "object") return null
  const parts = Array.isArray((message as { parts?: unknown }).parts)
    ? (message as { parts: unknown[] }).parts
    : []
  for (const part of parts) {
    if (!part || typeof part !== "object") continue
    const p = part as {
      type?: string
      toolInvocation?: { state?: string; result?: unknown }
      metadata?: { documentArtifacts?: unknown[] }
    }
    if (p.type === "tool-invocation" && p.toolInvocation?.state === "result") {
      const parsed = parseArtifactTypeFromToolResultPayload(p.toolInvocation?.result)
      if (parsed) return parsed
    }
    if (p.type === "metadata" && p.metadata && typeof p.metadata === "object") {
      if (
        Array.isArray(p.metadata.documentArtifacts) &&
        p.metadata.documentArtifacts.length > 0
      ) {
        return "document"
      }
    }
  }
  return null
}

/** User-facing status line while evidence / web preflight runs. */
export function buildEvidencePreflightPreview(input: {
  query: string
  shouldPreferUploadContext?: boolean
  shouldRunEvidenceSynthesis?: boolean
  shouldRunWebSearchPreflight?: boolean
}): string {
  const normalized = input.query.replace(/\s+/g, " ").trim()
  const snippet = normalized.length > 120 ? `${normalized.slice(0, 117)}...` : normalized

  if (input.shouldPreferUploadContext) {
    return snippet
      ? `Checking your uploaded material for the best supporting passages on "${snippet}".`
      : "Checking your uploaded material for the best supporting passages."
  }

  if (input.shouldRunEvidenceSynthesis && input.shouldRunWebSearchPreflight) {
    return snippet
      ? `Pulling together the strongest evidence and current sources for "${snippet}".`
      : "Pulling together the strongest evidence and current sources."
  }

  if (input.shouldRunEvidenceSynthesis) {
    return snippet
      ? `Gathering evidence-backed guidance for "${snippet}".`
      : "Gathering evidence-backed guidance."
  }

  if (input.shouldRunWebSearchPreflight) {
    return snippet
      ? `Looking up current sources for "${snippet}" and drafting the answer inline.`
      : "Looking up current sources and drafting the answer inline."
  }

  return snippet
    ? `Working on "${snippet}"…`
    : "Working on your request…"
}

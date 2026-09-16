import {
  buildEvidenceSourceId,
  type EvidenceCitation,
} from "@/lib/evidence"
import {
  provenanceToEvidenceCitation,
  type SourceProvenance,
} from "@/lib/evidence/provenance"

function dedupeFigureReferences(
  references: EvidenceCitation["figureReferences"]
): EvidenceCitation["figureReferences"] {
  if (!Array.isArray(references) || references.length === 0) return []
  const byKey = new Map<string, NonNullable<EvidenceCitation["figureReferences"]>[number]>()
  for (const reference of references) {
    if (!reference) continue
    const key =
      reference.assetId ||
      reference.filePath ||
      `${reference.type || "figure"}:${reference.label || "asset"}`
    const existing = byKey.get(key)
    if (!existing) {
      byKey.set(key, reference)
      continue
    }
    byKey.set(key, {
      ...existing,
      ...reference,
      signedUrl: reference.signedUrl || existing.signedUrl || null,
      fullUrl: reference.fullUrl || existing.fullUrl || null,
      filePath: reference.filePath || existing.filePath || null,
      storageBucket: reference.storageBucket || existing.storageBucket || null,
    })
  }
  return Array.from(byKey.values())
}

function mergeCitationVisuals(
  existing: EvidenceCitation,
  incoming: EvidenceCitation
): Pick<EvidenceCitation, "previewReference" | "figureReferences"> {
  const incomingPreview = incoming.previewReference
  const existingPreview = existing.previewReference
  const incomingHasPreviewSignal = Boolean(
    incomingPreview?.filePath || incomingPreview?.signedUrl || incomingPreview?.assetId
  )
  const previewReference = incomingHasPreviewSignal
    ? incomingPreview
    : existingPreview || incomingPreview || null
  const figureReferences = dedupeFigureReferences([
    ...(existing.figureReferences || []),
    ...(incoming.figureReferences || []),
  ])
  return {
    previewReference,
    figureReferences,
  }
}

function normalizeTitleForDedup(title: string | undefined | null): string {
  if (!title) return ""
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80)
}

function titleSimilarity(a: string, b: string): number {
  if (!a || !b) return 0
  const na = normalizeTitleForDedup(a)
  const nb = normalizeTitleForDedup(b)
  if (na === nb) return 1
  if (na.length === 0 || nb.length === 0) return 0
  const tokensA = new Set(na.split(" ").filter((t) => t.length > 2))
  const tokensB = new Set(nb.split(" ").filter((t) => t.length > 2))
  if (tokensA.size === 0 || tokensB.size === 0) return 0
  let overlap = 0
  for (const t of tokensA) if (tokensB.has(t)) overlap++
  return (2 * overlap) / (tokensA.size + tokensB.size)
}

export function dedupeAndReindexCitations(citations: EvidenceCitation[]): EvidenceCitation[] {
  const citationMetadataScore = (citation: EvidenceCitation): number => {
    let score = 0
    if (citation.title?.trim()) score += 3
    if (citation.journal?.trim()) score += 2
    if (citation.url?.trim()) score += 3
    if (citation.pmid?.trim()) score += 2
    if (citation.doi?.trim()) score += 1
    if (citation.sourceLabel?.trim()) score += 2
    if (citation.sourceType?.trim()) score += 1
    if (citation.studyType?.trim()) score += 1
    if (citation.snippet?.trim()) score += 1
    if (citation.sourceId?.trim()) score += 2
    if (Array.isArray(citation.authors) && citation.authors.length > 0) score += 1
    if (
      citation.previewReference?.filePath ||
      citation.previewReference?.signedUrl ||
      citation.previewReference?.assetId
    ) {
      score += 3
    }
    if (Array.isArray(citation.figureReferences) && citation.figureReferences.length > 0) {
      score += Math.min(4, citation.figureReferences.length)
    }
    return score
  }

  const deduped = new Map<string, EvidenceCitation>()
  const doiIndex = new Map<string, string>()
  const titleIndex = new Map<string, string>()

  const mergeInto = (key: string, normalizedCitation: EvidenceCitation) => {
    const existing = deduped.get(key)
    if (!existing) {
      deduped.set(key, normalizedCitation)
      return
    }
    const existingScore = citationMetadataScore(existing)
    const incomingScore = citationMetadataScore(normalizedCitation)
    const mergedVisuals = mergeCitationVisuals(existing, normalizedCitation)
    if (incomingScore >= existingScore) {
      deduped.set(key, { ...existing, ...normalizedCitation, ...mergedVisuals, sourceId: key })
    } else {
      deduped.set(key, { ...normalizedCitation, ...existing, ...mergedVisuals, sourceId: key })
    }
  }

  citations.forEach((citation) => {
    const normalizedCitation: EvidenceCitation = {
      ...citation,
      sourceId: buildEvidenceSourceId(citation),
    }
    const key =
      normalizedCitation.sourceId ||
      normalizedCitation.pmid ||
      normalizedCitation.doi ||
      normalizedCitation.url ||
      `${normalizedCitation.title || "untitled"}:${normalizedCitation.journal || "unknown"}`

    const doi = normalizedCitation.doi?.trim().toLowerCase()
    if (doi) {
      const existingKeyForDoi = doiIndex.get(doi)
      if (existingKeyForDoi && existingKeyForDoi !== key) {
        mergeInto(existingKeyForDoi, normalizedCitation)
        return
      }
      doiIndex.set(doi, key)
    }

    const normTitle = normalizeTitleForDedup(normalizedCitation.title)
    if (normTitle.length > 20) {
      for (const [existingTitle, existingKey] of titleIndex) {
        if (existingKey !== key && titleSimilarity(normTitle, existingTitle) > 0.85) {
          mergeInto(existingKey, normalizedCitation)
          return
        }
      }
      titleIndex.set(normTitle, key)
    }

    mergeInto(key, normalizedCitation)
  })
  return Array.from(deduped.values()).map((citation, index) => ({
    ...citation,
    index: index + 1,
    sourceId: buildEvidenceSourceId(citation),
  }))
}

export function citationsFromProvenance(provenance: SourceProvenance[]): EvidenceCitation[] {
  if (!Array.isArray(provenance) || provenance.length === 0) return []
  return dedupeAndReindexCitations(
    provenance.map((item, idx) => provenanceToEvidenceCitation(item, idx + 1))
  )
}

export function citationsFromToolResult(result: unknown): EvidenceCitation[] {
  if (!result || typeof result !== "object") return []
  const candidate = result as Record<string, unknown>
  if (Array.isArray(candidate.provenance)) {
    return citationsFromProvenance(candidate.provenance as SourceProvenance[])
  }
  if (Array.isArray(candidate.citations)) {
    return dedupeAndReindexCitations(candidate.citations as EvidenceCitation[])
  }
  if (Array.isArray(candidate.results)) {
    return dedupeAndReindexCitations(candidate.results as EvidenceCitation[])
  }
  return []
}

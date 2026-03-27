export type SourceIdCandidate = {
  sourceId?: string | null
  pmid?: string | null
  doi?: string | null
  url?: string | null
  title?: string | null
  journal?: string | null
  sourceLabel?: string | null
  uploadId?: string | null
  chunkId?: string | null
  sourceUnitId?: string | null
}

function normalizeWhitespace(value: string): string {
  return value.trim().replace(/\s+/g, " ")
}

function normalizeDoi(doi: string): string {
  const trimmed = normalizeWhitespace(doi).toLowerCase()
  return trimmed
    .replace(/^https?:\/\/(dx\.)?doi\.org\//, "")
    .replace(/^doi:/, "")
}

function normalizeUrl(url: string): string {
  try {
    const parsed = new URL(url)
    const host = parsed.hostname.toLowerCase().replace(/^www\./, "")
    const pathname = parsed.pathname.replace(/\/+$/, "") || "/"
    return `${host}${pathname}`.toLowerCase()
  } catch {
    return normalizeWhitespace(url).toLowerCase()
  }
}

function hashString(value: string): string {
  let hash = 2166136261
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0).toString(16).padStart(8, "0")
}

export function normalizeEvidenceSourceId(raw: string): string {
  return normalizeWhitespace(raw).toLowerCase()
}

export function buildEvidenceSourceId(candidate: SourceIdCandidate): string {
  if (typeof candidate.sourceId === "string" && candidate.sourceId.trim().length > 0) {
    return normalizeEvidenceSourceId(candidate.sourceId)
  }

  if (typeof candidate.pmid === "string" && /^\d{6,10}$/.test(candidate.pmid.trim())) {
    return `pmid:${candidate.pmid.trim()}`
  }

  if (typeof candidate.doi === "string" && candidate.doi.trim().length > 0) {
    return `doi:${normalizeDoi(candidate.doi)}`
  }

  if (typeof candidate.uploadId === "string" && candidate.uploadId.trim().length > 0) {
    const uploadId = candidate.uploadId.trim()
    const scope =
      (typeof candidate.sourceUnitId === "string" && candidate.sourceUnitId.trim()) ||
      (typeof candidate.chunkId === "string" && candidate.chunkId.trim()) ||
      "root"
    return `upload:${uploadId}:${scope}`
  }

  if (typeof candidate.url === "string" && candidate.url.trim().length > 0) {
    return `url:${normalizeUrl(candidate.url)}`
  }

  const fallbackPayload = [
    candidate.title || "",
    candidate.journal || "",
    candidate.sourceLabel || "",
  ]
    .map((value) => normalizeWhitespace(String(value || "")).toLowerCase())
    .join("|")
  return `text:${hashString(fallbackPayload || "unknown")}`
}


import { createAdminClient } from "@/lib/supabase/admin"
import { imageSize } from "image-size"
import { fetchPubMedArticle, searchPubMedByDOI } from "@/lib/pubmed/api"
import { buildEvidenceSourceId } from "./source-id"
import type { EvidenceCitation, UploadVisualReference } from "./types"

const EVIDENCE_VISUALS_BUCKET = "chat-attachments"
const SIGNED_URL_TTL_SECONDS = 60 * 60
const MAX_STORED_FIGURES_PER_ARTICLE = 8
const MAX_SELECTED_FIGURES_PER_CITATION = 3
const JOURNAL_VISUALS_TIMEOUT_MS = 8000

type StoredEvidenceVisualRow = {
  id: string
  source_id: string
  pmid: string | null
  pmcid: string | null
  doi: string | null
  article_url: string | null
  source_page_url: string | null
  figure_key: string
  asset_type: string
  label: string | null
  caption: string | null
  license: string | null
  storage_bucket: string
  file_path: string
  mime_type: string
  width: number | null
  height: number | null
  sort_order: number
  metadata: Record<string, unknown> | null
}

type JournalFigureCandidate = {
  figureKey: string
  label: string
  caption: string
  sourceImageUrl: string
  sourcePageUrl: string
  sortOrder: number
  license: string | null
}

type CitationVisualSelection =
  | { kind: "stored"; rows: StoredEvidenceVisualRow[] }
  | { kind: "direct"; figures: JournalFigureCandidate[] }

const articleIdentityCache = new Map<string, { pmid: string | null; pmcid: string | null; doi: string | null } | null>()
const figureCandidateCache = new Map<string, JournalFigureCandidate[] | null>()
let evidenceVisualAssetsTableAvailable = true

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | null = null
  return Promise.race([
    promise.finally(() => {
      if (timer) clearTimeout(timer)
    }),
    new Promise<T>((_, reject) => {
      timer = setTimeout(() => reject(new Error(`Timed out after ${timeoutMs}ms`)), timeoutMs)
    }),
  ])
}

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim()
}

function decodeXmlEntities(value: string): string {
  return value
    .replace(/<!\[CDATA\[(.*?)\]\]>/g, "$1")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#39;/g, "'")
}

function stripXmlTags(value: string): string {
  return normalizeWhitespace(decodeXmlEntities(value).replace(/<[^>]+>/g, " "))
}

function extractTagContents(block: string, tagName: string): string[] {
  return Array.from(
    block.matchAll(new RegExp(`<${tagName}\\b[^>]*>([\\s\\S]*?)<\\/${tagName}>`, "gi"))
  ).map((match) => match[1] || "")
}

function extractFirstTagContent(block: string, tagName: string): string | null {
  const first = extractTagContents(block, tagName)[0]
  return typeof first === "string" && first.trim().length > 0 ? first : null
}

function extractAttribute(block: string, attributeName: string): string | null {
  const match = block.match(new RegExp(`${attributeName}="([^"]+)"`, "i"))
  return match?.[1] || null
}

function sanitizePathSegment(value: string, fallback: string): string {
  const normalized = value
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-+|-+$/g, "")
  return normalized || fallback
}

function extensionForContentType(contentType: string | null, fallbackUrl: string): string {
  const normalized = String(contentType || "").toLowerCase()
  if (normalized.includes("png")) return "png"
  if (normalized.includes("webp")) return "webp"
  if (normalized.includes("gif")) return "gif"
  if (normalized.includes("svg")) return "svg"
  if (normalized.includes("jpeg") || normalized.includes("jpg")) return "jpg"
  const pathname = (() => {
    try {
      return new URL(fallbackUrl).pathname
    } catch {
      return fallbackUrl
    }
  })()
  const explicit = pathname.match(/\.([a-z0-9]+)$/i)?.[1]?.toLowerCase()
  if (explicit) return explicit
  return "jpg"
}

function extractPmcidFromValue(value: string | null | undefined): string | null {
  if (!value) return null
  const match = String(value).match(/\b(PMC\d+)\b/i)
  return match?.[1]?.toUpperCase() || null
}

function citationIdentityKey(citation: EvidenceCitation): string {
  return (
    citation.sourceId ||
    citation.pmcid ||
    citation.pmid ||
    citation.doi ||
    citation.url ||
    `${citation.title}:${citation.journal}`
  )
}

function extractDoiFromCitation(citation: EvidenceCitation): string | null {
  if (citation.doi?.trim()) return citation.doi.trim()
  if (citation.url?.includes("doi.org/")) {
    const match = citation.url.match(/doi\.org\/(.+)$/i)
    return match?.[1] ? decodeURIComponent(match[1]).trim() : null
  }
  return null
}

async function resolveArticleIdentity(
  citation: EvidenceCitation
): Promise<{ pmid: string | null; pmcid: string | null; doi: string | null } | null> {
  const cacheKey = citationIdentityKey(citation)
  if (articleIdentityCache.has(cacheKey)) {
    return articleIdentityCache.get(cacheKey) || null
  }

  const citationPmcid = extractPmcidFromValue(citation.pmcid || citation.url || citation.sourceId || null)
  if (citationPmcid) {
    const identity = {
      pmid: citation.pmid || null,
      pmcid: citationPmcid,
      doi: extractDoiFromCitation(citation),
    }
    articleIdentityCache.set(cacheKey, identity)
    return identity
  }

  let article = citation.pmid ? await fetchPubMedArticle(citation.pmid) : null
  if (!article) {
    const doi = extractDoiFromCitation(citation)
    if (doi) {
      article = await searchPubMedByDOI(doi)
    }
  }

  const identity = article
    ? {
        pmid: article.pmid || citation.pmid || null,
        pmcid: extractPmcidFromValue(article.pmcid),
        doi: article.doi || extractDoiFromCitation(citation),
      }
    : null
  articleIdentityCache.set(cacheKey, identity)
  return identity
}

async function fetchEuropePmcFullTextXml(pmcid: string): Promise<string | null> {
  const response = await withTimeout(
    fetch(`https://www.ebi.ac.uk/europepmc/webservices/rest/${pmcid}/fullTextXML`, {
      headers: {
        Accept: "application/xml,text/xml;q=0.9,*/*;q=0.8",
      },
      cache: "force-cache",
    }),
    JOURNAL_VISUALS_TIMEOUT_MS
  )
  if (!response.ok) return null
  return response.text()
}

function extractLicense(xml: string): string | null {
  const block = extractFirstTagContent(xml, "license")
  if (!block) return null
  const licenseText = stripXmlTags(block)
  return licenseText || null
}

function extractFigureCandidatesFromXml(
  pmcid: string,
  xml: string
): JournalFigureCandidate[] {
  if (figureCandidateCache.has(pmcid)) {
    return figureCandidateCache.get(pmcid) || []
  }

  const pmcNumeric = pmcid.replace(/^PMC/i, "")
  const sourcePageUrl = `https://pmc.ncbi.nlm.nih.gov/articles/${pmcid}/`
  const license = extractLicense(xml)
  const figureBlocks = Array.from(xml.matchAll(/<fig\b[\s\S]*?<\/fig>/gi))
  const figures: JournalFigureCandidate[] = []

  figureBlocks.forEach((match, index) => {
    const block = match[0]
    const graphicHrefMatch =
      block.match(/<graphic[^>]*xlink:href="([^"]+)"/i) ||
      block.match(/<graphic[^>]*href="([^"]+)"/i)
    const graphicHref = graphicHrefMatch?.[1]?.trim()
    if (!graphicHref) return

    const figureId = extractAttribute(block, "id") || `fig-${index + 1}`
    const label = stripXmlTags(extractFirstTagContent(block, "label") || `Figure ${index + 1}`)
    const titleText = stripXmlTags(extractFirstTagContent(block, "title") || "")
    const captionText = stripXmlTags(extractFirstTagContent(block, "caption") || "")
    const caption = normalizeWhitespace([titleText, captionText].filter(Boolean).join(". "))
    const fileName = graphicHref.split("/").pop() || graphicHref
    const sourceImageUrl = `https://pmc.ncbi.nlm.nih.gov/articles/instance/${pmcNumeric}/bin/${fileName}`

    figures.push({
      figureKey: graphicHref || figureId,
      label: label || `Figure ${index + 1}`,
      caption,
      sourceImageUrl,
      sourcePageUrl,
      sortOrder: index,
      license,
    })
  })

  const deduped = figures.filter(
    (figure, index, collection) =>
      collection.findIndex((candidate) => candidate.figureKey === figure.figureKey) === index
  )
  figureCandidateCache.set(pmcid, deduped)
  return deduped
}

function tokenize(value: string | null | undefined): string[] {
  return normalizeWhitespace(String(value || ""))
    .toLowerCase()
    .split(/[^a-z0-9]+/g)
    .filter((token) => token.length >= 3)
}

function scoreFigureForCitation(
  figure: { label: string | null; caption: string | null; sort_order?: number; sortOrder?: number },
  citation: EvidenceCitation,
  queryText: string
): number {
  const figureText = `${figure.label || ""} ${figure.caption || ""}`.toLowerCase()
  const citationText = `${citation.title || ""} ${citation.snippet || ""} ${citation.journal || ""}`.toLowerCase()
  const queryTokens = tokenize(queryText)
  const citationTokens = tokenize(citationText)
  const normalizedQuery = queryText.toLowerCase()
  const mechanismIntent =
    /\b(compare|comparison|versus|vs|difference|differentiate|mechanism|pathway|how|why|explain|overview|concept)\b/.test(
      normalizedQuery
    ) || /\bpd-?1\b/.test(normalizedQuery) || /\bctla-?4\b/.test(normalizedQuery)
  const outcomesIntent =
    /\b(survival|overall survival|progression|pfs|os|hazard ratio|response rate|efficacy|safety|toxicity|trial|meta-analysis|forest plot)\b/.test(
      normalizedQuery
    )
  const conceptualFigure =
    /\b(schematic|schema|mechanism|pathway|overview|cartoon|illustration|model|immune checkpoint|microenvironment|activation|priming|effector)\b/.test(
      figureText
    )
  const quantitativeFigure =
    /\b(forest plot|meta-analysis|hazard ratio|risk ratio|odds ratio|confidence interval|95% ci|subgroup|os\b|pfs\b|progression-free|overall survival|response rate)\b/.test(
      figureText
    )

  let score = 0
  queryTokens.forEach((token) => {
    if (figureText.includes(token)) score += 3
  })
  citationTokens.slice(0, 18).forEach((token) => {
    if (figureText.includes(token)) score += 1.5
  })
  if ((figure.caption || "").length > 120) score += 1.5
  if (/algorithm|schema|outcome|response|survival|imaging|radiograph|mri|ct|pet|figure/i.test(figureText)) {
    score += 1.25
  }
  if (mechanismIntent && conceptualFigure) score += 8
  if (mechanismIntent && quantitativeFigure) score -= 8
  if (!outcomesIntent && quantitativeFigure) score -= 4
  if (outcomesIntent && quantitativeFigure) score += 5
  if (outcomesIntent && conceptualFigure) score -= 1.5
  const sortOrder = typeof figure.sort_order === "number" ? figure.sort_order : figure.sortOrder || 0
  score += Math.max(0, 1.25 - sortOrder * 0.1)
  return score
}

async function createSignedUrl(filePath: string, bucket: string): Promise<string | null> {
  let supabase
  try {
    supabase = createAdminClient()
  } catch (error) {
    console.warn(
      "[Journal Visuals] Admin client unavailable for signed URLs:",
      error instanceof Error ? error.message : "unknown error"
    )
    return null
  }
  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(filePath, SIGNED_URL_TTL_SECONDS)
  if (error) {
    console.warn("[Journal Visuals] Failed to create signed URL:", error.message)
    return null
  }
  return data?.signedUrl || null
}

function toVisualReference(
  row: StoredEvidenceVisualRow,
  signedUrl: string | null,
  type: "preview" | "figure"
): UploadVisualReference {
  return {
    assetId: row.id,
    type,
    label: row.label || (type === "preview" ? "Preview" : "Figure"),
    caption: row.caption,
    signedUrl,
    fullUrl: signedUrl,
    contentType: row.mime_type,
    width: row.width,
    height: row.height,
    storageBucket: row.storage_bucket,
    filePath: row.file_path,
  }
}

function toDirectVisualReference(
  sourceId: string,
  figure: JournalFigureCandidate,
  type: "preview" | "figure"
): UploadVisualReference {
  return {
    assetId: `${sourceId}:${figure.figureKey}`,
    type,
    label: figure.label || (type === "preview" ? "Preview" : "Figure"),
    caption: figure.caption || null,
    signedUrl: figure.sourceImageUrl,
    fullUrl: figure.sourceImageUrl,
    contentType: "image/jpeg",
  }
}

async function loadStoredVisualRows(sourceId: string): Promise<StoredEvidenceVisualRow[]> {
  if (!evidenceVisualAssetsTableAvailable) return []
  let supabase
  try {
    supabase = createAdminClient()
  } catch (error) {
    console.warn(
      "[Journal Visuals] Admin client unavailable for cached visual lookup:",
      error instanceof Error ? error.message : "unknown error"
    )
    evidenceVisualAssetsTableAvailable = false
    return []
  }
  const { data, error } = await (supabase as any)
    .from("evidence_visual_assets")
    .select(
      "id, source_id, pmid, pmcid, doi, article_url, source_page_url, figure_key, asset_type, label, caption, license, storage_bucket, file_path, mime_type, width, height, sort_order, metadata"
    )
    .eq("source_id", sourceId)
    .order("sort_order", { ascending: true })
  if (error) {
    if (/does not exist|42P01/i.test(error.message || "")) {
      evidenceVisualAssetsTableAvailable = false
    }
    console.warn("[Journal Visuals] Failed to load cached visual rows:", error.message)
    return []
  }
  return Array.isArray(data) ? (data as StoredEvidenceVisualRow[]) : []
}

async function persistFigureCandidates(
  citation: EvidenceCitation,
  identity: { pmid: string | null; pmcid: string | null; doi: string | null },
  candidates: JournalFigureCandidate[]
): Promise<StoredEvidenceVisualRow[]> {
  if (!identity.pmcid || candidates.length === 0 || !evidenceVisualAssetsTableAvailable) return []

  let supabase
  try {
    supabase = createAdminClient()
  } catch (error) {
    console.warn(
      "[Journal Visuals] Admin client unavailable for figure persistence:",
      error instanceof Error ? error.message : "unknown error"
    )
    evidenceVisualAssetsTableAvailable = false
    return []
  }
  const sourceId = buildEvidenceSourceId(citation)
  const storedRows: StoredEvidenceVisualRow[] = []

  for (const candidate of candidates.slice(0, MAX_STORED_FIGURES_PER_ARTICLE)) {
    try {
      const response = await withTimeout(
        fetch(candidate.sourceImageUrl, {
          headers: {
            Accept: "image/*,*/*;q=0.8",
          },
        }),
        JOURNAL_VISUALS_TIMEOUT_MS
      )
      if (!response.ok) continue

      const contentTypeHeader = response.headers.get("content-type")
      if (contentTypeHeader && !contentTypeHeader.toLowerCase().startsWith("image/")) {
        continue
      }

      const buffer = Buffer.from(await response.arrayBuffer())
      if (buffer.length === 0) continue

      const dimensions = imageSize(buffer)
      const extension = extensionForContentType(contentTypeHeader, candidate.sourceImageUrl)
      const sourceFolder = sanitizePathSegment(sourceId, "source")
      const labelSlug = sanitizePathSegment(candidate.label || candidate.figureKey, `figure-${candidate.sortOrder + 1}`)
      const filePath =
        `evidence-visuals/${sourceFolder}/` +
        `${String(candidate.sortOrder + 1).padStart(3, "0")}-${labelSlug}.${extension}`

      const { error: uploadError } = await supabase.storage
        .from(EVIDENCE_VISUALS_BUCKET)
        .upload(filePath, buffer, {
          contentType: contentTypeHeader || `image/${extension}`,
          upsert: true,
        })
      if (uploadError) {
        console.warn("[Journal Visuals] Failed to upload mirrored figure:", uploadError.message)
        continue
      }

      const row = {
        source_id: sourceId,
        pmid: identity.pmid,
        pmcid: identity.pmcid,
        doi: identity.doi,
        article_url: citation.url || null,
        source_page_url: candidate.sourcePageUrl,
        figure_key: candidate.figureKey,
        asset_type: "figure",
        label: candidate.label,
        caption: candidate.caption || null,
        license: candidate.license,
        storage_bucket: EVIDENCE_VISUALS_BUCKET,
        file_path: filePath,
        mime_type: contentTypeHeader || `image/${extension}`,
        width: dimensions.width ?? null,
        height: dimensions.height ?? null,
        sort_order: candidate.sortOrder,
        metadata: {
          sourceImageUrl: candidate.sourceImageUrl,
          sourcePageUrl: candidate.sourcePageUrl,
          mirroredFrom: "pmc-open-access",
        },
      }

      const { data, error } = await (supabase as any)
        .from("evidence_visual_assets")
        .upsert(row, {
          onConflict: "source_id,figure_key",
        })
        .select(
          "id, source_id, pmid, pmcid, doi, article_url, source_page_url, figure_key, asset_type, label, caption, license, storage_bucket, file_path, mime_type, width, height, sort_order, metadata"
        )
        .single()
      if (error || !data) {
        if (/does not exist|42P01/i.test(error?.message || "")) {
          evidenceVisualAssetsTableAvailable = false
          return storedRows
        }
        console.warn("[Journal Visuals] Failed to persist mirrored figure metadata:", error?.message)
        continue
      }

      storedRows.push(data as StoredEvidenceVisualRow)
    } catch (error) {
      console.warn(
        "[Journal Visuals] Skipping figure candidate:",
        error instanceof Error ? error.message : "unknown error"
      )
    }
  }

  return storedRows
}

async function ensureStoredVisualRows(citation: EvidenceCitation): Promise<StoredEvidenceVisualRow[]> {
  const sourceId = buildEvidenceSourceId(citation)
  const existing = await loadStoredVisualRows(sourceId)
  if (existing.length > 0) {
    return existing
  }

  const identity = await resolveArticleIdentity(citation)
  if (!identity?.pmcid) return []

  const xml = await fetchEuropePmcFullTextXml(identity.pmcid)
  if (!xml) return []

  const candidates = extractFigureCandidatesFromXml(identity.pmcid, xml)
  if (candidates.length === 0) return []

  const persisted = await persistFigureCandidates(citation, identity, candidates)
  if (persisted.length > 0) {
    return persisted.sort((left, right) => left.sort_order - right.sort_order)
  }
  return []
}

async function ensureVisualSelection(
  citation: EvidenceCitation
): Promise<CitationVisualSelection | null> {
  const sourceId = buildEvidenceSourceId(citation)
  const existingRows = await loadStoredVisualRows(sourceId)
  if (existingRows.length > 0) {
    return { kind: "stored", rows: existingRows }
  }

  const identity = await resolveArticleIdentity(citation)
  if (!identity?.pmcid) return null

  const xml = await fetchEuropePmcFullTextXml(identity.pmcid)
  if (!xml) return null

  const candidates = extractFigureCandidatesFromXml(identity.pmcid, xml)
  if (candidates.length === 0) return null

  const persisted = await persistFigureCandidates(citation, identity, candidates)
  if (persisted.length > 0) {
    return {
      kind: "stored",
      rows: persisted.sort((left, right) => left.sort_order - right.sort_order),
    }
  }

  return { kind: "direct", figures: candidates }
}

function pickBestRowsForCitation(
  rows: StoredEvidenceVisualRow[],
  citation: EvidenceCitation,
  queryText: string
): StoredEvidenceVisualRow[] {
  return [...rows]
    .sort(
      (left, right) =>
        scoreFigureForCitation(right, citation, queryText) - scoreFigureForCitation(left, citation, queryText)
    )
    .slice(0, MAX_SELECTED_FIGURES_PER_CITATION)
}

function pickBestFiguresForCitation(
  figures: JournalFigureCandidate[],
  citation: EvidenceCitation,
  queryText: string
): JournalFigureCandidate[] {
  return [...figures]
    .sort(
      (left, right) => scoreFigureForCitation(right, citation, queryText) - scoreFigureForCitation(left, citation, queryText)
    )
    .slice(0, MAX_SELECTED_FIGURES_PER_CITATION)
}

export async function enrichEvidenceCitationsWithJournalVisuals(
  citations: EvidenceCitation[],
  options?: {
    queryText?: string
    maxCitationsToEnrich?: number
  }
): Promise<EvidenceCitation[]> {
  if (!Array.isArray(citations) || citations.length === 0) return citations

  const queryText = options?.queryText || ""
  const maxCitationsToEnrich = Math.max(1, Math.min(options?.maxCitationsToEnrich ?? 4, 6))
  const rankedCitations = [...citations]
    .filter((citation) => citation.sourceType !== "user_upload")
    .filter((citation) => !citation.previewReference && (!citation.figureReferences || citation.figureReferences.length === 0))
    .filter((citation) => Boolean(citation.pmid || citation.pmcid || citation.doi || citation.url))
    .sort((left, right) => {
      const leftScore = scoreFigureForCitation(
        {
          label: left.title,
          caption: left.snippet,
          sortOrder: 0,
        },
        left,
        queryText
      )
      const rightScore = scoreFigureForCitation(
        {
          label: right.title,
          caption: right.snippet,
          sortOrder: 0,
        },
        right,
        queryText
      )
      return rightScore - leftScore
    })
    .slice(0, maxCitationsToEnrich)

  if (rankedCitations.length === 0) return citations

  const merged = new Map<string, EvidenceCitation>(
    citations.map((citation) => [buildEvidenceSourceId(citation), citation])
  )

  for (const citation of rankedCitations) {
    try {
      const selection = await ensureVisualSelection(citation)
      if (!selection) continue

      const selectedVisuals =
        selection.kind === "stored"
          ? await Promise.all(
              pickBestRowsForCitation(selection.rows, citation, queryText).map(async (row, index) => {
                const signedUrl = await createSignedUrl(
                  row.file_path,
                  row.storage_bucket || EVIDENCE_VISUALS_BUCKET
                )
                return toVisualReference(row, signedUrl, index === 0 ? "preview" : "figure")
              })
            )
          : pickBestFiguresForCitation(selection.figures, citation, queryText)
              .map((figure, index) =>
                toDirectVisualReference(buildEvidenceSourceId(citation), figure, index === 0 ? "preview" : "figure")
              )
      const usableVisuals = selectedVisuals.filter((visual) => Boolean(visual.signedUrl))
      if (usableVisuals.length === 0) continue

      const sourceId = buildEvidenceSourceId(citation)
      const existing = merged.get(sourceId)
      if (!existing) continue

      merged.set(sourceId, {
        ...existing,
        pmcid:
          existing.pmcid ||
          (selection.kind === "stored" ? selection.rows[0]?.pmcid ?? null : existing.pmcid ?? null),
        previewReference: usableVisuals[0] || existing.previewReference || null,
        figureReferences: usableVisuals.slice(1),
      })
    } catch (error) {
      console.warn(
        "[Journal Visuals] Citation enrichment skipped:",
        error instanceof Error ? error.message : "unknown error"
      )
    }
  }

  return citations.map((citation) => merged.get(buildEvidenceSourceId(citation)) || citation)
}

import type {
  OCRStatus,
  ParsedUploadAsset,
  ParsedUploadDocument,
  ParsedSourceUnit,
  UploadDocumentKind,
  UploadSourceUnitType,
} from "@/lib/rag/types"

const DOCLING_DEFAULT_TIMEOUT_MS = 18_000
const DOCLING_DEFAULT_MAX_FIGURES_PER_UNIT = 4
const DOCLING_MAX_INLINE_BYTES = 80 * 1024 * 1024

type DoclingParseInput = {
  buffer: Buffer
  title: string
  fileName: string
  mimeType: string
  fallbackKind: UploadDocumentKind
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

function asString(value: unknown): string | null {
  if (typeof value !== "string") return null
  const normalized = value.trim()
  return normalized.length > 0 ? normalized : null
}

function asFiniteNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number.parseFloat(value)
    return Number.isFinite(parsed) ? parsed : null
  }
  return null
}

function clampInteger(
  value: string | undefined,
  fallback: number,
  min: number,
  max: number
): number {
  const parsed = Number.parseInt(value || "", 10)
  if (!Number.isFinite(parsed)) return fallback
  return Math.max(min, Math.min(max, parsed))
}

function normalizeWhitespace(value: string): string {
  return value.replace(/\r\n/g, "\n").replace(/[^\S\n]+/g, " ").trim()
}

function normalizeUploadKind(value: unknown, fallback: UploadDocumentKind): UploadDocumentKind {
  const normalized = asString(value)?.toLowerCase()
  if (
    normalized === "pdf" ||
    normalized === "pptx" ||
    normalized === "docx" ||
    normalized === "image" ||
    normalized === "text" ||
    normalized === "video" ||
    normalized === "other"
  ) {
    return normalized
  }
  return fallback
}

function defaultUnitTypeForKind(kind: UploadDocumentKind): UploadSourceUnitType {
  if (kind === "pdf") return "page"
  if (kind === "pptx") return "slide"
  if (kind === "image") return "image"
  return "section"
}

function normalizeUnitType(
  value: unknown,
  fallback: UploadSourceUnitType
): UploadSourceUnitType {
  const normalized = asString(value)?.toLowerCase()
  if (
    normalized === "page" ||
    normalized === "slide" ||
    normalized === "image" ||
    normalized === "section"
  ) {
    return normalized
  }
  return fallback
}

function normalizeOcrStatus(
  value: unknown,
  unitType: UploadSourceUnitType,
  extractedText: string
): OCRStatus {
  const normalized = asString(value)?.toLowerCase()
  if (
    normalized === "not_required" ||
    normalized === "pending" ||
    normalized === "completed" ||
    normalized === "failed"
  ) {
    return normalized
  }
  if (unitType === "page" || unitType === "image") {
    return extractedText.length > 0 ? "completed" : "pending"
  }
  return "not_required"
}

function decodeBase64Buffer(value: string): Buffer | null {
  const trimmed = value.trim()
  if (!trimmed) return null
  const base64Payload = trimmed.includes(",")
    ? trimmed.slice(trimmed.indexOf(",") + 1)
    : trimmed
  if (!base64Payload) return null
  try {
    const parsed = Buffer.from(base64Payload, "base64")
    return parsed.length > 0 ? parsed : null
  } catch {
    return null
  }
}

function inferImageMimeType(value: unknown, fallback = "image/png"): string {
  const fromValue = asString(value)?.toLowerCase()
  if (fromValue && fromValue.startsWith("image/")) return fromValue
  return fallback
}

function normalizeBoundingBox(value: unknown): Record<string, number> | null {
  const record = asRecord(value)
  if (record) {
    const x = asFiniteNumber(record.x)
    const y = asFiniteNumber(record.y)
    const width = asFiniteNumber(record.width)
    const height = asFiniteNumber(record.height)
    if (x !== null || y !== null || width !== null || height !== null) {
      return {
        ...(x !== null ? { x } : {}),
        ...(y !== null ? { y } : {}),
        ...(width !== null ? { width } : {}),
        ...(height !== null ? { height } : {}),
      }
    }
    return null
  }

  if (Array.isArray(value)) {
    if (value.length >= 4) {
      const left = asFiniteNumber(value[0])
      const top = asFiniteNumber(value[1])
      const right = asFiniteNumber(value[2])
      const bottom = asFiniteNumber(value[3])
      if (left !== null && top !== null && right !== null && bottom !== null) {
        return {
          x: left,
          y: top,
          width: Math.max(0, right - left),
          height: Math.max(0, bottom - top),
        }
      }
    }
  }

  return null
}

function normalizeAsset(
  rawAsset: Record<string, unknown>,
  assetType: "figure" | "preview",
  index: number
): ParsedUploadAsset | null {
  const base64 =
    asString(rawAsset.dataBase64) ||
    asString(rawAsset.base64) ||
    asString(rawAsset.contentBase64) ||
    asString(rawAsset.bytesBase64) ||
    asString(rawAsset.imageBase64)
  if (!base64) return null

  const buffer = decodeBase64Buffer(base64)
  if (!buffer) return null

  const rawAssetType =
    asString(rawAsset.assetType) ||
    asString(rawAsset.type) ||
    asString(rawAsset.kind) ||
    asString(rawAsset.category)
  const caption =
    asString(rawAsset.caption) ||
    asString(rawAsset.description) ||
    asString(rawAsset.vlmDescription) ||
    asString(rawAsset.altText)
  const label =
    asString(rawAsset.label) ||
    asString(rawAsset.title) ||
    (assetType === "preview" ? "Preview" : `Figure ${index + 1}`)
  const bbox = normalizeBoundingBox(
    rawAsset.boundingBox || rawAsset.bbox || rawAsset.region || rawAsset.bounds
  )
  const sourceOffsetStart =
    asFiniteNumber(rawAsset.sourceOffsetStart) ??
    asFiniteNumber(rawAsset.offsetStart) ??
    asFiniteNumber(rawAsset.startOffset)
  const sourceOffsetEnd =
    asFiniteNumber(rawAsset.sourceOffsetEnd) ??
    asFiniteNumber(rawAsset.offsetEnd) ??
    asFiniteNumber(rawAsset.endOffset)
  const width = asFiniteNumber(rawAsset.width)
  const height = asFiniteNumber(rawAsset.height)

  return {
    assetType,
    label,
    caption: caption || undefined,
    buffer,
    mimeType: inferImageMimeType(rawAsset.mimeType || rawAsset.contentType),
    width: width !== null ? Math.round(width) : undefined,
    height: height !== null ? Math.round(height) : undefined,
    metadata: {
      provider: "docling",
      rawAssetType,
      ...(bbox ? { bbox } : {}),
      ...(sourceOffsetStart !== null ? { sourceOffsetStart } : {}),
      ...(sourceOffsetEnd !== null ? { sourceOffsetEnd } : {}),
      ...(asString(rawAsset.classification)
        ? { classification: asString(rawAsset.classification) }
        : {}),
      ...(asString(rawAsset.pageLabel) ? { pageLabel: asString(rawAsset.pageLabel) } : {}),
      ...(asFiniteNumber(rawAsset.pageNumber) !== null
        ? { pageNumber: asFiniteNumber(rawAsset.pageNumber) }
        : {}),
    },
  }
}

function collectAssetCandidates(
  unitRecord: Record<string, unknown>,
  key: string
): Record<string, unknown>[] {
  const value = unitRecord[key]
  if (!value) return []
  if (Array.isArray(value)) {
    return value.map((item) => asRecord(item)).filter((item): item is Record<string, unknown> => Boolean(item))
  }
  const record = asRecord(value)
  return record ? [record] : []
}

function resolveSourceUnits(payload: Record<string, unknown>): Record<string, unknown>[] {
  const candidates = [
    payload.sourceUnits,
    payload.units,
    payload.pages,
    payload.sections,
  ]
  for (const value of candidates) {
    if (Array.isArray(value)) {
      const units = value
        .map((item) => asRecord(item))
        .filter((item): item is Record<string, unknown> => Boolean(item))
      if (units.length > 0) {
        return units
      }
    }
  }
  return []
}

function normalizeSourceUnit(
  rawUnit: Record<string, unknown>,
  index: number,
  fallbackKind: UploadDocumentKind,
  maxFiguresPerUnit: number
): ParsedSourceUnit {
  const fallbackUnitType = defaultUnitTypeForKind(fallbackKind)
  const unitType = normalizeUnitType(rawUnit.unitType || rawUnit.type, fallbackUnitType)
  const unitNumber =
    asFiniteNumber(rawUnit.unitNumber) ??
    asFiniteNumber(rawUnit.pageNumber) ??
    asFiniteNumber(rawUnit.slideNumber) ??
    asFiniteNumber(rawUnit.sectionNumber) ??
    index + 1
  const extractedText =
    normalizeWhitespace(
      asString(rawUnit.extractedText) ||
        asString(rawUnit.text) ||
        asString(rawUnit.markdown) ||
        asString(rawUnit.content) ||
        ""
    ) || ""

  const previewCandidates = [
    ...collectAssetCandidates(rawUnit, "preview"),
    ...collectAssetCandidates(rawUnit, "thumbnail"),
    ...collectAssetCandidates(rawUnit, "cover"),
  ]
  const figureCandidates = [
    ...collectAssetCandidates(rawUnit, "figures"),
    ...collectAssetCandidates(rawUnit, "images"),
    ...collectAssetCandidates(rawUnit, "pictureItems"),
    ...collectAssetCandidates(rawUnit, "visuals"),
  ]

  const sharedAssets = collectAssetCandidates(rawUnit, "assets")
  for (const asset of sharedAssets) {
    const kind =
      asString(asset.assetType)?.toLowerCase() ||
      asString(asset.type)?.toLowerCase() ||
      asString(asset.kind)?.toLowerCase() ||
      ""
    if (kind.includes("preview") || kind.includes("thumbnail") || kind.includes("cover")) {
      previewCandidates.push(asset)
    } else {
      figureCandidates.push(asset)
    }
  }

  const preview =
    previewCandidates
      .map((candidate) => normalizeAsset(candidate, "preview", 0))
      .find((asset): asset is ParsedUploadAsset => Boolean(asset)) || undefined

  const figures = figureCandidates
    .map((candidate, figureIndex) => normalizeAsset(candidate, "figure", figureIndex))
    .filter((asset): asset is ParsedUploadAsset => Boolean(asset))
    .slice(0, maxFiguresPerUnit)

  const width = asFiniteNumber(rawUnit.width)
  const height = asFiniteNumber(rawUnit.height)

  return {
    unitType,
    unitNumber: Math.max(1, Math.round(unitNumber)),
    title:
      asString(rawUnit.title) ||
      `${unitType.charAt(0).toUpperCase()}${unitType.slice(1)} ${Math.max(
        1,
        Math.round(unitNumber)
      )}`,
    extractedText,
    preview,
    figures,
    width: width !== null ? Math.round(width) : undefined,
    height: height !== null ? Math.round(height) : undefined,
    ocrStatus: normalizeOcrStatus(rawUnit.ocrStatus, unitType, extractedText),
    metadata: {
      provider: "docling",
      unitIndex: index,
      ...(asString(rawUnit.id) ? { providerUnitId: asString(rawUnit.id) } : {}),
      ...(asString(rawUnit.pageLabel) ? { pageLabel: asString(rawUnit.pageLabel) } : {}),
      ...(asRecord(rawUnit.metadata) ? (rawUnit.metadata as Record<string, unknown>) : {}),
    },
  }
}

function resolveDoclingEndpoint(serviceUrl: string): string {
  const trimmed = serviceUrl.trim().replace(/\/+$/, "")
  if (!trimmed) return ""
  if (/\/parse$/i.test(trimmed)) return trimmed
  return `${trimmed}/parse`
}

/**
 * Explicit DOCLING_SERVICE_URL, or Supabase Edge Function `docling-parse` when
 * SUPABASE_URL / NEXT_PUBLIC_SUPABASE_URL is set (unless DOCLING_USE_SUPABASE_EDGE=false).
 */
export function resolveDoclingServiceUrl(): string {
  const explicit = (process.env.DOCLING_SERVICE_URL || "").trim()
  if (explicit) return explicit
  if (process.env.DOCLING_USE_SUPABASE_EDGE === "false") return ""
  const base = (
    process.env.SUPABASE_URL ||
    process.env.NEXT_PUBLIC_SUPABASE_URL ||
    ""
  ).trim()
  if (!base) return ""
  return `${base.replace(/\/$/, "")}/functions/v1/docling-parse`
}

function buildDoclingRequestHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  }
  const serviceRole =
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ||
    process.env.SUPABASE_SERVICE_ROLE?.trim()
  if (serviceRole) {
    headers.Authorization = `Bearer ${serviceRole}`
  }
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim()
  if (anon) {
    headers.apikey = anon
    if (!headers.Authorization) {
      headers.Authorization = `Bearer ${anon}`
    }
  }
  return headers
}

export async function parseDocumentWithDocling(
  input: DoclingParseInput
): Promise<ParsedUploadDocument | null> {
  const serviceUrl = resolveDoclingServiceUrl()
  if (!serviceUrl) return null
  if (input.buffer.length === 0 || input.buffer.length > DOCLING_MAX_INLINE_BYTES) return null

  const endpoint = resolveDoclingEndpoint(serviceUrl)
  if (!endpoint) return null

  const timeoutMs = clampInteger(
    process.env.DOCLING_TIMEOUT_MS,
    DOCLING_DEFAULT_TIMEOUT_MS,
    2_000,
    120_000
  )
  const maxFiguresPerUnit = clampInteger(
    process.env.DOCLING_MAX_FIGURES_PER_UNIT,
    DOCLING_DEFAULT_MAX_FIGURES_PER_UNIT,
    0,
    12
  )

  const controller = new AbortController()
  const timeoutHandle = setTimeout(() => controller.abort(), timeoutMs)
  const startedAt = Date.now()

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: buildDoclingRequestHeaders(),
      body: JSON.stringify({
        fileName: input.fileName,
        mimeType: input.mimeType,
        contentBase64: input.buffer.toString("base64"),
        options: {
          extractFigures: true,
          extractPreview: true,
          includeCaptions: true,
          maxFiguresPerUnit,
        },
      }),
      signal: controller.signal,
    })
    if (!response.ok) return null

    const payload = asRecord(await response.json())
    if (!payload) return null

    const units = resolveSourceUnits(payload)
      .map((rawUnit, index) =>
        normalizeSourceUnit(rawUnit, index, input.fallbackKind, maxFiguresPerUnit)
      )
      .sort((left, right) => left.unitNumber - right.unitNumber)
    if (units.length === 0) return null

    const figureCount = units.reduce((sum, unit) => sum + unit.figures.length, 0)
    const previewCount = units.filter((unit) => Boolean(unit.preview)).length
    const parsedKind = normalizeUploadKind(payload.kind || payload.documentKind, input.fallbackKind)
    const payloadMetadata = asRecord(payload.metadata) || {}

    return {
      kind: parsedKind,
      title: input.title,
      metadata: {
        provider: "docling",
        doclingEnabled: true,
        doclingEndpoint: endpoint,
        doclingElapsedMs: Date.now() - startedAt,
        doclingFigureCount: figureCount,
        doclingPreviewCount: previewCount,
        ...payloadMetadata,
      },
      sourceUnits: units,
    }
  } catch (error) {
    if (!(error instanceof Error && error.name === "AbortError")) {
      console.warn("[Uploads] Docling parse failed:", error instanceof Error ? error.message : error)
    }
    return null
  } finally {
    clearTimeout(timeoutHandle)
  }
}

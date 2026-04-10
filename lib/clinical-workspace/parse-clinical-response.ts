import type {
  ClinicalDocType,
  ClinicalDocument,
  ClinicalSource,
  PrescriptionItem,
} from "./types"

const COMMAND_TO_DOC_TYPE: Record<string, ClinicalDocType> = {
  soap: "soap",
  summary: "summary",
  evidence: "evidence",
  interactions: "interactions",
  drug: "drug",
  icd: "icd",
  prescribe: "prescribe",
  refer: "refer",
  vitals: "vitals",
  verify: "verify",
  claim: "claim",
}

const DOC_TITLES: Record<ClinicalDocType, string> = {
  soap: "SOAP Note",
  summary: "Clinical Summary",
  evidence: "Evidence Review",
  interactions: "Drug Interactions",
  drug: "Drug Information",
  icd: "ICD-10 Codes",
  prescribe: "Prescription",
  refer: "Referral Letter",
  vitals: "Vitals Assessment",
  verify: "Eligibility Check",
  claim: "Billing Claim",
}

export function detectCommandFromUserMessage(userMessage: string): ClinicalDocType | null {
  let t = userMessage.trimStart()
  if (t.startsWith("{")) t = t.slice(1).trimStart()
  const match = t.match(/^\[\/(\w+)\]/)
  if (!match) return null
  return COMMAND_TO_DOC_TYPE[match[1]] ?? null
}

export function parseSources(content: string): ClinicalSource[] {
  const sourcesMatch = content.match(/=== EVIDENCE SOURCES \(\d+\) ===([\s\S]*?)(?:=== END ===|$)/)
  if (!sourcesMatch) return []

  const sources: ClinicalSource[] = []
  const lines = sourcesMatch[1].split("\n")

  let currentSource: Partial<ClinicalSource> = {}

  for (const line of lines) {
    const indexMatch = line.match(/^\[(\d+)\]\s*(.+)/)
    if (indexMatch) {
      if (currentSource.index !== undefined) {
        sources.push(currentSource as ClinicalSource)
      }
      currentSource = {
        index: parseInt(indexMatch[1]),
        title: indexMatch[2].trim(),
      }
      continue
    }

    const journalMatch = line.match(/Journal:\s*(.+?)(?:\s*\||$)/)
    if (journalMatch && currentSource.index !== undefined) {
      currentSource.journal = journalMatch[1].trim()
    }

    const yearMatch = line.match(/Year:\s*(\d{4})/)
    if (yearMatch && currentSource.index !== undefined) {
      currentSource.year = yearMatch[1]
    }

    const urlMatch = line.match(/URL:\s*(https?:\/\/\S+)/)
    if (urlMatch && currentSource.index !== undefined) {
      currentSource.url = urlMatch[1]
    }

    const snippetMatch = line.match(/Snippet:\s*(.+)/)
    if (snippetMatch && currentSource.index !== undefined) {
      currentSource.snippet = snippetMatch[1].trim()
    }
  }

  if (currentSource.index !== undefined) {
    sources.push(currentSource as ClinicalSource)
  }

  return sources
}

const PRESCRIPTION_ITEMS_BLOCK =
  /===\s*PRESCRIPTION_ITEMS\s*===\s*([\s\S]*?)(?:\n===\s*END_PRESCRIPTION_ITEMS\s*===|$)/i

export function parsePrescriptionItems(content: string): PrescriptionItem[] {
  const m = content.match(PRESCRIPTION_ITEMS_BLOCK)
  if (!m) return []
  const raw = m[1].trim()
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.map((row, i) => normalizePrescriptionRow(row, i))
  } catch {
    return []
  }
}

function normalizePrescriptionRow(raw: unknown, index: number): PrescriptionItem {
  if (!raw || typeof raw !== "object") {
    return { id: String(index + 1), drug: "Unknown" }
  }
  const o = raw as Record<string, unknown>
  const drugRaw = o.drug ?? o.name ?? o.medication
  const drug =
    typeof drugRaw === "string" && drugRaw.trim()
      ? drugRaw.trim()
      : "Unnamed medication"
  const id =
    typeof o.id === "string" && o.id.trim() ? o.id.trim() : String(index + 1)
  const str = (k: string) => {
    const v = o[k]
    return typeof v === "string" && v.trim() ? v.trim() : undefined
  }
  return {
    id,
    drug,
    strength: str("strength"),
    route: str("route"),
    frequency: str("frequency"),
    duration: str("duration"),
    instructions: str("instructions"),
    reasoning: str("reasoning"),
  }
}

export function stripPrescriptionItemsBlock(content: string): string {
  return content.replace(PRESCRIPTION_ITEMS_BLOCK, "").trim()
}

export function stripResponseWrapper(content: string): string {
  return stripPrescriptionItemsBlock(
    content
      .replace(/^=== FLEMING FULL RESPONSE ===\n?/, "")
      .replace(/\n?=== EVIDENCE SOURCES \(\d+\) ===[\s\S]*$/, "")
      .replace(/\n?=== END ===\s*$/, "")
      .trim()
  )
}

export type BuildClinicalDocumentOptions = {
  /**
   * Parse `=== EVIDENCE SOURCES ===` from this string (defaults to `fullContent`).
   * Pass pre-split raw assistant text when the display body has the appendix stripped
   * but the original message still contains the block.
   */
  sourcesParseInput?: string
  /**
   * When no structured evidence block is found, map trailing PMID appendix lines to sources [1], [2], …
   */
  trailingPmidSources?: Array<{ title: string; pmid: string; note?: string }>
}

function trailingPmidSourcesToClinicalSources(
  entries: NonNullable<BuildClinicalDocumentOptions["trailingPmidSources"]>
): ClinicalSource[] {
  return entries.map((e, i) => ({
    index: i + 1,
    title: e.title?.trim() || `PubMed ${e.pmid}`,
    /** Leave journal empty so UI shows article title instead of a fake "PubMed" journal name. */
    journal: undefined,
    pmid: e.pmid.trim(),
    url: `https://pubmed.ncbi.nlm.nih.gov/${e.pmid.trim()}/`,
    snippet: e.note?.trim(),
  }))
}

export function buildClinicalDocument(
  messageId: string,
  docType: ClinicalDocType,
  fullContent: string,
  isStreaming: boolean,
  patientName?: string,
  /** When revising with the document sheet open for the same type, reuse this id instead of `cdoc-${messageId}`. */
  documentIdOverride?: string | null,
  options?: BuildClinicalDocumentOptions,
): ClinicalDocument {
  const parseInput = options?.sourcesParseInput ?? fullContent
  let sources = parseSources(parseInput)
  if (sources.length === 0 && options?.trailingPmidSources?.length) {
    sources = trailingPmidSourcesToClinicalSources(options.trailingPmidSources)
  }
  const prescriptionItems =
    docType === "prescribe" ? parsePrescriptionItems(fullContent) : undefined
  const content = stripResponseWrapper(fullContent)
  const id =
    documentIdOverride && documentIdOverride.trim().length > 0
      ? documentIdOverride.trim()
      : `cdoc-${messageId}`

  return {
    id,
    type: docType,
    title: DOC_TITLES[docType],
    content,
    isStreaming,
    timestamp: new Date(),
    patientName,
    sources: sources.length > 0 ? sources : undefined,
    prescriptionItems:
      prescriptionItems && prescriptionItems.length > 0
        ? prescriptionItems
        : undefined,
  }
}

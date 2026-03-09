import type { EvidenceCitation } from "@/lib/evidence/types"

export type CitationStyle = "harvard" | "apa" | "vancouver"

export type FormattedBibliographyEntry = {
  index: number
  entry: string
  citation: EvidenceCitation
}

const DEFAULT_CITATION_STYLE: CitationStyle = "harvard"

function safeYear(citation: EvidenceCitation): string {
  return citation.year ? String(citation.year) : "n.d."
}

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim()
}

function formatSourceUrl(citation: EvidenceCitation): string {
  if (citation.doi && citation.doi.trim().length > 0) {
    return `https://doi.org/${citation.doi.trim().replace(/^https?:\/\/doi\.org\//i, "")}`
  }
  return citation.url || ""
}

function splitAuthor(author: string): { family: string; initials: string } {
  const trimmed = normalizeWhitespace(author)
  if (!trimmed) {
    return { family: "", initials: "" }
  }

  if (trimmed.includes(",")) {
    const [familyRaw, givenRaw] = trimmed.split(",", 2)
    const family = normalizeWhitespace(familyRaw || "")
    const initials = normalizeWhitespace(givenRaw || "")
      .split(" ")
      .filter(Boolean)
      .map((part) => `${part[0].toUpperCase()}.`)
      .join("")
    return { family, initials }
  }

  const parts = trimmed.split(" ").filter(Boolean)
  if (parts.length === 1) {
    return { family: parts[0], initials: "" }
  }
  const family = parts[parts.length - 1]
  const initials = parts
    .slice(0, -1)
    .map((part) => `${part[0].toUpperCase()}.`)
    .join("")
  return { family, initials }
}

function formatHarvardAuthors(authors: string[]): string {
  if (!authors.length) return "Unknown author"
  const mapped = authors
    .map((author) => splitAuthor(author))
    .filter((author) => author.family.length > 0)
    .map((author) =>
      author.initials.length > 0 ? `${author.family}, ${author.initials}` : author.family
    )
  if (!mapped.length) return "Unknown author"
  if (mapped.length === 1) return mapped[0]
  if (mapped.length === 2) return `${mapped[0]} and ${mapped[1]}`
  return `${mapped.slice(0, -1).join(", ")}, and ${mapped[mapped.length - 1]}`
}

function formatApaAuthors(authors: string[]): string {
  if (!authors.length) return "Unknown author"
  const mapped = authors
    .map((author) => splitAuthor(author))
    .filter((author) => author.family.length > 0)
    .map((author) =>
      author.initials.length > 0 ? `${author.family}, ${author.initials}` : author.family
    )
  if (!mapped.length) return "Unknown author"
  if (mapped.length === 1) return mapped[0]
  if (mapped.length <= 20) {
    return `${mapped.slice(0, -1).join(", ")}, & ${mapped[mapped.length - 1]}`
  }
  return `${mapped.slice(0, 19).join(", ")}, ... ${mapped[mapped.length - 1]}`
}

function formatVancouverAuthors(authors: string[]): string {
  if (!authors.length) return "Unknown author"
  const mapped = authors
    .map((author) => splitAuthor(author))
    .filter((author) => author.family.length > 0)
    .map((author) =>
      author.initials.length > 0 ? `${author.family} ${author.initials.replace(/\./g, "")}` : author.family
    )
  if (!mapped.length) return "Unknown author"
  if (mapped.length <= 6) return mapped.join(", ")
  return `${mapped.slice(0, 6).join(", ")}, et al`
}

export function normalizeCitationStyle(input?: string | null): CitationStyle {
  if (input === "harvard" || input === "apa" || input === "vancouver") {
    return input
  }
  return DEFAULT_CITATION_STYLE
}

export function formatInlineCitation(
  citation: EvidenceCitation,
  style: CitationStyle,
  indexOverride?: number
): string {
  const year = safeYear(citation)
  const idx = indexOverride ?? citation.index
  if (style === "vancouver") {
    return `[${idx}]`
  }

  const firstAuthor = citation.authors[0] || "Unknown"
  const family = splitAuthor(firstAuthor).family || "Unknown"
  if (style === "apa") {
    return citation.authors.length > 1 ? `(${family} et al., ${year})` : `(${family}, ${year})`
  }
  return citation.authors.length > 1 ? `(${family} et al., ${year})` : `(${family}, ${year})`
}

export function formatBibliographyEntry(
  citation: EvidenceCitation,
  style: CitationStyle,
  indexOverride?: number
): string {
  const year = safeYear(citation)
  const idx = indexOverride ?? citation.index
  const title = citation.title || "Untitled source"
  const journal = citation.journal || citation.sourceLabel || "Unknown source"
  const doiOrUrl = formatSourceUrl(citation)

  if (style === "vancouver") {
    const authorText = formatVancouverAuthors(citation.authors)
    const base = `${idx}. ${authorText}. ${title}. ${journal}. ${year}.`
    return doiOrUrl ? `${base} Available from: ${doiOrUrl}` : base
  }

  if (style === "apa") {
    const authorText = formatApaAuthors(citation.authors)
    const base = `${authorText} (${year}). ${title}. ${journal}.`
    return doiOrUrl ? `${base} ${doiOrUrl}` : base
  }

  const authorText = formatHarvardAuthors(citation.authors)
  const base = `${authorText} (${year}) ${title}. ${journal}.`
  return doiOrUrl ? `${base} Available at: ${doiOrUrl}` : base
}

export function formatBibliography(
  citations: EvidenceCitation[],
  style: CitationStyle
): FormattedBibliographyEntry[] {
  return citations
    .slice()
    .sort((a, b) => a.index - b.index)
    .map((citation, index) => ({
      index: style === "vancouver" ? index + 1 : citation.index,
      entry: formatBibliographyEntry(
        citation,
        style,
        style === "vancouver" ? index + 1 : citation.index
      ),
      citation,
    }))
}

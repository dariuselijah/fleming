"use client"

import { cn } from "@/lib/utils"
import type { ClinicalDocType, ClinicalDocument, ClinicalSource } from "@/lib/clinical-workspace"
import { useWorkspace } from "@/lib/clinical-workspace"
import { CitationMarkdown } from "@/app/components/chat/citation-markdown"
import { EvidenceCitationPill } from "@/app/components/chat/evidence-citation-pill"
import type { CitationData } from "@/app/components/chat/citation-popup"
import type { EvidenceCitation } from "@/lib/evidence/types"
import {
  Clipboard,
  Flask,
  Heartbeat,
  Pill,
  Receipt,
  ArrowRight,
  Warning,
  BookOpen,
  FileText,
  ShieldCheck,
  Hash,
  ArrowsOutSimple,
  SpinnerGap,
  CheckCircle,
  CaretDown,
} from "@phosphor-icons/react"
import { motion, AnimatePresence } from "motion/react"
import { useCallback, useMemo, useState } from "react"

const DOC_STYLES: Record<ClinicalDocType, {
  icon: React.ComponentType<any>
  label: string
  accent: string
  iconBg: string
  iconColor: string
  border: string
  sectionBorder: string
}> = {
  soap: {
    icon: Clipboard,
    label: "SOAP Note",
    accent: "from-indigo-500/8 to-transparent",
    iconBg: "bg-indigo-500/10",
    iconColor: "text-indigo-500",
    border: "border-indigo-500/15",
    sectionBorder: "border-l-indigo-400",
  },
  summary: {
    icon: FileText,
    label: "Clinical Summary",
    accent: "from-blue-500/8 to-transparent",
    iconBg: "bg-blue-500/10",
    iconColor: "text-blue-500",
    border: "border-blue-500/15",
    sectionBorder: "border-l-blue-400",
  },
  evidence: {
    icon: BookOpen,
    label: "Evidence Review",
    accent: "from-emerald-500/8 to-transparent",
    iconBg: "bg-emerald-500/10",
    iconColor: "text-emerald-500",
    border: "border-emerald-500/15",
    sectionBorder: "border-l-emerald-400",
  },
  interactions: {
    icon: Warning,
    label: "Drug Interactions",
    accent: "from-orange-500/8 to-transparent",
    iconBg: "bg-orange-500/10",
    iconColor: "text-orange-500",
    border: "border-orange-500/15",
    sectionBorder: "border-l-orange-400",
  },
  drug: {
    icon: Pill,
    label: "Drug Information",
    accent: "from-sky-500/8 to-transparent",
    iconBg: "bg-sky-500/10",
    iconColor: "text-sky-500",
    border: "border-sky-500/15",
    sectionBorder: "border-l-sky-400",
  },
  icd: {
    icon: Hash,
    label: "ICD-10 Codes",
    accent: "from-amber-500/8 to-transparent",
    iconBg: "bg-amber-500/10",
    iconColor: "text-amber-500",
    border: "border-amber-500/15",
    sectionBorder: "border-l-amber-400",
  },
  prescribe: {
    icon: Pill,
    label: "Prescription",
    accent: "from-sky-500/8 to-transparent",
    iconBg: "bg-sky-500/10",
    iconColor: "text-sky-500",
    border: "border-sky-500/15",
    sectionBorder: "border-l-sky-400",
  },
  refer: {
    icon: ArrowRight,
    label: "Referral Letter",
    accent: "from-teal-500/8 to-transparent",
    iconBg: "bg-teal-500/10",
    iconColor: "text-teal-500",
    border: "border-teal-500/15",
    sectionBorder: "border-l-teal-400",
  },
  vitals: {
    icon: Heartbeat,
    label: "Vitals Assessment",
    accent: "from-emerald-500/8 to-transparent",
    iconBg: "bg-emerald-500/10",
    iconColor: "text-emerald-500",
    border: "border-emerald-500/15",
    sectionBorder: "border-l-emerald-400",
  },
  verify: {
    icon: ShieldCheck,
    label: "Eligibility Check",
    accent: "from-amber-500/8 to-transparent",
    iconBg: "bg-amber-500/10",
    iconColor: "text-amber-500",
    border: "border-amber-500/15",
    sectionBorder: "border-l-amber-400",
  },
  claim: {
    icon: Receipt,
    label: "Billing Claim",
    accent: "from-amber-500/8 to-transparent",
    iconBg: "bg-amber-500/10",
    iconColor: "text-amber-500",
    border: "border-amber-500/15",
    sectionBorder: "border-l-amber-400",
  },
}

const SOAP_SECTION_COLORS: Record<string, string> = {
  subjective: "border-l-blue-400",
  objective: "border-l-emerald-400",
  assessment: "border-l-purple-400",
  plan: "border-l-amber-400",
}

const EMPTY_CITATIONS_MAP = new Map<number, CitationData>()

function parseClinicalSourceYear(y: string | undefined): number | null {
  if (!y?.trim()) return null
  const m = y.trim().match(/^(\d{4})/)
  return m ? parseInt(m[1], 10) : null
}

function clinicalSourcesToEvidenceCitations(
  sources: ClinicalSource[] | undefined
): EvidenceCitation[] {
  if (!sources?.length) return []
  return sources.map((s) => ({
    index: s.index,
    sourceId: `clinical-doc:${s.index}`,
    pmid: s.pmid?.trim() || null,
    title: s.title?.trim() || `Source ${s.index}`,
    journal: s.journal?.trim() || "",
    year: parseClinicalSourceYear(s.year),
    doi: null,
    authors: [],
    evidenceLevel: 3,
    studyType: null,
    sampleSize: null,
    meshTerms: [],
    url:
      s.url?.trim() ||
      (s.pmid?.trim() ? `https://pubmed.ncbi.nlm.nih.gov/${s.pmid.trim()}/` : null),
    snippet: (s.snippet?.trim() || s.title || "").slice(0, 500),
    score: 0,
    sourceType: "medical_evidence" as const,
  }))
}

function stripTranscriptProvenanceTags(text: string): string {
  return text.replace(/\[(?:T|E|H)\]/g, "")
}

interface ParsedSection {
  heading: string
  body: string
  key: string
}

function parseContentSections(content: string): ParsedSection[] {
  const sections: ParsedSection[] = []
  const lines = content.split("\n")
  let current: ParsedSection | null = null

  for (const line of lines) {
    const headingMatch = line.match(/^#{2,3}\s+(.+)/)
    if (headingMatch) {
      if (current) sections.push(current)
      const heading = headingMatch[1].replace(/\*\*/g, "").trim()
      current = {
        heading,
        body: "",
        key: heading.toLowerCase().replace(/[^a-z]/g, ""),
      }
    } else if (current) {
      current.body += (current.body ? "\n" : "") + line
    } else {
      if (line.trim()) {
        current = { heading: "", body: line, key: "intro" }
      }
    }
  }
  if (current) sections.push(current)
  return sections
}

function formatInlineHtml(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/g, '<strong class="font-semibold text-foreground">$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/\[T\]/g, '<sup class="ml-0.5 inline-flex size-3 items-center justify-center rounded bg-blue-500/10 text-[7px] font-bold text-blue-600 dark:text-blue-400 leading-none">T</sup>')
    .replace(/\[E\]/g, '<sup class="ml-0.5 inline-flex size-3 items-center justify-center rounded bg-purple-500/10 text-[7px] font-bold text-purple-600 dark:text-purple-400 leading-none">E</sup>')
    .replace(/\[H\]/g, '<sup class="ml-0.5 inline-flex size-3 items-center justify-center rounded bg-amber-500/10 text-[7px] font-bold text-amber-600 dark:text-amber-400 leading-none">H</sup>')
    .replace(/\[(\d+)\]/g, '<sup class="text-indigo-500 font-semibold">[$1]</sup>')
}

function extractSummary(content: string): string {
  const lines = content.split("\n")
  const keyParts: string[] = []
  for (const line of lines) {
    const t = line.trim()
      .replace(/^#{1,6}\s+/, "")
      .replace(/\*\*/g, "")
      .replace(/\[.*?\]/g, "")
      .replace(/^[-•*]\s*/, "")
      .trim()
    if (!t || t.length < 8 || t.startsWith("===") || t.startsWith("---")) continue
    if (/^(CC|Chief|HPI|Referral To|Patient|Reason|Drug|Code)/i.test(t)) {
      keyParts.push(t.length > 90 ? t.slice(0, 90) + "..." : t)
      if (keyParts.length >= 2) break
    }
  }
  if (keyParts.length === 0) {
    for (const line of lines) {
      const t = line.trim().replace(/^[-•*]\s*/, "").replace(/\*\*/g, "").replace(/\[.*?\]/g, "").trim()
      if (t.length > 15 && !t.startsWith("===") && !t.startsWith("#")) {
        keyParts.push(t.length > 90 ? t.slice(0, 90) + "..." : t)
        break
      }
    }
  }
  return keyParts.join(" · ")
}

interface ClinicalDocumentCardProps {
  document: ClinicalDocument
  onExpand: (doc: ClinicalDocument) => void
  messageId?: string
}

export function ClinicalDocumentCard({
  document,
  onExpand,
  messageId: messageIdProp,
}: ClinicalDocumentCardProps) {
  const {
    activePatient,
    acceptSessionDocument,
    rejectSessionDocument,
  } = useWorkspace()
  const style = DOC_STYLES[document.type] ?? DOC_STYLES.summary
  const Icon = style.icon
  const [expanded, setExpanded] = useState(false)
  const [rejectOpen, setRejectOpen] = useState(false)
  const [rejectReason, setRejectReason] = useState("")

  const sessionEntry = useMemo(
    () =>
      activePatient?.sessionDocuments?.find((s) => s.id === document.id) ?? null,
    [activePatient?.sessionDocuments, document.id]
  )
  const reviewStatus = sessionEntry?.status ?? "draft"
  const patientId = activePatient?.patientId

  const summary = useMemo(() => extractSummary(document.content), [document.content])
  const sections = useMemo(() => parseContentSections(document.content), [document.content])
  const sourceCount = document.sources?.length ?? 0
  const evidenceCitationsFromDoc = useMemo(
    () => clinicalSourcesToEvidenceCitations(document.sources),
    [document.sources]
  )
  const renderEvidenceMarkdown =
    document.type === "evidence" && evidenceCitationsFromDoc.length > 0
  const evidenceMdClass =
    "max-w-none text-[13px] leading-relaxed text-foreground/70 [&_p]:my-1 [&_ul]:my-1"
  const evidenceMdInlineClass =
    "inline max-w-none text-[13px] leading-relaxed text-foreground/70 [&_p]:m-0 [&_p]:inline [&_ul]:inline [&_ul]:m-0 [&_li]:inline"

  const handleExpand = useCallback(() => {
    onExpand(document)
  }, [document, onExpand])

  const messageId =
    messageIdProp ?? (document.id.replace(/^cdoc-/, "") || document.id)

  const handleAccept = useCallback(() => {
    if (!patientId) return
    acceptSessionDocument(patientId, document.id, {
      document,
      messageId,
    })
  }, [acceptSessionDocument, document, messageId, patientId])

  const handleRejectSubmit = useCallback(() => {
    if (!patientId || !rejectReason.trim()) return
    rejectSessionDocument(patientId, document.id, rejectReason.trim(), {
      document,
      messageId,
    })
    if (typeof window !== "undefined") {
      window.dispatchEvent(
        new CustomEvent("fleming:revise-document", {
          detail: {
            commandTag: document.type,
            reason: rejectReason.trim(),
            priorContent: document.content,
          },
        })
      )
    }
    setRejectOpen(false)
    setRejectReason("")
  }, [
    document,
    messageId,
    patientId,
    rejectReason,
    rejectSessionDocument,
  ])

  const toggleInline = useCallback(() => {
    setExpanded((prev) => !prev)
  }, [])

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: "spring", stiffness: 400, damping: 30 }}
      className="group w-full overflow-hidden rounded-xl border border-border/40 bg-background shadow-sm transition-shadow hover:shadow-md"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3">
        <div className="flex items-center gap-3">
          <div className={cn("flex size-9 items-center justify-center rounded-lg", style.iconBg)}>
            <Icon className={cn("size-[18px]", style.iconColor)} weight="duotone" />
          </div>
          <div>
            <h4 className="text-sm font-semibold leading-tight">{style.label}</h4>
            <div className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
              {document.patientName && <span>{document.patientName}</span>}
              <span>{new Date(document.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
              {sourceCount > 0 && (
                <span className="flex items-center gap-0.5">
                  <BookOpen className="size-3" />
                  {sourceCount}
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-1">
          {document.isStreaming ? (
            <span className="flex items-center gap-1.5 rounded-full bg-muted/60 px-2.5 py-1 text-xs text-muted-foreground">
              <SpinnerGap className="size-3.5 animate-spin" />
              Generating
            </span>
          ) : reviewStatus === "accepted" ? (
            <span className="flex items-center gap-1 rounded-full bg-emerald-500/12 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:text-emerald-400">
              <CheckCircle className="size-3.5" weight="fill" />
              Accepted
            </span>
          ) : reviewStatus === "rejected" ? (
            <span className="rounded-full bg-amber-500/12 px-2 py-0.5 text-xs font-medium text-amber-800 dark:text-amber-400">
              Revising…
            </span>
          ) : (
            <span className="flex items-center gap-1 rounded-full bg-emerald-500/8 px-2 py-0.5 text-xs font-medium text-emerald-600 dark:text-emerald-400">
              <CheckCircle className="size-3.5" weight="fill" />
              Complete
            </span>
          )}
        </div>
      </div>

      {/* Collapsed summary */}
      {!expanded && summary && (
        <div className="px-4 pb-3 -mt-0.5">
          <p className="text-[13px] leading-relaxed text-muted-foreground line-clamp-2">
            {summary}
          </p>
        </div>
      )}

      {/* Expanded content */}
      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ type: "spring", stiffness: 300, damping: 30 }}
            className="overflow-hidden"
          >
            <div className="space-y-3 border-t border-border/20 px-4 py-3">
              {sections.map((section, i) => {
                const borderColor = SOAP_SECTION_COLORS[section.key] ?? style.sectionBorder
                return (
                  <div key={i} className={cn("border-l-2 pl-3.5 py-0.5", borderColor)}>
                    {section.heading && (
                      <h5 className="mb-1 text-xs font-bold uppercase tracking-wide text-foreground/80">
                        {section.heading}
                      </h5>
                    )}
                    <div className="text-[13px] leading-relaxed text-foreground/70">
                      {section.body.split("\n").map((line, j) => {
                        const trimmed = line.trim()
                        if (!trimmed) return null

                        if (renderEvidenceMarkdown) {
                          if (trimmed.startsWith("- **") || trimmed.startsWith("* **")) {
                            const boldMatch = trimmed.match(/^[-*] \*\*(.+?)\*\*(.*)/)
                            if (boldMatch) {
                              const tail = stripTranscriptProvenanceTags(boldMatch[2] || "")
                              return (
                                <div key={j} className="flex gap-2 py-[3px]">
                                  <span className="mt-[7px] size-1 shrink-0 rounded-full bg-foreground/20" />
                                  <span>
                                    <strong className="font-semibold text-foreground">{boldMatch[1]}</strong>
                                    <CitationMarkdown
                                      citations={EMPTY_CITATIONS_MAP}
                                      evidenceCitations={evidenceCitationsFromDoc}
                                      className={evidenceMdInlineClass}
                                    >
                                      {tail}
                                    </CitationMarkdown>
                                  </span>
                                </div>
                              )
                            }
                          }

                          if (trimmed.startsWith("- ") || trimmed.startsWith("* ")) {
                            const inner = stripTranscriptProvenanceTags(trimmed.slice(2))
                            return (
                              <div key={j} className="flex gap-2 py-[3px]">
                                <span className="mt-[7px] size-1 shrink-0 rounded-full bg-foreground/20" />
                                <CitationMarkdown
                                  citations={EMPTY_CITATIONS_MAP}
                                  evidenceCitations={evidenceCitationsFromDoc}
                                  className={evidenceMdClass}
                                >
                                  {inner}
                                </CitationMarkdown>
                              </div>
                            )
                          }

                          const cleaned = stripTranscriptProvenanceTags(trimmed)
                          return (
                            <div key={j} className="py-[2px]">
                              <CitationMarkdown
                                citations={EMPTY_CITATIONS_MAP}
                                evidenceCitations={evidenceCitationsFromDoc}
                                className={evidenceMdClass}
                              >
                                {cleaned}
                              </CitationMarkdown>
                            </div>
                          )
                        }

                        if (trimmed.startsWith("- **") || trimmed.startsWith("* **")) {
                          const boldMatch = trimmed.match(/^[-*] \*\*(.+?)\*\*(.*)/)
                          if (boldMatch) {
                            return (
                              <div key={j} className="flex gap-2 py-[3px]">
                                <span className="mt-[7px] size-1 shrink-0 rounded-full bg-foreground/20" />
                                <span>
                                  <strong className="font-semibold text-foreground">{boldMatch[1]}</strong>
                                  <span
                                    dangerouslySetInnerHTML={{
                                      __html: formatInlineHtml(
                                        document.type === "evidence"
                                          ? stripTranscriptProvenanceTags(boldMatch[2] || "")
                                          : boldMatch[2] || ""
                                      ),
                                    }}
                                  />
                                </span>
                              </div>
                            )
                          }
                        }

                        if (trimmed.startsWith("- ") || trimmed.startsWith("* ")) {
                          const bulletBody =
                            document.type === "evidence"
                              ? stripTranscriptProvenanceTags(trimmed.slice(2))
                              : trimmed.slice(2)
                          return (
                            <div key={j} className="flex gap-2 py-[3px]">
                              <span className="mt-[7px] size-1 shrink-0 rounded-full bg-foreground/20" />
                              <span dangerouslySetInnerHTML={{ __html: formatInlineHtml(bulletBody) }} />
                            </div>
                          )
                        }

                        const para =
                          document.type === "evidence"
                            ? stripTranscriptProvenanceTags(trimmed)
                            : trimmed
                        return (
                          <p key={j} className="py-[2px]" dangerouslySetInnerHTML={{ __html: formatInlineHtml(para) }} />
                        )
                      })}
                    </div>
                  </div>
                )
              })}
              {document.type === "evidence" && evidenceCitationsFromDoc.length > 0 && (
                <div className="flex flex-wrap gap-1 border-t border-border/10 px-4 py-2">
                  {evidenceCitationsFromDoc.map((c) => (
                    <EvidenceCitationPill key={c.index} citation={c} size="sm" />
                  ))}
                </div>
              )}
              {document.type !== "evidence" && (
              <div className="flex items-center gap-3 border-t border-border/10 pt-2 text-[10px] text-muted-foreground/50">
                <span className="flex items-center gap-1">
                  <sup className="inline-flex size-3 items-center justify-center rounded bg-blue-500/10 text-[7px] font-bold text-blue-600 dark:text-blue-400">T</sup>
                  Transcript
                </span>
                <span className="flex items-center gap-1">
                  <sup className="inline-flex size-3 items-center justify-center rounded bg-purple-500/10 text-[7px] font-bold text-purple-600 dark:text-purple-400">E</sup>
                  Extraction
                </span>
                <span className="flex items-center gap-1">
                  <sup className="inline-flex size-3 items-center justify-center rounded bg-amber-500/10 text-[7px] font-bold text-amber-600 dark:text-amber-400">H</sup>
                  History
                </span>
              </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence initial={false}>
        {rejectOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden border-t border-border/20 bg-muted/20 px-4 py-3"
          >
            <p className="mb-1.5 text-[11px] font-medium text-muted-foreground">
              What should change?
            </p>
            <textarea
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="e.g. Expand assessment, fix drug dose…"
              rows={2}
              className="mb-2 w-full resize-none rounded-lg border border-border/50 bg-background px-2.5 py-2 text-[12px] outline-none focus:border-indigo-500/40"
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setRejectOpen(false)
                  setRejectReason("")
                }}
                className="rounded-md px-2.5 py-1 text-[11px] font-medium text-muted-foreground hover:bg-muted"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={!rejectReason.trim()}
                onClick={handleRejectSubmit}
                className="rounded-md bg-amber-600/90 px-2.5 py-1 text-[11px] font-medium text-white hover:bg-amber-600 disabled:opacity-40"
              >
                Reject &amp; revise
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Footer */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border/20 px-3 py-2">
        <div className="flex flex-wrap gap-1">
          {patientId && !document.isStreaming && reviewStatus === "draft" && (
            <>
              <button
                type="button"
                onClick={handleAccept}
                className="inline-flex items-center gap-1 rounded-lg bg-emerald-500/12 px-2.5 py-1.5 text-xs font-semibold text-emerald-700 transition-colors hover:bg-emerald-500/20 dark:text-emerald-400"
              >
                <CheckCircle className="size-3.5" weight="fill" />
                Accept
              </button>
              <button
                type="button"
                onClick={() => setRejectOpen((o) => !o)}
                className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-red-500/10 hover:text-red-600"
              >
                Reject
              </button>
            </>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={toggleInline}
            className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <motion.span
              animate={{ rotate: expanded ? 180 : 0 }}
              transition={{ duration: 0.2 }}
            >
              <CaretDown className="size-3.5" />
            </motion.span>
            {expanded ? "Collapse" : "Preview"}
          </button>
          <button
            type="button"
            onClick={handleExpand}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors",
              style.iconColor,
              "bg-muted/50 hover:bg-muted"
            )}
          >
            <ArrowsOutSimple className="size-3.5" />
            Open
          </button>
        </div>
      </div>
    </motion.div>
  )
}

export { DOC_STYLES }

"use client"

import {
  useWorkspace,
  type MedicalBlock,
  type ShareTarget,
  type ClinicalDocument,
  type ClinicalSource,
} from "@/lib/clinical-workspace"
import { CitationMarkdown } from "@/app/components/chat/citation-markdown"
import { EvidenceCitationPill } from "@/app/components/chat/evidence-citation-pill"
import type { CitationData } from "@/app/components/chat/citation-popup"
import type { EvidenceCitation } from "@/lib/evidence/types"
import {
  stripPrescriptionItemsBlock,
  stripResponseWrapper,
} from "@/lib/clinical-workspace/parse-clinical-response"
import ReactMarkdown from "react-markdown"
import remarkBreaks from "remark-breaks"
import remarkGfm from "remark-gfm"
import { cn } from "@/lib/utils"
import {
  X,
  PencilSimple,
  PaperPlaneTilt,
  Printer,
  Sparkle,
  Flask,
  Heartbeat,
  FileText,
  Receipt,
  Pill,
  Image as ImageIcon,
  Clipboard,
  ArrowRight,
  Warning,
  Microphone,
  Hospital,
  WhatsappLogo,
  EnvelopeSimple,
  UserCircle,
  Check,
  BookOpen,
  Hash,
  ShieldCheck,
  SpinnerGap,
} from "@phosphor-icons/react"
import { motion, AnimatePresence } from "motion/react"
import { useCallback, useMemo, useState, useRef, useEffect } from "react"
import type { MedicalBlockType, ClinicalDocType } from "@/lib/clinical-workspace"
import { PrescriptionEditorPanel } from "@/app/components/workspace/prescription-sidebar"

const BLOCK_ICONS: Record<MedicalBlockType, React.ComponentType<any>> = {
  LAB: Flask,
  VITAL: Heartbeat,
  NOTE: FileText,
  SOAP: Clipboard,
  CLAIM: Receipt,
  BILLING: Receipt,
  PRESCRIPTION: Pill,
  IMAGING: ImageIcon,
  SCRIBE: Microphone,
  REFERRAL: ArrowRight,
  ALERT: Warning,
}

const BLOCK_ICON_COLOR: Record<MedicalBlockType, string> = {
  LAB: "text-purple-500",
  VITAL: "text-emerald-500",
  NOTE: "text-blue-500",
  SOAP: "text-indigo-500",
  CLAIM: "text-amber-500",
  BILLING: "text-amber-500",
  PRESCRIPTION: "text-sky-500",
  IMAGING: "text-rose-500",
  SCRIBE: "text-red-500",
  REFERRAL: "text-teal-500",
  ALERT: "text-orange-500",
}

const DOC_ICONS: Record<ClinicalDocType, React.ComponentType<any>> = {
  soap: Clipboard,
  summary: FileText,
  evidence: BookOpen,
  interactions: Warning,
  drug: Pill,
  icd: Hash,
  prescribe: Pill,
  refer: ArrowRight,
  vitals: Heartbeat,
  verify: ShieldCheck,
  claim: Receipt,
}

const DOC_ICON_COLOR: Record<ClinicalDocType, string> = {
  soap: "text-indigo-500",
  summary: "text-blue-500",
  evidence: "text-emerald-500",
  interactions: "text-orange-500",
  drug: "text-sky-500",
  icd: "text-amber-500",
  prescribe: "text-sky-500",
  refer: "text-teal-500",
  vitals: "text-emerald-500",
  verify: "text-amber-500",
  claim: "text-amber-500",
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
    sourceType: "medical_evidence",
  }))
}

function ClinicalSourceTag({ kind }: { kind: "T" | "E" | "H" }) {
  const styles =
    kind === "T"
      ? "bg-blue-500/10 text-[8px] font-bold text-blue-600 dark:text-blue-400"
      : kind === "E"
        ? "bg-purple-500/10 text-[8px] font-bold text-purple-600 dark:text-purple-400"
        : "bg-amber-500/10 text-[8px] font-bold text-amber-600 dark:text-amber-400"
  return (
    <sup
      className={`ml-0.5 inline-flex size-3.5 items-center justify-center rounded leading-none ${styles}`}
    >
      {kind}
    </sup>
  )
}

function ClinicalInlineWithCitations({
  text,
  evidenceCitations,
  stripTranscriptProvenance = false,
}: {
  text: string
  evidenceCitations: EvidenceCitation[]
  /** Evidence Review docs use numeric literature citations only; hide [T]/[E]/[H] dictation tags. */
  stripTranscriptProvenance?: boolean
}) {
  const hasEvidence = evidenceCitations.length > 0
  const normalizedText = stripTranscriptProvenance
    ? text.replace(/\[(?:T|E|H)\]/g, "")
    : text
  const pieces = normalizedText.split(/(\[T\]|\[E\]|\[H\])/g)

  return (
    <>
      {pieces.map((piece, i) => {
        if (piece === "[T]") return <ClinicalSourceTag key={i} kind="T" />
        if (piece === "[E]") return <ClinicalSourceTag key={i} kind="E" />
        if (piece === "[H]") return <ClinicalSourceTag key={i} kind="H" />
        if (!piece) return null
        if (hasEvidence) {
          return (
            <CitationMarkdown
              key={i}
              citations={EMPTY_CITATIONS_MAP}
              evidenceCitations={evidenceCitations}
              className="inline max-w-none text-[13px] leading-relaxed text-foreground/90 [&_p]:m-0 [&_p]:inline [&_ul]:inline [&_ul]:m-0 [&_li]:inline"
            >
              {piece}
            </CitationMarkdown>
          )
        }
        return (
          <span
            key={i}
            dangerouslySetInnerHTML={{ __html: formatClinicalHtml(piece) }}
          />
        )
      })}
    </>
  )
}

const DOC_LABELS: Record<ClinicalDocType, string> = {
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

const SHARE_TARGETS: { id: ShareTarget; label: string; icon: React.ComponentType<any>; description: string }[] = [
  { id: "front_desk", label: "Front Desk", icon: Hospital, description: "Send to reception" },
  { id: "patient_whatsapp", label: "Patient (WhatsApp)", icon: WhatsappLogo, description: "Via WhatsApp" },
  { id: "patient_email", label: "Patient (Email)", icon: EnvelopeSimple, description: "Via email" },
  { id: "specialist", label: "Referring Specialist", icon: UserCircle, description: "With referral letter" },
]

function SharePopover({ onShare, onClose }: { onShare: (target: ShareTarget) => void; onClose: () => void }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 4, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 4, scale: 0.95 }}
      transition={{ duration: 0.12 }}
      className="absolute top-full right-0 z-50 mt-1.5 w-56 rounded-xl border border-border/60 bg-background/95 p-1 shadow-xl backdrop-blur-xl"
    >
      <div className="px-2.5 py-1.5">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Send to</span>
      </div>
      {SHARE_TARGETS.map(({ id, label, icon: ShareIcon, description }) => (
        <button
          key={id}
          type="button"
          onClick={() => { onShare(id); onClose() }}
          className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-muted/60"
        >
          <ShareIcon className="size-4 text-muted-foreground" />
          <div>
            <div className="text-xs font-medium">{label}</div>
            <div className="text-[10px] text-muted-foreground">{description}</div>
          </div>
        </button>
      ))}
    </motion.div>
  )
}

function formatClinicalHtml(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/g, '<strong class="font-semibold text-foreground">$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/\[T\]/g, '<sup class="ml-0.5 inline-flex size-3.5 items-center justify-center rounded bg-blue-500/10 text-[8px] font-bold text-blue-600 dark:text-blue-400 leading-none">T</sup>')
    .replace(/\[E\]/g, '<sup class="ml-0.5 inline-flex size-3.5 items-center justify-center rounded bg-purple-500/10 text-[8px] font-bold text-purple-600 dark:text-purple-400 leading-none">E</sup>')
    .replace(/\[H\]/g, '<sup class="ml-0.5 inline-flex size-3.5 items-center justify-center rounded bg-amber-500/10 text-[8px] font-bold text-amber-600 dark:text-amber-400 leading-none">H</sup>')
    .replace(/\[(\d+)\]/g, '<sup class="text-indigo-500 font-semibold cursor-pointer">[$1]</sup>')
}

function MarkdownDocumentView({
  content,
  isStreaming,
  editMode,
  onContentChange,
  sources,
  documentType,
}: {
  content: string
  isStreaming: boolean
  editMode?: boolean
  onContentChange?: (content: string) => void
  sources?: ClinicalSource[]
  documentType?: ClinicalDocType
}) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const evidenceCitations = useMemo(
    () => clinicalSourcesToEvidenceCitations(sources),
    [sources]
  )
  const stripTranscriptProvenance = documentType === "evidence"

  const bodyForMd = useMemo(() => stripResponseWrapper(content), [content])

  const mdComponents = useMemo(
    () => ({
      text: ({ value }: { value?: string }) =>
        value === undefined || value === "" ? null : (
          <ClinicalInlineWithCitations
            text={value}
            evidenceCitations={evidenceCitations}
            stripTranscriptProvenance={stripTranscriptProvenance}
          />
        ),
    }),
    [evidenceCitations, stripTranscriptProvenance]
  )

  useEffect(() => {
    if (isStreaming && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [bodyForMd, isStreaming])

  useEffect(() => {
    if (editMode && textareaRef.current) {
      textareaRef.current.focus()
      const ta = textareaRef.current
      ta.style.height = "auto"
      ta.style.height = `${ta.scrollHeight}px`
    }
  }, [editMode])

  if (editMode) {
    return (
      <div className="flex flex-1 flex-col overflow-hidden">
        <textarea
          ref={textareaRef}
          value={content}
          onChange={(e) => onContentChange?.(e.target.value)}
          className="flex-1 resize-none bg-transparent px-5 py-4 font-mono text-[12px] leading-relaxed text-foreground outline-none"
          style={{ scrollbarWidth: "thin" }}
          spellCheck={false}
        />
      </div>
    )
  }

  return (
    <div ref={scrollRef} className="flex-1 overflow-y-auto" style={{ scrollbarWidth: "thin" }}>
      <div className="px-5 py-4">
        {bodyForMd.trim().length === 0 ? (
          <p className="text-[13px] text-muted-foreground">No content yet.</p>
        ) : (
          <div className="prose prose-sm dark:prose-invert max-w-none text-[13px] leading-relaxed prose-headings:font-semibold prose-p:my-1.5 prose-li:my-0.5 prose-ul:my-2 prose-ol:my-2 [&_p]:text-foreground/90">
            <ReactMarkdown
              remarkPlugins={[remarkGfm, remarkBreaks]}
              /* `text` overrides markdown text nodes; cast avoids clash with SVG `text` in Components typings */
              components={mdComponents as any}
            >
              {bodyForMd}
            </ReactMarkdown>
          </div>
        )}
      </div>

      {isStreaming && (
        <div className="flex items-center gap-2 px-5 py-3 text-[11px] text-muted-foreground">
          <SpinnerGap className="size-3 animate-spin" />
          Generating clinical document...
        </div>
      )}

      {documentType !== "evidence" && (
        <div className="shrink-0 border-t border-border/20 px-5 py-2">
          <div className="flex items-center gap-3 text-[9px] text-muted-foreground/50">
            <span className="flex items-center gap-0.5">
              <sup className="inline-flex size-3 items-center justify-center rounded bg-blue-500/10 text-[7px] font-bold text-blue-600 dark:text-blue-400">
                T
              </sup>
              Transcript
            </span>
            <span className="flex items-center gap-0.5">
              <sup className="inline-flex size-3 items-center justify-center rounded bg-purple-500/10 text-[7px] font-bold text-purple-600 dark:text-purple-400">
                E
              </sup>
              Extraction
            </span>
            <span className="flex items-center gap-0.5">
              <sup className="inline-flex size-3 items-center justify-center rounded bg-amber-500/10 text-[7px] font-bold text-amber-600 dark:text-amber-400">
                H
              </sup>
              History
            </span>
          </div>
        </div>
      )}
    </div>
  )
}

function BlockDocumentContent({ block }: { block: MedicalBlock }) {
  const content = useMemo(() => {
    const parts: { label: string; value: string }[] = []
    if (block.title) parts.push({ label: "Title", value: block.title })
    if (block.summary) parts.push({ label: "Summary", value: block.summary })
    const meta = block.metadata ?? {}
    for (const [key, val] of Object.entries(meta)) {
      if (typeof val === "string" && val.length > 0 && val.length < 2000) {
        parts.push({ label: key.replace(/_/g, " "), value: val })
      }
    }
    return parts
  }, [block])

  return (
    <div className="flex-1 overflow-y-auto p-5" style={{ scrollbarWidth: "thin" }}>
      <div className="space-y-5">
        {content.length > 0 ? (
          content.map((field, i) => (
            <div key={i}>
              <h4 className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                {field.label}
              </h4>
              <p className="text-sm leading-relaxed text-foreground">{field.value}</p>
            </div>
          ))
        ) : (
          <div className="pt-8 text-center">
            <FileText className="mx-auto size-10 text-muted-foreground/20" />
            <p className="mt-3 text-sm text-muted-foreground">No content available.</p>
          </div>
        )}
      </div>
    </div>
  )
}

export function DocumentSheet() {
  const {
    documentSheet,
    closeDocumentSheet,
    toggleDocumentEditMode,
    updateDocumentContent,
    activePatient,
    acceptSessionDocument,
    rejectSessionDocument,
    addSessionMedication,
  } = useWorkspace()
  const [shareOpen, setShareOpen] = useState(false)
  const [rejectOpen, setRejectOpen] = useState(false)
  const [rejectReason, setRejectReason] = useState("")

  const block = useMemo(() => {
    if (!documentSheet.isOpen || !documentSheet.blockId || !activePatient) return null
    return activePatient.blocks.find((b) => b.id === documentSheet.blockId) ?? null
  }, [documentSheet, activePatient])

  const contentDoc = documentSheet.contentDocument

  const sessionEntry = useMemo(() => {
    if (!contentDoc || !activePatient?.sessionDocuments) return null
    return activePatient.sessionDocuments.find((s) => s.id === contentDoc.id) ?? null
  }, [activePatient?.sessionDocuments, contentDoc])

  const handleShare = useCallback((target: ShareTarget) => {
    console.log(`Sharing to ${target}`)
  }, [])

  const handlePrint = useCallback(() => {
    const doc = documentSheet.contentDocument
    const blk = activePatient?.blocks.find((b) => b.id === documentSheet.blockId)
    const title = doc?.title ?? blk?.title ?? "Clinical Document"
    const docType = doc ? (DOC_LABELS[doc.type] ?? doc.title) : (blk?.type ?? "Document")
    const patientName = doc?.patientName ?? activePatient?.name ?? ""
    const dateStr = new Date().toLocaleDateString("en-ZA", { year: "numeric", month: "long", day: "numeric" })
    const timeStr = new Date().toLocaleTimeString("en-ZA", { hour: "2-digit", minute: "2-digit" })

    let bodyHtml = ""
    if (doc) {
      const clean = stripPrescriptionItemsBlock(
        doc.content
          .replace(/=== FLEMING FULL RESPONSE ===\n?/, "")
          .replace(/=== END ===\n?/, "")
          .replace(/=== EVIDENCE SOURCES[\s\S]*$/, "")
      )
      bodyHtml = clean.split("\n").map((line: string) => {
        const t = line.trim()
        if (!t) return ""
        if (t.startsWith("## ")) return `<h2 style="margin:18px 0 6px;font-size:14px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;color:#1e293b;border-bottom:1px solid #e2e8f0;padding-bottom:4px">${t.slice(3).replace(/\*\*/g,"")}</h2>`
        if (t.startsWith("### ")) return `<h3 style="margin:12px 0 4px;font-size:13px;font-weight:600;color:#334155">${t.slice(4).replace(/\*\*/g,"")}</h3>`
        const formatted = t
          .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
          .replace(/\*(.+?)\*/g, "<em>$1</em>")
          .replace(/\[T\]/g, '<sup style="color:#3b82f6;font-size:8px;font-weight:700">T</sup>')
          .replace(/\[E\]/g, '<sup style="color:#8b5cf6;font-size:8px;font-weight:700">E</sup>')
          .replace(/\[H\]/g, '<sup style="color:#f59e0b;font-size:8px;font-weight:700">H</sup>')
          .replace(/\[(\d+)\]/g, '<sup style="color:#6366f1;font-weight:600">[$1]</sup>')
        if (t.startsWith("- ") || t.startsWith("* ")) return `<div style="display:flex;gap:8px;padding:2px 0;margin-left:8px"><span style="margin-top:6px;width:4px;height:4px;border-radius:50%;background:#94a3b8;flex-shrink:0"></span><span>${formatted.slice(2)}</span></div>`
        return `<p style="margin:3px 0">${formatted}</p>`
      }).join("")
    }

    const printWindow = window.open("", "_blank")
    if (!printWindow) return
    printWindow.document.write(`<!DOCTYPE html><html><head><title>${title}</title><style>
      @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
      * { margin:0; padding:0; box-sizing:border-box }
      body { font-family:'Inter',system-ui,sans-serif; color:#1e293b; padding:48px 56px; font-size:12.5px; line-height:1.65; max-width:800px; margin:0 auto }
      @media print { body { padding:32px 40px } @page { margin:20mm 16mm } }
    </style></head><body>
      <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:32px;padding-bottom:16px;border-bottom:2px solid #1e293b">
        <div>
          <div style="font-size:11px;font-weight:600;letter-spacing:1.5px;text-transform:uppercase;color:#64748b;margin-bottom:4px">${docType}</div>
          <div style="font-size:20px;font-weight:700;color:#0f172a">${patientName || title}</div>
          <div style="font-size:11px;color:#94a3b8;margin-top:2px">${dateStr} &middot; ${timeStr}</div>
        </div>
        <div style="text-align:right">
          <div style="font-size:15px;font-weight:700;color:#0f172a;letter-spacing:-0.3px">Fleming</div>
          <div style="font-size:9px;font-weight:500;letter-spacing:0.5px;text-transform:uppercase;color:#6366f1">Clinical Intelligence</div>
        </div>
      </div>
      <div>${bodyHtml}</div>
      <div style="margin-top:40px;padding-top:12px;border-top:1px solid #e2e8f0;display:flex;justify-content:space-between;font-size:9px;color:#94a3b8">
        <span>Generated by Fleming &middot; ${dateStr}</span>
        <span style="display:flex;gap:12px">
          <span><span style="color:#3b82f6;font-weight:700">T</span> Transcript</span>
          <span><span style="color:#8b5cf6;font-weight:700">E</span> Extraction</span>
          <span><span style="color:#f59e0b;font-weight:700">H</span> History</span>
        </span>
      </div>
    </body></html>`)
    printWindow.document.close()
    setTimeout(() => { printWindow.print(); printWindow.close() }, 250)
  }, [documentSheet, activePatient])

  const handleAiChat = useCallback(() => {
    const title = contentDoc?.title ?? block?.title ?? "document"
    window.dispatchEvent(new CustomEvent("fleming:set-input", { detail: { value: `/evidence ${title}` } }))
    closeDocumentSheet()
  }, [contentDoc, block, closeDocumentSheet])

  const handleSheetAccept = useCallback(() => {
    if (!activePatient || !contentDoc) return
    acceptSessionDocument(activePatient.patientId, contentDoc.id, {
      document: contentDoc,
    })
  }, [acceptSessionDocument, activePatient, contentDoc])

  const handleSheetRejectSubmit = useCallback(() => {
    if (!activePatient || !contentDoc || !rejectReason.trim()) return
    rejectSessionDocument(activePatient.patientId, contentDoc.id, rejectReason.trim(), {
      document: contentDoc,
    })
    window.dispatchEvent(
      new CustomEvent("fleming:revise-document", {
        detail: {
          commandTag: contentDoc.type,
          reason: rejectReason.trim(),
          priorContent: contentDoc.content,
        },
      })
    )
    setRejectOpen(false)
    setRejectReason("")
  }, [activePatient, contentDoc, rejectReason, rejectSessionDocument])

  if (!documentSheet.isOpen) return null

  const hasBlock = !!block
  const hasContent = !!contentDoc

  if (!hasBlock && !hasContent) return null

  let SheetIcon: React.ComponentType<any> = FileText
  let sheetIconColor = "text-muted-foreground"
  let sheetTitle = "Document"

  if (hasContent) {
    SheetIcon = DOC_ICONS[contentDoc!.type] ?? FileText
    sheetIconColor = DOC_ICON_COLOR[contentDoc!.type] ?? "text-muted-foreground"
    sheetTitle = DOC_LABELS[contentDoc!.type] ?? contentDoc!.title
  } else if (hasBlock) {
    SheetIcon = BLOCK_ICONS[block!.type] ?? FileText
    sheetIconColor = BLOCK_ICON_COLOR[block!.type] ?? "text-muted-foreground"
    sheetTitle = block!.title ?? block!.type
  }

  return (
    <motion.div
      initial={{ width: 0, opacity: 0 }}
      animate={{ width: "40%", opacity: 1 }}
      exit={{ width: 0, opacity: 0 }}
      transition={{ type: "spring", stiffness: 300, damping: 30 }}
      className="relative flex h-full shrink-0 flex-col overflow-hidden border-l border-slate-200/60 dark:border-border/40 bg-background"
    >
      {/* Frosted toolbar */}
      <div className="flex h-12 shrink-0 items-center justify-between border-b border-slate-200/60 dark:border-border/40 bg-background/80 px-4 backdrop-blur-xl">
        <div className="flex items-center gap-2.5">
          <div className={cn("flex size-6 items-center justify-center rounded-md bg-muted/60", sheetIconColor)}>
            <SheetIcon className="size-3.5" weight="duotone" />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="max-w-[180px] truncate text-sm font-semibold">{sheetTitle}</h3>
            {hasContent && contentDoc!.isStreaming && (
              <SpinnerGap className="size-3 animate-spin text-muted-foreground" />
            )}
            {hasContent && sessionEntry && !contentDoc!.isStreaming && (
              <span className="rounded-full bg-muted/80 px-2 py-0.5 text-[10px] font-medium capitalize text-muted-foreground">
                {sessionEntry.status}
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-0.5">
          {hasContent &&
            activePatient &&
            !contentDoc!.isStreaming &&
            sessionEntry?.status === "draft" && (
              <>
                <button
                  type="button"
                  onClick={handleSheetAccept}
                  className="inline-flex size-7 items-center justify-center rounded-md text-emerald-600 transition-colors hover:bg-emerald-500/10 dark:text-emerald-400"
                  title="Accept document"
                >
                  <Check className="size-3.5" weight="bold" />
                </button>
                <button
                  type="button"
                  onClick={() => setRejectOpen((o) => !o)}
                  className="inline-flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-red-500/10 hover:text-red-600"
                  title="Reject and request revision"
                >
                  <X className="size-3.5" weight="bold" />
                </button>
                <div className="mx-0.5 h-4 w-px bg-border/50" />
              </>
            )}
          <button
            type="button"
            onClick={toggleDocumentEditMode}
            className={cn(
              "inline-flex size-7 items-center justify-center rounded-md transition-colors",
              documentSheet.editMode
                ? "bg-indigo-500/15 text-indigo-600 dark:text-indigo-400"
                : "text-muted-foreground hover:bg-muted hover:text-foreground"
            )}
            title={documentSheet.editMode ? "Done editing" : "Edit"}
          >
            {documentSheet.editMode ? <Check className="size-3.5" /> : <PencilSimple className="size-3.5" />}
          </button>

          <div className="relative">
            <button
              type="button"
              onClick={() => setShareOpen(!shareOpen)}
              className="inline-flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              title="Send"
            >
              <PaperPlaneTilt className="size-3.5" />
            </button>
            <AnimatePresence>
              {shareOpen && <SharePopover onShare={handleShare} onClose={() => setShareOpen(false)} />}
            </AnimatePresence>
          </div>

          <button
            type="button"
            onClick={handlePrint}
            className="inline-flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            title="Print"
          >
            <Printer className="size-3.5" />
          </button>

          <button
            type="button"
            onClick={handleAiChat}
            className="inline-flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            title="Ask AI"
          >
            <Sparkle className="size-3.5" />
          </button>

          <div className="mx-1 h-4 w-px bg-border/50" />

          <button
            type="button"
            onClick={closeDocumentSheet}
            className="inline-flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            title="Close (Esc)"
          >
            <X className="size-3.5" />
          </button>
        </div>
      </div>

      <AnimatePresence initial={false}>
        {rejectOpen && hasContent && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="shrink-0 overflow-hidden border-b border-border/30 bg-muted/25 px-4 py-3"
          >
            <p className="mb-1 text-[11px] font-medium text-muted-foreground">Revision feedback</p>
            <textarea
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="What should change?"
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
                onClick={handleSheetRejectSubmit}
                className="rounded-md bg-amber-600/90 px-2.5 py-1 text-[11px] font-medium text-white hover:bg-amber-600 disabled:opacity-40"
              >
                Reject &amp; revise
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Content area */}
      {hasContent ? (
        contentDoc!.type === "prescribe" ? (
          activePatient ? (
            <PrescriptionEditorPanel
              doc={contentDoc!}
              updateDocumentContent={updateDocumentContent}
              activePatient={{
                patientId: activePatient.patientId,
                name: activePatient.name,
              }}
              acceptSessionDocument={acceptSessionDocument}
              addSessionMedication={addSessionMedication}
            />
          ) : (
            <MarkdownDocumentView
              content={contentDoc!.content}
              isStreaming={contentDoc!.isStreaming}
              editMode={documentSheet.editMode}
              onContentChange={(newContent) => updateDocumentContent(newContent, false)}
              sources={contentDoc!.sources}
              documentType={contentDoc!.type}
            />
          )
        ) : (
        <MarkdownDocumentView
          content={contentDoc!.content}
          isStreaming={contentDoc!.isStreaming}
          editMode={documentSheet.editMode}
          onContentChange={(newContent) => updateDocumentContent(newContent, false)}
          sources={contentDoc!.sources}
          documentType={contentDoc!.type}
        />
        )
      ) : hasBlock ? (
        <BlockDocumentContent block={block!} />
      ) : null}

      {/* Evidence sources footer */}
      {hasContent && contentDoc!.sources && contentDoc!.sources.length > 0 && (
        <div className="shrink-0 border-t border-border/30 bg-muted/10 px-5 py-3">
          <h4 className="mb-2 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            <BookOpen className="size-3" />
            Evidence ({contentDoc!.sources.length})
          </h4>
          <div
            className="flex max-h-32 flex-wrap gap-1.5 overflow-y-auto py-0.5"
            style={{ scrollbarWidth: "thin" }}
          >
            {clinicalSourcesToEvidenceCitations(contentDoc!.sources).map((citation) => (
              <EvidenceCitationPill
                key={citation.index}
                citation={citation}
                size="sm"
                showEvidenceLevel
              />
            ))}
          </div>
        </div>
      )}
    </motion.div>
  )
}

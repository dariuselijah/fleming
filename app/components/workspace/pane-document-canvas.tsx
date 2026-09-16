"use client"

import {
  useWorkspace,
  useWorkspaceStore,
  syncActivePatientScribeSnapshot,
  type ClinicalDocType,
  type SessionDocument,
  type ClinicalDocument,
  type ShareTarget,
} from "@/lib/clinical-workspace"
import { stripPrescriptionItemsBlock } from "@/lib/clinical-workspace"
import type { ClaimDocumentItem, IcdCodeItem } from "@/lib/clinical-workspace/types"
import { highlightFromExtracted, type HighlightedSegment, type HighlightSpan } from "@/lib/scribe/entity-highlighter"
import { cn } from "@/lib/utils"
import {
  useState,
  useEffect,
  useRef,
  useMemo,
  useCallback,
} from "react"
import { AnimatePresence, motion } from "motion/react"
import { ClinicalRichDocumentEditor, type ClinicalRichDocumentEditorHandle } from "@/app/components/workspace/clinical-document-editor"
import { clinicalMarkdownComponents } from "@/app/components/workspace/clinical-document-markdown"
import { createPendingSessionDocument } from "@/lib/clinical-workspace/pending-session-document"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import remarkBreaks from "remark-breaks"
import {
  Plus,
  FileText,
  Clipboard,
  BookOpen,
  Pill,
  Check,
  X,
  Printer,
  PencilSimple,
  SpinnerGap,
  ChatText,
  Hospital,
  Globe,
  EnvelopeSimple,
  UserCircle,
  ShieldCheck,
  Receipt,
  Hash,
  Heartbeat,
  Warning,
  DotsThree,
  CaretDown,
  ArrowRight,
  Stethoscope,
  Microphone,
  Quotes,
  Sparkle,
} from "@phosphor-icons/react"
import { DocumentCanvasProvider } from "./document-canvas-context"
import { PrescriptionEditorPanel, newPrescriptionItem } from "./prescription-sidebar"
import { SendToFrontDeskButton } from "./send-to-front-desk-button"
import { BillingClaimPanel } from "./billing-claim-panel"
import { CitationMarkdown } from "@/app/components/chat/citation-markdown"
import { EvidenceCitationPill } from "@/app/components/chat/evidence-citation-pill"
import type { EvidenceCitation } from "@/lib/evidence"
import type { ClinicalSource } from "@/lib/clinical-workspace/types"
import { toast } from "sonner"
import { fetchClient } from "@/lib/fetch"
import { encryptJson } from "@/lib/crypto/practice-e2ee"
import { usePracticeCrypto } from "@/lib/clinical-workspace/practice-crypto-context"

import type { Icon as PhosphorIcon } from "@phosphor-icons/react"

// ─── Icon / label maps ────────────────────────────────────────────────────────

const DOC_ICON: Record<ClinicalDocType, PhosphorIcon> = {
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

const DOC_COLOR: Record<ClinicalDocType, string> = {
  soap: "text-violet-500",
  summary: "text-blue-500",
  evidence: "text-amber-500",
  interactions: "text-red-500",
  drug: "text-sky-400",
  icd: "text-amber-500",
  prescribe: "text-sky-500",
  refer: "text-emerald-500",
  vitals: "text-rose-500",
  verify: "text-teal-500",
  claim: "text-indigo-500",
}

const DOC_LABEL: Record<ClinicalDocType, string> = {
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

type SectionId = "transcript" | "soap" | "prescribe" | "summary" | "billing" | "evidence"

const SECTION_CHIPS: Array<{ id: SectionId; label: string; docType?: ClinicalDocType }> = [
  { id: "transcript", label: "Transcript" },
  { id: "soap", label: "SOAP", docType: "soap" },
  { id: "prescribe", label: "Rx", docType: "prescribe" },
  { id: "summary", label: "Summary", docType: "summary" },
  { id: "billing", label: "Billing", docType: "claim" },
  { id: "evidence", label: "Evidence", docType: "evidence" },
]

// ─── Contextual loading messages ─────────────────────────────────────────────

const LOADING_STEPS: Record<ClinicalDocType, string[]> = {
  soap: ["Reading transcript…", "Structuring SOAP sections…", "Finalising note…"],
  summary: ["Reviewing consult…", "Extracting key findings…", "Writing summary…"],
  prescribe: [
    "Checking medications mentioned…",
    "Searching drug interactions…",
    "Calculating dosing…",
    "Drafting prescription…",
  ],
  icd: [
    "Identifying diagnoses…",
    "Matching ICD-10 codes…",
    "Calculating confidence…",
    "Checking transcript sources…",
  ],
  refer: ["Summarising clinical history…", "Drafting referral letter…", "Adding specialist questions…"],
  claim: ["Reading billing codes…", "Building claim lines…", "Calculating totals…"],
  evidence: [
    "Searching literature…",
    "Synthesising evidence…",
    "Formatting citations…",
  ],
  interactions: ["Reviewing medications…", "Checking interaction database…"],
  drug: ["Looking up drug information…", "Checking clinical guidelines…"],
  vitals: ["Reviewing vitals…", "Assessing trends…"],
  verify: ["Checking eligibility…", "Verifying member status…"],
}

// ─── Generate items + quick chips ─────────────────────────────────────────────

const GENERATE_ITEMS: { type: ClinicalDocType; label: string; description: string }[] = [
  { type: "soap", label: "SOAP Note", description: "Structured clinical note" },
  { type: "summary", label: "Clinical Summary", description: "Consult overview" },
  { type: "refer", label: "Referral Letter", description: "Specialist referral" },
  { type: "prescribe", label: "Prescription", description: "Drug orders" },
  { type: "icd", label: "ICD-10 Codes", description: "Billing codes" },
  { type: "claim", label: "Billing Claim", description: "Medical claim lines" },
  { type: "evidence", label: "Evidence Review", description: "Literature search" },
]

// ─── Share targets ────────────────────────────────────────────────────────────

const SHARE_TARGETS: {
  id: ShareTarget
  label: string
  icon: PhosphorIcon
  description: string
}[] = [
  { id: "front_desk", label: "Front Desk", icon: Hospital, description: "Add to work queue" },
  { id: "patient_rcs", label: "Patient (SMS)", icon: ChatText, description: "Via messaging" },
  { id: "patient_portal", label: "Patient Portal", icon: Globe, description: "Secure link" },
  { id: "patient_email", label: "Email", icon: EnvelopeSimple, description: "Via email" },
  { id: "specialist", label: "Specialist", icon: UserCircle, description: "With referral" },
]

const FRONT_DESK_DOC_TYPES = new Set<ClinicalDocType>([
  "soap",
  "icd",
  "prescribe",
  "claim",
  "vitals",
  "verify",
])

const PATIENT_DOC_TYPES = new Set<ClinicalDocType>([
  "summary",
  "refer",
  "evidence",
  "interactions",
  "drug",
])

// ─── Utility ──────────────────────────────────────────────────────────────────

function fireGenerate(type: ClinicalDocType, subTemplate?: string) {
  window.dispatchEvent(
    new CustomEvent("fleming:generate-note", { detail: { template: type, subTemplate } })
  )
}

const SOAP_TEMPLATES = [
  { subTemplate: undefined as string | undefined, label: "Standard" },
  { subTemplate: "paediatric", label: "Paediatric" },
  { subTemplate: "emergency", label: "Emergency" },
  { subTemplate: "mental_health", label: "Mental health" },
] as const

function ClinicalDocMarkdownView({ content }: { content: string }) {
  return (
    <div className="max-w-none text-[13px] leading-relaxed">
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkBreaks]}
        components={clinicalMarkdownComponents}
      >
        {content}
      </ReactMarkdown>
    </div>
  )
}

function SoapTemplateSelect({
  selected,
  onSelect,
  disabled,
}: {
  selected: string
  onSelect: (subTemplate?: string) => void
  disabled?: boolean
}) {
  const label =
    SOAP_TEMPLATES.find((t) => (t.subTemplate ?? "standard") === selected)?.label ?? "Standard"

  return (
    <div className="flex shrink-0 items-center gap-3 border-b border-border/20 bg-muted/15 px-4 py-2">
      <span className="text-[11px] font-medium text-muted-foreground">SOAP template</span>
      <Select
        value={selected}
        disabled={disabled}
        onValueChange={(value) => {
          const match = SOAP_TEMPLATES.find((t) => (t.subTemplate ?? "standard") === value)
          onSelect(match?.subTemplate)
        }}
      >
        <SelectTrigger size="sm" className="h-8 min-w-[168px] text-[12px]">
          <SelectValue>{label}</SelectValue>
        </SelectTrigger>
        <SelectContent>
          {SOAP_TEMPLATES.map((t) => {
            const key = t.subTemplate ?? "standard"
            return (
              <SelectItem key={key} value={key} className="text-[12px]">
                {t.label}
              </SelectItem>
            )
          })}
        </SelectContent>
      </Select>
      <span className="hidden text-[10px] text-muted-foreground/70 sm:inline">
        Regenerates note with selected format
      </span>
    </div>
  )
}

// ─── Document Skeleton (minimal, Apple/Anthropic-style) ───────────────────────

function ShimmerBar({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "h-2 rounded-full bg-gradient-to-r from-muted/30 via-muted/60 to-muted/30 bg-[length:200%_100%] animate-[shimmer_1.8s_ease-in-out_infinite]",
        className
      )}
    />
  )
}

function DocumentGeneratingView({
  docType,
  label,
}: {
  docType: ClinicalDocType
  label?: string
}) {
  const steps = LOADING_STEPS[docType] ?? ["Drafting…"]
  const [stepIdx, setStepIdx] = useState(0)

  useEffect(() => {
    setStepIdx(0)
    if (steps.length <= 1) return
    const timer = setInterval(() => setStepIdx((i) => (i + 1) % steps.length), 2200)
    return () => clearInterval(timer)
  }, [docType, steps.length])

  const title = label ?? DOC_LABEL[docType] ?? "Document"

  return (
    <div className="relative flex h-full min-h-[280px] flex-col items-center justify-center overflow-hidden px-8 py-12">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-foreground/10 to-transparent" />
      <div className="absolute inset-x-8 top-0 h-[2px] overflow-hidden rounded-full bg-muted/30">
        <motion.div
          className="h-full w-1/3 rounded-full bg-foreground/25"
          animate={{ x: ["-100%", "320%"] }}
          transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut" }}
        />
      </div>

      <div className="flex max-w-sm flex-col items-center text-center">
        <motion.div
          className="mb-5 flex size-9 items-center justify-center rounded-full border border-border/40 bg-background/80 shadow-sm backdrop-blur-sm"
          animate={{ scale: [1, 1.04, 1], opacity: [0.85, 1, 0.85] }}
          transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }}
        >
          <Sparkle className="size-4 text-foreground/55" weight="duotone" />
        </motion.div>

        <p className="text-[13px] font-medium tracking-tight text-foreground/85">{title}</p>
        <AnimatePresence mode="wait" initial={false}>
          <motion.p
            key={steps[stepIdx]}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
            className="mt-1.5 text-[12px] text-muted-foreground/70"
          >
            {steps[stepIdx]}
          </motion.p>
        </AnimatePresence>

        <div className="mt-8 w-full max-w-[240px] space-y-2.5">
          <ShimmerBar className="w-full" />
          <ShimmerBar className="w-[88%] mx-auto" />
          <ShimmerBar className="w-[72%] mx-auto" />
        </div>
      </div>
    </div>
  )
}

function DocumentSkeleton({ docType }: { docType: ClinicalDocType }) {
  return <DocumentGeneratingView docType={docType} />
}

// ─── ICD-10 Editor ────────────────────────────────────────────────────────────

function ConfidenceBadge({ confidence }: { confidence?: string }) {
  const c = confidence?.toLowerCase()
  if (c === "high") return (
    <span className="rounded-full bg-emerald-500/10 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-400">
      High
    </span>
  )
  if (c === "medium") return (
    <span className="rounded-full bg-amber-500/10 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-400">
      Medium
    </span>
  )
  return (
    <span className="rounded-full bg-muted px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">
      Low
    </span>
  )
}

function SourceTag({ tag }: { tag?: "T" | "E" | "H" }) {
  if (tag === "T") return (
    <sup className="inline-flex size-3.5 items-center justify-center rounded bg-blue-500/10 text-[7px] font-bold text-blue-600 dark:text-blue-400 leading-none">
      T
    </sup>
  )
  if (tag === "E") return (
    <sup className="inline-flex size-3.5 items-center justify-center rounded bg-purple-500/10 text-[7px] font-bold text-purple-600 dark:text-purple-400 leading-none">
      E
    </sup>
  )
  if (tag === "H") return (
    <sup className="inline-flex size-3.5 items-center justify-center rounded bg-amber-500/10 text-[7px] font-bold text-amber-600 dark:text-amber-400 leading-none">
      H
    </sup>
  )
  return null
}

function IcdCodeEditor({
  doc,
  updateDocumentContent,
  onSendToFrontDesk,
}: {
  doc: ClinicalDocument
  updateDocumentContent: (content: string, isStreaming: boolean, patch?: { icdItems?: IcdCodeItem[] }) => void
  onSendToFrontDesk?: () => void
}) {
  const [items, setItems] = useState<IcdCodeItem[]>(() => doc.icdItems ?? [])
  const [accepted, setAccepted] = useState<Record<string, boolean>>({})
  const [rejected, setRejected] = useState<Record<string, boolean>>({})
  const [excerptOpen, setExcerptOpen] = useState<Record<string, boolean>>({})

  // Sync from streamed doc
  useEffect(() => {
    if (doc.icdItems?.length) setItems(doc.icdItems.map((r) => ({ ...r })))
  }, [doc.id, doc.isStreaming, doc.icdItems])

  const setField = (id: string, patch: Partial<IcdCodeItem>) => {
    const next = items.map((r) => (r.id === id ? { ...r, ...patch } : r))
    setItems(next)
    updateDocumentContent(doc.content, doc.isStreaming, { icdItems: next })
  }

  const acceptedCount = items.filter((r) => accepted[r.id] && !rejected[r.id]).length
  const totalActive = items.filter((r) => !rejected[r.id]).length

  if (doc.isStreaming && items.length === 0) {
    return <DocumentSkeleton docType="icd" />
  }

  if (items.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2 p-8 text-center">
        <Hash className="size-8 text-amber-400/30" />
        <p className="text-[12px] text-muted-foreground/60">No ICD-10 codes extracted yet.</p>
      </div>
    )
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div
        className="min-h-0 flex-1 overflow-y-auto px-4 py-4 space-y-2.5"
        style={{ scrollbarWidth: "thin" }}
      >
        {items.map((row) => {
          const isAccepted = !!accepted[row.id]
          const isRejected = !!rejected[row.id]
          if (isRejected) return null

          return (
            <motion.div
              key={row.id}
              layout
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              className={cn(
                "group rounded-xl border bg-muted/20 p-3 transition-colors",
                isAccepted
                  ? "border-emerald-500/30 bg-emerald-500/[0.04]"
                  : "border-border/50 hover:border-border/80"
              )}
            >
              <div className="flex items-start gap-3">
                {/* Code + description */}
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2 mb-1">
                    <input
                      value={row.code}
                      onChange={(e) => setField(row.id, { code: e.target.value })}
                      className="w-24 shrink-0 rounded-md border border-border/40 bg-background px-2 py-0.5 font-mono text-[12px] font-semibold text-foreground outline-none focus:border-primary/40 focus:ring-1 focus:ring-primary/20"
                    />
                    <ConfidenceBadge confidence={row.confidence} />
                    <SourceTag tag={row.sourceTag} />
                  </div>
                  <input
                    value={row.description}
                    onChange={(e) => setField(row.id, { description: e.target.value })}
                    className="w-full rounded-md border border-transparent bg-transparent px-1 py-0.5 text-[12px] text-foreground/90 outline-none hover:border-border/40 focus:border-primary/40 focus:ring-1 focus:ring-primary/20"
                  />
                </div>
                {/* Actions */}
                <div className="flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                  <button
                    type="button"
                    onClick={() => setAccepted((s) => ({ ...s, [row.id]: !s[row.id] }))}
                    className={cn(
                      "rounded-md p-1.5 transition-colors",
                      isAccepted
                        ? "bg-emerald-500/15 text-emerald-600"
                        : "text-muted-foreground hover:bg-muted"
                    )}
                    title="Accept"
                  >
                    <Check className="size-3.5" weight="bold" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setRejected((s) => ({ ...s, [row.id]: true }))}
                    className="rounded-md p-1.5 text-muted-foreground hover:bg-red-500/10 hover:text-red-500"
                    title="Remove"
                  >
                    <X className="size-3.5" weight="bold" />
                  </button>
                </div>
              </div>

              {/* Source excerpt expandable */}
              {row.sourceExcerpt && (
                <div className="mt-2 pl-0">
                  <button
                    type="button"
                    onClick={() => setExcerptOpen((o) => ({ ...o, [row.id]: !o[row.id] }))}
                    className="flex items-center gap-1 text-[10px] font-medium text-muted-foreground/70 hover:text-foreground transition-colors"
                  >
                    <Quotes className="size-3 shrink-0" />
                    Source excerpt
                    <CaretDown
                      className={cn(
                        "size-2.5 transition-transform",
                        excerptOpen[row.id] && "rotate-180"
                      )}
                    />
                  </button>
                  <AnimatePresence>
                    {excerptOpen[row.id] && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.15 }}
                        className="overflow-hidden"
                      >
                        <p className="mt-1.5 rounded-lg border-l-2 border-blue-400/40 bg-blue-500/5 px-3 py-2 text-[11px] leading-relaxed text-muted-foreground italic">
                          &ldquo;{row.sourceExcerpt}&rdquo;
                        </p>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              )}
            </motion.div>
          )
        })}
      </div>

      <div className="shrink-0 border-t border-border/30 bg-background/90 px-4 py-3 backdrop-blur">
        <div className="mb-2 flex items-center justify-between text-[11px] text-muted-foreground">
          <span>{acceptedCount}/{totalActive} accepted</span>
          {onSendToFrontDesk && (
            <SendToFrontDeskButton
              size="sm"
              variant="outline"
              label="Send to Front Desk"
              onSend={onSendToFrontDesk}
            />
          )}
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => {
              const next: Record<string, boolean> = {}
              items.filter((r) => !rejected[r.id]).forEach((r) => (next[r.id] = true))
              setAccepted(next)
              toast.success("All ICD-10 codes accepted")
            }}
            className="flex-1 rounded-lg bg-emerald-600 px-3 py-1.5 text-[11px] font-semibold text-white transition-colors hover:bg-emerald-700"
          >
            Accept all
          </button>
          <button
            type="button"
            onClick={() => {
              const next: Record<string, boolean> = {}
              items.forEach((r) => (next[r.id] = true))
              setRejected(next)
            }}
            className="rounded-lg border border-border/50 px-3 py-1.5 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-muted"
          >
            Clear all
          </button>
        </div>
      </div>
    </div>
  )
}

function ClaimLineEditor({
  doc,
  updateDocumentContent,
}: {
  doc: ClinicalDocument
  updateDocumentContent: (
    content: string,
    isStreaming: boolean,
    patch?: { claimItems?: ClaimDocumentItem[] }
  ) => void
}) {
  const [items, setItems] = useState<ClaimDocumentItem[]>(() => doc.claimItems ?? [])

  useEffect(() => {
    if (doc.claimItems?.length) {
      setItems(doc.claimItems.map((row) => ({ ...row })))
    } else if (!doc.isStreaming) {
      setItems([])
    }
  }, [doc.id, doc.isStreaming, doc.claimItems])

  const persist = useCallback((next: ClaimDocumentItem[]) => {
    setItems(next)
    updateDocumentContent(doc.content, doc.isStreaming, { claimItems: next })
  }, [doc.content, doc.isStreaming, updateDocumentContent])

  const setField = (id: string, patch: Partial<ClaimDocumentItem>) => {
    persist(items.map((line) => (line.id === id ? { ...line, ...patch } : line)))
  }

  if (doc.isStreaming && items.length === 0) {
    return <DocumentSkeleton docType="claim" />
  }

  if (!items.length) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2 p-8 text-center">
        <Receipt className="size-8 text-indigo-400/30" />
        <p className="text-[12px] text-muted-foreground/60">No structured claim lines extracted yet.</p>
      </div>
    )
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="grid grid-cols-[minmax(220px,2fr)_92px_88px_70px_96px_36px] gap-2 border-b border-border/30 px-4 py-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/80">
        <span>Description</span>
        <span>ICD</span>
        <span>Tariff</span>
        <span>Qty</span>
        <span>Amount</span>
        <span />
      </div>
      <div className="min-h-0 flex-1 space-y-1 overflow-y-auto px-3 py-2" style={{ scrollbarWidth: "thin" }}>
        {items.map((row) => (
          <div
            key={row.id}
            className="grid grid-cols-[minmax(220px,2fr)_92px_88px_70px_96px_36px] items-center gap-2 rounded-lg border border-border/40 bg-muted/[0.18] px-2 py-1.5"
          >
            <input
              value={row.description}
              onChange={(e) => setField(row.id, { description: e.target.value })}
              className="h-7 rounded-md border border-transparent bg-transparent px-2 text-[12px] outline-none transition-colors hover:border-border/50 focus:border-primary/40 focus:ring-1 focus:ring-primary/20"
              placeholder="Claim line description"
            />
            <input
              value={row.icdCode ?? ""}
              onChange={(e) => setField(row.id, { icdCode: e.target.value })}
              className="h-7 rounded-md border border-border/40 bg-background px-2 font-mono text-[11px] outline-none focus:border-primary/40 focus:ring-1 focus:ring-primary/20"
              placeholder="I10"
            />
            <input
              value={row.tariffCode ?? ""}
              onChange={(e) => setField(row.id, { tariffCode: e.target.value })}
              className="h-7 rounded-md border border-border/40 bg-background px-2 font-mono text-[11px] outline-none focus:border-primary/40 focus:ring-1 focus:ring-primary/20"
              placeholder="0130"
            />
            <input
              value={row.quantity ?? ""}
              onChange={(e) => setField(row.id, { quantity: e.target.value ? Number(e.target.value) : undefined })}
              className="h-7 rounded-md border border-border/40 bg-background px-2 text-[11px] outline-none focus:border-primary/40 focus:ring-1 focus:ring-primary/20"
              placeholder="1"
            />
            <input
              value={row.amount ?? ""}
              onChange={(e) => setField(row.id, { amount: e.target.value ? Number(e.target.value) : undefined })}
              className="h-7 rounded-md border border-border/40 bg-background px-2 text-[11px] outline-none focus:border-primary/40 focus:ring-1 focus:ring-primary/20"
              placeholder="450"
            />
            <button
              type="button"
              onClick={() => persist(items.filter((line) => line.id !== row.id))}
              className="inline-flex size-7 items-center justify-center rounded text-muted-foreground/70 transition-colors hover:bg-red-500/10 hover:text-red-500"
              title="Remove line"
            >
              <X className="size-3.5" />
            </button>
          </div>
        ))}
      </div>
    </div>
  )
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
    year: s.year?.trim() ? parseInt(s.year.slice(0, 4), 10) : null,
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

// ─── Generate picker ──────────────────────────────────────────────────────────

function GeneratePicker({ onClose }: { onClose: () => void }) {
  const handleGenerate = useCallback(
    (type: ClinicalDocType) => {
      fireGenerate(type)
      onClose()
    },
    [onClose]
  )

  return (
    <motion.div
      initial={{ opacity: 0, y: -6, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -6, scale: 0.97 }}
      transition={{ duration: 0.14 }}
      className="absolute right-0 top-full z-50 mt-1.5 w-60 rounded-xl border border-border/60 bg-background/95 p-1 shadow-xl backdrop-blur-xl"
    >
      <div className="px-2.5 py-1.5">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          Generate document
        </span>
      </div>
      {GENERATE_ITEMS.map(({ type, label, description }) => {
        const Icon = DOC_ICON[type]
        const color = DOC_COLOR[type]
        return (
          <button
            key={type}
            type="button"
            onClick={() => handleGenerate(type)}
            className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-muted/60"
          >
            <Icon className={cn("size-4", color)} />
            <div>
              <div className="text-[12px] font-medium text-foreground">{label}</div>
              <div className="text-[10px] text-muted-foreground">{description}</div>
            </div>
          </button>
        )
      })}
    </motion.div>
  )
}

// ─── InlineDocViewer ──────────────────────────────────────────────────────────

function InlineDocViewer({
  doc,
  status,
  onAccept,
  onReject,
  onSendToFrontDesk,
}: {
  doc: ClinicalDocument
  status: "draft" | "accepted" | "rejected"
  onAccept: () => void
  onReject: (reason: string) => void
  onSendToFrontDesk?: (doc: ClinicalDocument) => void
}) {
  const {
    activePatient,
    updateDocumentContent,
    acceptSessionDocument,
    addSessionMedication,
  } = useWorkspace()

  const isStreaming = doc.isStreaming
  const [editMode, setEditMode] = useState(false)
  const [editContent, setEditContent] = useState(doc.content)
  const [rejectOpen, setRejectOpen] = useState(false)
  const [rejectReason, setRejectReason] = useState("")
  const [shareOpen, setShareOpen] = useState(false)
  const [soapTemplate, setSoapTemplate] = useState("standard")
  const editorRef = useRef<ClinicalRichDocumentEditorHandle>(null)
  const shareRef = useRef<HTMLDivElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  const bodyForMd = useMemo(() => {
    if (doc.type === "prescribe") return stripPrescriptionItemsBlock(doc.content)
    return doc.content
  }, [doc.content, doc.type])

  useEffect(() => {
    if (!editMode) setEditContent(doc.content)
  }, [doc.content, editMode])

  useEffect(() => {
    if (!shareOpen) return
    const handle = (e: MouseEvent) => {
      if (!shareRef.current?.contains(e.target as Node)) setShareOpen(false)
    }
    document.addEventListener("mousedown", handle)
    return () => document.removeEventListener("mousedown", handle)
  }, [shareOpen])

  const handlePrint = useCallback(() => {
    const patientName = doc.patientName ?? activePatient?.name ?? ""
    const docTypeLabel = DOC_LABEL[doc.type] ?? doc.title
    const dateStr = new Date().toLocaleDateString("en-ZA", { year: "numeric", month: "long", day: "numeric" })
    const timeStr = new Date().toLocaleTimeString("en-ZA", { hour: "2-digit", minute: "2-digit" })
    const clean = stripPrescriptionItemsBlock(
      doc.content
        .replace(/=== FLEMING FULL RESPONSE ===\n?/, "")
        .replace(/=== END ===\n?/, "")
        .replace(/=== EVIDENCE SOURCES[\s\S]*$/, "")
    )
    const bodyHtml = clean.split("\n").map((line: string) => {
      const t = line.trim()
      if (!t) return ""
      if (t.startsWith("## "))
        return `<h2 style="margin:18px 0 6px;font-size:14px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;color:#1e293b;border-bottom:1px solid #e2e8f0;padding-bottom:4px">${t.slice(3).replace(/\*\*/g, "")}</h2>`
      if (t.startsWith("### "))
        return `<h3 style="margin:12px 0 4px;font-size:13px;font-weight:600;color:#334155">${t.slice(4).replace(/\*\*/g, "")}</h3>`
      const formatted = t
        .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
        .replace(/\*(.+?)\*/g, "<em>$1</em>")
        .replace(/\[T\]/g, '<sup style="color:#3b82f6;font-size:8px;font-weight:700">T</sup>')
        .replace(/\[E\]/g, '<sup style="color:#8b5cf6;font-size:8px;font-weight:700">E</sup>')
        .replace(/\[H\]/g, '<sup style="color:#f59e0b;font-size:8px;font-weight:700">H</sup>')
        .replace(/\[(\d+)\]/g, '<sup style="color:#6366f1;font-weight:600">[$1]</sup>')
      if (t.startsWith("- ") || t.startsWith("* "))
        return `<div style="display:flex;gap:8px;padding:2px 0;margin-left:8px"><span style="margin-top:6px;width:4px;height:4px;border-radius:50%;background:#94a3b8;flex-shrink:0"></span><span>${formatted.slice(2)}</span></div>`
      return `<p style="margin:3px 0">${formatted}</p>`
    }).join("")
    const w = window.open("", "_blank")
    if (!w) return
    w.document.write(`<!DOCTYPE html><html><head><title>${doc.title}</title><style>
      * { margin:0; padding:0; box-sizing:border-box }
      body { font-family:system-ui,sans-serif; color:#1e293b; padding:48px 56px; font-size:12.5px; line-height:1.65; max-width:800px; margin:0 auto }
      @media print { body { padding:32px 40px } @page { margin:20mm 16mm } }
    </style></head><body>
      <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:32px;padding-bottom:16px;border-bottom:2px solid #1e293b">
        <div>
          <div style="font-size:11px;font-weight:600;letter-spacing:1.5px;text-transform:uppercase;color:#64748b;margin-bottom:4px">${docTypeLabel}</div>
          <div style="font-size:20px;font-weight:700;color:#0f172a">${patientName || doc.title}</div>
          <div style="font-size:11px;color:#94a3b8;margin-top:2px">${dateStr} · ${timeStr}</div>
        </div>
        <div style="text-align:right">
          <div style="font-size:15px;font-weight:700;color:#0f172a">Fleming</div>
          <div style="font-size:9px;font-weight:500;letter-spacing:0.5px;text-transform:uppercase;color:#6366f1">Clinical Intelligence</div>
        </div>
      </div>
      <div>${bodyHtml}</div>
    </body></html>`)
    w.document.close()
    setTimeout(() => { w.print(); w.close() }, 250)
  }, [doc, activePatient])

  const handleSaveEdit = useCallback(() => {
    const content = editorRef.current?.getMarkdown() ?? editContent
    updateDocumentContent(content, false, { docId: doc.id })
    setEditContent(content)
    setEditMode(false)
  }, [doc.id, editContent, updateDocumentContent])

  const handleShareTarget = useCallback(
    async (targetId: ShareTarget) => {
      if (targetId === "front_desk") {
        onSendToFrontDesk?.(doc)
        return
      }
      const patientId = activePatient?.patientId
      if (!patientId) {
        toast.error("No active patient")
        return
      }
      if (targetId === "patient_email" || targetId === "patient_rcs") {
        const channel = targetId === "patient_email" ? "email" : "sms"
        const label = targetId === "patient_email" ? "Email" : "SMS"
        try {
          const res = await fetchClient("/api/clinical/share-document", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              patientId,
              channel,
              title: doc.title,
              content: bodyForMd,
              docType: doc.type,
            }),
          })
          const data = (await res.json()) as { ok?: boolean; error?: string }
          if (data.ok) toast.success(`Sent via ${label}`)
          else toast.error(data.error ?? `Could not send via ${label}`)
        } catch {
          toast.error(`Could not send via ${label}`)
        }
        return
      }
      toast.info("Not available yet")
    },
    [activePatient?.patientId, bodyForMd, doc.title, doc.type, onSendToFrontDesk]
  )

  // Prescriptions rendered by dedicated editor
  if (doc.type === "prescribe") {
    return (
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <DocToolbar
          status={status}
          isStreaming={isStreaming}
          shareRef={shareRef}
          shareOpen={shareOpen}
          setShareOpen={setShareOpen}
          rejectOpen={rejectOpen}
          setRejectOpen={setRejectOpen}
          editMode={false}
          setEditMode={() => {}}
          onAccept={onAccept}
          onPrint={handlePrint}
          onSendToFrontDesk={onSendToFrontDesk ? () => onSendToFrontDesk(doc) : undefined}
          onShareTarget={handleShareTarget}
        />
        {isStreaming && !doc.prescriptionItems?.length ? (
          <DocumentSkeleton docType="prescribe" />
        ) : (
          <PrescriptionEditorPanel
            doc={doc}
            updateDocumentContent={updateDocumentContent}
            activePatient={activePatient}
            acceptSessionDocument={acceptSessionDocument}
            addSessionMedication={addSessionMedication}
          />
        )}
      </div>
    )
  }

  // ICD-10 rendered by dedicated editor
  if (doc.type === "icd") {
    return (
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <DocToolbar
          status={status}
          isStreaming={isStreaming}
          shareRef={shareRef}
          shareOpen={shareOpen}
          setShareOpen={setShareOpen}
          rejectOpen={rejectOpen}
          setRejectOpen={setRejectOpen}
          editMode={false}
          setEditMode={() => {}}
          onAccept={onAccept}
          onPrint={handlePrint}
          onSendToFrontDesk={onSendToFrontDesk ? () => onSendToFrontDesk(doc) : undefined}
          onShareTarget={handleShareTarget}
        />
        <IcdCodeEditor
          doc={doc}
          updateDocumentContent={updateDocumentContent}
          onSendToFrontDesk={onSendToFrontDesk ? () => onSendToFrontDesk(doc) : undefined}
        />
      </div>
    )
  }

  // Claims rendered by unified billing panel (ICD rail + Medprax lines).
  if (doc.type === "claim") {
    return (
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <DocToolbar
          status={status}
          isStreaming={isStreaming}
          shareRef={shareRef}
          shareOpen={shareOpen}
          setShareOpen={setShareOpen}
          rejectOpen={rejectOpen}
          setRejectOpen={setRejectOpen}
          editMode={false}
          setEditMode={() => {}}
          onAccept={onAccept}
          onPrint={handlePrint}
          onSendToFrontDesk={onSendToFrontDesk ? () => onSendToFrontDesk(doc) : undefined}
          onShareTarget={handleShareTarget}
        />
        <BillingClaimPanel
          doc={doc}
          updateDocumentContent={updateDocumentContent}
          onSendToFrontDesk={onSendToFrontDesk ? () => onSendToFrontDesk(doc) : undefined}
        />
      </div>
    )
  }

  // Evidence review with citation pills.
  if (doc.type === "evidence") {
    const evidenceCitations = clinicalSourcesToEvidenceCitations(doc.sources)
    return (
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <DocToolbar
          status={status}
          isStreaming={isStreaming}
          shareRef={shareRef}
          shareOpen={shareOpen}
          setShareOpen={setShareOpen}
          rejectOpen={rejectOpen}
          setRejectOpen={setRejectOpen}
          editMode={false}
          setEditMode={() => {}}
          onAccept={onAccept}
          onPrint={handlePrint}
          onSendToFrontDesk={undefined}
        />
        <div ref={scrollRef} className="flex-1 overflow-y-auto px-6 py-5" style={{ scrollbarWidth: "thin" }}>
          {isStreaming && bodyForMd.trim().length < 40 ? (
            <DocumentSkeleton docType="evidence" />
          ) : (
            <>
              <div className="prose prose-sm dark:prose-invert max-w-none text-[13px] leading-relaxed">
                {bodyForMd.split("\n").map((line, i) => {
                  const trimmed = line.trim()
                  if (!trimmed) return <div key={i} className="h-2" />
                  return (
                    <div key={i} className="py-0.5">
                      <CitationMarkdown
                        citations={new Map()}
                        evidenceCitations={evidenceCitations}
                        className="text-foreground/90"
                      >
                        {trimmed}
                      </CitationMarkdown>
                    </div>
                  )
                })}
              </div>
              {evidenceCitations.length > 0 ? (
                <div className="mt-4 flex flex-wrap gap-1.5 border-t border-border/25 pt-3">
                  {evidenceCitations.map((c) => (
                    <EvidenceCitationPill key={c.index} citation={c} size="sm" />
                  ))}
                </div>
              ) : null}
            </>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <DocToolbar
        status={status}
        isStreaming={isStreaming}
        shareRef={shareRef}
        shareOpen={shareOpen}
        setShareOpen={setShareOpen}
        rejectOpen={rejectOpen}
        setRejectOpen={setRejectOpen}
        editMode={editMode}
        setEditMode={setEditMode}
        onAccept={onAccept}
        onPrint={handlePrint}
        onSave={handleSaveEdit}
        onCancelEdit={() => { setEditMode(false); setEditContent(doc.content) }}
        onSendToFrontDesk={onSendToFrontDesk ? () => onSendToFrontDesk(doc) : undefined}
        onShareTarget={handleShareTarget}
      />

      {/* Reject / revise form */}
      <AnimatePresence>
        {rejectOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="shrink-0 overflow-hidden border-b border-border/30 bg-muted/30"
          >
            <div className="flex items-center gap-2 px-4 py-2">
              <input
                type="text"
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && rejectReason.trim()) {
                    onReject(rejectReason.trim())
                    setRejectReason("")
                    setRejectOpen(false)
                  }
                  if (e.key === "Escape") { setRejectOpen(false); setRejectReason("") }
                }}
                placeholder="What needs to be revised? Press Enter to send…"
                autoFocus
                className="flex-1 rounded-md border border-border/50 bg-background px-3 py-1.5 text-[12px] placeholder:text-muted-foreground/50 outline-none focus:border-primary/40 focus:ring-1 focus:ring-primary/20"
              />
              <button
                type="button"
                onClick={() => {
                  if (rejectReason.trim()) {
                    onReject(rejectReason.trim())
                    setRejectReason("")
                    setRejectOpen(false)
                  }
                }}
                disabled={!rejectReason.trim()}
                className="rounded-md bg-foreground px-3 py-1.5 text-[11px] font-semibold text-background transition-colors hover:bg-foreground/85 disabled:opacity-40"
              >
                Revise
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {doc.type === "soap" && !editMode ? (
        <SoapTemplateSelect
          selected={soapTemplate}
          disabled={isStreaming}
          onSelect={(subTemplate) => {
            setSoapTemplate(subTemplate ?? "standard")
            fireGenerate("soap", subTemplate)
          }}
        />
      ) : null}

      {/* Document content */}
      {editMode ? (
        <ClinicalRichDocumentEditor
          ref={editorRef}
          key={`edit-${doc.id}`}
          initialValue={editContent}
          onChange={setEditContent}
          className="border-t border-border/20"
        />
      ) : (
        <div
          ref={scrollRef}
          className="flex-1 overflow-y-auto"
          style={{ scrollbarWidth: "thin" }}
        >
          {isStreaming && bodyForMd.trim().length < 40 ? (
            <DocumentSkeleton docType={doc.type} />
          ) : (
            <>
              <div className="px-6 py-5">
                {bodyForMd.trim().length === 0 ? (
                  <DocumentSkeleton docType={doc.type} />
                ) : (
                  <ClinicalDocMarkdownView content={bodyForMd} />
                )}
              </div>

              {!isStreaming && (
                <div className="border-t border-border/20 px-6 py-2">
                  <div className="flex items-center gap-3 text-[9px] text-muted-foreground/40">
                    <span className="flex items-center gap-0.5">
                      <sup className="inline-flex size-3 items-center justify-center rounded bg-blue-500/10 text-[7px] font-bold text-blue-600 dark:text-blue-400">T</sup>
                      Transcript
                    </span>
                    <span className="flex items-center gap-0.5">
                      <sup className="inline-flex size-3 items-center justify-center rounded bg-purple-500/10 text-[7px] font-bold text-purple-600 dark:text-purple-400">E</sup>
                      Extraction
                    </span>
                    <span className="flex items-center gap-0.5">
                      <sup className="inline-flex size-3 items-center justify-center rounded bg-amber-500/10 text-[7px] font-bold text-amber-600 dark:text-amber-400">H</sup>
                      History
                    </span>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Document toolbar (shared) ────────────────────────────────────────────────

function DocToolbar({
  status,
  isStreaming,
  shareRef,
  shareOpen,
  setShareOpen,
  rejectOpen,
  setRejectOpen,
  editMode,
  setEditMode,
  onAccept,
  onPrint,
  onSave,
  onCancelEdit,
  onSendToFrontDesk,
  onShareTarget,
}: {
  status: "draft" | "accepted" | "rejected"
  isStreaming: boolean
  shareRef: React.RefObject<HTMLDivElement | null>
  shareOpen: boolean
  setShareOpen: (v: boolean) => void
  rejectOpen: boolean
  setRejectOpen: (v: boolean) => void
  editMode: boolean
  setEditMode: (v: boolean) => void
  onAccept: () => void
  onPrint: () => void
  onSave?: () => void
  onCancelEdit?: () => void
  onSendToFrontDesk?: () => void
  onShareTarget?: (target: ShareTarget) => void | Promise<void>
}) {
  return (
    <div
      className={cn(
        "flex h-10 shrink-0 items-center justify-between border-b px-4",
        editMode
          ? "border-primary/20 bg-primary/[0.035]"
          : "border-border/20"
      )}
    >
      <div className="flex items-center gap-2">
        {editMode ? (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/20 bg-primary/10 px-2.5 py-1 text-[11px] font-semibold text-primary">
            <PencilSimple className="size-3" />
            Editing document
          </span>
        ) : null}
        {status === "draft" && !isStreaming && !editMode && (
          <>
            <button
              type="button"
              onClick={onAccept}
              className="inline-flex items-center gap-1.5 rounded-md bg-emerald-600 px-2.5 py-1 text-[11px] font-semibold text-white transition-colors hover:bg-emerald-700"
            >
              <Check className="size-3" weight="bold" />
              Accept
            </button>
            <button
              type="button"
              onClick={() => setRejectOpen(!rejectOpen)}
              className="inline-flex items-center gap-1.5 rounded-md border border-border/50 px-2.5 py-1 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <X className="size-3" />
              Revise
            </button>
          </>
        )}
        {status === "accepted" && (
          <span className="inline-flex items-center gap-1 rounded-md bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-600 dark:text-emerald-400">
            <Check className="size-2.5" weight="bold" />
            Accepted
          </span>
        )}
      </div>

      <div className="flex items-center gap-0.5">
        {!isStreaming && (
          <>
            {editMode ? (
              <>
                <button
                  type="button"
                  onClick={onSave}
                  className="inline-flex items-center gap-1 rounded-md bg-emerald-600 px-2.5 py-1.5 text-[11px] font-semibold text-white transition-colors hover:bg-emerald-700"
                >
                  <Check className="size-3" weight="bold" />
                  Save
                </button>
                <button
                  type="button"
                  onClick={onCancelEdit}
                  className="inline-flex items-center gap-1 rounded-md border border-border/50 px-2.5 py-1.5 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                >
                  <X className="size-3" />
                  Cancel
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={() => setEditMode(true)}
                className="inline-flex size-7 items-center justify-center rounded text-muted-foreground/60 transition-colors hover:bg-muted hover:text-foreground"
                title="Edit"
              >
                <PencilSimple className="size-3.5" />
              </button>
            )}
            <button
              type="button"
              onClick={onPrint}
              className="inline-flex size-7 items-center justify-center rounded text-muted-foreground/60 transition-colors hover:bg-muted hover:text-foreground"
              title="Print"
            >
              <Printer className="size-3.5" />
            </button>

            <div className="relative" ref={shareRef}>
              <button
                type="button"
                onClick={() => setShareOpen(!shareOpen)}
                className="inline-flex size-7 items-center justify-center rounded text-muted-foreground/60 transition-colors hover:bg-muted hover:text-foreground"
                title="Share"
              >
                <DotsThree className="size-3.5" weight="bold" />
              </button>
              <AnimatePresence>
                {shareOpen && (
                  <motion.div
                    initial={{ opacity: 0, y: 4, scale: 0.96 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 4, scale: 0.96 }}
                    transition={{ duration: 0.12 }}
                    className="absolute right-0 top-full z-50 mt-1 w-52 rounded-xl border border-border/60 bg-background/95 p-1 shadow-xl backdrop-blur-xl"
                  >
                    {SHARE_TARGETS.map(({ id, label, icon: ShareIcon, description }) => (
                      <button
                        key={id}
                        type="button"
                        onClick={async () => {
                          if (id === "front_desk" && onSendToFrontDesk) {
                            onSendToFrontDesk()
                          } else if (onShareTarget) {
                            await onShareTarget(id)
                          } else {
                            toast.success(`Sent to ${label}`)
                          }
                          setShareOpen(false)
                        }}
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
                )}
              </AnimatePresence>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function TimelineHighlightedText({ segments }: { segments: HighlightedSegment[] }) {
  return (
    <span>
      {segments.map((seg, idx) => {
        if (seg.type === "text") return <span key={idx}>{seg.text}</span>
        const tone =
          seg.entityType === "medication"
            ? "bg-blue-500/15 text-blue-700 dark:text-blue-300"
            : seg.entityType === "diagnosis"
              ? "bg-purple-500/15 text-purple-700 dark:text-purple-300"
              : seg.entityType === "vital"
                ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
                : "bg-amber-500/15 text-amber-700 dark:text-amber-300"
        return (
          <mark key={idx} className={cn("rounded px-0.5 py-px font-medium", tone)}>
            {seg.text}
          </mark>
        )
      })}
    </span>
  )
}

function formatSec(seconds: number | null): string {
  if (seconds == null || Number.isNaN(seconds)) return "--:--"
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`
}

function segmentsToTranscript(segments: Array<{ text: string }>): string {
  return segments
    .map((s) => s.text.trim())
    .filter(Boolean)
    .join("\n\n")
}

function EditableTranscriptLine({
  text,
  highlights,
  onSave,
}: {
  text: string
  highlights: HighlightSpan[]
  onSave: (next: string) => void
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(text)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (!editing) setDraft(text)
  }, [text, editing])

  useEffect(() => {
    if (editing) {
      inputRef.current?.focus()
      inputRef.current?.select()
    }
  }, [editing])

  const save = useCallback(() => {
    const next = draft.trim()
    if (next && next !== text.trim()) onSave(next)
    setEditing(false)
  }, [draft, onSave, text])

  if (editing) {
    return (
      <div className="space-y-1.5">
        <textarea
          ref={inputRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          rows={Math.min(8, Math.max(2, draft.split("\n").length + 1))}
          className="w-full resize-y rounded-md border border-border/50 bg-background px-2 py-1.5 text-[12px] leading-relaxed text-foreground outline-none ring-1 ring-primary/20 focus:border-primary/40 focus:ring-primary/30"
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              setDraft(text)
              setEditing(false)
            }
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault()
              save()
            }
          }}
        />
        <div className="flex items-center justify-end gap-1">
          <button
            type="button"
            onClick={() => {
              setDraft(text)
              setEditing(false)
            }}
            className="rounded px-2 py-0.5 text-[10px] font-medium text-muted-foreground hover:bg-muted"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={save}
            className="inline-flex items-center gap-1 rounded bg-primary px-2 py-0.5 text-[10px] font-medium text-primary-foreground hover:opacity-90"
          >
            <Check className="size-3" weight="bold" />
            Save
          </button>
        </div>
      </div>
    )
  }

  return (
    <button
      type="button"
      onClick={() => setEditing(true)}
      className="group relative w-full cursor-text rounded-md px-1 py-0.5 text-left transition-colors hover:bg-background/60"
      title="Click to edit this line"
    >
      <TimelineHighlightedText segments={highlightFromExtracted(text, highlights)} />
      <PencilSimple
        className="pointer-events-none absolute -right-1 top-0.5 size-3 text-muted-foreground/0 transition-opacity group-hover:text-muted-foreground/70"
        weight="bold"
      />
    </button>
  )
}

function ClinicalTranscriptTimeline() {
  const { scribeTranscript, scribeSegments, scribeHighlights, setScribeTranscript } = useWorkspace()
  const hasDiarization = scribeSegments.length > 0
  const plainLines = useMemo(
    () =>
      scribeTranscript
        .split(/\n{1,2}/)
        .map((line) => line.trim())
        .filter(Boolean),
    [scribeTranscript]
  )

  const updateSegmentLine = useCallback((idx: number, nextText: string) => {
    useWorkspaceStore.setState((s) => {
      const segments = s.scribeSegments.map((seg, i) =>
        i === idx ? { ...seg, text: nextText } : seg
      )
      return {
        scribeSegments: segments,
        scribeTranscript: segmentsToTranscript(segments),
      }
    })
    syncActivePatientScribeSnapshot()
  }, [])

  const updatePlainLine = useCallback(
    (idx: number, nextText: string) => {
      const lines = scribeTranscript
        .split(/\n{1,2}/)
        .map((line) => line.trim())
        .filter(Boolean)
      lines[idx] = nextText
      setScribeTranscript(lines.join("\n\n"))
    },
    [scribeTranscript, setScribeTranscript]
  )

  if (!scribeTranscript.trim()) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 text-center">
        <Stethoscope className="size-7 text-muted-foreground/30" />
        <p className="text-sm font-medium text-muted-foreground/70">Transcript will appear here</p>
        <p className="max-w-sm text-[11px] text-muted-foreground/50">
          Start recording or upload audio to build a clean timeline for notes, ICD-10 and claims.
        </p>
      </div>
    )
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden border-b border-border/25">
      <div className="px-4 py-2">
        <h3 className="text-xs font-semibold text-muted-foreground">Transcript Timeline</h3>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-3" style={{ scrollbarWidth: "thin" }}>
        <div className="space-y-2 pb-2">
          {hasDiarization
            ? scribeSegments.map((seg, idx) => (
                  <div
                    key={`${seg.startSec ?? "na"}-${idx}`}
                    className="grid grid-cols-[52px_minmax(0,1fr)] gap-2 rounded-lg border border-border/30 bg-muted/20 px-2.5 py-2 transition-colors hover:border-border/50"
                  >
                    <div className="pt-0.5 text-[10px] font-medium text-muted-foreground">
                      {formatSec(seg.startSec)}
                    </div>
                    <div className="min-w-0">
                      <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/80">
                        {seg.speaker || "Discussion"}
                      </div>
                      <div className="text-[12px] leading-relaxed text-foreground/90">
                        <EditableTranscriptLine
                          text={seg.text}
                          highlights={scribeHighlights}
                          onSave={(next) => updateSegmentLine(idx, next)}
                        />
                      </div>
                    </div>
                  </div>
                ))
            : plainLines.map((line, idx) => (
                <div
                  key={`line-${idx}`}
                  className="grid grid-cols-[52px_minmax(0,1fr)] gap-2 rounded-lg border border-border/30 bg-muted/20 px-2.5 py-2 transition-colors hover:border-border/50"
                >
                  <div className="pt-0.5 text-[10px] font-medium text-muted-foreground">
                    {formatSec(idx * 90)}
                  </div>
                  <div className="text-[12px] leading-relaxed text-foreground/90">
                    <EditableTranscriptLine
                      text={line}
                      highlights={scribeHighlights}
                      onSave={(next) => updatePlainLine(idx, next)}
                    />
                  </div>
                </div>
              ))}
        </div>
      </div>
    </div>
  )
}

function GenerationStatusRibbon({
  mode,
  sessionDocuments,
  activeDoc,
  activeTabId,
}: {
  mode: "recording" | "transcript" | "generating" | "review"
  sessionDocuments: SessionDocument[]
  activeDoc: SessionDocument | null
  activeTabId: string | null
}) {
  const streamingDoc = useMemo(() => {
    if (activeTabId) {
      const active = sessionDocuments.find((s) => s.id === activeTabId)
      if (active?.document.isStreaming) return active
    }
    return [...sessionDocuments]
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
      .find((s) => s.document.isStreaming)
  }, [sessionDocuments, activeTabId])

  const steps = streamingDoc ? LOADING_STEPS[streamingDoc.document.type] ?? ["Drafting…"] : []
  const [stepIdx, setStepIdx] = useState(0)

  useEffect(() => {
    if (!streamingDoc || steps.length <= 1) return
    setStepIdx(0)
    const timer = setInterval(() => setStepIdx((idx) => (idx + 1) % steps.length), 2200)
    return () => clearInterval(timer)
  }, [streamingDoc, streamingDoc?.id, steps.length])

  if (mode === "recording") {
    return (
      <div className="shrink-0 border-b border-red-500/15 bg-red-500/[0.04] px-4 py-2">
        <div className="flex items-center gap-2 text-[11px] text-red-700/90 dark:text-red-300/90">
          <span className="relative flex size-2">
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-red-500/40 opacity-75" />
            <span className="relative inline-flex size-2 rounded-full bg-red-500" />
          </span>
          <span className="font-medium">Recording</span>
          <span className="text-muted-foreground/60">· transcript capturing live</span>
        </div>
      </div>
    )
  }

  if (mode === "generating" && streamingDoc) {
    const label = DOC_LABEL[streamingDoc.document.type]
    const step = steps[stepIdx] ?? "Drafting…"
    return (
      <div className="relative shrink-0 border-b border-border/20 bg-background/90 px-4 py-2 backdrop-blur-sm">
        <div className="absolute inset-x-0 top-0 h-px overflow-hidden">
          <motion.div
            className="h-full w-1/4 bg-foreground/20"
            animate={{ x: ["-20%", "420%"] }}
            transition={{ duration: 1.8, repeat: Infinity, ease: "easeInOut" }}
          />
        </div>
        <div className="flex min-w-0 items-center gap-2.5 text-[11px]">
          <motion.span
            className="inline-flex size-1.5 rounded-full bg-foreground/45"
            animate={{ opacity: [0.35, 1, 0.35] }}
            transition={{ duration: 1.6, repeat: Infinity }}
          />
          <span className="font-medium text-foreground/80">{label}</span>
          <AnimatePresence mode="wait" initial={false}>
            <motion.span
              key={step}
              initial={{ opacity: 0, y: 3 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -3 }}
              transition={{ duration: 0.3 }}
              className="truncate text-muted-foreground/65"
            >
              {step}
            </motion.span>
          </AnimatePresence>
        </div>
      </div>
    )
  }

  if (mode === "review" && activeDoc) {
    return (
      <div className="shrink-0 border-b border-emerald-500/15 bg-emerald-500/[0.03] px-4 py-2">
        <div className="flex items-center gap-2 text-[11px]">
          <Check className="size-3 text-emerald-600/80 dark:text-emerald-400/80" weight="bold" />
          <span className="font-medium text-foreground/75">
            {DOC_LABEL[activeDoc.document.type]} ready
          </span>
          <span className="text-muted-foreground/55">· review and send</span>
        </div>
      </div>
    )
  }

  return null
}

// ─── Main component ───────────────────────────────────────────────────────────

export function PaneDocumentCanvas({
  children,
  scribeSlot,
}: {
  children: React.ReactNode
  scribeSlot?: React.ReactNode
}) {
  const {
    activePatient,
    documentSheet,
    acceptSessionDocument,
    rejectSessionDocument,
    scribeActive,
  } = useWorkspace()
  const { dekKey } = usePracticeCrypto()

  const [activeTab, setActiveTab] = useState<string | null>(null)
  const [activeSection, setActiveSection] = useState<SectionId>("transcript")
  const [pickerOpen, setPickerOpen] = useState(false)
  const pickerRef = useRef<HTMLDivElement>(null)
  const patientEpochRef = useRef<string | null>(null)

  useEffect(() => {
    const pid = activePatient?.patientId ?? null
    if (patientEpochRef.current === pid) return
    patientEpochRef.current = pid
    setActiveTab(null)
    setActiveSection("transcript")
    setPickerOpen(false)
  }, [activePatient?.patientId])

  const sessionDocuments = useMemo(
    () =>
      [...(activePatient?.sessionDocuments ?? [])].sort(
        (a, b) =>
          new Date(a.updatedAt ?? 0).getTime() - new Date(b.updatedAt ?? 0).getTime()
      ),
    [activePatient?.sessionDocuments]
  )

  // When the document sheet is triggered externally, switch to its tab.
  const prevContentDocId = useRef<string | null>(null)
  useEffect(() => {
    const cd = documentSheet.contentDocument
    if (!cd || cd.id === prevContentDocId.current) return
    prevContentDocId.current = cd.id
    const match = sessionDocuments.find((s) => s.document.id === cd.id || s.id === cd.id)
    if (match) setActiveTab(match.id)
  }, [documentSheet.contentDocument, sessionDocuments])

  // Keep active tab valid
  useEffect(() => {
    if (!activeTab) return
    const stillExists = sessionDocuments.some((s) => s.id === activeTab)
    if (!stillExists) setActiveTab(null)
  }, [sessionDocuments, activeTab])

  // Focus tab on generation
  useEffect(() => {
    const handler = (e: Event) => {
      const docId = (e as CustomEvent<{ docId?: string }>).detail?.docId
      if (docId) setActiveTab(docId)
    }
    window.addEventListener("fleming:focus-document-tab", handler)
    return () => window.removeEventListener("fleming:focus-document-tab", handler)
  }, [])

  // Close pickers on outside click
  useEffect(() => {
    if (!pickerOpen) return
    const handle = (e: MouseEvent) => {
      if (pickerOpen && !pickerRef.current?.contains(e.target as Node)) setPickerOpen(false)
    }
    document.addEventListener("mousedown", handle)
    return () => document.removeEventListener("mousedown", handle)
  }, [pickerOpen])

  const handleAccept = useCallback(
    (sd: SessionDocument) => {
      if (!activePatient) return
      acceptSessionDocument(activePatient.patientId, sd.document.id, { document: sd.document })
    },
    [activePatient, acceptSessionDocument]
  )

  const handleReject = useCallback(
    (sd: SessionDocument, reason: string) => {
      if (!activePatient) return
      rejectSessionDocument(activePatient.patientId, sd.document.id, reason, { document: sd.document })
      window.dispatchEvent(
        new CustomEvent("fleming:revise-document", {
          detail: {
            commandTag: sd.document.type,
            reason,
            priorContent: sd.document.content,
          },
        })
      )
    },
    [activePatient, rejectSessionDocument]
  )

  const handleSendToFrontDesk = useCallback(
    async (doc: ClinicalDocument) => {
      const patientName = doc.patientName ?? activePatient?.name ?? "Unknown patient"
      const patientId = activePatient?.patientId ?? null
      const preview = `${DOC_LABEL[doc.type]} — ${patientName}`
      try {
        let payloadCiphertext: string | undefined
        let payloadIv: string | undefined
        if (dekKey) {
          const enc = await encryptJson(dekKey, {
            docType: doc.type,
            title: doc.title,
            content: doc.content,
            prescriptionItems: doc.prescriptionItems,
            icdItems: doc.icdItems,
            claimItems: doc.claimItems,
            patientName,
          })
          payloadCiphertext = enc.ciphertext
          payloadIv = enc.iv
        }
        const res = await fetchClient("/api/practice/inbox", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            channel: "document",
            fromLabel: `${DOC_LABEL[doc.type]} · ${patientName}`,
            preview,
            patientId,
            payloadCiphertext,
            payloadIv,
            metadata: {
              docType: doc.type,
              sessionDocumentId: doc.id,
              clinicalEncounterId: activePatient?.clinicalEncounterId ?? undefined,
              source: "clinical_consult",
            },
          }),
        })
        if (!res.ok) throw new Error("Failed")
        toast.success("Sent to Front Desk")
      } catch {
        toast.error("Could not send to Front Desk")
        throw new Error("Failed")
      }
    },
    [activePatient, dekKey]
  )

  const handleSendToPatient = useCallback((doc: ClinicalDocument) => {
    const patientName = doc.patientName ?? activePatient?.name ?? "the patient"
    toast.success(`${DOC_LABEL[doc.type]} prepared for ${patientName}`)
  }, [activePatient])

  const activeDoc = useMemo(
    () => (activeTab ? sessionDocuments.find((s) => s.id === activeTab) ?? null : null),
    [activeTab, sessionDocuments]
  )

  useEffect(() => {
    if (!activeDoc) return
    const section = SECTION_CHIPS.find((s) => s.docType === activeDoc.document.type)
    if (section) {
      setActiveSection(section.id)
      return
    }
    if (activeDoc.document.type === "refer") setActiveSection("transcript")
  }, [activeDoc, activeDoc?.id, activeDoc?.document.type])

  const openSection = useCallback(
    (sectionId: SectionId) => {
      if (sectionId === "transcript") {
        setActiveSection("transcript")
        setActiveTab(null)
        return
      }
      setActiveSection(sectionId)
      const section = SECTION_CHIPS.find((s) => s.id === sectionId)
      const type = section?.docType
      if (!type) return
      const existing = [...sessionDocuments]
        .reverse()
        .find((s) => s.document.type === type)
      if (existing) {
        setActiveTab(existing.id)
        return
      }
      fireGenerate(type)
    },
    [sessionDocuments]
  )

  const handleQuickRx = useCallback(() => {
    const pid = activePatient?.patientId
    if (!pid) return
    setActiveSection("prescribe")
    const existing = [...sessionDocuments]
      .reverse()
      .find((s) => s.document.type === "prescribe")
    if (existing) {
      setActiveTab(existing.id)
      return
    }
    const pending = createPendingSessionDocument("prescribe")
    pending.document.isStreaming = false
    pending.document.prescriptionItems = [newPrescriptionItem()]
    pending.document.patientName = activePatient.name
    useWorkspaceStore.getState().upsertSessionDocument(pid, pending)
    setActiveTab(pending.id)
  }, [activePatient, sessionDocuments])

  const paneMode = useMemo<"recording" | "transcript" | "generating" | "review">(() => {
    const hasStreamingDoc = sessionDocuments.some((sd) => sd.document.isStreaming)
    if (scribeActive) return "recording"
    if (hasStreamingDoc) return "generating"
    if (activeDoc && !activeDoc.document.isStreaming) return "review"
    return "transcript"
  }, [scribeActive, sessionDocuments, activeDoc])

  // Safety: clear orphaned pending streams (e.g. failed generation) after 90s.
  useEffect(() => {
    const pid = activePatient?.patientId
    if (!pid) return
    const stuck = sessionDocuments.some(
      (sd) => sd.document.isStreaming && sd.messageId === "pending"
    )
    if (!stuck) return
    const timer = window.setTimeout(() => {
      const store = useWorkspaceStore.getState()
      const patient = store.openPatients.find((p) => p.patientId === pid)
      for (const sd of patient?.sessionDocuments ?? []) {
        if (sd.document.isStreaming && sd.messageId === "pending") {
          store.upsertSessionDocument(pid, {
            ...sd,
            document: { ...sd.document, isStreaming: false },
          })
        }
      }
    }, 90_000)
    return () => window.clearTimeout(timer)
  }, [activePatient?.patientId, sessionDocuments])

  return (
    <DocumentCanvasProvider documentLayout>
      <div className="relative flex h-full min-w-0 flex-1 flex-col overflow-hidden bg-background">
        {/* Recording strip */}
        {scribeSlot && scribeActive ? <div className="shrink-0">{scribeSlot}</div> : null}

        {/* Row A: section chips */}
        <div className="flex h-10 shrink-0 items-center gap-1 border-b border-border/25 bg-background/85 px-2 backdrop-blur-sm">
          <div className="relative flex min-w-0 flex-1 items-center gap-1 overflow-x-auto" style={{ scrollbarWidth: "none" }}>
            {SECTION_CHIPS.map((chip) => (
              <button
                key={chip.id}
                type="button"
                onClick={() => openSection(chip.id)}
                className={cn(
                  "inline-flex h-7 shrink-0 items-center gap-1.5 rounded-full border px-2.5 text-[11px] font-medium transition-colors",
                  activeSection === chip.id
                    ? "border-foreground/20 bg-foreground/[0.08] text-foreground"
                    : "border-border/40 text-muted-foreground/70 hover:bg-muted/50 hover:text-foreground"
                )}
              >
                {chip.id === "transcript" ? <Clipboard className="size-3" /> : null}
                {chip.id === "soap" ? <Clipboard className="size-3" /> : null}
                {chip.id === "prescribe" ? <Pill className="size-3" /> : null}
                {chip.id === "summary" ? <FileText className="size-3" /> : null}
                {chip.id === "billing" ? <Receipt className="size-3" /> : null}
                {chip.id === "evidence" ? <BookOpen className="size-3" /> : null}
                {chip.label}
              </button>
            ))}
          </div>
          <div className="relative ml-1 shrink-0" ref={pickerRef}>
            <button
              type="button"
              onClick={() => setPickerOpen((o) => !o)}
              className={cn(
                "inline-flex h-7 items-center gap-1.5 rounded-full border border-dashed border-border/50 px-2.5 text-[11px] font-medium text-muted-foreground transition-colors hover:border-border/70 hover:bg-muted/50 hover:text-foreground",
                pickerOpen && "border-border/70 bg-muted/50 text-foreground"
              )}
            >
              <Plus className="size-3" />
              Generate
            </button>
            <AnimatePresence>
              {pickerOpen ? (
                <div className="absolute right-0 top-full z-[80] mt-1.5">
                  <GeneratePicker onClose={() => setPickerOpen(false)} />
                </div>
              ) : null}
            </AnimatePresence>
          </div>
        </div>

        {/* Row B: contextual actions */}
        <div className="flex min-h-11 shrink-0 items-center justify-between gap-2 border-b border-border/20 bg-background/80 px-2.5">
          <div className="flex min-w-0 items-center gap-2">
            <button
              type="button"
              onClick={handleQuickRx}
              className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border border-sky-500/35 bg-sky-500/10 px-3.5 text-[11px] font-semibold text-sky-800 transition-colors hover:bg-sky-500/15 dark:text-sky-300"
            >
              <Pill className="size-3.5" weight="fill" />
              Quick Rx
            </button>
            {activeDoc && !activeDoc.document.isStreaming ? (
              <>
                {FRONT_DESK_DOC_TYPES.has(activeDoc.document.type) ? (
                  <SendToFrontDeskButton
                    onSend={() => handleSendToFrontDesk(activeDoc.document)}
                  />
                ) : null}
                {PATIENT_DOC_TYPES.has(activeDoc.document.type) ? (
                  <button
                    type="button"
                    onClick={() => handleSendToPatient(activeDoc.document)}
                    className="inline-flex h-8 items-center gap-1.5 rounded-full border border-border/50 bg-background px-3.5 text-[11px] font-semibold text-foreground transition-transform hover:scale-[1.02] hover:bg-muted"
                  >
                    <ChatText className="size-3.5" />
                    Send to Patient
                  </button>
                ) : null}
              </>
            ) : (
              <span className="text-[11px] text-muted-foreground">
                {activeDoc?.document.isStreaming
                  ? `Generating ${DOC_LABEL[activeDoc.document.type]}…`
                  : "Transcript ready"}
              </span>
            )}
          </div>
        </div>

        <GenerationStatusRibbon
          mode={paneMode}
          sessionDocuments={sessionDocuments}
          activeDoc={activeDoc}
          activeTabId={activeTab}
        />

        {/* Main center area */}
        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden pb-20">
          {activeDoc ? (
            <>
              <div className="shrink-0 border-b border-border/25 px-3 py-1.5">
                <button
                  type="button"
                  onClick={() => setActiveTab(null)}
                  className={cn(
                    "inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium transition-colors",
                    activeDoc.document.isStreaming
                      ? "text-muted-foreground/45 hover:text-muted-foreground"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground"
                  )}
                >
                  <ArrowRight className="size-3 rotate-180" />
                  Back to transcript
                </button>
              </div>
              <InlineDocViewer
                key={activeDoc.id}
                doc={activeDoc.document}
                status={activeDoc.status}
                onAccept={() => handleAccept(activeDoc)}
                onReject={(reason) => handleReject(activeDoc, reason)}
                onSendToFrontDesk={handleSendToFrontDesk}
              />
            </>
          ) : (
            <ClinicalTranscriptTimeline />
          )}
        </div>

        {/* Keep chat mounted for generation/stream events; hidden from UI */}
        <div className="pointer-events-none absolute h-0 w-0 overflow-hidden opacity-0" aria-hidden>
          {children}
        </div>
      </div>
    </DocumentCanvasProvider>
  )
}

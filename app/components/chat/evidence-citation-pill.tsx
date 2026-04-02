"use client"

import { cn } from "@/lib/utils"
import { useState, useRef, useEffect } from "react"
import { motion, AnimatePresence } from "motion/react"
import { createPortal } from "react-dom"
import Link from "next/link"
import { 
  X, 
  ArrowSquareOut, 
  BookOpen
} from "@phosphor-icons/react"
import type { EvidenceCitation, UploadVisualReference } from "@/lib/evidence/types"
import { 
  EVIDENCE_LEVEL_COLORS, 
  EVIDENCE_LEVEL_SHORT,
  EVIDENCE_LEVEL_LABELS,
} from "@/lib/evidence/types"

function gradeLabelForLevel(level: number, studyType?: string): string {
  const st = (studyType || "").toLowerCase()
  if (level <= 1 && (st.includes("meta") || st.includes("systematic") || st.includes("guideline"))) return "High"
  if (level <= 2 && (st.includes("randomized") || st.includes("rct"))) return "High"
  if (level <= 2) return "Mod"
  if (level <= 3) return "Mod"
  if (level <= 4) return "Low"
  return "V.Low"
}

function gradeColorForLevel(level: number, studyType?: string): string {
  const label = gradeLabelForLevel(level, studyType)
  switch (label) {
    case "High": return "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
    case "Mod": return "bg-blue-500/15 text-blue-700 dark:text-blue-300"
    case "Low": return "bg-amber-500/15 text-amber-700 dark:text-amber-300"
    default: return "bg-red-500/15 text-red-700 dark:text-red-300"
  }
}

// Journal favicon mapping - returns URL for known journals
function getJournalFavicon(journal: string): string | null {
  const journalLower = journal.toLowerCase()
  
  // JAMA family
  if (journalLower.includes('jama network open') || journalLower.includes('jama network')) {
    return 'https://cdn.jamanetwork.com/favicon.ico'
  }
  if (journalLower.includes('jama cardiology')) {
    return 'https://jamanetwork.com/favicon.ico'
  }
  if (journalLower.includes('jama internal medicine')) {
    return 'https://jamanetwork.com/favicon.ico'
  }
  if (journalLower.includes('jama') || journalLower.includes('journal of the american medical')) {
    return 'https://cdn.jamanetwork.com/images/logos/JAMA.png'
  }
  
  // NEJM
  if (journalLower.includes('new england journal') || journalLower.includes('nejm')) {
    return 'https://www.nejm.org/favicon.ico'
  }
  
  // Lancet
  if (journalLower.includes('lancet')) {
    return 'https://www.thelancet.com/favicon.ico'
  }
  
  // BMJ family
  if (journalLower.includes('bmj open')) {
    return 'https://bmjopen.bmj.com/favicon.ico'
  }
  if (journalLower.includes('bmj open diabetes')) {
    return 'https://drc.bmj.com/favicon.ico'
  }
  if (journalLower.includes('bmj') || journalLower.includes('british medical')) {
    return 'https://www.bmj.com/favicon.ico'
  }
  
  // PLOS
  if (journalLower.includes('plos one') || journalLower.includes('plos')) {
    return 'https://journals.plos.org/favicon.ico'
  }
  
  // Cochrane
  if (journalLower.includes('cochrane')) {
    return 'https://www.cochranelibrary.com/favicon.ico'
  }
  
  // AHA Journals (Circulation, JACC, etc.)
  if (journalLower.includes('journal of the american college of cardiology') || journalLower.includes('jacc')) {
    return 'https://www.jacc.org/favicon.ico'
  }
  if (journalLower.includes('journal of the american heart association') || journalLower.includes('jaha')) {
    return 'https://www.ahajournals.org/favicon.ico'
  }
  if (journalLower.includes('circulation')) {
    return 'https://www.ahajournals.org/favicon.ico'
  }
  if (journalLower.includes('hypertension')) {
    return 'https://www.ahajournals.org/favicon.ico'
  }
  
  // Annals of Internal Medicine / ACP
  if (journalLower.includes('annals of internal medicine') || journalLower.includes('acp')) {
    return 'https://www.acpjournals.org/favicon.ico'
  }
  
  // Nature family
  if (journalLower.includes('nature medicine') || journalLower.includes('nature')) {
    return 'https://www.nature.com/favicon.ico'
  }
  
  // Science
  if (journalLower.includes('scientific reports')) {
    return 'https://www.nature.com/favicon.ico'
  }
  if (journalLower.includes('science')) {
    return 'https://www.science.org/favicon.ico'
  }
  
  // BMC journals
  if (journalLower.includes('bmc')) {
    return 'https://www.biomedcentral.com/favicon.ico'
  }
  
  // Diabetes journals
  if (journalLower.includes('diabetes care') || journalLower.includes('diabetes & metabolism')) {
    return 'https://diabetesjournals.org/favicon.ico'
  }
  if (journalLower.includes('diabetes, obesity & metabolism')) {
    return 'https://dom-pubs.onlinelibrary.wiley.com/favicon.ico'
  }
  if (journalLower.includes('diabetes')) {
    return 'https://diabetesjournals.org/favicon.ico'
  }
  
  // Mayo Clinic
  if (journalLower.includes('mayo clinic')) {
    return 'https://www.mayoclinic.org/favicon.ico'
  }
  
  // JMIR
  if (journalLower.includes('journal of medical internet research') || journalLower.includes('jmir')) {
    return 'https://www.jmir.org/favicon.ico'
  }
  
  // Frontiers
  if (journalLower.includes('frontiers')) {
    return 'https://www.frontiersin.org/favicon.ico'
  }
  
  // European journals
  if (journalLower.includes('european journal') || journalLower.includes('european radiology')) {
    return 'https://www.springer.com/favicon.ico'
  }
  if (journalLower.includes('clinical microbiology and infection')) {
    return 'https://www.elsevier.com/favicon.ico'
  }
  
  // General medicine
  if (journalLower.includes('journal of general internal medicine')) {
    return 'https://www.sgim.org/favicon.ico'
  }
  if (journalLower.includes('american journal of preventive medicine')) {
    return 'https://www.ajpmonline.org/favicon.ico'
  }
  if (journalLower.includes('clinical therapeutics')) {
    return 'https://www.clinicaltherapeutics.com/favicon.ico'
  }
  if (journalLower.includes('contemporary clinical trials')) {
    return 'https://www.elsevier.com/favicon.ico'
  }
  
  // Cancer
  if (journalLower.includes('cancer causes & control') || journalLower.includes('cancer causes')) {
    return 'https://www.springer.com/favicon.ico'
  }
  if (journalLower.includes('european journal of cancer')) {
    return 'https://www.elsevier.com/favicon.ico'
  }
  
  // Pain
  if (journalLower.includes('pain physician')) {
    return 'https://www.painphysicianjournal.com/favicon.ico'
  }
  if (journalLower.includes('pain management nursing')) {
    return 'https://www.elsevier.com/favicon.ico'
  }
  
  // Heart failure
  if (journalLower.includes('european journal of heart failure')) {
    return 'https://www.escardio.org/favicon.ico'
  }
  if (journalLower.includes('journal of cardiac failure')) {
    return 'https://www.onlinejcf.com/favicon.ico'
  }
  
  // Radiology
  if (journalLower.includes('journal of the american college of radiology') || journalLower.includes('jacr')) {
    return 'https://www.jacr.org/favicon.ico'
  }
  
  // Surgery
  if (journalLower.includes('surgical endoscopy')) {
    return 'https://www.springer.com/favicon.ico'
  }
  
  // Nutrition
  if (journalLower.includes('nutrients')) {
    return 'https://www.mdpi.com/favicon.ico'
  }
  
  // Atherosclerosis
  if (journalLower.includes('atherosclerosis')) {
    return 'https://www.elsevier.com/favicon.ico'
  }
  
  // Medicine (general)
  if (journalLower.includes('medicine (baltimore)') || (journalLower.includes('medicine') && !journalLower.includes('journal'))) {
    return 'https://journals.lww.com/favicon.ico'
  }
  
  // Trials
  if (journalLower.includes('trials')) {
    return 'https://www.biomedcentral.com/favicon.ico'
  }
  
  // Health Technology Assessment
  if (journalLower.includes('health technology assessment')) {
    return 'https://www.journalslibrary.nihr.ac.uk/favicon.ico'
  }
  
  // Translational Behavioral Medicine
  if (journalLower.includes('translational behavioral medicine')) {
    return 'https://academic.oup.com/favicon.ico'
  }
  
  // PubMed/NCBI fallback
  if (journalLower.includes('pubmed') || journalLower.includes('ncbi')) {
    return 'https://www.ncbi.nlm.nih.gov/favicon.ico'
  }
  
  // Generic fallback for common publishers (check these last as they're less specific)
  if (journalLower.includes('elsevier')) {
    return 'https://www.elsevier.com/favicon.ico'
  }
  if (journalLower.includes('springer')) {
    return 'https://www.springer.com/favicon.ico'
  }
  if (journalLower.includes('wiley')) {
    return 'https://www.wiley.com/favicon.ico'
  }
  if (journalLower.includes('oxford university press') || journalLower.includes('oup')) {
    return 'https://academic.oup.com/favicon.ico'
  }
  if (journalLower.includes('sage')) {
    return 'https://journals.sagepub.com/favicon.ico'
  }
  if (journalLower.includes('mdpi')) {
    return 'https://www.mdpi.com/favicon.ico'
  }
  if (journalLower.includes('lww') || journalLower.includes('lippincott')) {
    return 'https://journals.lww.com/favicon.ico'
  }
  
  // Try to construct favicon URL from DOI if available
  // This is a last resort before returning null
  return null
}

function getSourceDisplayFromUrl(url: string | null | undefined): {
  label: string
  faviconUrl: string | null
} | null {
  if (!url || typeof url !== "string") return null
  try {
    const parsed = new URL(url)
    const host = parsed.hostname.toLowerCase().replace(/^www\./, "")
    if (host.includes("pubmed.ncbi.nlm.nih.gov") || host.includes("ncbi.nlm.nih.gov")) {
      return { label: "PubMed", faviconUrl: "https://www.ncbi.nlm.nih.gov/favicon.ico" }
    }
    if (host.includes("clinicaltrials.gov")) {
      return { label: "ClinicalTrials.gov", faviconUrl: "https://clinicaltrials.gov/favicon.ico" }
    }
    if (host.includes("nice.org.uk")) {
      return { label: "NICE", faviconUrl: "https://www.nice.org.uk/favicon.ico" }
    }
    if (host.includes("who.int")) {
      return { label: "WHO", faviconUrl: "https://www.who.int/favicon.ico" }
    }
    if (host.includes("cdc.gov")) {
      return { label: "CDC", faviconUrl: "https://www.cdc.gov/favicon.ico" }
    }
    if (host.includes("fda.gov")) {
      return { label: "FDA", faviconUrl: "https://www.fda.gov/favicon.ico" }
    }
    return { label: host, faviconUrl: `https://www.google.com/s2/favicons?sz=64&domain=${host}` }
  } catch {
    return null
  }
}

function isGenericSourceLabel(value: string | null | undefined): boolean {
  const normalized = (value || "").trim().toLowerCase()
  return (
    normalized.length === 0 ||
    normalized === "source" ||
    normalized === "trials" ||
    normalized === "unknown" ||
    normalized === "unknown source" ||
    normalized === "medical evidence"
  )
}

// Shorten journal name for display
function shortenJournalName(journal: string, maxLength: number = 18): string {
  // Common abbreviations - order matters (more specific first)
  const abbreviations: Record<string, string> = {
    'jama network open': 'JAMA Netw Open',
    'jama cardiology': 'JAMA Cardiol',
    'jama internal medicine': 'JAMA Intern Med',
    'journal of the american medical association': 'JAMA',
    'new england journal of medicine': 'NEJM',
    'the lancet': 'The Lancet',
    'lancet (london, england)': 'The Lancet',
    'bmj open': 'BMJ Open',
    'bmj open diabetes research & care': 'BMJ Open Diab',
    'bmj (clinical research ed.)': 'BMJ',
    'british medical journal': 'BMJ',
    'plos one': 'PLOS ONE',
    'the cochrane database of systematic reviews': 'Cochrane',
    'cochrane database of systematic reviews': 'Cochrane',
    'journal of the american college of cardiology': 'JACC',
    'jacc. cardiovascular interventions': 'JACC Interv',
    'journal of the american heart association': 'JAHA',
    'circulation': 'Circulation',
    'annals of internal medicine': 'Annals Intern Med',
    'bmc nephrology': 'BMC Nephrol',
    'bmc public health': 'BMC Public Health',
    'bmc health services research': 'BMC Health Serv',
    'bmc infectious diseases': 'BMC Infect Dis',
    'bmc cancer': 'BMC Cancer',
    'bmc cardiovascular disorders': 'BMC Cardiovasc',
    'bmc primary care': 'BMC Prim Care',
    'journal of medical internet research': 'JMIR',
    'scientific reports': 'Sci Rep',
    'clinical microbiology and infection': 'Clin Microbiol Infect',
    'clinical therapeutics': 'Clin Ther',
    'contemporary clinical trials': 'Contemp Clin Trials',
    'pain physician': 'Pain Physician',
    'trials': 'Trials',
    'journal of the american college of radiology': 'JACR',
    'medicine': 'Medicine',
    'nutrients': 'Nutrients',
    'american journal of preventive medicine': 'Am J Prev Med',
    'diabetes, obesity & metabolism': 'Diabetes Obes Metab',
    'diabetes & metabolism journal': 'Diabetes Metab J',
    'diabetes care': 'Diabetes Care',
    'journal of general internal medicine': 'J Gen Intern Med',
    'surgical endoscopy': 'Surg Endosc',
    'european radiology': 'Eur Radiol',
    'frontiers in endocrinology': 'Front Endocrinol',
    'frontiers in immunology': 'Front Immunol',
    'hypertension': 'Hypertension',
    'health technology assessment': 'Health Technol Assess',
    'translational behavioral medicine': 'Transl Behav Med',
    'european journal of cancer': 'Eur J Cancer',
    'european journal of heart failure': 'Eur J Heart Fail',
    'journal of cardiac failure': 'J Card Fail',
    'cancer causes & control': 'Cancer Causes Control',
    'pain management nursing': 'Pain Manag Nurs',
    'mayo clinic proceedings': 'Mayo Clinic',
    'atherosclerosis': 'Atherosclerosis',
  }
  
  const journalLower = journal.toLowerCase()
  
  // Try exact matches first
  for (const [key, abbrev] of Object.entries(abbreviations)) {
    if (journalLower === key || journalLower.startsWith(key + ' ') || journalLower.includes(' ' + key)) {
      return abbrev
    }
  }
  
  // Try partial matches
  for (const [key, abbrev] of Object.entries(abbreviations)) {
    if (journalLower.includes(key)) {
      return abbrev
    }
  }
  
  // Special handling for long journal names
  if (journal.length > maxLength) {
    // Try to find a good break point (after common words)
    const breakPoints = [' of ', ' and ', ' & ', ' in ', ' the ']
    for (const breakPoint of breakPoints) {
      const index = journalLower.indexOf(breakPoint, maxLength - 10)
      if (index > 0 && index < maxLength) {
        return journal.substring(0, index) + '...'
      }
    }
    // Just truncate
    return journal.substring(0, maxLength - 3) + '...'
  }
  
  return journal
}

interface EvidenceCitationPillProps {
  citation: EvidenceCitation
  size?: "sm" | "md"
  showEvidenceLevel?: boolean
  className?: string
}

const LEVEL_DOT_COLORS: Record<number, string> = {
  1: "bg-emerald-400",
  2: "bg-blue-400",
  3: "bg-amber-400",
  4: "bg-orange-400",
  5: "bg-gray-400",
}

/**
 * Evidence Citation Pill - OpenEvidence-style citation with favicon and journal name
 */
export function EvidenceCitationPill({
  citation,
  size = "sm",
  showEvidenceLevel = true,
  className,
}: EvidenceCitationPillProps) {
  const [isPopupOpen, setIsPopupOpen] = useState(false)
  const [mounted, setMounted] = useState(false)
  const anchorRef = useRef<HTMLSpanElement>(null)
  const [popupPosition, setPopupPosition] = useState<{ x: number; y: number } | null>(null)
  const [faviconError, setFaviconError] = useState(false)

  // Mount check for portal
  useEffect(() => {
    setMounted(true)
  }, [])

  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    
    if (anchorRef.current) {
      const rect = anchorRef.current.getBoundingClientRect()
      const scrollY = window.scrollY
      const scrollX = window.scrollX
      
      let x = rect.right + 12 + scrollX
      let y = rect.top + scrollY - 10
      
      // Check bounds
      const popupWidth = 420
      const popupHeight =
        citation.previewReference || (citation.figureReferences?.length ?? 0) > 0
          ? 460
          : 320
      
      if (x + popupWidth > window.innerWidth + scrollX) {
        x = rect.left - popupWidth - 12 + scrollX
      }
      if (y + popupHeight > window.innerHeight + scrollY) {
        y = window.innerHeight + scrollY - popupHeight - 16
      }
      if (y < scrollY + 16) {
        y = scrollY + 16
      }
      
      setPopupPosition({ x, y })
    }
    
    setIsPopupOpen(true)
  }

  const isUploadCitation = citation.sourceType === "user_upload"
  const uploadDisplayName =
    citation.uploadFileName || citation.sourceLabel || citation.title || "Your upload"
  const sourceFromUrl = isUploadCitation ? null : getSourceDisplayFromUrl(citation.url)
  const inferredSourceFromPmid =
    !isUploadCitation && !sourceFromUrl && citation.pmid ? "PubMed" : null
  const effectiveSourceLabel = isUploadCitation
    ? uploadDisplayName
    : sourceFromUrl?.label ||
      inferredSourceFromPmid ||
      (!isGenericSourceLabel(citation.sourceLabel) ? citation.sourceLabel : null) ||
      citation.journal ||
      "Source"
  const shortName = shortenJournalName(effectiveSourceLabel, 20)

  const inlineVisuals: UploadVisualReference[] = (() => {
    const out: UploadVisualReference[] = []
    if (citation.previewReference?.signedUrl) {
      out.push(citation.previewReference)
    }
    for (const fig of citation.figureReferences || []) {
      if (fig?.signedUrl && out.length < 3) {
        out.push(fig)
      }
    }
    return out
  })()

  // Try to get favicon - first from journal name, then from DOI domain
  let faviconUrl = isUploadCitation
    ? null
    : sourceFromUrl?.faviconUrl ||
      (citation.pmid ? "https://www.ncbi.nlm.nih.gov/favicon.ico" : null) ||
      getJournalFavicon(effectiveSourceLabel)
  
  // Fallback: try to extract favicon from DOI URL if available
  if (!faviconUrl && citation.doi) {
    try {
      if (citation.doi.includes('10.1016')) {
        faviconUrl = 'https://www.elsevier.com/favicon.ico'
      } else if (citation.doi.includes('10.1371')) {
        faviconUrl = 'https://journals.plos.org/favicon.ico'
      } else if (citation.doi.includes('10.1186')) {
        faviconUrl = 'https://www.biomedcentral.com/favicon.ico'
      } else if (citation.doi.includes('10.1007')) {
        faviconUrl = 'https://www.springer.com/favicon.ico'
      } else if (citation.doi.includes('10.1111') || citation.doi.includes('10.1002')) {
        faviconUrl = 'https://www.wiley.com/favicon.ico'
      } else if (citation.doi.includes('10.1093')) {
        faviconUrl = 'https://academic.oup.com/favicon.ico'
      }
    } catch (e) {
      // Ignore errors
    }
  }
  
  return (
    <>
      <span className="inline-flex max-w-full items-center gap-1 align-baseline">
        <span
          ref={anchorRef}
          onClick={handleClick}
          className={cn(
            "inline-flex cursor-pointer items-center gap-1 rounded-full",
            "h-5 max-w-36 overflow-hidden py-0 pr-2 pl-1",
            "bg-muted text-muted-foreground transition-colors duration-150",
            "hover:bg-muted-foreground/20 hover:text-foreground",
            size === "sm" ? "text-[11px]" : "text-xs",
            className
          )}
        >
          {/* Favicon or fallback icon */}
          {faviconUrl && !faviconError ? (
            <img 
              src={faviconUrl} 
              alt=""
              className="size-3.5 rounded-full object-contain shrink-0"
              onError={() => setFaviconError(true)}
            />
          ) : (
            // Use a more subtle fallback icon that matches the design
            <BookOpen weight="fill" className="size-3.5 shrink-0 text-muted-foreground/70" />
          )}
          
          {/* Evidence level dot */}
          {showEvidenceLevel && citation.evidenceLevel >= 1 && citation.evidenceLevel <= 5 && (
            <span
              className={cn(
                "size-1.5 shrink-0 rounded-full",
                LEVEL_DOT_COLORS[citation.evidenceLevel] || "bg-gray-400"
              )}
              title={`Level ${citation.evidenceLevel}: ${EVIDENCE_LEVEL_LABELS[citation.evidenceLevel] || "Unknown"}`}
            />
          )}

          {/* Journal name - truncate if too long */}
          <span className="min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap font-normal">
            {shortName}
          </span>
        </span>

        {inlineVisuals.length > 0 ? (
          <span
            className="inline-flex shrink-0 items-center gap-0.5"
            aria-label="Linked figures from source"
          >
            {inlineVisuals.map((visual) => (
              <button
                key={visual.assetId}
                type="button"
                onClick={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  handleClick(e)
                }}
                className="ring-border hover:ring-primary/40 relative h-5 w-5 shrink-0 overflow-hidden rounded-md ring-1 transition ring-offset-1 ring-offset-background"
                title={visual.caption || visual.label}
              >
                <img
                  src={visual.signedUrl || ""}
                  alt=""
                  className="h-full w-full object-cover"
                />
              </button>
            ))}
          </span>
        ) : null}
      </span>

      {/* Evidence Popup */}
      {mounted && isPopupOpen && popupPosition && createPortal(
        <EvidencePopup
          citation={citation}
          position={popupPosition}
          onClose={() => setIsPopupOpen(false)}
        />,
        document.body
      )}
    </>
  )
}

interface EvidencePopupProps {
  citation: EvidenceCitation
  position: { x: number; y: number }
  onClose: () => void
}

function EvidencePopup({ citation, position, onClose }: EvidencePopupProps) {
  const evidenceColor = EVIDENCE_LEVEL_COLORS[citation.evidenceLevel] || 'bg-gray-500'
  const evidenceLabel = EVIDENCE_LEVEL_LABELS[citation.evidenceLevel] || 'Unknown'
  const citationAuthors = Array.isArray(citation.authors) ? citation.authors : []
  const isUploadCitation =
    citation.sourceType === "user_upload" &&
    typeof citation.url === "string" &&
    citation.url.startsWith("/uploads/")
  const sourceFromUrl = getSourceDisplayFromUrl(citation.url)
  const inferredSourceFromPmid = !sourceFromUrl && citation.pmid ? "PubMed" : null
  const ctaSourceLabel =
    sourceFromUrl?.label ||
    inferredSourceFromPmid ||
    (!isGenericSourceLabel(citation.sourceLabel) ? citation.sourceLabel : null) ||
    citation.journal ||
    "Source"
  const primaryHref = citation.url || "#"
  const primaryTarget = isUploadCitation ? undefined : "_blank"
  const primaryRel = isUploadCitation ? undefined : "noopener noreferrer"
  const visualReferences = [
    ...(citation.previewReference ? [citation.previewReference] : []),
    ...(citation.figureReferences || []),
  ].filter((item) => item?.signedUrl)

  const formatAuthors = (authors: string[]): string => {
    if (authors.length === 0) return ''
    if (authors.length === 1) return authors[0]
    return `${authors[0]} et al.`
  }

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement
      if (!target.closest('[data-evidence-popup]')) {
        onClose()
      }
    }
    document.addEventListener('click', handleClickOutside)
    return () => document.removeEventListener('click', handleClickOutside)
  }, [onClose])

  const authorStr = formatAuthors(citationAuthors)
  const journalStr = citation.sourceLabel || citation.journal || ""
  const metaLine = [
    journalStr,
    citation.studyType,
    citation.year,
  ].filter(Boolean).join("  ·  ")

  return (
    <AnimatePresence>
      <motion.div
        data-evidence-popup
        initial={{ opacity: 0, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 4 }}
        transition={{ duration: 0.15, ease: "easeOut" }}
        className="fixed z-50 w-[380px] overflow-hidden rounded-lg border border-border/80 bg-popover text-popover-foreground shadow-lg"
        style={{ left: position.x, top: position.y }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-3.5 space-y-2.5">
          {/* Title row */}
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              {citation.url ? (
                isUploadCitation ? (
                  <Link
                    href={primaryHref}
                    className="block text-[13px] font-medium leading-snug text-foreground hover:text-primary transition-colors line-clamp-2"
                  >
                    {citation.title}
                  </Link>
                ) : (
                  <a
                    href={primaryHref}
                    target={primaryTarget}
                    rel={primaryRel}
                    className="block text-[13px] font-medium leading-snug text-foreground hover:text-primary transition-colors line-clamp-2"
                  >
                    {citation.title}
                  </a>
                )
              ) : (
                <h4 className="text-[13px] font-medium leading-snug line-clamp-2">
                  {citation.title}
                </h4>
              )}
            </div>
            <button
              onClick={onClose}
              className="mt-0.5 shrink-0 rounded p-0.5 text-muted-foreground/60 hover:text-foreground transition-colors"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>

          {/* Meta line with GRADE indicator */}
          <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
            <span className={cn(
              "inline-flex shrink-0 items-center rounded px-1.5 py-0.5 text-[10px] font-semibold text-white",
              evidenceColor
            )}>
              L{citation.evidenceLevel}
            </span>
            <span className={cn(
              "inline-flex shrink-0 items-center rounded px-1.5 py-0.5 text-[10px] font-medium",
              gradeColorForLevel(citation.evidenceLevel, citation.studyType || undefined)
            )}>
              {gradeLabelForLevel(citation.evidenceLevel, citation.studyType || undefined)}
            </span>
            <span className="truncate">{metaLine}</span>
          </div>

          {/* Author */}
          {authorStr && (
            <p className="text-[11px] text-muted-foreground/80 truncate">
              {authorStr}
            </p>
          )}

          {/* Snippet */}
          {citation.snippet && (
            <p className="text-[11px] leading-relaxed text-muted-foreground line-clamp-3">
              {citation.snippet}
            </p>
          )}

          {/* Visuals */}
          {visualReferences.length > 0 && (
            <div className="flex gap-1.5 overflow-x-auto">
              {visualReferences.slice(0, 3).map((visual) => (
                <a
                  key={visual.assetId}
                  href={primaryHref}
                  target={isUploadCitation ? undefined : "_blank"}
                  rel={isUploadCitation ? undefined : "noopener noreferrer"}
                  className="shrink-0"
                >
                  <div className="h-16 w-20 overflow-hidden rounded border border-border/60">
                    <img
                      src={visual.signedUrl || ""}
                      alt={visual.label}
                      className="h-full w-full object-cover"
                    />
                  </div>
                </a>
              ))}
            </div>
          )}

          {/* Footer actions */}
          <div className="flex items-center gap-3 pt-1.5">
            {citation.url && (
              isUploadCitation ? (
                <Link
                  href={primaryHref}
                  className="inline-flex items-center gap-1 text-[11px] font-medium text-primary hover:text-primary/80 transition-colors"
                >
                  Open source
                  <ArrowSquareOut className="h-3 w-3" />
                </Link>
              ) : (
                <a
                  href={primaryHref}
                  target={primaryTarget}
                  rel={primaryRel}
                  className="inline-flex items-center gap-1 text-[11px] font-medium text-primary hover:text-primary/80 transition-colors"
                >
                  {ctaSourceLabel}
                  <ArrowSquareOut className="h-3 w-3" />
                </a>
              )
            )}
            {citation.doi && citation.sourceType !== "user_upload" && (
              <a
                href={`https://doi.org/${citation.doi}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-[11px] text-muted-foreground/70 hover:text-foreground transition-colors"
              >
                {citation.doi}
              </a>
            )}
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  )
}

/**
 * Evidence Summary Badge - Shows overall evidence quality
 */
interface EvidenceSummaryBadgeProps {
  totalSources: number
  highestEvidenceLevel: number
  className?: string
}

export function EvidenceSummaryBadge({
  totalSources,
  highestEvidenceLevel,
  className,
}: EvidenceSummaryBadgeProps) {
  if (totalSources === 0) return null

  const evidenceColor = EVIDENCE_LEVEL_COLORS[highestEvidenceLevel] || 'bg-gray-500'
  const evidenceShort = EVIDENCE_LEVEL_SHORT[highestEvidenceLevel] || '?'

  return (
    <div className={cn(
      "inline-flex items-center gap-2 rounded-lg bg-accent/50 px-3 py-1.5 text-xs",
      className
    )}>
      <span className="text-muted-foreground">
        {totalSources} source{totalSources !== 1 ? 's' : ''}
      </span>
      <span className="text-muted-foreground">•</span>
      <span className="flex items-center gap-1">
        <span className="text-muted-foreground">Best evidence:</span>
        <span className={cn(
          "px-1.5 py-0.5 rounded text-[10px] font-semibold text-white",
          evidenceColor
        )}>
          {evidenceShort}
        </span>
      </span>
    </div>
  )
}

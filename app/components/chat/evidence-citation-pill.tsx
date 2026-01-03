"use client"

import { cn } from "@/lib/utils"
import { useState, useRef, useEffect } from "react"
import { motion, AnimatePresence } from "motion/react"
import { createPortal } from "react-dom"
import { 
  X, 
  ArrowSquareOut, 
  Book, 
  Flask, 
  Users, 
  FileText,
  Star,
  CaretRight,
  Newspaper,
  BookOpen
} from "@phosphor-icons/react"
import type { EvidenceCitation } from "@/lib/evidence/types"
import { 
  EVIDENCE_LEVEL_COLORS, 
  EVIDENCE_LEVEL_SHORT,
  EVIDENCE_LEVEL_LABELS 
} from "@/lib/evidence/types"

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

/**
 * Evidence Citation Pill - OpenEvidence-style citation with favicon and journal name
 */
export function EvidenceCitationPill({
  citation,
  size = "sm",
  showEvidenceLevel = false,
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
      const popupHeight = 320
      
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

  // Try to get favicon - first from journal name, then from DOI domain
  let faviconUrl = getJournalFavicon(citation.journal)
  
  // Fallback: try to extract favicon from DOI URL if available
  if (!faviconUrl && citation.doi) {
    try {
      const doiUrl = `https://doi.org/${citation.doi}`
      // Extract domain from DOI resolver
      // Most DOIs resolve to publisher domains, we can try common ones
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
  
  const shortName = shortenJournalName(citation.journal)

  return (
    <>
      <span
        ref={anchorRef}
        onClick={handleClick}
        className={cn(
          "inline-flex items-center gap-1.5 cursor-pointer transition-all duration-150",
          "rounded-full px-2.5 py-1",
          "bg-zinc-700/80 hover:bg-zinc-600/80",
          "text-zinc-100",
          "hover:scale-[1.02] active:scale-[0.98]",
          "w-[120px] h-6", // Fixed width and height for consistent sizing
          size === "sm" ? "text-xs" : "text-sm",
          className
        )}
      >
        {/* Favicon or fallback icon */}
        {faviconUrl && !faviconError ? (
          <img 
            src={faviconUrl} 
            alt=""
            className="w-4 h-4 rounded-sm object-contain flex-shrink-0"
            onError={() => setFaviconError(true)}
          />
        ) : (
          // Use a more subtle fallback icon that matches the design
          <BookOpen weight="fill" className="w-4 h-4 text-zinc-400 flex-shrink-0" />
        )}
        
        {/* Journal name - truncate if too long */}
        <span className="font-medium whitespace-nowrap overflow-hidden text-ellipsis min-w-0 flex-1">
          {shortName}
        </span>
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

  const formatAuthors = (authors: string[]): string => {
    if (authors.length === 0) return 'Unknown authors'
    if (authors.length === 1) return authors[0]
    if (authors.length <= 3) return authors.join(', ')
    return `${authors.slice(0, 3).join(', ')}, et al.`
  }

  // Close on click outside
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

  return (
    <AnimatePresence>
      <motion.div
        data-evidence-popup
        initial={{ opacity: 0, scale: 0.95, y: -5 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: -5 }}
        transition={{ type: "spring", duration: 0.25, bounce: 0 }}
        className="fixed z-50 w-[420px] rounded-xl border border-border bg-popover text-popover-foreground shadow-xl"
        style={{ left: position.x, top: position.y }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header with evidence level */}
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <div className="flex items-center gap-2">
            <span className={cn(
              "flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold text-white",
              evidenceColor
            )}>
              <Star weight="fill" className="h-3 w-3" />
              Level {citation.evidenceLevel}
            </span>
            <span className="text-xs text-muted-foreground">
              {evidenceLabel}
            </span>
          </div>
          <button
            onClick={onClose}
            className="rounded-full p-1 text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 space-y-3">
          {/* Title */}
          {citation.url ? (
            <a
              href={citation.url}
              target="_blank"
              rel="noopener noreferrer"
              className="block text-sm font-medium leading-snug text-primary hover:text-primary/80 transition-colors"
            >
              [{citation.index}] {citation.title}
              <ArrowSquareOut className="inline ml-1 h-3.5 w-3.5" />
            </a>
          ) : (
            <h4 className="text-sm font-medium leading-snug">
              [{citation.index}] {citation.title}
            </h4>
          )}

          {/* Metadata Grid */}
          <div className="grid grid-cols-2 gap-2 text-xs">
            {/* Journal */}
            <div className="flex items-start gap-1.5 text-muted-foreground">
              <Book className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
              <span>{citation.journal}{citation.year ? `, ${citation.year}` : ''}</span>
            </div>
            
            {/* Study Type */}
            {citation.studyType && (
              <div className="flex items-start gap-1.5 text-muted-foreground">
                <Flask className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
                <span>{citation.studyType}</span>
              </div>
            )}
            
            {/* Sample Size */}
            {citation.sampleSize && (
              <div className="flex items-start gap-1.5 text-muted-foreground">
                <Users className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
                <span>n = {citation.sampleSize.toLocaleString()}</span>
              </div>
            )}

            {/* Authors */}
            {citation.authors.length > 0 && (
              <div className="flex items-start gap-1.5 text-muted-foreground col-span-2">
                <FileText className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
                <span>{formatAuthors(citation.authors)}</span>
              </div>
            )}
          </div>

          {/* MeSH Terms */}
          {citation.meshTerms.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {citation.meshTerms.slice(0, 5).map((term, i) => (
                <span
                  key={i}
                  className="inline-flex items-center rounded bg-accent px-1.5 py-0.5 text-[10px] text-muted-foreground"
                >
                  {term}
                </span>
              ))}
              {citation.meshTerms.length > 5 && (
                <span className="text-[10px] text-muted-foreground">
                  +{citation.meshTerms.length - 5} more
                </span>
              )}
            </div>
          )}

          {/* Snippet */}
          {citation.snippet && (
            <p className="text-xs text-muted-foreground leading-relaxed line-clamp-3 border-l-2 border-primary/30 pl-3 italic">
              "{citation.snippet}"
            </p>
          )}

          {/* Actions */}
          <div className="flex items-center gap-2 pt-2 border-t border-border">
            {citation.url && (
              <a
                href={citation.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:text-primary/80 transition-colors"
              >
                View on PubMed
                <CaretRight className="h-3 w-3" />
              </a>
            )}
            {citation.doi && (
              <a
                href={`https://doi.org/${citation.doi}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                DOI: {citation.doi.substring(0, 20)}...
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

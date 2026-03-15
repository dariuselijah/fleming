"use client"

import { cn } from "@/lib/utils"
import { useState, useRef, useEffect } from "react"
import { CitationPopup, type CitationData } from "./citation-popup"
import { GlobeHemisphereWest } from "@phosphor-icons/react"
import { getFavicon } from "./utils"

interface JournalCitationTagProps {
  citations: CitationData[]
  className?: string
}

// Journal abbreviation mapping - matches OpenEvidence style
const JOURNAL_ABBREVIATIONS: Record<string, string> = {
  'JAMA': 'JN JAMA',
  'Journal of the American Medical Association': 'JN JAMA',
  'JAMA Pediatrics': 'JN JAMA',
  'JAMA Internal Medicine': 'JN JAMA',
  'JAMA Surgery': 'JN JAMA',
  'Scientific Reports': 'Scientific Repor',
  'Nature': 'Nature',
  'NEJM': 'NEJM',
  'New England Journal of Medicine': 'NEJM',
  'The Lancet': 'Lancet',
  'BMJ': 'BMJ',
  'Annals of Internal Medicine': 'Annals Intern Med',
  'Developmental Cognitive Neuroscience': 'Developmental Cogn Neurosci',
  'The Journal of Clinical Endocrinology and Metabolism': 'J Clin Endocrinol Metab',
  'The American Journal of Clinical Nutrition': 'Am J Clin Nutr',
  'Diabetes Care': 'Diabetes Care',
  'Cell': 'Cell',
  'Science': 'Science',
}

/**
 * Get journal abbreviation for display
 */
function getJournalAbbreviation(journal: string): string {
  // Check exact match first
  if (JOURNAL_ABBREVIATIONS[journal]) {
    return JOURNAL_ABBREVIATIONS[journal]
  }
  
  // Check partial matches
  for (const [fullName, abbr] of Object.entries(JOURNAL_ABBREVIATIONS)) {
    if (journal.includes(fullName) || fullName.includes(journal)) {
      return abbr
    }
  }
  
  // Default: truncate to 12 chars like OpenEvidence
  return journal.length > 12 ? journal.substring(0, 12) + '...' : journal
}

export function JournalCitationTag({ citations, className }: JournalCitationTagProps) {
  const [isPopupOpen, setIsPopupOpen] = useState(false)
  const [activeCitationIndex, setActiveCitationIndex] = useState(0)
  const [isHovering, setIsHovering] = useState(false)
  const [faviconFailed, setFaviconFailed] = useState(false)
  const anchorRef = useRef<HTMLElement>(null)
  
  if (citations.length === 0) return null
  
  // Get journal abbreviation for first citation
  const firstCitation = citations[0]
  const journalAbbr = getJournalAbbreviation(firstCitation.journal)
  
  // Count additional citations
  const additionalCount = citations.length - 1
  
  const handleClick = () => {
    setActiveCitationIndex(0)
    setIsPopupOpen(true)
  }

  const handleClose = () => {
    setIsPopupOpen(false)
  }

  const hoverTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const closeTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  const handleMouseEnter = () => {
    setIsHovering(true)
    // Clear any pending close timeout
    if (closeTimeoutRef.current) {
      clearTimeout(closeTimeoutRef.current)
      closeTimeoutRef.current = null
    }
    // Show popup on hover after a short delay
    hoverTimeoutRef.current = setTimeout(() => {
      setActiveCitationIndex(0)
      setIsPopupOpen(true)
    }, 300)
  }

  const handleMouseLeave = () => {
    setIsHovering(false)
    // Clear any pending hover timeout
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current)
      hoverTimeoutRef.current = null
    }
    // Close popup when mouse leaves (with small delay to allow moving to popup)
    closeTimeoutRef.current = setTimeout(() => {
      setIsPopupOpen(false)
    }, 200)
  }

  const activeCitation = citations[activeCitationIndex]
  const faviconUrl = getFavicon(firstCitation.url || null)
  const showFavicon = Boolean(faviconUrl && !faviconFailed)

  // Get URL for first citation to make it clickable
  const citationUrl = firstCitation.url

  return (
    <>
      {citationUrl ? (
        <a
          href={citationUrl}
          target="_blank"
          rel="noopener noreferrer"
          ref={anchorRef as React.RefObject<HTMLAnchorElement>}
          className={cn(
            "inline-flex cursor-pointer items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
            "border-border/70 bg-muted/35 text-foreground/90 hover:bg-muted/60",
            "relative z-10 no-underline",
            className
          )}
          onClick={(e) => {
            // Still show popup on click, but also allow link to work
            e.stopPropagation()
            handleClick()
          }}
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
        >
          {showFavicon ? (
            <img
              src={faviconUrl || ""}
              alt=""
              className="h-3.5 w-3.5 rounded-sm object-contain"
              onError={() => setFaviconFailed(true)}
            />
          ) : (
            <GlobeHemisphereWest className="h-3.5 w-3.5 text-muted-foreground" />
          )}
          {journalAbbr}
          {additionalCount > 0 && ` +${additionalCount}`}
        </a>
      ) : (
        <span
          ref={anchorRef}
          className={cn(
            "inline-flex cursor-pointer items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
            "border-border/70 bg-muted/35 text-foreground/90 hover:bg-muted/60",
            "relative z-10",
            className
          )}
          onClick={(e) => {
            e.preventDefault()
            e.stopPropagation()
            handleClick()
          }}
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
        >
          {showFavicon ? (
            <img
              src={faviconUrl || ""}
              alt=""
              className="h-3.5 w-3.5 rounded-sm object-contain"
              onError={() => setFaviconFailed(true)}
            />
          ) : (
            <GlobeHemisphereWest className="h-3.5 w-3.5 text-muted-foreground" />
          )}
          {journalAbbr}
          {additionalCount > 0 && ` +${additionalCount}`}
        </span>
      )}
      
      {activeCitation && isPopupOpen && (
        <CitationPopup
          citation={activeCitation}
          isOpen={isPopupOpen}
          onClose={handleClose}
          anchorElement={anchorRef.current}
        />
      )}
    </>
  )
}


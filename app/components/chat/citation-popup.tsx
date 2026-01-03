"use client"

import { cn } from "@/lib/utils"
import type { PubMedArticle } from "@/lib/pubmed/api"
import { X } from "@phosphor-icons/react"
import { AnimatePresence, motion } from "motion/react"
import { useEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"

interface CitationPopupProps {
  citation: CitationData
  isOpen: boolean
  onClose: () => void
  position?: { x: number; y: number }
  anchorElement?: HTMLElement | null
}

export interface CitationData {
  index: number
  title: string
  authors: string[]
  journal: string
  year: string
  url?: string
  doi?: string
  pmid?: string
  abstract?: string
  isNew?: boolean
}

const TRANSITION = {
  type: "spring",
  duration: 0.3,
  bounce: 0,
}

export function CitationPopup({
  citation,
  isOpen,
  onClose,
  position,
  anchorElement,
}: CitationPopupProps) {
  const [popupPosition, setPopupPosition] = useState<{ x: number; y: number } | null>(null)
  const popupRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!isOpen) return

    const updatePosition = () => {
      // Prefer anchorElement over position prop
      if (anchorElement) {
        const rect = anchorElement.getBoundingClientRect()
        const scrollY = window.scrollY
        const scrollX = window.scrollX
        
        // Position popup to the right of the anchor, or adjust if it would go off screen
        let x = rect.right + 16 + scrollX
        let y = rect.top + scrollY
        
        // Check if popup would go off right edge
        if (popupRef.current) {
          const popupWidth = popupRef.current.offsetWidth || 400
          if (x + popupWidth > window.innerWidth + scrollX) {
            // Position to the left instead
            x = rect.left - popupWidth - 16 + scrollX
          }
          
          // Check if popup would go off bottom edge
          const popupHeight = popupRef.current.offsetHeight || 300
          if (y + popupHeight > window.innerHeight + scrollY) {
            y = window.innerHeight + scrollY - popupHeight - 16
          }
          
          // Ensure popup doesn't go off top edge
          if (y < scrollY + 16) {
            y = scrollY + 16
          }
        }
        
        setPopupPosition({ x, y })
      } else if (position) {
        setPopupPosition(position)
      } else {
        // Default: center of viewport
        setPopupPosition({
          x: window.innerWidth / 2 - 200,
          y: window.innerHeight / 2 - 150,
        })
      }
    }

    // Initial position
    updatePosition()
    
    // Update on scroll/resize
    window.addEventListener('scroll', updatePosition, true)
    window.addEventListener('resize', updatePosition)

    return () => {
      window.removeEventListener('scroll', updatePosition, true)
      window.removeEventListener('resize', updatePosition)
    }
  }, [isOpen, anchorElement, position])

  const formatAuthors = (authors: string[]): string => {
    if (authors.length === 0) return ''
    if (authors.length === 1) return authors[0]
    if (authors.length <= 3) return authors.join(', ')
    return `${authors.slice(0, 3).join(', ')}, et al.`
  }

  // Use portal to avoid HTML nesting issues
  const [mounted, setMounted] = useState(false)
  useEffect(() => {
    setMounted(true)
    return () => setMounted(false)
  }, [])

  if (!isOpen || !mounted || !popupPosition) return null

  const popupContent = (
    <AnimatePresence>
      {isOpen && popupPosition && (
        <motion.div
          ref={popupRef}
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          transition={TRANSITION}
          className="bg-popover border-border text-popover-foreground fixed z-50 w-[400px] rounded-lg border shadow-lg"
          style={{
            left: `${popupPosition.x}px`,
            top: `${popupPosition.y}px`,
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="relative p-4">
            <div className="mb-3 flex items-center justify-between border-b border-border pb-2">
              <h3 className="text-sm font-semibold">
                {citation.index} Reference
              </h3>
              <button
                onClick={onClose}
                className="text-muted-foreground hover:text-foreground rounded-sm p-1 transition-colors"
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            
            <div>
              {citation.url ? (
                <a
                  href={citation.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mb-2 line-clamp-2 text-sm font-medium leading-tight text-orange-600 dark:text-orange-400 hover:text-orange-700 dark:hover:text-orange-300 no-underline block cursor-pointer"
                >
                  {citation.index}. {citation.title}
                </a>
              ) : (
                <h4 className="mb-2 line-clamp-2 text-sm font-medium leading-tight text-orange-600 dark:text-orange-400">
                  {citation.index}. {citation.title}
                </h4>
              )}
              
              <div className="text-muted-foreground space-y-1 text-xs mt-2">
                <div className="flex items-center gap-1.5">
                  <span className="inline-block w-2 h-2 rounded-full bg-green-500 dark:bg-green-400 flex-shrink-0"></span>
                  <span className="font-medium">{citation.journal}</span>
                  {citation.year && `. ${citation.year}`}
                  {citation.isNew && (
                    <span className="bg-purple-500 text-white rounded px-1.5 py-0.5 text-xs font-medium ml-2">
                      New
                    </span>
                  )}
                </div>
                {citation.authors && citation.authors.length > 0 && (
                  <div>
                    {formatAuthors(citation.authors)}
                  </div>
                )}
                {citation.doi && (
                  <div className="text-xs">
                    DOI: {citation.doi}
                  </div>
                )}
                {citation.pmid && (
                  <div className="text-xs">
                    PMID: {citation.pmid}
                  </div>
                )}
              </div>
              
              {citation.abstract && (
                <p className="text-muted-foreground mt-3 line-clamp-3 text-xs leading-relaxed">
                  {citation.abstract}
                </p>
              )}
              
              {citation.url && (
                <a
                  href={citation.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:text-primary/80 mt-3 inline-block text-xs font-medium underline"
                  onClick={(e) => e.stopPropagation()}
                >
                  View on {citation.url.includes('pubmed') ? 'PubMed' : 
                           citation.url.includes('jama') ? 'JAMA' :
                           citation.url.includes('nejm') ? 'NEJM' :
                           citation.url.includes('aafp') ? 'AAFP' :
                           citation.url.includes('uptodate') ? 'UpToDate' : 'Source'} →
                </a>
              )}
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )

  return createPortal(popupContent, document.body)
}


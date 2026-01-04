"use client"

import { cn } from "@/lib/utils"
import { useState } from "react"
import { motion, AnimatePresence } from "motion/react"
import { 
  CaretDown, 
  CaretUp, 
  Book, 
  Star,
  ArrowSquareOut,
  ThumbsUp,
  ThumbsDown
} from "@phosphor-icons/react"
import type { EvidenceCitation } from "@/lib/evidence/types"
import { 
  EVIDENCE_LEVEL_COLORS, 
  EVIDENCE_LEVEL_SHORT,
  EVIDENCE_LEVEL_LABELS 
} from "@/lib/evidence/types"

interface EvidenceReferencesSectionProps {
  citations: EvidenceCitation[]
  className?: string
}

/**
 * Evidence References Section - OpenEvidence-style references list
 * Shows at the bottom of the message with evidence quality indicators
 */
export function EvidenceReferencesSection({
  citations,
  className,
}: EvidenceReferencesSectionProps) {
  const [isExpanded, setIsExpanded] = useState(false)
  // Track which citations have been rated (for UI feedback only)
  const [ratedCitations, setRatedCitations] = useState<Map<number, 'up' | 'down'>>(new Map())

  if (citations.length === 0) return null

  // Group citations by evidence level
  const byLevel = citations.reduce((acc, c) => {
    const level = c.evidenceLevel
    if (!acc[level]) acc[level] = []
    acc[level].push(c)
    return acc
  }, {} as Record<number, EvidenceCitation[]>)

  // Get evidence summary
  const highestLevel = Math.min(...citations.map(c => c.evidenceLevel))
  const studyTypeCounts = citations.reduce((acc, c) => {
    const type = c.studyType || 'Unknown'
    acc[type] = (acc[type] || 0) + 1
    return acc
  }, {} as Record<string, number>)

  const formatAuthors = (authors: string[]): string => {
    if (authors.length === 0) return ''
    if (authors.length === 1) return authors[0]
    return `${authors[0]} et al.`
  }

  const handleCitationRating = (citation: EvidenceCitation, rating: 'up' | 'down') => {
    // Log the rating action
    console.log('📊 [CITATION RATING]', {
      action: rating === 'up' ? 'thumbs_up' : 'thumbs_down',
      citationIndex: citation.index,
      citationTitle: citation.title,
      citationPmid: citation.pmid,
      citationDoi: citation.doi,
      citationJournal: citation.journal,
      citationYear: citation.year,
      evidenceLevel: citation.evidenceLevel,
      studyType: citation.studyType,
      timestamp: new Date().toISOString(),
    })

    // Update UI state for visual feedback
    setRatedCitations(prev => {
      const newMap = new Map(prev)
      // Toggle if clicking the same rating, otherwise set new rating
      if (newMap.get(citation.index) === rating) {
        newMap.delete(citation.index)
      } else {
        newMap.set(citation.index, rating)
      }
      return newMap
    })
  }

  return (
    <div className={cn(
      "mt-4 rounded-xl border border-border bg-accent/30 overflow-hidden",
      className
    )}>
      {/* Header - Always visible */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-accent/50 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <Book className="h-4 w-4 text-primary" />
            <span className="text-sm font-medium">
              {citations.length} Reference{citations.length !== 1 ? 's' : ''}
            </span>
          </div>
          
          {/* Evidence quality summary */}
          <div className="flex items-center gap-1.5">
            <span className={cn(
              "flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold text-white",
              EVIDENCE_LEVEL_COLORS[highestLevel]
            )}>
              <Star weight="fill" className="h-2.5 w-2.5" />
              {EVIDENCE_LEVEL_SHORT[highestLevel]}
            </span>
            
            {/* Study type badges */}
            {Object.entries(studyTypeCounts).slice(0, 3).map(([type, count]) => (
              <span
                key={type}
                className="px-1.5 py-0.5 rounded bg-accent text-[10px] text-muted-foreground"
              >
                {count} {type}
              </span>
            ))}
          </div>
        </div>
        
        {isExpanded ? (
          <CaretUp className="h-4 w-4 text-muted-foreground" />
        ) : (
          <CaretDown className="h-4 w-4 text-muted-foreground" />
        )}
      </button>

      {/* Expanded content */}
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="border-t border-border"
          >
            <div className="p-4 space-y-4">
              {/* Group by evidence level */}
              {[1, 2, 3, 4, 5].map(level => {
                const levelCitations = byLevel[level]
                if (!levelCitations || levelCitations.length === 0) return null

                return (
                  <div key={level} className="space-y-2">
                    {/* Level header */}
                    <div className="flex items-center gap-2">
                      <span className={cn(
                        "px-2 py-0.5 rounded text-[10px] font-semibold text-white",
                        EVIDENCE_LEVEL_COLORS[level]
                      )}>
                        Level {level}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {EVIDENCE_LEVEL_LABELS[level]}
                      </span>
                    </div>

                    {/* Citations in this level */}
                    <div className="space-y-2 pl-2 border-l-2 border-border">
                      {levelCitations.map((citation) => {
                        const rating = ratedCitations.get(citation.index)
                        return (
                          <div
                            key={citation.index}
                            className="group flex items-start gap-2 text-xs"
                          >
                            <span className="flex-shrink-0 w-5 h-5 flex items-center justify-center rounded bg-primary/10 text-primary text-[10px] font-semibold">
                              {citation.index}
                            </span>
                            
                            <div className="flex-1 min-w-0">
                              {citation.url ? (
                                <a
                                  href={citation.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="block font-medium text-foreground hover:text-primary transition-colors line-clamp-1"
                                >
                                  {citation.title}
                                  <ArrowSquareOut className="inline ml-1 h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                                </a>
                              ) : (
                                <span className="block font-medium text-foreground line-clamp-1">
                                  {citation.title}
                                </span>
                              )}
                              
                              <div className="flex items-center gap-2 text-muted-foreground mt-0.5">
                                <span>{formatAuthors(citation.authors)}</span>
                                {citation.authors.length > 0 && <span>•</span>}
                                <span>{citation.journal}</span>
                                {citation.year && (
                                  <>
                                    <span>•</span>
                                    <span>{citation.year}</span>
                                  </>
                                )}
                                {citation.sampleSize && (
                                  <>
                                    <span>•</span>
                                    <span>n={citation.sampleSize.toLocaleString()}</span>
                                  </>
                                )}
                              </div>
                            </div>

                            {/* Thumbs up/down buttons */}
                            <div className="flex-shrink-0 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                              <button
                                onClick={(e) => {
                                  e.preventDefault()
                                  e.stopPropagation()
                                  handleCitationRating(citation, 'up')
                                }}
                                className={cn(
                                  "p-1.5 rounded hover:bg-accent transition-colors",
                                  rating === 'up' && "bg-green-500/10"
                                )}
                                title="This citation was helpful"
                                aria-label="Thumbs up"
                              >
                                <ThumbsUp 
                                  className={cn(
                                    "h-3.5 w-3.5 transition-colors",
                                    rating === 'up' 
                                      ? "fill-green-500 text-green-500" 
                                      : "text-muted-foreground"
                                  )} 
                                />
                              </button>
                              <button
                                onClick={(e) => {
                                  e.preventDefault()
                                  e.stopPropagation()
                                  handleCitationRating(citation, 'down')
                                }}
                                className={cn(
                                  "p-1.5 rounded hover:bg-accent transition-colors",
                                  rating === 'down' && "bg-red-500/10"
                                )}
                                title="This citation was not helpful"
                                aria-label="Thumbs down"
                              >
                                <ThumbsDown 
                                  className={cn(
                                    "h-3.5 w-3.5 transition-colors",
                                    rating === 'down' 
                                      ? "fill-red-500 text-red-500" 
                                      : "text-muted-foreground"
                                  )} 
                                />
                              </button>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

/**
 * Compact evidence indicator for inline use
 */
interface EvidenceIndicatorProps {
  level: number
  className?: string
}

export function EvidenceIndicator({ level, className }: EvidenceIndicatorProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 px-1 py-px rounded text-[9px] font-semibold text-white",
        EVIDENCE_LEVEL_COLORS[level],
        className
      )}
      title={EVIDENCE_LEVEL_LABELS[level]}
    >
      <Star weight="fill" className="h-2 w-2" />
      {level}
    </span>
  )
}


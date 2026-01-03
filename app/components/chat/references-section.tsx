"use client"

import { cn } from "@/lib/utils"
import { CaretDown, ListNumbers } from "@phosphor-icons/react"
import { AnimatePresence, motion } from "motion/react"
import { useState } from "react"
import type { CitationData } from "./citation-popup"
import { CitationPopup } from "./citation-popup"

interface ReferencesSectionProps {
  citations: Map<number, CitationData>
  className?: string
}

const TRANSITION = {
  type: "spring",
  duration: 0.2,
  bounce: 0,
}

export function ReferencesSection({ citations, className }: ReferencesSectionProps) {
  const [isExpanded, setIsExpanded] = useState(true)
  const [popupCitation, setPopupCitation] = useState<{ citation: CitationData; index: number } | null>(null)

  if (citations.size === 0) return null

  const sortedCitations = Array.from(citations.entries())
    .sort(([a], [b]) => a - b)

  const formatAuthors = (authors: string[]): string => {
    if (authors.length === 0) return ''
    if (authors.length === 1) return authors[0]
    if (authors.length <= 6) return authors.join(', ')
    return `${authors.slice(0, 6).join(', ')}, et al.`
  }

  return (
    <div className={cn("my-6 border-t border-border pt-6", className)}>
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        type="button"
        className="hover:bg-accent flex w-full flex-row items-center gap-2 rounded-md px-2 py-2 transition-colors"
      >
        <ListNumbers className="h-4 w-4" />
        <span className="text-sm font-medium">
          References
        </span>
        <CaretDown
          className={cn(
            "ml-auto h-4 w-4 transition-transform",
            isExpanded ? "rotate-180 transform" : ""
          )}
        />
      </button>

      <AnimatePresence initial={false}>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={TRANSITION}
            className="overflow-hidden"
          >
            <ol className="mt-4 space-y-4">
              {sortedCitations.map(([index, citation]) => (
                <li
                  key={index}
                  className="group relative flex items-start gap-3 text-sm"
                >
                  <span className="text-foreground mt-0.5 flex-shrink-0 font-medium">
                    {index}.
                  </span>
                  <div className="min-w-0 flex-1">
                    <button
                      onClick={() => setPopupCitation({ citation, index })}
                      className="text-left hover:text-orange-600 dark:hover:text-orange-400 transition-colors w-full"
                    >
                      <h4 className="font-medium leading-tight text-orange-600 dark:text-orange-400 mb-1">
                        {citation.title}
                      </h4>
                    </button>
                    <div className="text-muted-foreground text-xs space-y-0.5">
                      <div>
                        <span className="font-medium">{citation.journal}</span>
                        {citation.year && `. ${citation.year}`}
                      </div>
                      <div>
                        {formatAuthors(citation.authors)}
                      </div>
                      {citation.doi && (
                        <div className="text-xs opacity-70">
                          DOI: {citation.doi}
                        </div>
                      )}
                      {citation.pmid && (
                        <div className="text-xs opacity-70">
                          PMID: {citation.pmid}
                        </div>
                      )}
                    </div>
                    {citation.url && (
                      <a
                        href={citation.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary hover:text-primary/80 mt-2 inline-block text-xs underline"
                        onClick={(e) => e.stopPropagation()}
                      >
                        View on {citation.url.includes('pubmed') ? 'PubMed' : 
                                 citation.url.includes('jama') ? 'JAMA' :
                                 citation.url.includes('nejm') ? 'NEJM' : 'Source'} →
                      </a>
                    )}
                  </div>
                  {citation.isNew && (
                    <span className="bg-purple-500 text-white rounded px-2 py-0.5 text-xs font-medium ml-auto flex-shrink-0">
                      New
                    </span>
                  )}
                </li>
              ))}
            </ol>
          </motion.div>
        )}
      </AnimatePresence>

      {popupCitation && (
        <CitationPopup
          citation={popupCitation.citation}
          isOpen={true}
          onClose={() => setPopupCitation(null)}
          position={{
            x: window.innerWidth / 2 - 200,
            y: window.innerHeight / 2 - 150,
          }}
        />
      )}
    </div>
  )
}


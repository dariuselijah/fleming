"use client"

import { cn } from "@/lib/utils"
import { useState, useRef } from "react"
import { CitationPopup, type CitationData } from "./citation-popup"

interface InlineCitationProps {
  indices: number[]
  citations: Map<number, CitationData>
  className?: string
}

export function InlineCitation({ indices, citations, className }: InlineCitationProps) {
  const [isPopupOpen, setIsPopupOpen] = useState(false)
  const [activeCitationIndex, setActiveCitationIndex] = useState<number | null>(null)
  const anchorRef = useRef<HTMLSpanElement>(null)

  const handleClick = (index: number) => {
    setActiveCitationIndex(index)
    setIsPopupOpen(true)
  }

  const handleClose = () => {
    setIsPopupOpen(false)
    setActiveCitationIndex(null)
  }

  // Get the first available citation for popup
  const activeCitation = activeCitationIndex !== null 
    ? citations.get(activeCitationIndex)
    : indices.length > 0 
      ? citations.get(indices[0])
      : null

  return (
    <>
      <span
        ref={anchorRef}
        className={cn(
          "bg-primary/10 text-primary hover:bg-primary/20 inline-flex cursor-pointer items-center gap-1 rounded px-1.5 py-0.5 text-xs font-medium transition-colors",
          className
        )}
        onClick={(e) => {
          e.preventDefault()
          e.stopPropagation()
          if (indices.length > 0) {
            handleClick(indices[0])
          }
        }}
        onMouseEnter={() => {
          // Optional: show popup on hover
          // if (indices.length > 0) {
          //   handleClick(indices[0])
          // }
        }}
      >
        {indices.map((idx, i) => (
          <span key={idx}>
            {idx}
            {i < indices.length - 1 && ','}
          </span>
        ))}
      </span>
      
      {activeCitation && (
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



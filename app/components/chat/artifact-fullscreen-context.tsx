"use client"

import React, { createContext, useContext, useState, ReactNode } from 'react'

interface ArtifactFullscreenContextType {
  isAnyArtifactFullscreen: boolean
  setArtifactFullscreen: (isFullscreen: boolean) => void
}

const ArtifactFullscreenContext = createContext<ArtifactFullscreenContextType | undefined>(undefined)

export function ArtifactFullscreenProvider({ children }: { children: ReactNode }) {
  const [isAnyArtifactFullscreen, setIsAnyArtifactFullscreen] = useState(false)

  const setArtifactFullscreen = (isFullscreen: boolean) => {
    setIsAnyArtifactFullscreen(isFullscreen)
    
    // Add/remove CSS class to body for global layout changes
    if (isFullscreen) {
      document.body.classList.add('artifact-fullscreen-active')
    } else {
      document.body.classList.remove('artifact-fullscreen-active')
    }
  }

  // Cleanup effect to remove body class when component unmounts
  React.useEffect(() => {
    return () => {
      document.body.classList.remove('artifact-fullscreen-active')
    }
  }, [])

  return (
    <ArtifactFullscreenContext.Provider value={{ isAnyArtifactFullscreen, setArtifactFullscreen }}>
      {children}
    </ArtifactFullscreenContext.Provider>
  )
}

export function useArtifactFullscreen() {
  const context = useContext(ArtifactFullscreenContext)
  if (context === undefined) {
    throw new Error('useArtifactFullscreen must be used within an ArtifactFullscreenProvider')
  }
  return context
}

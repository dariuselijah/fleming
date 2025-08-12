"use client"

import { useState, useRef, useEffect } from "react"
import { 
  FileText, 
  Copy, 
  PencilSimple, 
  Check, 
  X, 
  ArrowsOut, 
  ArrowsIn 
} from "@phosphor-icons/react"
import { useArtifactFullscreen } from "./artifact-fullscreen-context"

interface InlineArtifactProps {
  id: string
  title: string
  content: string
  contentType: string
  metadata: any
  created_at: string
  userId: string
  isAuthenticated: boolean
}

export function InlineArtifact({
  id,
  title,
  content,
  contentType,
  metadata,
  created_at,
  userId,
  isAuthenticated,
}: InlineArtifactProps) {
  const [isExpanded, setIsExpanded] = useState(false)
  const [isEditing, setIsEditing] = useState(false)
  const [editedContent, setEditedContent] = useState(content)
  const [isFullScreen, setIsFullScreen] = useState(false)
  const [isEntering, setIsEntering] = useState(false)
  const [isExiting, setIsExiting] = useState(false)
  const [cardPosition, setCardPosition] = useState({ 
    top: 0, 
    left: 0, 
    width: 0, 
    height: 0,
    deltaTop: 0,
    deltaLeft: 0,
    deltaWidth: 0,
    deltaHeight: 0
  })
  const { setArtifactFullscreen } = useArtifactFullscreen()
  const animationRef = useRef<HTMLDivElement>(null)
  const cardRef = useRef<HTMLDivElement>(null)

  const currentContent = isEditing ? editedContent : content

  // Clean up animation states
  useEffect(() => {
    if (!isFullScreen) {
      setIsEntering(false)
      setIsExiting(false)
    }
  }, [isFullScreen])

  const toggleExpansion = () => {
    setIsExpanded(!isExpanded)
  }

  const toggleFullScreen = () => {
    if (isFullScreen) {
      // Exit full screen - animate back to card position
      setIsExiting(true)
      setArtifactFullscreen(false)
      
      // Wait for exit animation, then hide
      setTimeout(() => {
        setIsFullScreen(false)
        setIsExiting(false)
      }, 300)
    } else {
      // Calculate card position and size before entering full screen
      if (cardRef.current) {
        const rect = cardRef.current.getBoundingClientRect()
        const fullScreenTop = 16 // right-4 = 16px
        const fullScreenLeft = window.innerWidth - (window.innerWidth * 0.7) - 16 // 70vw from right
        const fullScreenWidth = window.innerWidth * 0.7 - 32 // 70vw - 2rem
        const fullScreenHeight = window.innerHeight - 128 // 100vh - 8rem
        
        // Calculate the difference between card and full-screen positions
        const deltaTop = fullScreenTop - rect.top
        const deltaLeft = fullScreenLeft - rect.left
        const deltaWidth = fullScreenWidth - rect.width
        const deltaHeight = fullScreenHeight - rect.height
        
        setCardPosition({
          top: rect.top,
          left: rect.left,
          width: rect.width,
          height: rect.height,
          deltaTop,
          deltaLeft,
          deltaWidth,
          deltaHeight
        })
      }
      
      // Enter full screen - start from card position
      setIsFullScreen(true)
      setIsEntering(true)
      setArtifactFullscreen(true)
      
      // Remove entering state after animation
      setTimeout(() => {
        setIsEntering(false)
      }, 300)
    }
  }

  const handleEdit = () => {
    setIsEditing(true)
    setEditedContent(content)
  }

  const handleSave = async () => {
    try {
      const requestBody = {
        artifactId: id,
        content: editedContent,
        userId,
        isAuthenticated,
      }
      
      console.log('Saving artifact with data:', requestBody)
      
      const response = await fetch('/api/update-ai-artifact', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      })

      if (response.ok) {
        setIsEditing(false)
        // Update the local content
        // Note: In a real app, you might want to update the parent state
      } else {
        const errorData = await response.json().catch(() => ({}))
        console.error('Failed to save artifact:', errorData.error || 'Unknown error')
        // You could add a toast notification here to show the error to the user
      }
    } catch (error) {
      console.error('Error saving artifact:', error)
    }
  }

  const handleCancel = () => {
    setIsEditing(false)
    setEditedContent(content)
  }

  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(currentContent)
      // You could add a toast notification here
    } catch (err) {
      console.error('Failed to copy text: ', err)
    }
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    })
  }

  if (isFullScreen) {
    return (
      <>
        {/* Backdrop */}
        <div className={`fixed inset-0 bg-black/30 backdrop-blur-sm z-40 transition-opacity duration-300 ease-out ${
          isExiting ? 'opacity-0' : 'opacity-100'
        }`} />
        
        {/* Full-screen artifact */}
        <div 
          ref={animationRef}
          style={{
            position: 'fixed',
            top: isEntering || isExiting ? `${cardPosition.top}px` : '16px',
            left: isEntering || isExiting ? `${cardPosition.left}px` : `${typeof window !== 'undefined' ? window.innerWidth - (window.innerWidth * 0.7) - 16 : 0}px`,
            width: isEntering || isExiting ? `${cardPosition.width}px` : `${typeof window !== 'undefined' ? window.innerWidth * 0.7 - 32 : 0}px`,
            height: isEntering || isExiting ? `${cardPosition.height}px` : `${typeof window !== 'undefined' ? window.innerHeight - 128 : 0}px`,
            zIndex: 50,
            backgroundColor: 'hsl(var(--background))',
            border: '2px solid hsl(var(--border) / 0.5)',
            borderRadius: '12px',
            boxShadow: '0 25px 50px -12px rgb(0 0 0 / 0.25)',
            overflow: 'hidden',
            transition: 'all 300ms ease-out',
            opacity: isEntering || isExiting ? 0 : 1,
          }}
        >
          {/* Header */}
          <div className="flex items-center justify-between p-6 border-b border-border/50 bg-gradient-to-r from-muted/40 to-muted/20">
            <div className="flex items-center gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10">
                <FileText className="h-6 w-6 text-primary" />
              </div>
              <div>
                <h2 className="text-xl font-semibold text-foreground leading-tight">{title}</h2>
                <p className="text-base text-muted-foreground mt-1">
                  {formatDate(created_at)} • {contentType}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={copyToClipboard}
                className="p-3 hover:bg-accent rounded-xl transition-all duration-200 hover:scale-105"
                title="Copy to clipboard"
              >
                <Copy className="h-5 w-5" />
              </button>
              <button
                onClick={toggleFullScreen}
                className="p-3 hover:bg-accent rounded-xl transition-all duration-200 hover:scale-105"
                title="Exit full screen"
              >
                <ArrowsIn className="h-5 w-5" />
              </button>
            </div>
          </div>
          
          {/* Content */}
          <div className="p-6 h-full overflow-y-auto">
            {isEditing ? (
              <div className="space-y-6">
                <textarea
                  value={editedContent}
                  onChange={(e) => setEditedContent(e.target.value)}
                  className="w-full h-[calc(100vh-400px)] p-6 border-2 border-border/50 rounded-xl bg-background text-foreground resize-none focus:outline-none focus:ring-4 focus:ring-primary/20 focus:border-primary text-lg leading-relaxed font-sans"
                  placeholder="Edit artifact content..."
                />
                <div className="flex gap-4">
                  <button
                    onClick={handleSave}
                    className="px-6 py-3 bg-primary text-primary-foreground rounded-xl hover:bg-primary/90 transition-all duration-200 hover:scale-105 flex items-center gap-3 text-base font-medium shadow-lg"
                  >
                    <Check className="h-5 w-5" />
                    Save Changes
                  </button>
                  <button
                    onClick={handleCancel}
                    className="px-6 py-3 bg-muted text-foreground rounded-xl hover:bg-muted/80 transition-all duration-200 hover:scale-105 flex items-center gap-3 text-base font-medium"
                  >
                    <X className="h-5 w-5" />
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div className="prose prose-lg max-w-none dark:prose-invert">
                <div className="text-lg leading-relaxed text-foreground font-sans bg-muted/20 p-6 rounded-xl border border-border/30">
                  <pre className="whitespace-pre-wrap font-sans text-foreground bg-transparent p-0 m-0 text-lg leading-relaxed">
                    {currentContent}
                  </pre>
                </div>
              </div>
            )}
          </div>
        </div>
      </>
    )
  }

  return (
    <div className="group relative">
      {/* Artifact Card */}
      <div ref={cardRef} className="bg-card border-2 border-border/30 rounded-xl shadow-lg hover:shadow-xl transition-all duration-300 ease-out overflow-hidden hover:border-primary/30">
        {/* Header */}
        <div className="flex items-center justify-between p-5 bg-gradient-to-r from-muted/30 to-muted/10 border-b border-border/30">
          <div className="flex items-center gap-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
              <FileText className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h3 className="font-semibold text-foreground text-base leading-tight">{title}</h3>
              <p className="text-sm text-muted-foreground mt-1">
                {formatDate(created_at)} • {contentType}
              </p>
            </div>
          </div>
          
          <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-all duration-300 ease-out">
            <button
              onClick={copyToClipboard}
              className="p-2 hover:bg-accent rounded-lg transition-all duration-200 hover:scale-105"
              title="Copy to clipboard"
            >
              <Copy className="h-4 w-4 text-muted-foreground hover:text-foreground" />
            </button>
            <button
              onClick={handleEdit}
              className="p-2 hover:bg-accent rounded-lg transition-all duration-200 hover:scale-105"
              title="Edit artifact"
            >
              <PencilSimple className="h-4 w-4 text-muted-foreground hover:text-foreground" />
            </button>
            <button
              onClick={toggleFullScreen}
              className="p-2 hover:bg-accent rounded-lg transition-all duration-200 hover:scale-105"
              title="Expand to full screen"
            >
              <ArrowsOut className="h-4 w-4 text-muted-foreground hover:text-foreground" />
            </button>
          </div>
        </div>
        
        {/* Content */}
        <div className="p-5">
          {isEditing ? (
            <div className="space-y-4">
              <textarea
                value={editedContent}
                onChange={(e) => setEditedContent(e.target.value)}
                className="w-full h-40 p-4 border-2 border-border/50 rounded-xl bg-background text-foreground resize-none focus:outline-none focus:ring-4 focus:ring-primary/20 focus:border-primary text-base leading-relaxed font-sans"
                placeholder="Edit artifact content..."
              />
              <div className="flex gap-3">
                <button
                  onClick={handleSave}
                  className="px-4 py-2.5 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-all duration-200 hover:scale-105 text-sm font-medium flex items-center gap-2 shadow-md"
                >
                  <Check className="h-4 w-4" />
                  Save
                </button>
                <button
                  onClick={handleCancel}
                  className="px-4 py-2.5 bg-muted text-foreground rounded-lg hover:bg-muted/80 transition-all duration-200 hover:scale-105 text-sm font-medium flex items-center gap-2"
                >
                  <X className="h-4 w-4" />
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="relative">
                <div 
                  className={`overflow-hidden transition-all duration-500 ease-out ${
                    isExpanded ? 'max-h-96' : 'max-h-28'
                  }`}
                >
                  <div className="text-base leading-relaxed text-foreground font-sans bg-muted/10 p-4 rounded-lg border border-border/20">
                    <pre className="whitespace-pre-wrap font-sans text-foreground bg-transparent p-0 m-0 text-base leading-relaxed">
                      {currentContent}
                    </pre>
                  </div>
                </div>
                
                {/* Gradient overlay for collapsed state */}
                {!isExpanded && (
                  <div className="absolute bottom-0 left-0 right-0 h-12 bg-gradient-to-t from-card to-transparent pointer-events-none" />
                )}
              </div>
              
              <button
                onClick={toggleExpansion}
                className="text-sm text-primary hover:text-primary/80 transition-colors font-medium hover:underline"
              >
                {isExpanded ? 'Show less' : 'Show more'}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

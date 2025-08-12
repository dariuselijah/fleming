"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { ScrollArea } from "@/components/ui/scroll-area"
import { 
  FileText, 
  CaretDown as ChevronDown, 
  CaretUp as ChevronUp, 
  Plus,
  Code,
  TextT,
  Brain,
  Copy
} from "@phosphor-icons/react"
import { cn } from "@/lib/utils"
import { toast } from "@/components/ui/toast"

export interface AIArtifact {
  id: string
  title: string
  content: string
  content_type: string
  metadata: any
  created_at: string
}

export interface AIArtifactsPanelProps {
  chatId: string
  userId: string
  isAuthenticated: boolean
  onArtifactSelect?: (artifact: AIArtifact) => void
}

const getContentIcon = (contentType: string) => {
  switch (contentType) {
    case 'code':
      return Code
    case 'markdown':
      return FileText
    case 'summary':
      return Brain
    default:
      return TextT
  }
}

const getContentTypeLabel = (contentType: string) => {
  switch (contentType) {
    case 'code':
      return 'Code'
    case 'markdown':
      return 'Markdown'
    case 'summary':
      return 'Summary'
    default:
      return 'Text'
  }
}

const formatDate = (dateString: string) => {
  return new Date(dateString).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })
}

const copyToClipboard = async (text: string) => {
  try {
    await navigator.clipboard.writeText(text)
    toast({
      title: "Copied!",
      description: "Content copied to clipboard",
    })
  } catch (err) {
    toast({
      title: "Failed to copy",
      description: "Could not copy to clipboard",
      status: "error",
    })
  }
}

export function AIArtifactsPanel({ 
  chatId, 
  userId, 
  isAuthenticated,
  onArtifactSelect 
}: AIArtifactsPanelProps) {
  const [artifacts, setArtifacts] = useState<AIArtifact[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [expandedArtifacts, setExpandedArtifacts] = useState<Set<string>>(new Set())
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (chatId && userId && isAuthenticated) {
      fetchArtifacts()
    }
  }, [chatId, userId, isAuthenticated])

  const fetchArtifacts = async () => {
    setIsLoading(true)
    setError(null)
    
    try {
      const response = await fetch(`/api/get-ai-artifacts?chatId=${chatId}&userId=${userId}&isAuthenticated=${isAuthenticated}`)
      
      if (!response.ok) {
        throw new Error('Failed to fetch AI artifacts')
      }
      
      const data = await response.json()
      setArtifacts(data.artifacts || [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch AI artifacts')
    } finally {
      setIsLoading(false)
    }
  }

  const toggleArtifact = (artifactId: string) => {
    const newExpanded = new Set(expandedArtifacts)
    if (newExpanded.has(artifactId)) {
      newExpanded.delete(artifactId)
    } else {
      newExpanded.add(artifactId)
    }
    setExpandedArtifacts(newExpanded)
  }

  const handleArtifactSelect = (artifact: AIArtifact) => {
    onArtifactSelect?.(artifact)
  }

  const handleCopyContent = (content: string) => {
    copyToClipboard(content)
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
        <span className="ml-2 text-sm text-muted-foreground">Loading AI artifacts...</span>
      </div>
    )
  }

  if (error) {
    return (
      <div className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
        Error: {error}
      </div>
    )
  }

  if (artifacts.length === 0) {
    return (
      <div className="text-center py-8 text-sm text-muted-foreground">
        <Brain className="h-12 w-12 mx-auto mb-3 opacity-50" />
        <p>No AI artifacts yet</p>
        <p className="text-xs mt-1">Ask the AI to create artifacts for you</p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-foreground">AI Artifacts</h3>
        <Badge variant="secondary" className="text-xs">
          {artifacts.length} {artifacts.length === 1 ? 'artifact' : 'artifacts'}
        </Badge>
      </div>
      
      <div className="space-y-2">
        {artifacts.map((artifact) => {
          const isExpanded = expandedArtifacts.has(artifact.id)
          const ContentIcon = getContentIcon(artifact.content_type)
          const contentTypeLabel = getContentTypeLabel(artifact.content_type)
          
          return (
            <Card key={artifact.id} className="border border-border/50 bg-card/50">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                      <ContentIcon className="h-5 w-5 text-primary" />
                    </div>
                    <div className="flex flex-col">
                      <CardTitle className="text-sm font-medium text-foreground">
                        {artifact.title}
                      </CardTitle>
                      <div className="flex items-center gap-2 mt-1">
                        <Badge variant="secondary" className="text-xs">
                          {contentTypeLabel}
                        </Badge>
                        <span className="text-xs text-muted-foreground">
                          {formatDate(artifact.created_at)}
                        </span>
                        {artifact.metadata?.generated_by && (
                          <Badge variant="outline" className="text-xs">
                            AI Generated
                          </Badge>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleCopyContent(artifact.content)}
                      className="h-8 w-8 p-0"
                      title="Copy content"
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleArtifactSelect(artifact)}
                      className="h-8 w-8 p-0"
                      title="Use in chat"
                    >
                      <Plus className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => toggleArtifact(artifact.id)}
                      className="h-8 w-8 p-0"
                    >
                      {isExpanded ? (
                        <ChevronUp className="h-4 w-4" />
                      ) : (
                        <ChevronDown className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                </div>
              </CardHeader>

              {isExpanded && (
                <>
                  <Separator />
                  <CardContent className="pt-4">
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <h4 className="text-sm font-medium text-foreground">
                          Content
                        </h4>
                        <Badge variant="outline" className="text-xs">
                          {artifact.content.length} characters
                        </Badge>
                      </div>
                      
                      <ScrollArea className="h-48 w-full rounded-md border bg-muted/30 p-3">
                        <div className="text-sm text-muted-foreground whitespace-pre-wrap font-mono">
                          {artifact.content}
                        </div>
                      </ScrollArea>

                      <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <span>Created {formatDate(artifact.created_at)}</span>
                        <div className="flex items-center gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleCopyContent(artifact.content)}
                            className="h-6 px-2 text-xs"
                          >
                            <Copy className="h-3 w-3 mr-1" />
                            Copy
                          </Button>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </>
              )}
            </Card>
          )
        })}
      </div>
    </div>
  )
}

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
  File, 
  Image as ImageIcon,
  FilePdf,
  FileDoc,
  FileXls,
  FileCsv,
  Code,
  Plus,
  ArrowSquareOut
} from "@phosphor-icons/react"
import { cn } from "@/lib/utils"

export interface DocumentArtifact {
  id: string
  file_name: string
  content_type: string
  file_url: string
  extracted_content: string
  metadata: any
  created_at: string
}

export interface DocumentArtifactsPanelProps {
  chatId: string
  userId: string
  isAuthenticated: boolean
  onArtifactSelect?: (artifact: DocumentArtifact) => void
}

const getFileIcon = (contentType: string, fileName: string) => {
  if (contentType.startsWith("image/")) return ImageIcon
  if (contentType === "application/pdf") return FilePdf
  if (contentType.includes("word") || contentType.includes("document")) return FileDoc
  if (contentType.includes("excel") || contentType.includes("spreadsheet")) return FileXls
  if (contentType === "text/csv") return FileCsv
  if (contentType.includes("json") || contentType.includes("code")) return Code
  if (contentType.startsWith("text/")) return FileText
  return File
}

const getFileTypeLabel = (contentType: string) => {
  if (contentType.startsWith("image/")) return "Image"
  if (contentType === "application/pdf") return "PDF"
  if (contentType.includes("word") || contentType.includes("document")) return "Document"
  if (contentType.includes("excel") || contentType.includes("spreadsheet")) return "Spreadsheet"
  if (contentType === "text/csv") return "CSV"
  if (contentType.includes("json") || contentType.includes("code")) return "Code"
  if (contentType.startsWith("text/")) return "Text"
  return "File"
}

const formatDate = (dateString: string) => {
  return new Date(dateString).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })
}

export function DocumentArtifactsPanel({ 
  chatId, 
  userId, 
  isAuthenticated,
  onArtifactSelect 
}: DocumentArtifactsPanelProps) {
  const [artifacts, setArtifacts] = useState<DocumentArtifact[]>([])
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
      const response = await fetch(`/api/get-document-artifacts?chatId=${chatId}&userId=${userId}&isAuthenticated=${isAuthenticated}`)
      
      if (!response.ok) {
        throw new Error('Failed to fetch artifacts')
      }
      
      const data = await response.json()
      setArtifacts(data.artifacts || [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch artifacts')
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

  const handleArtifactSelect = (artifact: DocumentArtifact) => {
    onArtifactSelect?.(artifact)
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
        <span className="ml-2 text-sm text-muted-foreground">Loading artifacts...</span>
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
        <FileText className="h-12 w-12 mx-auto mb-3 opacity-50" />
        <p>No document artifacts yet</p>
        <p className="text-xs mt-1">Upload documents to create artifacts</p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-foreground">Document Artifacts</h3>
        <Badge variant="secondary" className="text-xs">
          {artifacts.length} {artifacts.length === 1 ? 'artifact' : 'artifacts'}
        </Badge>
      </div>
      
      <div className="space-y-2">
        {artifacts.map((artifact) => {
          const isExpanded = expandedArtifacts.has(artifact.id)
          const FileIcon = getFileIcon(artifact.content_type, artifact.file_name)
          const fileTypeLabel = getFileTypeLabel(artifact.content_type)
          
          return (
            <Card key={artifact.id} className="border border-border/50 bg-card/50">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                      <FileIcon className="h-5 w-5 text-primary" />
                    </div>
                    <div className="flex flex-col">
                      <CardTitle className="text-sm font-medium text-foreground">
                        {artifact.file_name}
                      </CardTitle>
                      <div className="flex items-center gap-2 mt-1">
                        <Badge variant="secondary" className="text-xs">
                          {fileTypeLabel}
                        </Badge>
                        <span className="text-xs text-muted-foreground">
                          {formatDate(artifact.created_at)}
                        </span>
                        {artifact.metadata && (
                          <div className="flex items-center gap-1 text-xs text-muted-foreground">
                            {artifact.metadata.wordCount && (
                              <span>• {artifact.metadata.wordCount} words</span>
                            )}
                            {artifact.metadata.pageCount && (
                              <span>• {artifact.metadata.pageCount} pages</span>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
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
                          Extracted Content
                        </h4>
                        <Badge variant="outline" className="text-xs">
                          {artifact.extracted_content.length} characters
                        </Badge>
                      </div>
                      
                      <ScrollArea className="h-48 w-full rounded-md border bg-muted/30 p-3">
                        <div className="text-sm text-muted-foreground whitespace-pre-wrap font-mono">
                          {artifact.extracted_content}
                        </div>
                      </ScrollArea>

                      <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <span>Created {formatDate(artifact.created_at)}</span>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => window.open(artifact.file_url, '_blank')}
                          className="h-6 px-2 text-xs"
                        >
                          <ArrowSquareOut className="h-3 w-3 mr-1" />
                          View Original
                        </Button>
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

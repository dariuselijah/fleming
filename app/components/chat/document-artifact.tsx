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
  Code
} from "@phosphor-icons/react"
import { cn } from "@/lib/utils"

export interface DocumentArtifactProps {
  attachment: {
    name: string
    contentType: string
    url: string
    filePath?: string
  }
  extractedContent?: string
  onContentExtract?: (content: string) => void
  metadata?: {
    pageCount?: number
    wordCount?: number
    tables?: number
    images?: number
    extractedAt?: string
  }
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

const formatFileSize = (bytes: number) => {
  if (bytes === 0) return "0 Bytes"
  const k = 1024
  const sizes = ["Bytes", "KB", "MB", "GB"]
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i]
}

export function DocumentArtifact({ 
  attachment, 
  extractedContent,
  onContentExtract,
  metadata
}: DocumentArtifactProps) {
  const [isExpanded, setIsExpanded] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [content, setContent] = useState(extractedContent || "")
  const [error, setError] = useState<string | null>(null)

  const FileIcon = getFileIcon(attachment.contentType, attachment.name)
  const fileTypeLabel = getFileTypeLabel(attachment.contentType)

  useEffect(() => {
    if (extractedContent) {
      setContent(extractedContent)
    }
  }, [extractedContent])

  const handleExtractContent = async () => {
    if (content || isLoading) return

    setIsLoading(true)
    setError(null)

    try {
      // Create a document artifact instead of just extracting content
      const response = await fetch("/api/create-document-artifact", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          fileUrl: attachment.url,
          fileName: attachment.name,
          contentType: attachment.contentType,
          userId: "current-user", // This should be passed from parent component
          isAuthenticated: true,
          chatId: "current-chat" // This should be passed from parent component
        }),
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || "Failed to process document")
      }

      const result = await response.json()
      if (result.success && result.artifact) {
        setContent(result.artifact.content)
        onContentExtract?.(result.artifact.content)
        
        // Update metadata if available
        if (result.artifact.metadata) {
          // You can store metadata here or pass it up to parent
          console.log("Document metadata:", result.artifact.metadata)
        }
        
        // Notify parent that artifact was created
        console.log("Document artifact created:", result.artifact.id)
      } else {
        throw new Error(result.error || "Failed to create artifact")
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to extract content")
    } finally {
      setIsLoading(false)
    }
  }

  const toggleExpanded = () => {
    if (!content && !isLoading) {
      handleExtractContent()
    }
    setIsExpanded(!isExpanded)
  }

  const truncateContent = (text: string, maxLength: number = 200) => {
    if (text.length <= maxLength) return text
    return text.substring(0, maxLength) + "..."
  }

  return (
    <Card className="w-full max-w-2xl border border-border/50 bg-card/50">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
              <FileIcon className="h-5 w-5 text-primary" />
            </div>
            <div className="flex flex-col">
              <CardTitle className="text-sm font-medium text-foreground">
                {attachment.name}
              </CardTitle>
                             <div className="flex items-center gap-2 mt-1">
                 <Badge variant="secondary" className="text-xs">
                   {fileTypeLabel}
                 </Badge>
                 <span className="text-xs text-muted-foreground">
                   {attachment.contentType}
                 </span>
                 {metadata && (
                   <div className="flex items-center gap-1 text-xs text-muted-foreground">
                     {metadata.wordCount && (
                       <span>• {metadata.wordCount} words</span>
                     )}
                     {metadata.pageCount && (
                       <span>• {metadata.pageCount} pages</span>
                     )}
                     {metadata.tables && (
                       <span>• {metadata.tables} tables</span>
                     )}
                   </div>
                 )}
               </div>
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={toggleExpanded}
            className="h-8 w-8 p-0"
          >
            {isExpanded ? (
              <ChevronUp className="h-4 w-4" />
            ) : (
              <ChevronDown className="h-4 w-4" />
            )}
          </Button>
        </div>
      </CardHeader>

      {isExpanded && (
        <>
          <Separator />
          <CardContent className="pt-4">
            {isLoading && (
              <div className="flex items-center justify-center py-8">
                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
                <span className="ml-2 text-sm text-muted-foreground">
                  Extracting content...
                </span>
              </div>
            )}

            {error && (
              <div className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
                Error: {error}
              </div>
            )}

            {content && !isLoading && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-medium text-foreground">
                    Extracted Content
                  </h4>
                  <Badge variant="outline" className="text-xs">
                    {content.length} characters
                  </Badge>
                </div>
                
                <ScrollArea className="h-48 w-full rounded-md border bg-muted/30 p-3">
                  <div className="text-sm text-muted-foreground whitespace-pre-wrap font-mono">
                    {isExpanded ? content : truncateContent(content)}
                  </div>
                </ScrollArea>

                {content.length > 200 && (
                  <div className="text-xs text-muted-foreground text-center">
                    {isExpanded ? "Content expanded" : "Click to expand full content"}
                  </div>
                )}
              </div>
            )}

            {!content && !isLoading && !error && (
              <div className="text-center py-6 text-sm text-muted-foreground">
                <FileText className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p>Click to extract content from this document</p>
              </div>
            )}
          </CardContent>
        </>
      )}
    </Card>
  )
}

"use client"

import { DocumentArtifact, DocumentArtifactProps } from "./document-artifact"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { FileText, CaretDown as ChevronDown, CaretUp as ChevronUp } from "@phosphor-icons/react"
import { useState } from "react"

export interface DocumentArtifactsListProps {
  attachments: Array<{
    name: string
    contentType: string
    url: string
    filePath?: string
  }>
  extractedContents?: Record<string, string>
  extractedMetadata?: Record<string, DocumentArtifactProps["metadata"]>
  onContentExtract?: (fileName: string, content: string) => void
  className?: string
}

export function DocumentArtifactsList({
  attachments,
  extractedContents = {},
  extractedMetadata = {},
  onContentExtract,
  className
}: DocumentArtifactsListProps) {
  const [isCollapsed, setIsCollapsed] = useState(false)

  if (!attachments || attachments.length === 0) {
    return null
  }

  const handleContentExtract = (fileName: string, content: string) => {
    onContentExtract?.(fileName, content)
  }

  const documentAttachments = attachments.filter(
    attachment => !attachment.contentType.startsWith("image/")
  )

  const imageAttachments = attachments.filter(
    attachment => attachment.contentType.startsWith("image/")
  )

  if (documentAttachments.length === 0) {
    return null
  }

  return (
    <div className={className}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <FileText className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium text-foreground">
            Document Artifacts
          </span>
          <Badge variant="secondary" className="text-xs">
            {documentAttachments.length}
          </Badge>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setIsCollapsed(!isCollapsed)}
          className="h-6 w-6 p-0"
        >
          {isCollapsed ? (
            <ChevronDown className="h-3 w-3" />
          ) : (
            <ChevronUp className="h-3 w-3" />
          )}
        </Button>
      </div>

      {!isCollapsed && (
        <div className="space-y-3">
          {documentAttachments.map((attachment, index) => (
            <DocumentArtifact
              key={`${attachment.name}-${index}`}
              attachment={attachment}
              extractedContent={extractedContents[attachment.name]}
              metadata={extractedMetadata[attachment.name]}
              onContentExtract={(content) => 
                handleContentExtract(attachment.name, content)
              }
            />
          ))}
        </div>
      )}
    </div>
  )
}

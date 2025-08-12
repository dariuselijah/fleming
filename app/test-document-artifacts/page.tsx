"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { DocumentArtifactsList } from "@/app/components/chat/document-artifacts-list"
import { UnifiedArtifactsPanel } from "@/app/components/chat/unified-artifacts-panel"
import { FileUpload } from "@/components/prompt-kit/file-upload"
import { FileUploadTrigger, FileUploadContent } from "@/components/prompt-kit/file-upload"

export default function TestDocumentArtifacts() {
  const [attachments, setAttachments] = useState<any[]>([])
  const [extractedContents, setExtractedContents] = useState<Record<string, string>>({})
  const [extractedMetadata, setExtractedMetadata] = useState<Record<string, any>>({})

  const handleFileUpload = (files: File[]) => {
    const newAttachments = files.map(file => ({
      name: file.name,
      contentType: file.type,
      url: URL.createObjectURL(file),
      filePath: undefined
    }))
    
    setAttachments(prev => [...prev, ...newAttachments])
  }

  const handleContentExtract = (fileName: string, content: string) => {
    setExtractedContents(prev => ({
      ...prev,
      [fileName]: content
    }))
  }

  const handleMetadataExtract = (fileName: string, metadata: any) => {
    setExtractedMetadata(prev => ({
      ...prev,
      [fileName]: metadata
    }))
  }

  const clearAll = () => {
    setAttachments([])
    setExtractedContents({})
    setExtractedMetadata({})
  }

  return (
    <div className="container mx-auto p-6 max-w-4xl">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-4">Unified Artifacts Demo</h1>
                  <p className="text-muted-foreground mb-6">
            This page demonstrates the unified artifacts system that combines document artifacts and AI-generated content artifacts, similar to the Vercel AI chatbot.
          </p>
        
        <div className="flex gap-4 mb-6">
          <FileUpload onFilesAdded={handleFileUpload} multiple>
            <FileUploadTrigger asChild>
              <Button>Upload Documents</Button>
            </FileUploadTrigger>
            <FileUploadContent>
              <div className="border-input bg-background flex flex-col items-center rounded-lg border border-dashed p-8">
                <div className="text-muted-foreground text-center">
                  <p className="text-lg font-medium mb-2">Drop files here</p>
                  <p className="text-sm">Supports PDF, Word, Excel, CSV, JSON, and text files</p>
                </div>
              </div>
            </FileUploadContent>
          </FileUpload>
          
          <Button variant="outline" onClick={clearAll}>
            Clear All
          </Button>
        </div>
      </div>

      {attachments.length > 0 && (
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Uploaded Files ({attachments.length})</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {attachments.map((attachment, index) => (
                  <div key={index} className="p-3 border rounded-lg">
                    <div className="font-medium text-sm">{attachment.name}</div>
                    <div className="text-xs text-muted-foreground">{attachment.contentType}</div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <DocumentArtifactsList
            attachments={attachments}
            extractedContents={extractedContents}
            extractedMetadata={extractedMetadata}
            onContentExtract={handleContentExtract}
          />

          <Card>
            <CardHeader>
              <CardTitle>Document Artifacts Panel</CardTitle>
            </CardHeader>
            <CardContent>
                      <UnifiedArtifactsPanel
          chatId="test-chat-123"
          userId="test-user-123"
          isAuthenticated={true}
          onDocumentArtifactSelect={(artifact) => {
            console.log("Selected document artifact:", artifact)
            // You can use this artifact in the chat or other ways
          }}
          onAIArtifactSelect={(artifact) => {
            console.log("Selected AI artifact:", artifact)
            // You can use this artifact in the chat or other ways
          }}
        />
            </CardContent>
          </Card>
        </div>
      )}

      {attachments.length === 0 && (
        <Card>
          <CardContent className="p-12 text-center">
            <div className="text-muted-foreground">
              <p className="text-lg mb-2">No documents uploaded yet</p>
              <p className="text-sm">Upload some documents to see the artifact feature in action</p>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="mt-12">
        <Card>
          <CardHeader>
            <CardTitle>Feature Overview</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <h3 className="font-semibold mb-2">Supported File Types</h3>
              <ul className="list-disc list-inside text-sm text-muted-foreground space-y-1">
                <li>PDF documents (.pdf)</li>
                <li>Word documents (.doc, .docx)</li>
                <li>Excel spreadsheets (.xls, .xlsx)</li>
                <li>CSV files (.csv)</li>
                <li>JSON files (.json)</li>
                <li>Text files (.txt, .md)</li>
                <li>Images (.jpg, .png, .gif, .webp, .svg)</li>
              </ul>
            </div>
            
            <div>
              <h3 className="font-semibold mb-2">Key Features</h3>
              <ul className="list-disc list-inside text-sm text-muted-foreground space-y-1">
                <li>Automatic text extraction from documents</li>
                <li>Collapsible content display</li>
                <li>Document metadata (page count, word count, tables)</li>
                <li>File type detection and appropriate icons</li>
                <li>Content preview and full expansion</li>
                <li>Integration with chat messages</li>
              </ul>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

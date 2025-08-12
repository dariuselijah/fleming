"use client"

import { useState } from "react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { DocumentArtifactsPanel } from "./document-artifacts-panel"
import { AIArtifactsPanel, AIArtifact } from "./ai-artifacts-panel"
import { DocumentArtifact } from "./document-artifacts-panel"
import { Badge } from "@/components/ui/badge"
import { Brain, FileText } from "@phosphor-icons/react"

export interface UnifiedArtifactsPanelProps {
  chatId: string
  userId: string
  isAuthenticated: boolean
  onDocumentArtifactSelect?: (artifact: DocumentArtifact) => void
  onAIArtifactSelect?: (artifact: AIArtifact) => void
}

export function UnifiedArtifactsPanel({
  chatId,
  userId,
  isAuthenticated,
  onDocumentArtifactSelect,
  onAIArtifactSelect
}: UnifiedArtifactsPanelProps) {
  const [activeTab, setActiveTab] = useState("documents")

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-foreground">Artifacts</h2>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="text-xs">
            <FileText className="h-3 w-3 mr-1" />
            Documents
          </Badge>
          <Badge variant="outline" className="text-xs">
            <Brain className="h-3 w-3 mr-1" />
            AI Generated
          </Badge>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="documents" className="flex items-center gap-2">
            <FileText className="h-4 w-4" />
            Documents
          </TabsTrigger>
          <TabsTrigger value="ai" className="flex items-center gap-2">
            <Brain className="h-4 w-4" />
            AI Generated
          </TabsTrigger>
        </TabsList>

        <TabsContent value="documents" className="mt-4">
          <DocumentArtifactsPanel
            chatId={chatId}
            userId={userId}
            isAuthenticated={isAuthenticated}
            onArtifactSelect={onDocumentArtifactSelect}
          />
        </TabsContent>

        <TabsContent value="ai" className="mt-4">
          <AIArtifactsPanel
            chatId={chatId}
            userId={userId}
            isAuthenticated={isAuthenticated}
            onArtifactSelect={onAIArtifactSelect}
          />
        </TabsContent>
      </Tabs>
    </div>
  )
}

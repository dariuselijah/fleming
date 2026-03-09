import type { CitationStyle } from "@/lib/citations/formatters"
import type { EvidenceCitation } from "@/lib/evidence/types"

export type DocumentArtifactSection = {
  heading: string
  content: string
}

export type DocumentArtifact = {
  artifactType: "document"
  artifactId: string
  title: string
  query: string
  citationStyle: CitationStyle
  includeReferences?: boolean
  markdown: string
  sections: DocumentArtifactSection[]
  bibliography: Array<{ index: number; entry: string }>
  citations: EvidenceCitation[]
  warnings: string[]
  uploadId?: string | null
  uploadTitle?: string | null
  generatedAt: string
}

export type QuizArtifactQuestion = {
  id: string
  prompt: string
  options: string[]
  correctOptionIndex: number
  explanation: string
  citationIndices: number[]
}

export type QuizArtifact = {
  artifactType: "quiz"
  artifactId: string
  title: string
  query: string
  questions: QuizArtifactQuestion[]
  citations: EvidenceCitation[]
  warnings: string[]
  uploadId?: string | null
  uploadTitle?: string | null
  generatedAt: string
}

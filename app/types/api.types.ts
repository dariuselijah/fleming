import type { Database, Json } from "@/app/types/database.types"
import type { Attachment } from "@ai-sdk/ui-utils"
import type { SupabaseClient } from "@supabase/supabase-js"
import type { SupportedModel } from "@/lib/openproviders/types"
import type { DocumentArtifact, QuizArtifact } from "@/lib/uploads/artifacts"
import type { CitationStyle } from "@/lib/citations/formatters"

export type SupabaseClientType = SupabaseClient<Database>

export interface TopicContext {
  activeTopic?: string | null
  lastUploadId?: string | null
  recentPages?: number[]
  recentEvidenceIds?: string[]
  followUpType?: "clarify" | "next_page" | "previous_page" | "drill_down" | "switch_topic" | "unknown"
  pendingQuizTopicSelection?: boolean
  pendingQuizTopicOptions?: string[]
  pendingQuizOriginalQuery?: string | null
  pendingQuizRequestedAt?: string | null
}

export interface ContentPart {
  type: string
  text?: string
  toolCallId?: string
  toolName?: string
  args?: Json
  result?: Json
  toolInvocation?: {
    state: string
    step: number
    toolCallId: string
    toolName: string
    args?: Json
    result?: Json
  }
  reasoning?: string
  details?: Json[]
  metadata?: {
    evidenceCitations?: unknown[]
    topicContext?: TopicContext
    documentArtifacts?: DocumentArtifact[]
    quizArtifacts?: QuizArtifact[]
    citationStyle?: CitationStyle
  }
}

export interface Message {
  role: "user" | "assistant" | "system" | "data" | "tool" | "tool-call"
  content: string | null | ContentPart[]
  reasoning?: string
}

export interface ChatApiParams {
  userId: string
  model: SupportedModel
  isAuthenticated: boolean
}

export interface LogUserMessageParams {
  supabase: SupabaseClientType
  userId: string
  chatId: string
  content: string
  attachments?: Attachment[]
  model: SupportedModel
  isAuthenticated: boolean
  message_group_id?: string
}

export interface StoreAssistantMessageParams {
  supabase: SupabaseClientType
  userId: string
  chatId: string
  messages: Message[]
  message_group_id?: string
  model?: SupportedModel
  topicContext?: TopicContext
  allowMultipleArtifacts?: boolean
}

export interface ApiErrorResponse {
  error: string
  details?: string
}

export interface ApiSuccessResponse<T = unknown> {
  success: true
  data?: T
}

export type ApiResponse<T = unknown> = ApiSuccessResponse<T> | ApiErrorResponse

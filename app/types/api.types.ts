import type { Database, Json } from "@/app/types/database.types"
import type { Attachment } from "@ai-sdk/ui-utils"
import type { SupabaseClient } from "@supabase/supabase-js"
import type { SupportedModel } from "@/lib/openproviders/types"

export type SupabaseClientType = SupabaseClient<Database>

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
  chatId: string
  messages: Message[]
  message_group_id?: string
  model?: SupportedModel
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

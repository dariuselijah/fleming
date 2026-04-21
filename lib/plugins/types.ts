import type { PluginCategory, PluginStatus } from "@/lib/student-workspace/types"

export type StudentPluginId =
  | "lms_canvas"
  | "lms_moodle"
  | "calendar_google"
  | "literature_pubmed"
  | "speech_ocr_pipeline"

export interface StudentPluginConnectionField {
  key: string
  label: string
  required?: boolean
  secret?: boolean
  multiline?: boolean
  placeholder?: string
}

export interface StudentPluginDefinition {
  id: StudentPluginId
  name: string
  category: PluginCategory
  description: string
  availability: "live" | "beta" | "coming_soon"
  syncDescription: string
  requiredCredentials: Array<{
    env: string
    label: string
    secret?: boolean
  }>
  connectionFields?: StudentPluginConnectionField[]
}

export interface StudentPluginConnectionRecord {
  pluginId: StudentPluginId
  status: PluginStatus
  updatedAt?: string | null
  lastSyncAt?: string | null
  lastError?: string | null
  metadata?: Record<string, unknown>
}

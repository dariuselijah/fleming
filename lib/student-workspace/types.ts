import type { UploadProgressStage, UploadStatus, UserUploadListItem } from "@/lib/uploads/types"

export type UploadCollectionStatus =
  | "pending"
  | "uploading"
  | "processing"
  | "completed"
  | "partial"
  | "failed"
  | "archived"

export type UploadBatchStatus =
  | "pending"
  | "queued"
  | "processing"
  | "completed"
  | "partial"
  | "failed"
  | "cancelled"

export interface UploadCollectionSummary {
  id: string
  name: string
  description?: string | null
  status: UploadCollectionStatus
  totalFiles: number
  completedFiles: number
  failedFiles: number
  processingFiles: number
  createdAt: string
  updatedAt: string
  metadata?: Record<string, unknown>
  latestBatch?: UploadBatchSummary | null
}

export interface UploadBatchSummary {
  id: string
  collectionId: string
  status: UploadBatchStatus
  maxConcurrency: number
  totalFiles: number
  processedFiles: number
  completedFiles: number
  failedFiles: number
  progressPercent: number
  createdAt: string
  updatedAt: string
  startedAt?: string | null
  finishedAt?: string | null
  errorMessage?: string | null
  metadata?: Record<string, unknown>
}

export interface UploadBatchFileState {
  uploadId: string
  title: string
  fileName: string
  status: UploadStatus
  latestJobStage?: UploadProgressStage | null
  latestJobProgress?: number | null
  lastError?: string | null
}

export interface UploadBatchStatusPayload {
  collection: UploadCollectionSummary
  batch: UploadBatchSummary
  files: UploadBatchFileState[]
}

export interface BatchUploadFileInput {
  fileName: string
  mimeType: string
  fileSize: number
  title?: string
}

export interface BatchUploadInitToken {
  uploadId: string
  bucket: string
  filePath: string
  fileName: string
  title: string
}

export interface UploadBatchInitPayload {
  collection: UploadCollectionSummary
  batch: UploadBatchSummary
  uploads: BatchUploadInitToken[]
}

export type StudyNodeType = "topic" | "objective" | "deadline" | "weak_area" | "source_unit"
export type StudyEdgeType = "contains" | "supports" | "depends_on" | "scheduled_for" | "reinforces"

export interface StudyGraphNode {
  id: string
  userId: string
  uploadId?: string | null
  nodeType: StudyNodeType
  label: string
  description?: string | null
  sourceUnitNumber?: number | null
  deadlineAt?: string | null
  weakScore: number
  metadata: Record<string, unknown>
  createdAt: string
  updatedAt: string
}

export interface StudyGraphEdge {
  id: string
  userId: string
  fromNodeId: string
  toNodeId: string
  edgeType: StudyEdgeType
  metadata: Record<string, unknown>
  createdAt: string
}

export interface StudyGraphOverview {
  nodeCount: number
  topicCount: number
  objectiveCount: number
  deadlineCount: number
  weakAreaCount: number
  recentNodes: StudyGraphNode[]
}

export type PlannerBlockType = "study" | "review" | "quiz" | "remediation" | "exam_prep"
export type PlannerBlockStatus = "scheduled" | "completed" | "missed" | "cancelled"
export type PlannerStatus = "draft" | "active" | "completed" | "archived"

export interface StudyPlan {
  id: string
  title: string
  timezone: string
  startDate: string
  endDate: string
  status: PlannerStatus
  metadata: Record<string, unknown>
  createdAt: string
  updatedAt: string
}

export interface StudyPlanBlock {
  id: string
  planId: string
  graphNodeId?: string | null
  title: string
  description?: string | null
  blockType: PlannerBlockType
  startAt: string
  endAt: string
  durationMinutes: number
  status: PlannerBlockStatus
  metadata: Record<string, unknown>
}

export interface StudyPlanWithBlocks {
  plan: StudyPlan
  blocks: StudyPlanBlock[]
}

export interface CalendarExportPayload {
  planId: string
  timezone: string
  events: Array<{
    title: string
    description?: string | null
    startAt: string
    endAt: string
    blockType: PlannerBlockType
  }>
}

export interface ReviewItem {
  id: string
  graphNodeId?: string | null
  prompt: string
  answer?: string | null
  topicLabel?: string | null
  difficulty: number
  repetition: number
  intervalDays: number
  easeFactor: number
  errorStreak: number
  nextReviewAt: string
  lastSeenAt?: string | null
  status: "active" | "suspended" | "mastered"
  metadata: Record<string, unknown>
}

export interface ReviewQueuePayload {
  due: ReviewItem[]
  totalDue: number
}

export type PluginCategory = "lms" | "calendar" | "literature" | "speech_ocr"
export type PluginStatus = "not_connected" | "pending" | "connected" | "error" | "coming_soon"

export interface StudentPluginDefinition {
  id: string
  name: string
  category: PluginCategory
  description: string
  availability: "live" | "beta" | "coming_soon"
  syncDescription: string
  requiredCredentials?: Array<{
    env: string
    label: string
    secret?: boolean
  }>
  connectionFields?: Array<{
    key: string
    label: string
    required?: boolean
    secret?: boolean
    multiline?: boolean
    placeholder?: string
  }>
}

export interface StudentPluginConnection {
  pluginId: string
  status: PluginStatus
  lastSyncAt?: string | null
  lastError?: string | null
  updatedAt?: string | null
  metadata?: Record<string, unknown>
}

export interface StudentLmsCourse {
  id: string
  pluginId: string
  provider: "canvas" | "moodle"
  externalCourseId: string
  courseName: string
  courseCode?: string | null
  termName?: string | null
  lastSyncedAt?: string | null
  metadata?: Record<string, unknown>
}

export interface StudentLmsArtifact {
  id: string
  pluginId: string
  provider: "canvas" | "moodle"
  courseId: string
  courseName: string
  externalId: string
  artifactType: string
  title: string
  dueAt?: string | null
  uploadId?: string | null
  syncedAt?: string | null
  metadata?: Record<string, unknown>
}

export interface StudentLmsLibraryPayload {
  courses: StudentLmsCourse[]
  artifacts: StudentLmsArtifact[]
}

export type TimetableEntry = {
  label: string
  dayHint: string | null
  startsAt: string | null
  endsAt: string | null
  date: string | null
  sourceUnitNumber: number | null
}

export type StudyExtractionMetadata = {
  parserVersion: string
  uploadTitle: string
  uploadKind: UserUploadListItem["uploadKind"] | "other"
  topicLabels: string[]
  objectives: string[]
  actionables: string[]
  lectureSummary: string | null
  timetableEntries: TimetableEntry[]
  ocrSuggested: boolean
  hasImageHeavyUnits: boolean
}

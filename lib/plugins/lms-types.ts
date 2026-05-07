export type LmsProvider = "canvas" | "moodle"

export type LmsArtifactType =
  | "course_overview"
  | "module_item"
  | "page"
  | "assignment"
  | "quiz"
  | "file"
  | "resource"

export interface LmsConnectionConfig {
  baseUrl: string
  accessToken: string
  courseIds: string[]
}

export interface LmsCourse {
  id: string
  name: string
  code?: string | null
  term?: string | null
  metadata?: Record<string, unknown>
}

export interface LmsArtifact {
  provider: LmsProvider
  courseId: string
  courseName: string
  externalId: string
  artifactType: LmsArtifactType
  title: string
  bodyText: string
  externalUpdatedAt?: string | null
  dueAt?: string | null
  fileName?: string | null
  mimeType?: string | null
  fileUrl?: string | null
  metadata?: Record<string, unknown>
}

export interface LmsSyncPayload {
  courses: LmsCourse[]
  artifacts: LmsArtifact[]
}

export interface LmsSyncSummary {
  provider: LmsProvider
  courseCount: number
  artifactCount: number
  uploadedCount: number
  skippedCount: number
  failedCount: number
  warnings: string[]
}

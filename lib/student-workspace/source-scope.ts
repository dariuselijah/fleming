/* eslint-disable @typescript-eslint/no-explicit-any */

const LMS_ARTIFACTS_TABLE = "student_lms_artifacts"

function isMissingTableError(error: unknown): boolean {
  const message = String((error as { message?: string } | undefined)?.message || "")
  return /student_lms_artifacts|does not exist|42P01/i.test(message)
}

function normalizeIds(values?: string[]): string[] {
  if (!Array.isArray(values)) return []
  const seen = new Set<string>()
  const out: string[] = []
  for (const value of values) {
    const normalized = typeof value === "string" ? value.trim() : ""
    if (!normalized || seen.has(normalized)) continue
    seen.add(normalized)
    out.push(normalized)
  }
  return out
}

export async function resolveScopedUploadIds(input: {
  supabase: any
  userId: string
  uploadIds?: string[]
  courseIds?: string[]
}): Promise<string[] | null> {
  const selectedUploadIds = normalizeIds(input.uploadIds)
  const selectedCourseIds = normalizeIds(input.courseIds)
  if (selectedUploadIds.length === 0 && selectedCourseIds.length === 0) {
    return null
  }

  const scoped = new Set<string>(selectedUploadIds)
  if (selectedCourseIds.length > 0) {
    const { data, error } = await (input.supabase as any)
      .from(LMS_ARTIFACTS_TABLE)
      .select("upload_id")
      .eq("user_id", input.userId)
      .in("course_id", selectedCourseIds)
      .not("upload_id", "is", null)
      .limit(5000)

    if (error && !isMissingTableError(error)) {
      throw new Error(`Failed to scope sources by LMS course: ${error.message}`)
    }

    for (const row of (data || []) as Array<{ upload_id?: string | null }>) {
      const uploadId = typeof row.upload_id === "string" ? row.upload_id.trim() : ""
      if (uploadId) {
        scoped.add(uploadId)
      }
    }
  }

  return [...scoped]
}

export function normalizeTopicLabels(topicLabels?: string[]): string[] {
  if (!Array.isArray(topicLabels)) return []
  const seen = new Set<string>()
  const out: string[] = []
  for (const label of topicLabels) {
    const normalized = typeof label === "string" ? label.trim().toLowerCase() : ""
    if (!normalized || seen.has(normalized)) continue
    seen.add(normalized)
    out.push(normalized)
  }
  return out
}

export function normalizeGraphNodeIds(graphNodeIds?: string[]): string[] {
  return normalizeIds(graphNodeIds)
}

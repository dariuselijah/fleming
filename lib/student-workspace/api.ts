import type {
  CalendarExportPayload,
  ReviewItem,
  ReviewQueuePayload,
  StudyGraphEdge,
  StudyGraphNode,
  StudyGraphOverview,
  StudyPlan,
  StudyPlanWithBlocks,
  StudentPluginConnection,
  StudentPluginDefinition,
  StudentLmsLibraryPayload,
  UploadBatchStatusPayload,
} from "./types"

async function requestJson<T>(input: RequestInfo | URL, init?: RequestInit): Promise<T> {
  const response = await fetch(input, {
    ...init,
    credentials: "include",
  })
  if (!response.ok) {
    let payload: { error?: string } | null = null
    try {
      payload = (await response.json()) as { error?: string }
    } catch {
      payload = null
    }
    throw new Error(payload?.error || "Request failed")
  }
  return (await response.json()) as T
}

export async function fetchStudyGraph(params?: {
  q?: string
  uploadId?: string
  limit?: number
}): Promise<{
  overview: StudyGraphOverview
  nodes: StudyGraphNode[]
  edges: StudyGraphEdge[]
}> {
  const search = new URLSearchParams()
  if (params?.q) search.set("q", params.q)
  if (params?.uploadId) search.set("uploadId", params.uploadId)
  if (typeof params?.limit === "number") search.set("limit", String(params.limit))
  return requestJson(`/api/student-workspace/study-graph${search.toString() ? `?${search.toString()}` : ""}`)
}

export async function rebuildStudyGraphFromUpload(uploadId: string) {
  return requestJson<{ success: boolean; nodeCount: number; edgeCount: number }>(
    "/api/student-workspace/study-graph",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ uploadId }),
    }
  )
}

export async function previewParserExtraction(uploadId: string) {
  return requestJson<{
    extraction: {
      topicLabels: string[]
      objectives: string[]
      actionables: string[]
      lectureSummary: string | null
      timetableEntries: Array<{
        label: string
        dayHint: string | null
        startsAt: string | null
        endsAt: string | null
        date: string | null
      }>
      ocrSuggested: boolean
      hasImageHeavyUnits: boolean
    }
    source: "cached" | "on_demand"
  }>("/api/student-workspace/parser/preview", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ uploadId }),
  })
}

export async function listStudyPlans(): Promise<StudyPlan[]> {
  const payload = await requestJson<{ plans: StudyPlan[] }>("/api/student-workspace/planner")
  return Array.isArray(payload.plans) ? payload.plans : []
}

export async function generateStudyPlan(payload: {
  title?: string
  timezone?: string
  startDate?: string
  endDate?: string
  hoursPerDay?: number
  collectionId?: string
  uploadIds?: string[]
  courseIds?: string[]
  topicLabels?: string[]
  graphNodeIds?: string[]
}): Promise<StudyPlanWithBlocks> {
  return requestJson("/api/student-workspace/planner/generate", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  })
}

export async function getStudyPlan(planId: string): Promise<StudyPlanWithBlocks> {
  return requestJson(`/api/student-workspace/planner/${planId}`)
}

export async function rebalanceStudyPlan(
  planId: string,
  missedBlockIds?: string[]
): Promise<StudyPlanWithBlocks> {
  return requestJson(`/api/student-workspace/planner/${planId}/rebalance`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ missedBlockIds }),
  })
}

export async function exportStudyPlanCalendar(planId: string): Promise<CalendarExportPayload> {
  return requestJson(`/api/student-workspace/planner/${planId}/calendar-export`)
}

export async function generateReviewItems(
  input?:
    | number
    | {
        limit?: number
        uploadIds?: string[]
        courseIds?: string[]
        topicLabels?: string[]
        graphNodeIds?: string[]
      }
): Promise<ReviewItem[]> {
  const normalized =
    typeof input === "number"
      ? {
          limit: input,
        }
      : input || {}
  const payload = await requestJson<{ items: ReviewItem[] }>("/api/student-workspace/review/generate", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      limit: normalized.limit,
      uploadIds: normalized.uploadIds,
      courseIds: normalized.courseIds,
      topicLabels: normalized.topicLabels,
      graphNodeIds: normalized.graphNodeIds,
    }),
  })
  return Array.isArray(payload.items) ? payload.items : []
}

export async function getDueReviewQueue(limit?: number): Promise<ReviewQueuePayload> {
  const query = typeof limit === "number" ? `?limit=${encodeURIComponent(String(limit))}` : ""
  return requestJson(`/api/student-workspace/review/due${query}`)
}

export async function gradeReviewItem(payload: {
  reviewItemId: string
  score: number
  responseTimeMs?: number
  notes?: string
}): Promise<{ item: ReviewItem }> {
  return requestJson("/api/student-workspace/review/grade", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  })
}

export async function fetchReviewStats() {
  return requestJson<{
    stats: {
      totalActive: number
      dueNow: number
      mastered: number
      avgEaseFactor: number
      avgIntervalDays: number
    }
  }>("/api/student-workspace/review/stats")
}

export async function fetchPluginCatalog(): Promise<StudentPluginDefinition[]> {
  const payload = await requestJson<{ plugins: StudentPluginDefinition[] }>(
    "/api/student-workspace/plugins/catalog"
  )
  return Array.isArray(payload.plugins) ? payload.plugins : []
}

export async function fetchPluginStatuses(): Promise<Record<string, StudentPluginConnection>> {
  const payload = await requestJson<{ statuses: Record<string, StudentPluginConnection> }>(
    "/api/student-workspace/plugins/status"
  )
  return payload.statuses || {}
}

export async function connectPlugin(
  pluginId: string,
  connection?: {
    baseUrl?: string
    accessToken?: string
    courseIds?: string[]
  }
) {
  return requestJson<{ pluginId: string; status: string; message: string }>(
    "/api/student-workspace/plugins/connect",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ pluginId, connection }),
    }
  )
}

export async function syncPlugin(pluginId: string, metadata?: Record<string, unknown>) {
  return requestJson<{
    pluginId: string
    status: "completed" | "failed"
    syncedAt: string
    details: Record<string, unknown>
  }>("/api/student-workspace/plugins/sync", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      pluginId,
      metadata,
    }),
  })
}

export async function fetchPluginLibrary(pluginId?: string): Promise<StudentLmsLibraryPayload> {
  const query = pluginId ? `?pluginId=${encodeURIComponent(pluginId)}` : ""
  return requestJson<StudentLmsLibraryPayload>(`/api/student-workspace/plugins/library${query}`)
}

export async function waitForBatchCompletion(
  batchId: string,
  options?: {
    timeoutMs?: number
    pollIntervalMs?: number
  }
): Promise<UploadBatchStatusPayload> {
  const timeoutMs = Math.max(20_000, options?.timeoutMs ?? 8 * 60_000)
  const pollIntervalMs = Math.max(1000, options?.pollIntervalMs ?? 2000)
  const deadline = Date.now() + timeoutMs
  let latest = await requestJson<UploadBatchStatusPayload>(`/api/uploads/batch/${batchId}`)
  while (Date.now() < deadline) {
    if (["completed", "partial", "failed", "cancelled"].includes(latest.batch.status)) {
      return latest
    }
    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs))
    latest = await requestJson<UploadBatchStatusPayload>(`/api/uploads/batch/${batchId}`)
  }
  return latest
}

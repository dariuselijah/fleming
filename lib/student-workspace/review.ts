/* eslint-disable @typescript-eslint/no-explicit-any */
import { createClient } from "@/lib/supabase/server"
import type { ReviewItem, ReviewQueuePayload } from "./types"
import { StudyGraphService } from "./study-graph"
import {
  normalizeGraphNodeIds,
  normalizeTopicLabels,
  resolveScopedUploadIds,
} from "./source-scope"

const REVIEW_ITEM_TABLE = "student_review_items"
const REVIEW_ATTEMPT_TABLE = "student_review_attempts"
const STUDY_GRAPH_NODE_TABLE = "student_study_graph_nodes"

type ReviewItemRow = {
  id: string
  user_id: string
  graph_node_id: string | null
  prompt: string
  answer: string | null
  topic_label: string | null
  difficulty: number
  repetition: number
  interval_days: number
  ease_factor: number
  error_streak: number
  last_seen_at: string | null
  next_review_at: string
  status: "active" | "suspended" | "mastered"
  metadata: Record<string, unknown> | null
}

type StudyNode = {
  id: string
  upload_id: string | null
  node_type: string
  label: string
  description: string | null
  weak_score: number
}

function toReviewItem(row: ReviewItemRow): ReviewItem {
  return {
    id: row.id,
    graphNodeId: row.graph_node_id,
    prompt: row.prompt,
    answer: row.answer,
    topicLabel: row.topic_label,
    difficulty: row.difficulty,
    repetition: row.repetition,
    intervalDays: row.interval_days,
    easeFactor: Number(row.ease_factor || 2.5),
    errorStreak: row.error_streak,
    nextReviewAt: row.next_review_at,
    lastSeenAt: row.last_seen_at,
    status: row.status,
    metadata: row.metadata || {},
  }
}

function sm2Update(input: {
  score: number
  repetition: number
  intervalDays: number
  easeFactor: number
  errorStreak: number
}) {
  const score = Math.max(0, Math.min(5, Math.round(input.score)))
  let repetition = Math.max(0, input.repetition)
  let intervalDays = Math.max(1, input.intervalDays || 1)
  let easeFactor = Math.max(1.3, input.easeFactor || 2.5)
  let errorStreak = Math.max(0, input.errorStreak || 0)

  if (score < 3) {
    repetition = 0
    intervalDays = 1
    errorStreak += 1
    easeFactor = Math.max(1.3, easeFactor - 0.2)
  } else {
    errorStreak = 0
    repetition += 1
    if (repetition === 1) {
      intervalDays = 1
    } else if (repetition === 2) {
      intervalDays = 3
    } else {
      intervalDays = Math.max(1, Math.round(intervalDays * easeFactor))
    }

    const qualityDelta = 5 - score
    const easeDelta = 0.1 - qualityDelta * (0.08 + qualityDelta * 0.02)
    easeFactor = Math.max(1.3, easeFactor + easeDelta)
  }

  return {
    score,
    repetition,
    intervalDays,
    easeFactor: Number(easeFactor.toFixed(2)),
    errorStreak,
  }
}

export class StudyReviewService {
  private supabase: Awaited<ReturnType<typeof createClient>> | null
  private studyGraphService: StudyGraphService | null = null

  constructor(supabase?: Awaited<ReturnType<typeof createClient>>) {
    this.supabase = supabase ?? null
  }

  private async getSupabase() {
    if (!this.supabase) {
      this.supabase = await createClient()
    }
    if (!this.supabase) {
      throw new Error("Supabase client not available")
    }
    return this.supabase
  }

  private async getStudyGraphService() {
    if (!this.studyGraphService) {
      this.studyGraphService = new StudyGraphService(await this.getSupabase())
    }
    return this.studyGraphService
  }

  async generateReviewItems(input: {
    userId: string
    limit?: number
    uploadIds?: string[]
    courseIds?: string[]
    topicLabels?: string[]
    graphNodeIds?: string[]
  }): Promise<ReviewItem[]> {
    const supabase = await this.getSupabase()
    const limit = Math.max(4, Math.min(80, input.limit ?? 24))

    const scopedUploadIds = await resolveScopedUploadIds({
      supabase,
      userId: input.userId,
      uploadIds: input.uploadIds,
      courseIds: input.courseIds,
    })

    let nodeRows: StudyNode[] = []
    if (scopedUploadIds !== null && scopedUploadIds.length === 0) {
      nodeRows = []
    } else {
      let nodeQuery = (supabase as any)
        .from(STUDY_GRAPH_NODE_TABLE)
        .select("id, upload_id, node_type, label, description, weak_score")
        .eq("user_id", input.userId)
        .in("node_type", ["objective", "topic", "weak_area"])
        .order("weak_score", { ascending: false })
        .order("updated_at", { ascending: false })
        .limit(limit * 6)
      if (scopedUploadIds && scopedUploadIds.length > 0) {
        nodeQuery = nodeQuery.in("upload_id", scopedUploadIds)
      }
      const { data, error } = await nodeQuery
      if (error) {
        throw new Error(`Failed to read study graph for review generation: ${error.message}`)
      }
      nodeRows = (data || []) as StudyNode[]
    }

    const graphNodeIdSet = new Set(normalizeGraphNodeIds(input.graphNodeIds))
    const topicFilters = normalizeTopicLabels(input.topicLabels)

    let nodes = nodeRows
    if (graphNodeIdSet.size > 0) {
      nodes = nodes.filter((node) => graphNodeIdSet.has(node.id))
    }
    if (topicFilters.length > 0) {
      nodes = nodes.filter((node) => {
        const haystack = `${node.label} ${node.description || ""}`.toLowerCase()
        return topicFilters.some((topic) => haystack.includes(topic))
      })
    }

    if (nodes.length === 0) {
      return []
    }

    const selectedNodes = nodes.slice(0, limit)
    const payload = selectedNodes.map((node) => ({
      user_id: input.userId,
      graph_node_id: node.id,
      prompt: `Review check: ${node.label}`,
      answer: node.description || null,
      topic_label: node.label,
      difficulty: node.node_type === "weak_area" ? 4 : 3,
      repetition: 0,
      interval_days: 1,
      ease_factor: 2.5,
      error_streak: 0,
      next_review_at: new Date().toISOString(),
      status: "active",
      metadata: {
        generatedFromNodeType: node.node_type,
        weakScore: node.weak_score,
        sourceUploadId: node.upload_id,
        scopedUploadIds: scopedUploadIds || [],
        topicFilters,
      },
    }))

    const { data: inserted, error: insertError } = await (supabase as any)
      .from(REVIEW_ITEM_TABLE)
      .insert(payload)
      .select("*")

    if (insertError) {
      throw new Error(`Failed to generate review items: ${insertError.message}`)
    }
    return ((inserted || []) as ReviewItemRow[]).map(toReviewItem)
  }

  async getDueQueue(userId: string, limit = 32): Promise<ReviewQueuePayload> {
    const supabase = await this.getSupabase()
    const nowIso = new Date().toISOString()

    const { data, error } = await (supabase as any)
      .from(REVIEW_ITEM_TABLE)
      .select("*")
      .eq("user_id", userId)
      .eq("status", "active")
      .lte("next_review_at", nowIso)
      .order("next_review_at", { ascending: true })
      .limit(Math.max(1, Math.min(100, limit)))

    if (error) {
      throw new Error(`Failed to fetch review queue: ${error.message}`)
    }

    const due = ((data || []) as ReviewItemRow[]).map(toReviewItem)
    return {
      due,
      totalDue: due.length,
    }
  }

  async gradeReviewItem(input: {
    userId: string
    reviewItemId: string
    score: number
    responseTimeMs?: number
    notes?: string
  }): Promise<ReviewItem | null> {
    const supabase = await this.getSupabase()
    const studyGraphService = await this.getStudyGraphService()

    const { data: existing, error: existingError } = await (supabase as any)
      .from(REVIEW_ITEM_TABLE)
      .select("*")
      .eq("id", input.reviewItemId)
      .eq("user_id", input.userId)
      .maybeSingle()

    if (existingError) {
      throw new Error(`Failed to load review item: ${existingError.message}`)
    }
    if (!existing) return null
    const current = existing as ReviewItemRow

    const updated = sm2Update({
      score: input.score,
      repetition: current.repetition,
      intervalDays: current.interval_days,
      easeFactor: Number(current.ease_factor || 2.5),
      errorStreak: current.error_streak,
    })

    const nextReviewAt = new Date()
    nextReviewAt.setUTCDate(nextReviewAt.getUTCDate() + updated.intervalDays)
    nextReviewAt.setUTCHours(8, 0, 0, 0)

    await (supabase as any).from(REVIEW_ATTEMPT_TABLE).insert({
      user_id: input.userId,
      review_item_id: input.reviewItemId,
      score: updated.score,
      response_time_ms: Number.isFinite(input.responseTimeMs) ? input.responseTimeMs : null,
      metadata: {
        notes: input.notes || null,
      },
    })

    const status =
      updated.repetition >= 8 && updated.score >= 4
        ? ("mastered" as const)
        : ("active" as const)

    const { data: nextRow, error: updateError } = await (supabase as any)
      .from(REVIEW_ITEM_TABLE)
      .update({
        repetition: updated.repetition,
        interval_days: updated.intervalDays,
        ease_factor: updated.easeFactor,
        error_streak: updated.errorStreak,
        difficulty: updated.score < 3 ? Math.min(5, current.difficulty + 1) : Math.max(1, current.difficulty - 1),
        last_seen_at: new Date().toISOString(),
        next_review_at: nextReviewAt.toISOString(),
        status,
        metadata: {
          ...(current.metadata || {}),
          lastScore: updated.score,
          lastReviewedAt: new Date().toISOString(),
        },
      })
      .eq("id", input.reviewItemId)
      .eq("user_id", input.userId)
      .select("*")
      .single()

    if (updateError || !nextRow) {
      throw new Error(`Failed to update review item: ${updateError?.message ?? "Unknown error"}`)
    }

    if (updated.score < 3 && current.graph_node_id) {
      await studyGraphService.incrementWeakScore({
        userId: input.userId,
        graphNodeId: current.graph_node_id,
        delta: 0.5,
      })
    }

    return toReviewItem(nextRow as ReviewItemRow)
  }

  async getReviewStats(userId: string): Promise<{
    totalActive: number
    dueNow: number
    mastered: number
    avgEaseFactor: number
    avgIntervalDays: number
  }> {
    const supabase = await this.getSupabase()
    const { data, error } = await (supabase as any)
      .from(REVIEW_ITEM_TABLE)
      .select("status, ease_factor, interval_days, next_review_at")
      .eq("user_id", userId)
      .limit(1000)

    if (error) {
      throw new Error(`Failed to fetch review stats: ${error.message}`)
    }
    const rows = (data || []) as Array<{
      status: string
      ease_factor: number
      interval_days: number
      next_review_at: string
    }>

    const now = Date.now()
    const activeRows = rows.filter((row) => row.status === "active")
    const dueNow = activeRows.filter((row) => new Date(row.next_review_at).getTime() <= now).length
    const avgEase =
      activeRows.length > 0
        ? activeRows.reduce((sum, row) => sum + Number(row.ease_factor || 2.5), 0) / activeRows.length
        : 0
    const avgInterval =
      activeRows.length > 0
        ? activeRows.reduce((sum, row) => sum + Number(row.interval_days || 1), 0) / activeRows.length
        : 0

    return {
      totalActive: activeRows.length,
      dueNow,
      mastered: rows.filter((row) => row.status === "mastered").length,
      avgEaseFactor: Number(avgEase.toFixed(2)),
      avgIntervalDays: Number(avgInterval.toFixed(2)),
    }
  }
}

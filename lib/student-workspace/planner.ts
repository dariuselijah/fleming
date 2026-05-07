/* eslint-disable @typescript-eslint/no-explicit-any */
import { createClient } from "@/lib/supabase/server"
import type {
  CalendarExportPayload,
  StudyPlan,
  StudyPlanBlock,
  StudyPlanWithBlocks,
} from "./types"
import {
  normalizeGraphNodeIds,
  normalizeTopicLabels,
  resolveScopedUploadIds,
} from "./source-scope"

const STUDY_PLAN_TABLE = "student_study_plans"
const STUDY_PLAN_BLOCK_TABLE = "student_study_plan_blocks"
const STUDY_GRAPH_NODE_TABLE = "student_study_graph_nodes"

type PlanRow = {
  id: string
  user_id: string
  title: string
  timezone: string
  start_date: string
  end_date: string
  status: StudyPlan["status"]
  metadata: Record<string, unknown> | null
  created_at: string
  updated_at: string
}

type PlanBlockRow = {
  id: string
  user_id: string
  plan_id: string
  graph_node_id: string | null
  title: string
  description: string | null
  block_type: StudyPlanBlock["blockType"]
  start_at: string
  end_at: string
  duration_minutes: number
  status: StudyPlanBlock["status"]
  metadata: Record<string, unknown> | null
}

type StudyNodeRow = {
  id: string
  upload_id: string | null
  node_type: string
  label: string
  description: string | null
  deadline_at: string | null
  weak_score: number
  metadata: Record<string, unknown> | null
}

function toPlan(row: PlanRow): StudyPlan {
  return {
    id: row.id,
    title: row.title,
    timezone: row.timezone,
    startDate: row.start_date,
    endDate: row.end_date,
    status: row.status,
    metadata: row.metadata || {},
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function toBlock(row: PlanBlockRow): StudyPlanBlock {
  return {
    id: row.id,
    planId: row.plan_id,
    graphNodeId: row.graph_node_id,
    title: row.title,
    description: row.description,
    blockType: row.block_type,
    startAt: row.start_at,
    endAt: row.end_at,
    durationMinutes: row.duration_minutes,
    status: row.status,
    metadata: row.metadata || {},
  }
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date)
  next.setUTCDate(next.getUTCDate() + days)
  return next
}

function dateKey(date: Date): string {
  return date.toISOString().slice(0, 10)
}

function clampHoursPerDay(hours: number): number {
  if (!Number.isFinite(hours)) return 3
  return Math.max(1, Math.min(12, Math.round(hours)))
}

function parseDateStart(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`)
}

function parseDateEnd(value: string): Date {
  return new Date(`${value}T23:59:59.000Z`)
}

export class StudyPlannerService {
  private supabase: Awaited<ReturnType<typeof createClient>> | null

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

  async generatePlan(input: {
    userId: string
    title?: string
    timezone?: string
    startDate: string
    endDate: string
    hoursPerDay?: number
    collectionId?: string
    uploadIds?: string[]
    courseIds?: string[]
    topicLabels?: string[]
    graphNodeIds?: string[]
  }): Promise<StudyPlanWithBlocks> {
    const supabase = await this.getSupabase()
    const startDate = parseDateStart(input.startDate)
    const endDate = parseDateEnd(input.endDate)
    if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime()) || endDate < startDate) {
      throw new Error("Invalid startDate/endDate window")
    }

    const daySpan = Math.ceil((endDate.getTime() - startDate.getTime()) / (24 * 60 * 60 * 1000)) + 1
    if (daySpan > 180) {
      throw new Error("Planner generation currently supports windows up to 180 days")
    }

    const scopedUploadIds = await resolveScopedUploadIds({
      supabase,
      userId: input.userId,
      uploadIds: input.uploadIds,
      courseIds: input.courseIds,
    })

    let nodeRows: StudyNodeRow[] = []
    if (scopedUploadIds !== null && scopedUploadIds.length === 0) {
      nodeRows = []
    } else {
      let nodeQuery = (supabase as any)
        .from(STUDY_GRAPH_NODE_TABLE)
        .select("id, upload_id, node_type, label, description, deadline_at, weak_score, metadata")
        .eq("user_id", input.userId)
        .order("updated_at", { ascending: false })
        .limit(400)
      if (scopedUploadIds && scopedUploadIds.length > 0) {
        nodeQuery = nodeQuery.in("upload_id", scopedUploadIds)
      }
      const { data, error: nodeError } = await nodeQuery

      if (nodeError) {
        throw new Error(`Failed to load study graph nodes for planner: ${nodeError.message}`)
      }
      nodeRows = (data || []) as StudyNodeRow[]
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

    const objectiveNodes = nodes.filter((node) => node.node_type === "objective")
    const topicNodes = nodes.filter((node) => node.node_type === "topic")
    const weakAreaNodes = nodes.filter((node) => node.node_type === "weak_area")
    const deadlineNodes = nodes
      .filter((node) => node.node_type === "deadline" && node.deadline_at)
      .sort((a, b) => String(a.deadline_at).localeCompare(String(b.deadline_at)))

    const planTitle =
      input.title?.trim() ||
      (input.collectionId ? "File-grounded study plan" : "Auto-generated study plan")
    const timezone = input.timezone?.trim() || "UTC"
    const hoursPerDay = clampHoursPerDay(input.hoursPerDay ?? 3)
    const sessionsPerDay = Math.max(1, Math.floor((hoursPerDay * 60) / 55))

    const { data: planRow, error: planError } = await (supabase as any)
      .from(STUDY_PLAN_TABLE)
      .insert({
        user_id: input.userId,
        title: planTitle,
        timezone,
        start_date: dateKey(startDate),
        end_date: dateKey(endDate),
        generated_from_collection_id: input.collectionId || null,
        status: "active",
        metadata: {
          generationMode: "auto",
          sourceNodeCount: nodes.length,
          hoursPerDay,
          sessionsPerDay,
          scopedUploadIds: scopedUploadIds || [],
          topicFilters,
          graphNodeIds: [...graphNodeIdSet],
        },
      })
      .select("*")
      .single()

    if (planError || !planRow) {
      throw new Error(`Failed to create study plan: ${planError?.message ?? "Unknown error"}`)
    }

    const scheduleSeed = [...objectiveNodes, ...topicNodes]
    const fallbackTopic = scheduleSeed.length > 0 ? scheduleSeed : [{ id: null, label: "General revision" }]
    const blocksPayload: Array<Record<string, unknown>> = []
    let rotation = 0
    for (let dayOffset = 0; dayOffset < daySpan; dayOffset += 1) {
      const dayDate = addDays(startDate, dayOffset)
      for (let sessionIndex = 0; sessionIndex < sessionsPerDay; sessionIndex += 1) {
        const node = fallbackTopic[rotation % fallbackTopic.length]
        rotation += 1
        const startHour = 8 + sessionIndex
        const startAt = new Date(dayDate)
        startAt.setUTCHours(startHour, 0, 0, 0)
        const endAt = new Date(startAt)
        endAt.setUTCMinutes(endAt.getUTCMinutes() + 50)

        blocksPayload.push({
          user_id: input.userId,
          plan_id: planRow.id,
          graph_node_id: node.id || null,
          title: node.label,
          description: "Auto-scheduled study block",
          block_type: "study",
          start_at: startAt.toISOString(),
          end_at: endAt.toISOString(),
          duration_minutes: 50,
          status: "scheduled",
          metadata: {
            generated: true,
          },
        })
      }
    }

    const nearExamCount = Math.min(6, deadlineNodes.length)
    for (let index = 0; index < nearExamCount; index += 1) {
      const deadline = deadlineNodes[index]
      const deadlineDate = new Date(deadline.deadline_at as string)
      if (Number.isNaN(deadlineDate.getTime())) continue
      const prepDate = addDays(deadlineDate, -2)
      const startAt = new Date(prepDate)
      startAt.setUTCHours(19, 0, 0, 0)
      const endAt = new Date(startAt)
      endAt.setUTCMinutes(endAt.getUTCMinutes() + 60)

      blocksPayload.push({
        user_id: input.userId,
        plan_id: planRow.id,
        graph_node_id: deadline.id,
        title: `Exam prep: ${deadline.label}`,
        description: "Generated near deadline from timetable parsing",
        block_type: "exam_prep",
        start_at: startAt.toISOString(),
        end_at: endAt.toISOString(),
        duration_minutes: 60,
        status: "scheduled",
        metadata: {
          generated: true,
          deadlineAt: deadline.deadline_at,
        },
      })
    }

    for (let index = 0; index < Math.min(4, weakAreaNodes.length); index += 1) {
      const weak = weakAreaNodes[index]
      const startAt = addDays(startDate, index + 1)
      startAt.setUTCHours(20, 0, 0, 0)
      const endAt = new Date(startAt)
      endAt.setUTCMinutes(endAt.getUTCMinutes() + 45)

      blocksPayload.push({
        user_id: input.userId,
        plan_id: planRow.id,
        graph_node_id: weak.id,
        title: `Remediation: ${weak.label}`,
        description: "Weak-topic loop reinforcement block",
        block_type: "remediation",
        start_at: startAt.toISOString(),
        end_at: endAt.toISOString(),
        duration_minutes: 45,
        status: "scheduled",
        metadata: {
          generated: true,
          weakScore: weak.weak_score,
        },
      })
    }

    const { data: insertedBlocks, error: blockError } = await (supabase as any)
      .from(STUDY_PLAN_BLOCK_TABLE)
      .insert(blocksPayload)
      .select("*")

    if (blockError) {
      throw new Error(`Failed to create study blocks: ${blockError.message}`)
    }

    return {
      plan: toPlan(planRow as PlanRow),
      blocks: ((insertedBlocks || []) as PlanBlockRow[])
        .map(toBlock)
        .sort((a, b) => a.startAt.localeCompare(b.startAt)),
    }
  }

  async getPlanWithBlocks(userId: string, planId: string): Promise<StudyPlanWithBlocks | null> {
    const supabase = await this.getSupabase()
    const [planResult, blockResult] = await Promise.all([
      (supabase as any)
        .from(STUDY_PLAN_TABLE)
        .select("*")
        .eq("id", planId)
        .eq("user_id", userId)
        .maybeSingle(),
      (supabase as any)
        .from(STUDY_PLAN_BLOCK_TABLE)
        .select("*")
        .eq("plan_id", planId)
        .eq("user_id", userId)
        .order("start_at", { ascending: true }),
    ])

    if (planResult.error) {
      throw new Error(`Failed to load plan: ${planResult.error.message}`)
    }
    if (!planResult.data) return null
    if (blockResult.error) {
      throw new Error(`Failed to load plan blocks: ${blockResult.error.message}`)
    }

    return {
      plan: toPlan(planResult.data as PlanRow),
      blocks: ((blockResult.data || []) as PlanBlockRow[]).map(toBlock),
    }
  }

  async rebalancePlan(input: {
    userId: string
    planId: string
    missedBlockIds?: string[]
  }): Promise<StudyPlanWithBlocks | null> {
    const supabase = await this.getSupabase()
    const existing = await this.getPlanWithBlocks(input.userId, input.planId)
    if (!existing) return null

    const missedIds =
      Array.isArray(input.missedBlockIds) && input.missedBlockIds.length > 0
        ? input.missedBlockIds
        : existing.blocks
            .filter((block) => block.status === "missed")
            .map((block) => block.id)

    if (missedIds.length > 0) {
      await (supabase as any)
        .from(STUDY_PLAN_BLOCK_TABLE)
        .update({
          status: "missed",
        })
        .eq("user_id", input.userId)
        .eq("plan_id", input.planId)
        .in("id", missedIds)
    }

    const missedBlocks = existing.blocks.filter((block) => missedIds.includes(block.id))
    if (missedBlocks.length === 0) {
      return this.getPlanWithBlocks(input.userId, input.planId)
    }

    const now = new Date()
    const payload = missedBlocks.map((block, index) => {
      const startAt = addDays(now, index + 1)
      startAt.setUTCHours(19, 0, 0, 0)
      const endAt = new Date(startAt)
      endAt.setUTCMinutes(endAt.getUTCMinutes() + block.durationMinutes)
      return {
        user_id: input.userId,
        plan_id: input.planId,
        graph_node_id: block.graphNodeId,
        title: `${block.title} (replanned)`,
        description: "Auto-rebalanced after missed session",
        block_type: block.blockType === "exam_prep" ? "remediation" : block.blockType,
        start_at: startAt.toISOString(),
        end_at: endAt.toISOString(),
        duration_minutes: block.durationMinutes,
        status: "scheduled",
        metadata: {
          replannedFromBlockId: block.id,
          replannedAt: new Date().toISOString(),
        },
      }
    })

    await (supabase as any).from(STUDY_PLAN_BLOCK_TABLE).insert(payload)
    return this.getPlanWithBlocks(input.userId, input.planId)
  }

  async exportCalendar(userId: string, planId: string): Promise<CalendarExportPayload | null> {
    const payload = await this.getPlanWithBlocks(userId, planId)
    if (!payload) return null
    return {
      planId,
      timezone: payload.plan.timezone,
      events: payload.blocks
        .filter((block) => block.status === "scheduled")
        .map((block) => ({
          title: block.title,
          description: block.description,
          startAt: block.startAt,
          endAt: block.endAt,
          blockType: block.blockType,
        })),
    }
  }

  async listPlans(userId: string): Promise<StudyPlan[]> {
    const supabase = await this.getSupabase()
    const { data, error } = await (supabase as any)
      .from(STUDY_PLAN_TABLE)
      .select("*")
      .eq("user_id", userId)
      .order("updated_at", { ascending: false })
      .limit(24)

    if (error) {
      throw new Error(`Failed to list study plans: ${error.message}`)
    }
    return ((data || []) as PlanRow[]).map(toPlan)
  }
}

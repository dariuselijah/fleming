/* eslint-disable @typescript-eslint/no-explicit-any */
import { createClient } from "@/lib/supabase/server"
import type {
  StudyExtractionMetadata,
  StudyGraphEdge,
  StudyGraphNode,
  StudyGraphOverview,
} from "./types"

const STUDY_GRAPH_NODE_TABLE = "student_study_graph_nodes"
const STUDY_GRAPH_EDGE_TABLE = "student_study_graph_edges"

type StudyGraphNodeRow = {
  id: string
  user_id: string
  upload_id: string | null
  node_type: StudyGraphNode["nodeType"]
  label: string
  description: string | null
  source_unit_number: number | null
  deadline_at: string | null
  weak_score: number
  metadata: Record<string, unknown> | null
  created_at: string
  updated_at: string
}

type StudyGraphEdgeRow = {
  id: string
  user_id: string
  from_node_id: string
  to_node_id: string
  edge_type: StudyGraphEdge["edgeType"]
  metadata: Record<string, unknown> | null
  created_at: string
}

function rowToNode(row: StudyGraphNodeRow): StudyGraphNode {
  return {
    id: row.id,
    userId: row.user_id,
    uploadId: row.upload_id,
    nodeType: row.node_type,
    label: row.label,
    description: row.description,
    sourceUnitNumber: row.source_unit_number,
    deadlineAt: row.deadline_at,
    weakScore: Number(row.weak_score || 0),
    metadata: row.metadata || {},
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function rowToEdge(row: StudyGraphEdgeRow): StudyGraphEdge {
  return {
    id: row.id,
    userId: row.user_id,
    fromNodeId: row.from_node_id,
    toNodeId: row.to_node_id,
    edgeType: row.edge_type,
    metadata: row.metadata || {},
    createdAt: row.created_at,
  }
}

function tokenize(value: string): string[] {
  return value
    .toLowerCase()
    .split(/[^a-z0-9]+/g)
    .map((token) => token.trim())
    .filter((token) => token.length > 1)
}

export class StudyGraphService {
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

  async rebuildGraphFromUpload(input: {
    userId: string
    uploadId: string
    uploadTitle: string
    extraction: StudyExtractionMetadata
    sourceMetadata?: Record<string, unknown>
  }): Promise<{
    nodeCount: number
    edgeCount: number
  }> {
    const supabase = await this.getSupabase()
    const sourceMetadata = input.sourceMetadata || {}

    await (supabase as any)
      .from(STUDY_GRAPH_NODE_TABLE)
      .delete()
      .eq("user_id", input.userId)
      .eq("upload_id", input.uploadId)

    const topicPayload = input.extraction.topicLabels.map((topic) => ({
      user_id: input.userId,
      upload_id: input.uploadId,
      node_type: "topic",
      label: topic,
      description: `Derived from ${input.uploadTitle}`,
      metadata: {
        parserVersion: input.extraction.parserVersion,
        sourceMetadata,
      },
    }))

    const objectivePayload = input.extraction.objectives.map((objective) => ({
      user_id: input.userId,
      upload_id: input.uploadId,
      node_type: "objective",
      label: objective,
      description: `Objective from ${input.uploadTitle}`,
      metadata: {
        parserVersion: input.extraction.parserVersion,
        sourceMetadata,
      },
    }))
    const actionablePayload = input.extraction.actionables.map((actionable) => ({
      user_id: input.userId,
      upload_id: input.uploadId,
      node_type: "objective",
      label: actionable,
      description: `Actionable follow-up from ${input.uploadTitle}`,
      metadata: {
        parserVersion: input.extraction.parserVersion,
        actionable: true,
        sourceMetadata,
      },
    }))

    const deadlinePayload = input.extraction.timetableEntries
      .filter((entry) => entry.date)
      .map((entry) => ({
        user_id: input.userId,
        upload_id: input.uploadId,
        node_type: "deadline",
        label: entry.label,
        description: `Timetable entry from ${input.uploadTitle}`,
        source_unit_number: entry.sourceUnitNumber,
        deadline_at: entry.date ? `${entry.date}T09:00:00.000Z` : null,
        metadata: {
          dayHint: entry.dayHint,
          startsAt: entry.startsAt,
          endsAt: entry.endsAt,
          parserVersion: input.extraction.parserVersion,
          sourceMetadata,
        },
      }))

    const sourceUnitPayload = Array.from(
      new Set(input.extraction.timetableEntries.map((entry) => entry.sourceUnitNumber).filter(Boolean))
    ).map((unitNumber) => ({
      user_id: input.userId,
      upload_id: input.uploadId,
      node_type: "source_unit",
      label: `Source unit ${unitNumber}`,
      source_unit_number: unitNumber,
      metadata: {
        parserVersion: input.extraction.parserVersion,
        sourceMetadata,
      },
    }))

    const allPayload = [
      ...topicPayload,
      ...objectivePayload,
      ...actionablePayload,
      ...deadlinePayload,
      ...sourceUnitPayload,
    ]
    if (allPayload.length === 0) {
      return { nodeCount: 0, edgeCount: 0 }
    }

    const { data: insertedRows, error: insertError } = await (supabase as any)
      .from(STUDY_GRAPH_NODE_TABLE)
      .insert(allPayload)
      .select("*")

    if (insertError || !insertedRows) {
      throw new Error(`Failed to rebuild study graph nodes: ${insertError?.message ?? "Unknown error"}`)
    }

    const nodes = insertedRows as StudyGraphNodeRow[]
    const topicNodes = nodes.filter((node) => node.node_type === "topic")
    const objectiveNodes = nodes.filter((node) => node.node_type === "objective")
    const deadlineNodes = nodes.filter((node) => node.node_type === "deadline")
    const sourceUnitNodes = nodes.filter((node) => node.node_type === "source_unit")

    const edgePayload: Array<Record<string, unknown>> = []
    for (let index = 0; index < objectiveNodes.length; index += 1) {
      const objective = objectiveNodes[index]
      const topic = topicNodes[index % Math.max(1, topicNodes.length)]
      if (!topic) continue
      edgePayload.push({
        user_id: input.userId,
        from_node_id: topic.id,
        to_node_id: objective.id,
        edge_type: "contains",
        metadata: {
          uploadId: input.uploadId,
        },
      })
    }

    for (let index = 0; index < deadlineNodes.length; index += 1) {
      const deadline = deadlineNodes[index]
      const topic = topicNodes[index % Math.max(1, topicNodes.length)]
      if (!topic) continue
      edgePayload.push({
        user_id: input.userId,
        from_node_id: topic.id,
        to_node_id: deadline.id,
        edge_type: "scheduled_for",
        metadata: {
          uploadId: input.uploadId,
        },
      })
    }

    for (let index = 0; index < sourceUnitNodes.length; index += 1) {
      const source = sourceUnitNodes[index]
      const topic = topicNodes[index % Math.max(1, topicNodes.length)]
      if (!topic) continue
      edgePayload.push({
        user_id: input.userId,
        from_node_id: source.id,
        to_node_id: topic.id,
        edge_type: "supports",
        metadata: {
          uploadId: input.uploadId,
        },
      })
    }

    if (edgePayload.length > 0) {
      await (supabase as any)
        .from(STUDY_GRAPH_EDGE_TABLE)
        .insert(edgePayload)
    }

    return {
      nodeCount: nodes.length,
      edgeCount: edgePayload.length,
    }
  }

  async searchNodes(input: {
    userId: string
    query?: string
    uploadId?: string
    limit?: number
  }): Promise<StudyGraphNode[]> {
    const supabase = await this.getSupabase()
    const limit = Math.max(1, Math.min(80, input.limit ?? 24))

    const builder = (supabase as any)
      .from(STUDY_GRAPH_NODE_TABLE)
      .select("*")
      .eq("user_id", input.userId)
      .order("updated_at", { ascending: false })
      .limit(Math.max(limit * 3, 50))

    const scoped = input.uploadId ? builder.eq("upload_id", input.uploadId) : builder
    const { data, error } = await scoped
    if (error) {
      throw new Error(`Failed to search study graph nodes: ${error.message}`)
    }
    const nodes = ((data || []) as StudyGraphNodeRow[]).map(rowToNode)

    const query = (input.query || "").trim().toLowerCase()
    if (!query) return nodes.slice(0, limit)

    const queryTokens = tokenize(query)
    const scored = nodes
      .map((node) => {
        const haystack = `${node.label} ${node.description || ""}`.toLowerCase()
        const tokenScore = queryTokens.reduce((sum, token) => (haystack.includes(token) ? sum + 1 : sum), 0)
        const fullMatch = haystack.includes(query) ? 2 : 0
        return {
          node,
          score: tokenScore + fullMatch,
        }
      })
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map((item) => item.node)

    return scored.length > 0 ? scored : nodes.slice(0, limit)
  }

  async getOverview(userId: string): Promise<StudyGraphOverview> {
    const supabase = await this.getSupabase()
    const { data, error } = await (supabase as any)
      .from(STUDY_GRAPH_NODE_TABLE)
      .select("*")
      .eq("user_id", userId)
      .order("updated_at", { ascending: false })
      .limit(200)

    if (error) {
      throw new Error(`Failed to load study graph overview: ${error.message}`)
    }
    const rows = (data || []) as StudyGraphNodeRow[]
    const nodes = rows.map(rowToNode)
    return {
      nodeCount: nodes.length,
      topicCount: nodes.filter((node) => node.nodeType === "topic").length,
      objectiveCount: nodes.filter((node) => node.nodeType === "objective").length,
      deadlineCount: nodes.filter((node) => node.nodeType === "deadline").length,
      weakAreaCount: nodes.filter((node) => node.nodeType === "weak_area").length,
      recentNodes: nodes.slice(0, 24),
    }
  }

  async incrementWeakScore(input: {
    userId: string
    graphNodeId: string
    delta?: number
  }): Promise<void> {
    const supabase = await this.getSupabase()
    const delta = Number.isFinite(input.delta) ? Number(input.delta) : 0.5

    const { data: existing, error } = await (supabase as any)
      .from(STUDY_GRAPH_NODE_TABLE)
      .select("*")
      .eq("id", input.graphNodeId)
      .eq("user_id", input.userId)
      .maybeSingle()

    if (error || !existing) return
    const current = existing as StudyGraphNodeRow
    const nextWeakScore = Math.max(0, Number(current.weak_score || 0) + delta)

    await (supabase as any)
      .from(STUDY_GRAPH_NODE_TABLE)
      .update({
        weak_score: nextWeakScore,
        metadata: {
          ...(current.metadata || {}),
          weakScoreUpdatedAt: new Date().toISOString(),
        },
      })
      .eq("id", current.id)
      .eq("user_id", input.userId)

    if (current.node_type !== "weak_area" && nextWeakScore >= 1.5) {
      const weakLabel = `Weak area: ${current.label}`
      const { data: weakAreaNode, error: weakError } = await (supabase as any)
        .from(STUDY_GRAPH_NODE_TABLE)
        .insert({
          user_id: input.userId,
          upload_id: current.upload_id,
          node_type: "weak_area",
          label: weakLabel,
          description: `Generated from review misses for "${current.label}"`,
          weak_score: nextWeakScore,
          metadata: {
            sourceNodeId: current.id,
          },
        })
        .select("*")
        .single()

      if (!weakError && weakAreaNode) {
        await (supabase as any)
          .from(STUDY_GRAPH_EDGE_TABLE)
          .insert({
            user_id: input.userId,
            from_node_id: current.id,
            to_node_id: weakAreaNode.id,
            edge_type: "reinforces",
            metadata: {
              reason: "review_feedback",
            },
          })
      }
    }
  }

  async listEdges(userId: string): Promise<StudyGraphEdge[]> {
    const supabase = await this.getSupabase()
    const { data, error } = await (supabase as any)
      .from(STUDY_GRAPH_EDGE_TABLE)
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(200)

    if (error) {
      throw new Error(`Failed to load study graph edges: ${error.message}`)
    }
    return ((data || []) as StudyGraphEdgeRow[]).map(rowToEdge)
  }
}

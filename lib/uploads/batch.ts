/* eslint-disable @typescript-eslint/no-explicit-any */
import { createClient } from "@/lib/supabase/server"
import type {
  BatchUploadFileInput,
  BatchUploadInitToken,
  UploadBatchInitPayload,
  UploadBatchStatusPayload,
  UploadBatchSummary,
  UploadCollectionSummary,
} from "@/lib/student-workspace/types"
import type { UserUploadListItem } from "./types"
import { UserUploadService } from "./server"

const COLLECTION_TABLE = "upload_collections"
const BATCH_TABLE = "upload_batch_jobs"
const COLLECTION_ITEMS_TABLE = "upload_collection_items"
const DEFAULT_MAX_CONCURRENCY = 2
const MAX_CONCURRENCY = 6

type UploadCollectionRow = {
  id: string
  user_id: string
  name: string
  description: string | null
  status: UploadCollectionSummary["status"]
  total_files: number
  completed_files: number
  failed_files: number
  processing_files: number
  metadata: Record<string, unknown> | null
  created_at: string
  updated_at: string
}

type UploadBatchRow = {
  id: string
  user_id: string
  collection_id: string
  status: UploadBatchSummary["status"]
  max_concurrency: number
  total_files: number
  processed_files: number
  completed_files: number
  failed_files: number
  progress_percent: number
  error_message: string | null
  started_at: string | null
  finished_at: string | null
  metadata: Record<string, unknown> | null
  created_at: string
  updated_at: string
}

type UploadCollectionItemRow = {
  id: string
  user_id: string
  collection_id: string
  batch_job_id: string | null
  upload_id: string
  file_order: number
  ingest_state: "pending" | "queued" | "processing" | "completed" | "failed"
  metadata: Record<string, unknown> | null
}

type UploadIngestionJobRow = {
  id: string
  upload_id: string
  status: string
  metadata: Record<string, unknown> | null
  created_at: string
}

function clampConcurrency(value: number | undefined): number {
  const rounded = Math.round(Number.isFinite(value) ? Number(value) : DEFAULT_MAX_CONCURRENCY)
  return Math.max(1, Math.min(MAX_CONCURRENCY, rounded))
}

function asCollectionSummary(
  row: UploadCollectionRow,
  latestBatch: UploadBatchSummary | null
): UploadCollectionSummary {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    status: row.status,
    totalFiles: row.total_files,
    completedFiles: row.completed_files,
    failedFiles: row.failed_files,
    processingFiles: row.processing_files,
    metadata: row.metadata || {},
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    latestBatch,
  }
}

function asBatchSummary(row: UploadBatchRow): UploadBatchSummary {
  return {
    id: row.id,
    collectionId: row.collection_id,
    status: row.status,
    maxConcurrency: row.max_concurrency,
    totalFiles: row.total_files,
    processedFiles: row.processed_files,
    completedFiles: row.completed_files,
    failedFiles: row.failed_files,
    progressPercent: row.progress_percent,
    errorMessage: row.error_message,
    metadata: row.metadata || {},
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
  }
}

export class UploadBatchService {
  private supabase: Awaited<ReturnType<typeof createClient>> | null
  private uploadService: UserUploadService | null = null

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

  private async getUploadService() {
    if (!this.uploadService) {
      this.uploadService = new UserUploadService(await this.getSupabase())
    }
    return this.uploadService
  }

  async createBatchInit(input: {
    userId: string
    collectionName: string
    description?: string
    files: BatchUploadFileInput[]
    maxConcurrency?: number
  }): Promise<UploadBatchInitPayload> {
    if (!Array.isArray(input.files) || input.files.length === 0) {
      throw new Error("At least one file is required for batch initialization")
    }
    if (input.files.length > 200) {
      throw new Error("Batch initialization currently supports up to 200 files per collection")
    }

    const supabase = await this.getSupabase()
    const uploadService = await this.getUploadService()
    const maxConcurrency = clampConcurrency(input.maxConcurrency)

    const { data: collectionRow, error: collectionError } = await (supabase as any)
      .from(COLLECTION_TABLE)
      .insert({
        user_id: input.userId,
        name: input.collectionName.trim() || "Untitled collection",
        description: input.description?.trim() || null,
        status: "pending",
        total_files: input.files.length,
        metadata: {
          phase: "batch_init",
        },
      })
      .select("*")
      .single()

    if (collectionError || !collectionRow) {
      throw new Error(`Failed to create upload collection: ${collectionError?.message ?? "Unknown error"}`)
    }

    const { data: batchRow, error: batchError } = await (supabase as any)
      .from(BATCH_TABLE)
      .insert({
        user_id: input.userId,
        collection_id: collectionRow.id,
        status: "pending",
        max_concurrency: maxConcurrency,
        total_files: input.files.length,
        metadata: {
          queueDepth: input.files.length,
          queuedAt: new Date().toISOString(),
        },
      })
      .select("*")
      .single()

    if (batchError || !batchRow) {
      throw new Error(`Failed to create upload batch job: ${batchError?.message ?? "Unknown error"}`)
    }

    const createdUploads: BatchUploadInitToken[] = []
    const collectionItems: Array<Record<string, unknown>> = []

    for (let index = 0; index < input.files.length; index += 1) {
      const file = input.files[index]
      const pendingUpload = await uploadService.createPendingUpload({
        userId: input.userId,
        fileName: file.fileName,
        mimeType: file.mimeType,
        fileSize: file.fileSize,
        title: file.title,
      })

      createdUploads.push({
        uploadId: pendingUpload.uploadId,
        bucket: pendingUpload.bucket,
        filePath: pendingUpload.filePath,
        fileName: file.fileName,
        title: pendingUpload.title,
      })

      collectionItems.push({
        user_id: input.userId,
        collection_id: collectionRow.id,
        batch_job_id: batchRow.id,
        upload_id: pendingUpload.uploadId,
        file_order: index,
        ingest_state: "pending",
        metadata: {
          fileName: file.fileName,
          requestedTitle: file.title || null,
        },
      })

      await (supabase as any)
        .from("user_uploads")
        .update({
          metadata: {
            collectionId: collectionRow.id,
            batchJobId: batchRow.id,
            batchOrder: index,
          },
        })
        .eq("id", pendingUpload.uploadId)
        .eq("user_id", input.userId)
    }

    const { error: itemError } = await (supabase as any).from(COLLECTION_ITEMS_TABLE).insert(collectionItems)
    if (itemError) {
      throw new Error(`Failed to register batch collection items: ${itemError.message}`)
    }

    const collectionSummary = asCollectionSummary(collectionRow as UploadCollectionRow, null)
    const batchSummary = asBatchSummary(batchRow as UploadBatchRow)
    return {
      collection: collectionSummary,
      batch: batchSummary,
      uploads: createdUploads,
    }
  }

  async listCollections(userId: string): Promise<UploadCollectionSummary[]> {
    const supabase = await this.getSupabase()
    const { data: collectionRows, error: collectionError } = await (supabase as any)
      .from(COLLECTION_TABLE)
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(40)

    if (collectionError) {
      throw new Error(`Failed to list upload collections: ${collectionError.message}`)
    }

    const collections = (collectionRows || []) as UploadCollectionRow[]
    if (collections.length === 0) return []

    const collectionIds = collections.map((row) => row.id)
    const { data: batchRows, error: batchError } = await (supabase as any)
      .from(BATCH_TABLE)
      .select("*")
      .eq("user_id", userId)
      .in("collection_id", collectionIds)
      .order("created_at", { ascending: false })

    if (batchError) {
      throw new Error(`Failed to list batch jobs: ${batchError.message}`)
    }

    const latestBatchByCollection = new Map<string, UploadBatchSummary>()
    for (const row of (batchRows || []) as UploadBatchRow[]) {
      if (!latestBatchByCollection.has(row.collection_id)) {
        latestBatchByCollection.set(row.collection_id, asBatchSummary(row))
      }
    }

    return collections.map((collection) =>
      asCollectionSummary(collection, latestBatchByCollection.get(collection.id) || null)
    )
  }

  async getBatchStatus(userId: string, batchId: string): Promise<UploadBatchStatusPayload | null> {
    await this.refreshBatchProgress(userId, batchId)
    const supabase = await this.getSupabase()
    const uploadService = await this.getUploadService()

    const { data: batchRow, error: batchError } = await (supabase as any)
      .from(BATCH_TABLE)
      .select("*")
      .eq("id", batchId)
      .eq("user_id", userId)
      .maybeSingle()

    if (batchError) {
      throw new Error(`Failed to load batch job: ${batchError.message}`)
    }
    if (!batchRow) return null

    const { data: collectionRow, error: collectionError } = await (supabase as any)
      .from(COLLECTION_TABLE)
      .select("*")
      .eq("id", batchRow.collection_id)
      .eq("user_id", userId)
      .maybeSingle()

    if (collectionError) {
      throw new Error(`Failed to load collection for batch: ${collectionError.message}`)
    }
    if (!collectionRow) return null

    const { data: itemRows, error: itemError } = await (supabase as any)
      .from(COLLECTION_ITEMS_TABLE)
      .select("*")
      .eq("batch_job_id", batchId)
      .eq("user_id", userId)
      .order("file_order", { ascending: true })

    if (itemError) {
      throw new Error(`Failed to list batch items: ${itemError.message}`)
    }
    const items = (itemRows || []) as UploadCollectionItemRow[]
    const uploadIds = items.map((item) => item.upload_id)

    let uploadsById = new Map<string, UserUploadListItem>()
    if (uploadIds.length > 0) {
      const uploads = await uploadService.listUploads(userId)
      uploadsById = new Map(uploads.map((upload) => [upload.id, upload]))
    }

    const files = items.map((item) => {
      const upload = uploadsById.get(item.upload_id)
      return {
        uploadId: item.upload_id,
        title: upload?.title || String(item.metadata?.title || "Untitled upload"),
        fileName: upload?.fileName || String(item.metadata?.fileName || "unknown"),
        status: upload?.status || "pending",
        latestJobStage: upload?.latestJob?.progressStage ?? null,
        latestJobProgress: upload?.latestJob?.progressPercent ?? null,
        lastError: upload?.lastError ?? null,
      }
    })

    const batchSummary = asBatchSummary(batchRow as UploadBatchRow)
    const collectionSummary = asCollectionSummary(
      collectionRow as UploadCollectionRow,
      batchSummary
    )
    return {
      collection: collectionSummary,
      batch: batchSummary,
      files,
    }
  }

  async startBatchIngest(
    userId: string,
    batchId: string,
    options?: {
      maxConcurrency?: number
      reprocessFailed?: boolean
    }
  ): Promise<UploadBatchStatusPayload | null> {
    const supabase = await this.getSupabase()
    const uploadService = await this.getUploadService()

    const { data: batchRow, error: batchError } = await (supabase as any)
      .from(BATCH_TABLE)
      .select("*")
      .eq("id", batchId)
      .eq("user_id", userId)
      .maybeSingle()

    if (batchError) {
      throw new Error(`Failed to load batch for ingest: ${batchError.message}`)
    }
    if (!batchRow) return null

    const concurrency = clampConcurrency(options?.maxConcurrency ?? batchRow.max_concurrency)

    await Promise.all([
      (supabase as any)
        .from(BATCH_TABLE)
        .update({
          status: "processing",
          max_concurrency: concurrency,
          started_at: new Date().toISOString(),
          error_message: null,
          metadata: {
            ...(batchRow.metadata || {}),
            workerConcurrency: concurrency,
            startedBy: "batch_ingest_route",
          },
        })
        .eq("id", batchId)
        .eq("user_id", userId),
      (supabase as any)
        .from(COLLECTION_TABLE)
        .update({
          status: "processing",
        })
        .eq("id", batchRow.collection_id)
        .eq("user_id", userId),
    ])

    const { data: itemRows, error: itemError } = await (supabase as any)
      .from(COLLECTION_ITEMS_TABLE)
      .select("*")
      .eq("batch_job_id", batchId)
      .eq("user_id", userId)
      .order("file_order", { ascending: true })

    if (itemError) {
      throw new Error(`Failed to load batch items for ingest: ${itemError.message}`)
    }

    const targetItems = ((itemRows || []) as UploadCollectionItemRow[]).filter((item) => {
      if (item.ingest_state === "pending" || item.ingest_state === "queued") return true
      if (options?.reprocessFailed && item.ingest_state === "failed") return true
      return false
    })

    if (targetItems.length === 0) {
      return this.getBatchStatus(userId, batchId)
    }

    await (supabase as any)
      .from(COLLECTION_ITEMS_TABLE)
      .update({ ingest_state: "queued" })
      .eq("batch_job_id", batchId)
      .eq("user_id", userId)
      .in(
        "upload_id",
        targetItems.map((item) => item.upload_id)
      )

    let cursor = 0
    const worker = async () => {
      while (cursor < targetItems.length) {
        const index = cursor
        cursor += 1
        const item = targetItems[index]

        await (supabase as any)
          .from(COLLECTION_ITEMS_TABLE)
          .update({ ingest_state: "processing" })
          .eq("id", item.id)
          .eq("user_id", userId)

        try {
          await uploadService.ingestStoredUpload(userId, item.upload_id, { resume: true })
          await (supabase as any)
            .from(COLLECTION_ITEMS_TABLE)
            .update({
              ingest_state: "completed",
              metadata: {
                ...(item.metadata || {}),
                finishedAt: new Date().toISOString(),
              },
            })
            .eq("id", item.id)
            .eq("user_id", userId)
        } catch (error) {
          const message = error instanceof Error ? error.message : "Unknown batch ingest failure"
          await (supabase as any)
            .from(COLLECTION_ITEMS_TABLE)
            .update({
              ingest_state: "failed",
              metadata: {
                ...(item.metadata || {}),
                lastError: message,
                failedAt: new Date().toISOString(),
              },
            })
            .eq("id", item.id)
            .eq("user_id", userId)
        }

        await this.refreshBatchProgress(userId, batchId)
      }
    }

    await Promise.all(Array.from({ length: concurrency }).map(() => worker()))
    await this.refreshBatchProgress(userId, batchId, true)
    return this.getBatchStatus(userId, batchId)
  }

  async refreshBatchProgress(userId: string, batchId: string, finalize = false): Promise<void> {
    const supabase = await this.getSupabase()
    const { data: batchRow, error: batchError } = await (supabase as any)
      .from(BATCH_TABLE)
      .select("*")
      .eq("id", batchId)
      .eq("user_id", userId)
      .maybeSingle()

    if (batchError || !batchRow) {
      return
    }

    const { data: itemRows, error: itemError } = await (supabase as any)
      .from(COLLECTION_ITEMS_TABLE)
      .select("ingest_state")
      .eq("batch_job_id", batchId)
      .eq("user_id", userId)

    if (itemError) return

    const items = (itemRows || []) as Array<{ ingest_state: string }>
    const totalFiles = items.length
    const completedFiles = items.filter((item) => item.ingest_state === "completed").length
    const failedFiles = items.filter((item) => item.ingest_state === "failed").length
    const processingFiles = items.filter(
      (item) => item.ingest_state === "processing" || item.ingest_state === "queued"
    ).length
    const processedFiles = completedFiles + failedFiles
    const progressPercent =
      totalFiles > 0 ? Math.max(1, Math.min(100, Math.round((processedFiles / totalFiles) * 100))) : 100

    let status: UploadBatchSummary["status"] = "processing"
    if (processedFiles >= totalFiles) {
      if (failedFiles === 0) {
        status = "completed"
      } else if (completedFiles > 0) {
        status = "partial"
      } else {
        status = "failed"
      }
    } else if (processingFiles === 0 && processedFiles === 0) {
      status = "pending"
    } else {
      status = "processing"
    }

    await Promise.all([
      (supabase as any)
        .from(BATCH_TABLE)
        .update({
          status,
          total_files: totalFiles,
          processed_files: processedFiles,
          completed_files: completedFiles,
          failed_files: failedFiles,
          progress_percent: progressPercent,
          ...(finalize || processedFiles >= totalFiles ? { finished_at: new Date().toISOString() } : {}),
        })
        .eq("id", batchId)
        .eq("user_id", userId),
      (supabase as any)
        .from(COLLECTION_TABLE)
        .update({
          status:
            status === "completed"
              ? "completed"
              : status === "partial"
                ? "partial"
                : status === "failed"
                  ? "failed"
                  : "processing",
          total_files: totalFiles,
          completed_files: completedFiles,
          failed_files: failedFiles,
          processing_files: processingFiles,
          metadata: {
            ...(batchRow.metadata || {}),
            lastBatchId: batchId,
            progressPercent,
          },
        })
        .eq("id", batchRow.collection_id)
        .eq("user_id", userId),
    ])
  }

  async resolveLatestJobsForUploads(uploadIds: string[]): Promise<Map<string, UploadIngestionJobRow>> {
    const supabase = await this.getSupabase()
    if (uploadIds.length === 0) return new Map()
    const { data: rows, error } = await (supabase as any)
      .from("upload_ingestion_jobs")
      .select("id, upload_id, status, metadata, created_at")
      .in("upload_id", uploadIds)
      .order("created_at", { ascending: false })

    if (error || !rows) {
      return new Map()
    }
    const latest = new Map<string, UploadIngestionJobRow>()
    for (const row of rows as UploadIngestionJobRow[]) {
      if (!latest.has(row.upload_id)) {
        latest.set(row.upload_id, row)
      }
    }
    return latest
  }
}

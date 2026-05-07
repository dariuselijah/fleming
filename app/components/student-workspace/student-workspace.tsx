"use client"

import { toast } from "@/components/ui/toast"
import { UploadsWorkspace } from "@/app/components/uploads/uploads-workspace"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useUserPreferences } from "@/lib/user-preference-store/provider"
import {
  connectPlugin,
  exportStudyPlanCalendar,
  fetchPluginCatalog,
  fetchPluginLibrary,
  fetchPluginStatuses,
  fetchReviewStats,
  fetchStudyGraph,
  generateReviewItems,
  generateStudyPlan,
  getDueReviewQueue,
  getStudyPlan,
  gradeReviewItem,
  listStudyPlans,
  previewParserExtraction,
  rebuildStudyGraphFromUpload,
  rebalanceStudyPlan,
  syncPlugin,
} from "@/lib/student-workspace/api"
import type {
  ReviewItem,
  StudyGraphNode,
  StudyPlan,
  StudyPlanWithBlocks,
  StudentLmsArtifact,
  StudentLmsCourse,
  StudentPluginConnection,
  StudentPluginDefinition,
  UploadBatchStatusPayload,
  UploadCollectionSummary,
} from "@/lib/student-workspace/types"
import {
  listUploadCollections,
  listUserUploads,
  uploadKnowledgeFilesBatch,
} from "@/lib/uploads/api"
import type { UserUploadListItem } from "@/lib/uploads/types"
import {
  ArrowClockwise,
  BookOpenText,
  Brain,
  CaretRight,
  CheckCircle,
  FileArrowUp,
  FolderOpen,
  Lightning,
  Pulse,
  Sparkle,
  SpinnerGap,
} from "@phosphor-icons/react"
import { useRouter } from "next/navigation"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"

type WorkspacePrompt = {
  id: string
  title: string
  description: string
  prompt: string
  artifactIntent?: "none" | "quiz"
  citationStyle?: "harvard" | "apa" | "vancouver"
}

const CASE_BUILDER_PROMPTS: WorkspacePrompt[] = [
  {
    id: "case-progressive-reveal",
    title: "Progressive reveal case",
    description:
      "Start with history and exam, then reveal labs and imaging in stages to force hypothesis updates.",
    prompt:
      "Create a progressive reveal internal medicine case for a medical student. Stage 1: focused history and exam clues. Stage 2: targeted labs. Stage 3: imaging/follow-up data. After each stage, ask me for my top differential before revealing the next stage.",
  },
  {
    id: "case-rounds-summary",
    title: "Morning rounds format",
    description:
      "Generate a concise rounds-style patient summary with prioritized assessment and next-step plan.",
    prompt:
      "Generate a morning-rounds style patient case summary with problem list, prioritized differential, and immediate workup/management plan. Keep it high-yield for med-student clinical reasoning.",
  },
]

const CHART_LAB_PROMPTS: WorkspacePrompt[] = [
  {
    id: "chart-trend-interpretation",
    title: "Trend interpretation chart",
    description:
      "Ask for a chart-backed interpretation with baseline, inflection points, and likely drivers.",
    prompt:
      "Build a chart-first interpretation of a patient trend over time. Include one fenced `chart-spec` block with clean JSON for the trend data, then explain inflection points, likely drivers, and next tests.",
    citationStyle: "vancouver",
  },
  {
    id: "chart-differential-comparison",
    title: "Differential comparison chart",
    description:
      "Compare plausible diagnoses with evidence-for/evidence-against in visual form.",
    prompt:
      "Generate a differential comparison using a chart-friendly format: compare at least 3 diagnoses across key findings in a `chart-spec` block, then provide a concise interpretation and top pick.",
    citationStyle: "vancouver",
  },
]

const VIVA_DRILL_PROMPTS: WorkspacePrompt[] = [
  {
    id: "rapid-fire-viva",
    title: "Rapid-fire viva",
    description:
      "Run adaptive oral-style questions based on a case and tighten weaknesses in real time.",
    prompt:
      "Run a rapid-fire viva drill using one clinical case. Ask one question at a time, adapt difficulty to my answers, and at the end give a focused remediation plan.",
    artifactIntent: "quiz",
  },
]

const CHAT_WORKFLOW_PROMPTS: WorkspacePrompt[] = [
  {
    id: "chat-timetable-from-uploads",
    title: "Timetable from uploads",
    description:
      "Build a calendar-ready timetable directly in chat from uploaded timetables/slides and study metadata.",
    prompt:
      "Use generateTimetableFromUploads to create a study timetable from my uploads. Infer date windows from extracted timetable entries when available, and return next actions.",
  },
  {
    id: "chat-lecture-summary-actionables",
    title: "Lecture video -> notes + actionables",
    description:
      "Summarize uploaded lecture videos into high-yield notes, key topics, and actionable follow-up items.",
    prompt:
      "Use summarizeLectureUpload on my latest lecture upload and return concise notes, key topics, and prioritized next actionables.",
  },
  {
    id: "chat-review-queue",
    title: "Build review queue",
    description:
      "Generate a spaced-repetition queue from uploaded content and suggest what to revise first.",
    prompt:
      "Use createReviewQueueFromUploads to build my review queue and tell me what to study first today.",
  },
  {
    id: "chat-rebalance-plan",
    title: "Rebalance missed sessions",
    description:
      "Re-plan missed sessions and produce an updated timetable with realistic constraints.",
    prompt:
      "Use rebalanceTimetablePlan on my current study plan and give me an updated schedule with no overload days.",
  },
]

function formatDate(value: string | null | undefined) {
  if (!value) return "N/A"
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleDateString()
}

function parseCommaSeparated(value: string): string[] {
  return value
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part.length > 0)
}

function toggleSelection(values: string[], id: string): string[] {
  if (!id) return values
  return values.includes(id) ? values.filter((value) => value !== id) : [...values, id]
}

function buildPromptHref(prompt: WorkspacePrompt): string {
  const params = new URLSearchParams()
  params.set("prompt", prompt.prompt)
  if (prompt.artifactIntent && prompt.artifactIntent !== "none") {
    params.set("artifactIntent", prompt.artifactIntent)
  }
  if (prompt.citationStyle) {
    params.set("citationStyle", prompt.citationStyle)
  }
  return `/?${params.toString()}`
}

function PromptGrid({
  prompts,
  onLaunch,
}: {
  prompts: WorkspacePrompt[]
  onLaunch: (prompt: WorkspacePrompt) => void
}) {
  return (
    <div className="grid gap-3 md:grid-cols-2">
      {prompts.map((prompt) => (
        <div
          key={prompt.id}
          className="rounded-xl border border-border/70 bg-gradient-to-b from-background to-muted/20 p-4 shadow-sm"
        >
          <p className="text-sm font-semibold">{prompt.title}</p>
          <p className="mt-1 text-sm text-muted-foreground">{prompt.description}</p>
          <Button
            variant="outline"
            size="sm"
            className="mt-3 rounded-full"
            onClick={() => onLaunch(prompt)}
          >
            Launch in chat
            <CaretRight className="ml-1 size-3.5" />
          </Button>
        </div>
      ))}
    </div>
  )
}

export function StudentWorkspace() {
  const router = useRouter()
  const { preferences } = useUserPreferences()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [activeTab, setActiveTab] = useState("explore")
  const [uploads, setUploads] = useState<UserUploadListItem[]>([])
  const [collections, setCollections] = useState<UploadCollectionSummary[]>([])
  const [isLoadingLibrary, setIsLoadingLibrary] = useState(true)
  const [isUploadingBatch, setIsUploadingBatch] = useState(false)
  const [batchProgress, setBatchProgress] = useState<{
    fileName: string
    fileProgress: number
    uploadedCount: number
    totalFiles: number
    overallProgress: number
  } | null>(null)
  const [lastBatchStatus, setLastBatchStatus] = useState<UploadBatchStatusPayload | null>(null)
  const [selectedUploadId, setSelectedUploadId] = useState<string>("")
  const [parserPreview, setParserPreview] = useState<Awaited<
    ReturnType<typeof previewParserExtraction>
  > | null>(null)
  const [isLoadingParser, setIsLoadingParser] = useState(false)
  const [isRebuildingGraph, setIsRebuildingGraph] = useState(false)
  const [studyGraphOverview, setStudyGraphOverview] = useState<StudyGraphNode[]>([])
  const [studyGraphCounts, setStudyGraphCounts] = useState<{
    nodeCount: number
    topicCount: number
    objectiveCount: number
    weakAreaCount: number
  }>({
    nodeCount: 0,
    topicCount: 0,
    objectiveCount: 0,
    weakAreaCount: 0,
  })
  const [studyGraphQuery, setStudyGraphQuery] = useState("")
  const [isLoadingGraph, setIsLoadingGraph] = useState(false)
  const [plans, setPlans] = useState<StudyPlan[]>([])
  const [activePlan, setActivePlan] = useState<StudyPlanWithBlocks | null>(null)
  const [isGeneratingPlan, setIsGeneratingPlan] = useState(false)
  const [plannerForm, setPlannerForm] = useState(() => {
    const start = new Date()
    const end = new Date()
    end.setUTCDate(end.getUTCDate() + 14)
    return {
      title: "",
      startDate: start.toISOString().slice(0, 10),
      endDate: end.toISOString().slice(0, 10),
      hoursPerDay: "3",
    }
  })
  const [reviewQueue, setReviewQueue] = useState<ReviewItem[]>([])
  const [reviewStats, setReviewStats] = useState<{
    totalActive: number
    dueNow: number
    mastered: number
    avgEaseFactor: number
    avgIntervalDays: number
  }>({
    totalActive: 0,
    dueNow: 0,
    mastered: 0,
    avgEaseFactor: 0,
    avgIntervalDays: 0,
  })
  const [isReviewBusy, setIsReviewBusy] = useState(false)
  const [pluginCatalog, setPluginCatalog] = useState<StudentPluginDefinition[]>([])
  const [pluginStatuses, setPluginStatuses] = useState<Record<string, StudentPluginConnection>>({})
  const [pluginBusyId, setPluginBusyId] = useState<string | null>(null)
  const [pluginConnectionInputs, setPluginConnectionInputs] = useState<
    Record<string, { baseUrl: string; accessToken: string; courseIds: string }>
  >({})
  const [lmsCourses, setLmsCourses] = useState<StudentLmsCourse[]>([])
  const [lmsArtifacts, setLmsArtifacts] = useState<StudentLmsArtifact[]>([])
  const [selectedPlannerUploadIds, setSelectedPlannerUploadIds] = useState<string[]>([])
  const [selectedPlannerCourseIds, setSelectedPlannerCourseIds] = useState<string[]>([])
  const [plannerTopicFilter, setPlannerTopicFilter] = useState("")
  const [selectedReviewUploadIds, setSelectedReviewUploadIds] = useState<string[]>([])
  const [selectedReviewCourseIds, setSelectedReviewCourseIds] = useState<string[]>([])
  const [reviewTopicFilter, setReviewTopicFilter] = useState("")

  const launchPrompt = (prompt: WorkspacePrompt) => {
    router.push(buildPromptHref(prompt))
  }

  const launchQuickPrompt = (prompt: string) => {
    router.push(`/?prompt=${encodeURIComponent(prompt)}`)
  }

  const refreshLibrary = useCallback(async () => {
    setIsLoadingLibrary(true)
    try {
      const [uploadItems, collectionItems] = await Promise.all([
        listUserUploads({ allowStale: true, maxAgeMs: 10_000, revalidateInBackground: true }),
        listUploadCollections(),
      ])
      setUploads(uploadItems)
      setCollections(collectionItems)
    } catch (error) {
      toast({
        title: error instanceof Error ? error.message : "Failed to load library workspace",
        status: "error",
      })
    } finally {
      setIsLoadingLibrary(false)
    }
  }, [])

  const refreshStudyGraph = useCallback(async (query?: string) => {
    setIsLoadingGraph(true)
    try {
      const payload = await fetchStudyGraph({ q: query || undefined, limit: 30 })
      setStudyGraphOverview(payload.nodes)
      setStudyGraphCounts({
        nodeCount: payload.overview.nodeCount,
        topicCount: payload.overview.topicCount,
        objectiveCount: payload.overview.objectiveCount,
        weakAreaCount: payload.overview.weakAreaCount,
      })
    } catch (error) {
      toast({
        title: error instanceof Error ? error.message : "Failed to load sources map",
        status: "error",
      })
    } finally {
      setIsLoadingGraph(false)
    }
  }, [])

  const refreshPlans = useCallback(async () => {
    try {
      const list = await listStudyPlans()
      setPlans(list)
      if (list.length > 0) {
        const detailed = await getStudyPlan(list[0].id)
        setActivePlan((current) => current ?? detailed)
      }
    } catch (error) {
      toast({
        title: error instanceof Error ? error.message : "Failed to load planner data",
        status: "error",
      })
    }
  }, [])

  const refreshReview = useCallback(async () => {
    try {
      const [queue, statsPayload] = await Promise.all([getDueReviewQueue(20), fetchReviewStats()])
      setReviewQueue(queue.due)
      setReviewStats(statsPayload.stats)
    } catch (error) {
      toast({
        title: error instanceof Error ? error.message : "Failed to load review queue",
        status: "error",
      })
    }
  }, [])

  const refreshPlugins = useCallback(async () => {
    try {
      const [catalog, statuses, library] = await Promise.all([
        fetchPluginCatalog(),
        fetchPluginStatuses(),
        fetchPluginLibrary(),
      ])
      setPluginCatalog(catalog)
      setPluginStatuses(statuses)
      setLmsCourses(library.courses)
      setLmsArtifacts(library.artifacts)
      setPluginConnectionInputs((current) => {
        const next = { ...current }
        for (const [pluginId, status] of Object.entries(statuses)) {
          if (pluginId !== "lms_canvas" && pluginId !== "lms_moodle") continue
          const metadata = status.metadata || {}
          const baseUrl = typeof metadata.baseUrl === "string" ? metadata.baseUrl : ""
          const courseIds = Array.isArray(metadata.courseIds)
            ? metadata.courseIds
                .map((value) => (typeof value === "string" ? value.trim() : ""))
                .filter((value): value is string => value.length > 0)
                .join(",")
            : ""
          const existing = next[pluginId] || { baseUrl: "", accessToken: "", courseIds: "" }
          next[pluginId] = {
            baseUrl: existing.baseUrl || baseUrl,
            accessToken: existing.accessToken,
            courseIds: existing.courseIds || courseIds,
          }
        }
        return next
      })
    } catch (error) {
      toast({
        title: error instanceof Error ? error.message : "Failed to load plugin hub",
        status: "error",
      })
    }
  }, [])

  useEffect(() => {
    void Promise.all([
      refreshLibrary(),
      refreshStudyGraph(),
      refreshPlans(),
      refreshReview(),
      refreshPlugins(),
    ])
  }, [refreshLibrary, refreshStudyGraph, refreshPlans, refreshReview, refreshPlugins])

  useEffect(() => {
    if (!selectedUploadId) {
      setParserPreview(null)
      return
    }
    setIsLoadingParser(true)
    void previewParserExtraction(selectedUploadId)
      .then((payload) => {
        setParserPreview(payload)
      })
      .catch((error) => {
        toast({
          title: error instanceof Error ? error.message : "Failed to parse selected upload",
          status: "error",
        })
      })
      .finally(() => {
        setIsLoadingParser(false)
      })
  }, [selectedUploadId])

  const uploadReadyCount = useMemo(
    () => uploads.filter((item) => item.status === "completed").length,
    [uploads]
  )
  const uploadProcessingCount = useMemo(
    () => uploads.filter((item) => item.status === "processing" || item.status === "pending").length,
    [uploads]
  )
  const completedUploads = useMemo(
    () => uploads.filter((item) => item.status === "completed"),
    [uploads]
  )

  const handleBulkUpload = async (fileList: FileList | null) => {
    const files = fileList ? Array.from(fileList) : []
    if (files.length === 0) return

    setIsUploadingBatch(true)
    setBatchProgress(null)
    try {
      const status = await uploadKnowledgeFilesBatch(files, {
        collectionName: `Mass dump ${new Date().toLocaleDateString()}`,
        maxConcurrency: 2,
        onProgress: (progress) => {
          setBatchProgress(progress)
        },
      })
      setLastBatchStatus(status)
      toast({
        title: `Batch ingest ${status.batch.status}`,
        description: `${status.batch.completedFiles}/${status.batch.totalFiles} files completed`,
        status: status.batch.failedFiles > 0 ? "warning" : "success",
      })
      await Promise.all([refreshLibrary(), refreshStudyGraph()])
    } catch (error) {
      toast({
        title: error instanceof Error ? error.message : "Batch upload failed",
        status: "error",
      })
    } finally {
      setIsUploadingBatch(false)
      if (fileInputRef.current) {
        fileInputRef.current.value = ""
      }
    }
  }

  const handleRebuildStudyGraph = async () => {
    if (!selectedUploadId) return
    setIsRebuildingGraph(true)
    try {
      const result = await rebuildStudyGraphFromUpload(selectedUploadId)
      toast({
        title: "StudyGraph refreshed",
        description: `${result.nodeCount} nodes and ${result.edgeCount} edges updated`,
        status: "success",
      })
      await refreshStudyGraph(studyGraphQuery)
      await refreshReview()
    } catch (error) {
      toast({
        title: error instanceof Error ? error.message : "Failed to refresh study graph",
        status: "error",
      })
    } finally {
      setIsRebuildingGraph(false)
    }
  }

  const handleGeneratePlan = async () => {
    setIsGeneratingPlan(true)
    try {
      const generated = await generateStudyPlan({
        title: plannerForm.title || undefined,
        startDate: plannerForm.startDate,
        endDate: plannerForm.endDate,
        hoursPerDay: Number(plannerForm.hoursPerDay || "3"),
        uploadIds: selectedPlannerUploadIds.length > 0 ? selectedPlannerUploadIds : undefined,
        courseIds: selectedPlannerCourseIds.length > 0 ? selectedPlannerCourseIds : undefined,
        topicLabels: parseCommaSeparated(plannerTopicFilter),
      })
      setActivePlan(generated)
      await refreshPlans()
      toast({
        title: "Planner generated",
        description: `${generated.blocks.length} schedule blocks created`,
        status: "success",
      })
    } catch (error) {
      toast({
        title: error instanceof Error ? error.message : "Failed to generate study plan",
        status: "error",
      })
    } finally {
      setIsGeneratingPlan(false)
    }
  }

  const handleRebalancePlan = async () => {
    if (!activePlan) return
    try {
      const rebalanced = await rebalanceStudyPlan(activePlan.plan.id)
      setActivePlan(rebalanced)
      toast({
        title: "Plan rebalanced",
        description: "Missed sessions were rescheduled into remediation blocks.",
        status: "success",
      })
      await refreshPlans()
    } catch (error) {
      toast({
        title: error instanceof Error ? error.message : "Failed to rebalance study plan",
        status: "error",
      })
    }
  }

  const handleExportCalendar = async () => {
    if (!activePlan) return
    try {
      const payload = await exportStudyPlanCalendar(activePlan.plan.id)
      toast({
        title: "Calendar export ready",
        description: `${payload.events.length} blocks prepared for calendar sync`,
        status: "success",
      })
    } catch (error) {
      toast({
        title: error instanceof Error ? error.message : "Failed to export planner blocks",
        status: "error",
      })
    }
  }

  const handleGenerateReviewItems = async () => {
    setIsReviewBusy(true)
    try {
      const generated = await generateReviewItems({
        limit: 20,
        uploadIds: selectedReviewUploadIds.length > 0 ? selectedReviewUploadIds : undefined,
        courseIds: selectedReviewCourseIds.length > 0 ? selectedReviewCourseIds : undefined,
        topicLabels: parseCommaSeparated(reviewTopicFilter),
      })
      toast({
        title: "Review queue generated",
        description: `${generated.length} flashcards created from sources`,
        status: "success",
      })
      await refreshReview()
    } catch (error) {
      toast({
        title: error instanceof Error ? error.message : "Failed to generate review queue",
        status: "error",
      })
    } finally {
      setIsReviewBusy(false)
    }
  }

  const handleGradeReview = async (item: ReviewItem, score: number) => {
    setIsReviewBusy(true)
    try {
      await gradeReviewItem({
        reviewItemId: item.id,
        score,
      })
      await Promise.all([refreshReview(), refreshStudyGraph(studyGraphQuery)])
    } catch (error) {
      toast({
        title: error instanceof Error ? error.message : "Failed to grade review item",
        status: "error",
      })
    } finally {
      setIsReviewBusy(false)
    }
  }

  const handleConnectPlugin = async (pluginId: string) => {
    setPluginBusyId(pluginId)
    try {
      const connectionInput = pluginConnectionInputs[pluginId]
      const result = await connectPlugin(
        pluginId,
        pluginId === "lms_canvas" || pluginId === "lms_moodle"
          ? {
              baseUrl: connectionInput?.baseUrl || undefined,
              accessToken: connectionInput?.accessToken || undefined,
              courseIds: parseCommaSeparated(connectionInput?.courseIds || ""),
            }
          : undefined
      )
      toast({
        title: result.message,
        status: result.status === "error" ? "warning" : "success",
      })
      await refreshPlugins()
    } catch (error) {
      toast({
        title: error instanceof Error ? error.message : "Failed to connect plugin",
        status: "error",
      })
    } finally {
      setPluginBusyId(null)
    }
  }

  const handleSyncPlugin = async (pluginId: string) => {
    setPluginBusyId(pluginId)
    try {
      const connectionInput = pluginConnectionInputs[pluginId]
      const syncMetadata =
        pluginId === "lms_canvas" || pluginId === "lms_moodle"
          ? {
              courseIds: parseCommaSeparated(connectionInput?.courseIds || ""),
              maxArtifacts: 320,
            }
          : undefined
      const result = await syncPlugin(pluginId, syncMetadata)
      toast({
        title: `Sync complete: ${pluginId}`,
        description: `Synced at ${formatDate(result.syncedAt)}`,
        status: "success",
      })
      await Promise.all([refreshPlugins(), refreshLibrary(), refreshStudyGraph(studyGraphQuery)])
    } catch (error) {
      toast({
        title: error instanceof Error ? error.message : "Failed to run plugin sync",
        status: "error",
      })
    } finally {
      setPluginBusyId(null)
    }
  }

  const completionSignals = [
    Boolean(preferences.studentSchool?.trim()),
    Boolean(preferences.studentYear?.trim()),
    Boolean(preferences.medicalLiteratureAccess),
  ]
  const completionCount = completionSignals.filter(Boolean).length

  if (preferences.userRole !== "medical_student") {
    return (
      <div className="mx-auto w-full max-w-3xl px-4 pt-22 pb-8">
        <section className="rounded-2xl border border-border/70 bg-background p-5 shadow-sm">
          <p className="text-sm font-medium">Medical Student Workspace</p>
          <p className="mt-2 text-sm text-muted-foreground">
            This workspace is tailored for medical student mode. Switch your role to
            medical student to unlock Case Builder, Chart Lab, and Viva Drill modules.
          </p>
          <Button className="mt-4 rounded-full" onClick={() => router.push("/health")}>
            Open Health Workspace
          </Button>
        </section>
      </div>
    )
  }

  return (
    <div className="mx-auto flex w-full max-w-[1200px] gap-6 px-4 pt-22 pb-8">
      <div className="min-w-0 flex-1 space-y-6">
        <section className="rounded-2xl border border-border/70 bg-gradient-to-b from-muted/30 to-background p-5 shadow-sm">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">
            AskFleming Med Workspace
          </p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight">Medical Student Workspace</h1>
          <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
            Practice cases, generate chart-based analysis, and run viva drills in one place.
            Every module launches directly into chat with med-student-tuned prompts.
          </p>
          <div className="mt-3 inline-flex items-center gap-2 rounded-full border border-border/70 bg-background px-3 py-1 text-xs">
            <CheckCircle className="size-3.5 text-emerald-500" weight="fill" />
            Workspace setup {completionCount}/3
          </div>
        </section>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="bg-transparent p-0">
            <TabsTrigger value="explore" className="rounded-full px-4">
              <Sparkle className="mr-1.5 size-4" />
              Explore
            </TabsTrigger>
            <TabsTrigger value="library" className="rounded-full px-4">
              <FolderOpen className="mr-1.5 size-4" />
              Library
            </TabsTrigger>
            <TabsTrigger value="planner" className="rounded-full px-4">
              <Pulse className="mr-1.5 size-4" />
              Planner
            </TabsTrigger>
            <TabsTrigger value="review" className="rounded-full px-4">
              <Lightning className="mr-1.5 size-4" />
              Review
            </TabsTrigger>
            <TabsTrigger value="sources" className="rounded-full px-4">
              <BookOpenText className="mr-1.5 size-4" />
              Sources
            </TabsTrigger>
            <TabsTrigger value="plugins" className="rounded-full px-4">
              <Sparkle className="mr-1.5 size-4" />
              Plugins
            </TabsTrigger>
          </TabsList>

          <TabsContent value="explore" className="mt-5 space-y-4">
            <section className="rounded-2xl border border-border/70 bg-background p-4 shadow-sm">
              <h2 className="text-xl font-semibold">Chat-first workflows</h2>
              <p className="text-sm text-muted-foreground">
                Run planner, timetable, lecture extraction, and review actions directly in chat.
              </p>
              <div className="mt-3">
                <PromptGrid prompts={CHAT_WORKFLOW_PROMPTS} onLaunch={launchPrompt} />
              </div>
            </section>
            <section className="rounded-2xl border border-border/70 bg-gradient-to-b from-primary/[0.05] to-background p-4 shadow-sm">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h3 className="font-semibold">Agent Lab</h3>
                  <p className="text-sm text-muted-foreground">
                    Sleek launchpad for case simulation, chart reasoning, and viva drills.
                  </p>
                </div>
                <Button
                  variant="outline"
                  className="rounded-full"
                  onClick={() =>
                    launchQuickPrompt(
                      "Use my uploaded sources and start an adaptive med-student workflow: case simulation -> chart interpretation -> viva drill."
                    )
                  }
                >
                  Launch unified run
                  <CaretRight className="ml-1 size-3.5" />
                </Button>
              </div>
              <div className="mt-4 space-y-4">
                <div>
                  <p className="text-sm font-medium">Case Builder</p>
                  <PromptGrid prompts={CASE_BUILDER_PROMPTS} onLaunch={launchPrompt} />
                </div>
                <div>
                  <p className="text-sm font-medium">Chart Lab</p>
                  <PromptGrid prompts={CHART_LAB_PROMPTS} onLaunch={launchPrompt} />
                </div>
                <div>
                  <p className="text-sm font-medium">Viva Drill</p>
                  <PromptGrid prompts={VIVA_DRILL_PROMPTS} onLaunch={launchPrompt} />
                </div>
              </div>
            </section>

            <section className="rounded-2xl border border-border/70 bg-background p-2 shadow-sm">
              <UploadsWorkspace embedded />
            </section>
          </TabsContent>

          <TabsContent value="library" className="mt-5 space-y-4">
            <div>
              <h2 className="text-xl font-semibold">Library + extraction</h2>
              <p className="text-sm text-muted-foreground">
                Bulk upload study files, run timetable/lecture extraction, and monitor ingest quality.
              </p>
            </div>
            <div className="rounded-2xl border border-border/70 bg-background p-4">
              <div className="flex flex-wrap items-center gap-2">
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  className="hidden"
                  accept=".pdf,.pptx,.docx,.txt,.md,.mp4,.mov,.m4v,.webm,.mkv,image/jpeg,image/png,image/webp,image/gif,video/mp4,video/quicktime,video/webm"
                  onChange={(event) => {
                    void handleBulkUpload(event.target.files)
                  }}
                />
                <Button
                  className="rounded-full"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isUploadingBatch}
                >
                  {isUploadingBatch ? (
                    <SpinnerGap className="mr-2 size-4 animate-spin" />
                  ) : (
                    <FileArrowUp className="mr-2 size-4" />
                  )}
                  Mass dump upload
                </Button>
                <Button
                  variant="outline"
                  className="rounded-full"
                  onClick={() => {
                    void refreshLibrary()
                  }}
                >
                  <ArrowClockwise className="mr-2 size-4" />
                  Refresh
                </Button>
              </div>
              {batchProgress ? (
                <div className="mt-4 rounded-xl border border-border/70 bg-muted/20 p-3">
                  <p className="text-sm font-medium">{batchProgress.fileName}</p>
                  <p className="text-xs text-muted-foreground">
                    {batchProgress.uploadedCount}/{batchProgress.totalFiles} uploaded · overall{" "}
                    {batchProgress.overallProgress}%
                  </p>
                </div>
              ) : null}
              {lastBatchStatus ? (
                <div className="mt-3 rounded-xl border border-border/70 bg-muted/20 p-3 text-xs text-muted-foreground">
                  Last batch: {lastBatchStatus.batch.completedFiles}/{lastBatchStatus.batch.totalFiles} complete,{" "}
                  {lastBatchStatus.batch.failedFiles} failed.
                </div>
              ) : null}
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <div className="rounded-2xl border border-border/70 bg-background p-4">
                <p className="text-sm font-medium">Collections</p>
                {isLoadingLibrary ? (
                  <p className="mt-2 text-xs text-muted-foreground">Loading collections...</p>
                ) : collections.length === 0 ? (
                  <p className="mt-2 text-xs text-muted-foreground">No upload collections yet.</p>
                ) : (
                  <div className="mt-2 space-y-2">
                    {collections.slice(0, 6).map((collection) => (
                      <div
                        key={collection.id}
                        className="rounded-xl border border-border/70 bg-muted/20 p-3 text-xs"
                      >
                        <p className="font-medium">{collection.name}</p>
                        <p className="text-muted-foreground">
                          {collection.completedFiles}/{collection.totalFiles} complete · {collection.failedFiles} failed
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div className="rounded-2xl border border-border/70 bg-background p-4">
                <p className="text-sm font-medium">Ingestion health</p>
                <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
                  <div className="rounded-xl border border-border/70 p-2">
                    <p className="text-muted-foreground">Ready</p>
                    <p className="text-lg font-semibold">{uploadReadyCount}</p>
                  </div>
                  <div className="rounded-xl border border-border/70 p-2">
                    <p className="text-muted-foreground">Processing</p>
                    <p className="text-lg font-semibold">{uploadProcessingCount}</p>
                  </div>
                </div>
              </div>
            </div>
            <section className="rounded-2xl border border-border/70 bg-background p-4 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="font-semibold">Timetable + lecture extraction</h3>
                  <p className="text-sm text-muted-foreground">
                    Pick an upload to preview extraction, rebuild StudyGraph nodes, and launch chat actions.
                  </p>
                </div>
                <Button
                  variant="outline"
                  className="rounded-full"
                  disabled={!selectedUploadId}
                  onClick={() =>
                    launchQuickPrompt(
                      selectedUploadId
                        ? `Use summarizeLectureUpload for uploadId ${selectedUploadId} and return concise notes plus actionables.`
                        : "Use summarizeLectureUpload on my latest upload."
                    )
                  }
                >
                  Open extraction in chat
                </Button>
              </div>
              <div className="mt-3">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Select upload</p>
                <select
                  className="mt-2 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                  value={selectedUploadId}
                  onChange={(event) => setSelectedUploadId(event.target.value)}
                >
                  <option value="">Choose a completed upload</option>
                  {completedUploads.map((upload) => (
                    <option key={upload.id} value={upload.id}>
                      {upload.title}
                    </option>
                  ))}
                </select>
                <div className="mt-3 flex items-center gap-2">
                  <Button
                    variant="outline"
                    className="rounded-full"
                    disabled={!selectedUploadId || isRebuildingGraph}
                    onClick={() => {
                      void handleRebuildStudyGraph()
                    }}
                  >
                    {isRebuildingGraph ? (
                      <SpinnerGap className="mr-2 size-4 animate-spin" />
                    ) : (
                      <ArrowClockwise className="mr-2 size-4" />
                    )}
                    Build StudyGraph nodes
                  </Button>
                  <Button
                    variant="outline"
                    className="rounded-full"
                    disabled={!selectedUploadId}
                    onClick={() =>
                      launchQuickPrompt(
                        selectedUploadId
                          ? `Use generateTimetableFromUploads with uploadId ${selectedUploadId} and produce a practical schedule.`
                          : "Use generateTimetableFromUploads and produce a practical schedule."
                      )
                    }
                  >
                    Generate timetable in chat
                  </Button>
                </div>
              </div>

              <div className="mt-4 rounded-xl border border-border/70 bg-muted/10 p-3">
                {isLoadingParser ? (
                  <p className="text-sm text-muted-foreground">Parsing selected upload...</p>
                ) : parserPreview ? (
                  <div className="space-y-3 text-sm">
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">
                      Source: {parserPreview.source}
                    </p>
                    <p>
                      <span className="font-medium">Topics:</span>{" "}
                      {parserPreview.extraction.topicLabels.slice(0, 8).join(", ") || "None detected"}
                    </p>
                    <p>
                      <span className="font-medium">Objectives:</span>{" "}
                      {parserPreview.extraction.objectives.slice(0, 6).join(" | ") || "None detected"}
                    </p>
                    {parserPreview.extraction.lectureSummary ? (
                      <p>
                        <span className="font-medium">Lecture summary:</span>{" "}
                        {parserPreview.extraction.lectureSummary}
                      </p>
                    ) : null}
                    <p>
                      <span className="font-medium">Actionables:</span>{" "}
                      {parserPreview.extraction.actionables.slice(0, 6).join(" | ") || "None detected"}
                    </p>
                    <div>
                      <p className="font-medium">Timetable blocks</p>
                      <div className="mt-1 space-y-1 text-xs text-muted-foreground">
                        {parserPreview.extraction.timetableEntries.slice(0, 8).map((entry, index) => (
                          <p key={`${entry.label}-${index}`}>
                            {entry.label} · {entry.dayHint || "day n/a"} · {entry.date || "date n/a"} ·{" "}
                            {entry.startsAt || "--"}-{entry.endsAt || "--"}
                          </p>
                        ))}
                        {parserPreview.extraction.timetableEntries.length === 0 ? (
                          <p>No timetable entries extracted yet.</p>
                        ) : null}
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      OCR suggested: {parserPreview.extraction.ocrSuggested ? "yes" : "no"} ·
                      Image-heavy: {parserPreview.extraction.hasImageHeavyUnits ? "yes" : "no"}
                    </p>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    Select an upload to preview parser output.
                  </p>
                )}
              </div>
            </section>
          </TabsContent>

          <TabsContent value="planner" className="mt-5 space-y-4">
            <div>
              <h2 className="text-xl font-semibold">Planner</h2>
              <p className="text-sm text-muted-foreground">
                Auto-generate weekly/day study plans from parsed files and rebalance missed sessions.
              </p>
            </div>
            <div className="grid gap-3 md:grid-cols-4">
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">Plan title</p>
                <Input
                  value={plannerForm.title}
                  onChange={(event) => setPlannerForm((current) => ({ ...current, title: event.target.value }))}
                  placeholder="Exam prep sprint"
                />
              </div>
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">Start</p>
                <Input
                  type="date"
                  value={plannerForm.startDate}
                  onChange={(event) =>
                    setPlannerForm((current) => ({ ...current, startDate: event.target.value }))
                  }
                />
              </div>
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">End</p>
                <Input
                  type="date"
                  value={plannerForm.endDate}
                  onChange={(event) =>
                    setPlannerForm((current) => ({ ...current, endDate: event.target.value }))
                  }
                />
              </div>
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">Hours/day</p>
                <Input
                  value={plannerForm.hoursPerDay}
                  onChange={(event) =>
                    setPlannerForm((current) => ({ ...current, hoursPerDay: event.target.value }))
                  }
                />
              </div>
            </div>
            <div className="rounded-2xl border border-border/70 bg-background p-4">
              <p className="text-sm font-medium">Plan scope</p>
              <p className="text-xs text-muted-foreground">
                Choose specific uploads, LMS courses, and optional topic filters.
              </p>
              <div className="mt-3 grid gap-3 md:grid-cols-3">
                <div>
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Uploads</p>
                  <div className="mt-2 max-h-36 space-y-1 overflow-auto rounded-lg border border-border/60 p-2">
                    {completedUploads.slice(0, 16).map((upload) => (
                      <label key={upload.id} className="flex items-center gap-2 text-xs">
                        <input
                          type="checkbox"
                          checked={selectedPlannerUploadIds.includes(upload.id)}
                          onChange={() =>
                            setSelectedPlannerUploadIds((current) => toggleSelection(current, upload.id))
                          }
                        />
                        <span className="truncate">{upload.title}</span>
                      </label>
                    ))}
                    {completedUploads.length === 0 ? (
                      <p className="text-xs text-muted-foreground">No completed uploads yet.</p>
                    ) : null}
                  </div>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">LMS courses</p>
                  <div className="mt-2 max-h-36 space-y-1 overflow-auto rounded-lg border border-border/60 p-2">
                    {lmsCourses.slice(0, 20).map((course) => (
                      <label key={course.id} className="flex items-center gap-2 text-xs">
                        <input
                          type="checkbox"
                          checked={selectedPlannerCourseIds.includes(course.externalCourseId)}
                          onChange={() =>
                            setSelectedPlannerCourseIds((current) =>
                              toggleSelection(current, course.externalCourseId)
                            )
                          }
                        />
                        <span className="truncate">{course.courseName}</span>
                      </label>
                    ))}
                    {lmsCourses.length === 0 ? (
                      <p className="text-xs text-muted-foreground">Sync Canvas/Moodle to list courses.</p>
                    ) : null}
                  </div>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">
                    Topic filters (comma separated)
                  </p>
                  <Input
                    value={plannerTopicFilter}
                    onChange={(event) => setPlannerTopicFilter(event.target.value)}
                    placeholder="renal physiology, chest pain, ECG"
                    className="mt-2"
                  />
                </div>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button className="rounded-full" onClick={() => void handleGeneratePlan()} disabled={isGeneratingPlan}>
                {isGeneratingPlan ? <SpinnerGap className="mr-2 size-4 animate-spin" /> : null}
                Generate plan
              </Button>
              <Button
                variant="outline"
                className="rounded-full"
                onClick={() => void handleRebalancePlan()}
                disabled={!activePlan}
              >
                Auto-replan missed
              </Button>
              <Button
                variant="outline"
                className="rounded-full"
                onClick={() => void handleExportCalendar()}
                disabled={!activePlan}
              >
                Calendar export
              </Button>
            </div>
            <div className="rounded-2xl border border-border/70 bg-background p-4">
              <p className="text-sm font-medium">Recent plans</p>
              {plans.length === 0 ? (
                <p className="mt-2 text-xs text-muted-foreground">No plans yet.</p>
              ) : (
                <div className="mt-2 flex flex-wrap gap-2">
                  {plans.map((plan) => (
                    <Button
                      key={plan.id}
                      variant="outline"
                      size="sm"
                      className="rounded-full"
                      onClick={() => {
                        void getStudyPlan(plan.id)
                          .then((payload) => setActivePlan(payload))
                      }}
                    >
                      {plan.title}
                    </Button>
                  ))}
                </div>
              )}
              {activePlan ? (
                <div className="mt-3 space-y-2 text-xs">
                  <p className="font-medium">{activePlan.plan.title}</p>
                  {activePlan.blocks.slice(0, 8).map((block) => (
                    <div key={block.id} className="rounded-xl border border-border/70 bg-muted/20 p-2">
                      <p className="font-medium">{block.title}</p>
                      <p className="text-muted-foreground">
                        {formatDate(block.startAt)} · {block.blockType} · {block.durationMinutes}m
                      </p>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          </TabsContent>

          <TabsContent value="review" className="mt-5 space-y-4">
            <div>
              <h2 className="text-xl font-semibold">Review system</h2>
              <p className="text-sm text-muted-foreground">
                Spaced repetition queue with weak-topic feedback loop into StudyGraph.
              </p>
            </div>
            <div className="rounded-2xl border border-border/70 bg-background p-4">
              <p className="text-sm font-medium">Review scope</p>
              <p className="text-xs text-muted-foreground">
                Build review sets from selected uploads, synced LMS courses, and topic labels.
              </p>
              <div className="mt-3 grid gap-3 md:grid-cols-3">
                <div>
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Uploads</p>
                  <div className="mt-2 max-h-36 space-y-1 overflow-auto rounded-lg border border-border/60 p-2">
                    {completedUploads.slice(0, 16).map((upload) => (
                      <label key={upload.id} className="flex items-center gap-2 text-xs">
                        <input
                          type="checkbox"
                          checked={selectedReviewUploadIds.includes(upload.id)}
                          onChange={() =>
                            setSelectedReviewUploadIds((current) => toggleSelection(current, upload.id))
                          }
                        />
                        <span className="truncate">{upload.title}</span>
                      </label>
                    ))}
                    {completedUploads.length === 0 ? (
                      <p className="text-xs text-muted-foreground">No completed uploads yet.</p>
                    ) : null}
                  </div>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">LMS courses</p>
                  <div className="mt-2 max-h-36 space-y-1 overflow-auto rounded-lg border border-border/60 p-2">
                    {lmsCourses.slice(0, 20).map((course) => (
                      <label key={course.id} className="flex items-center gap-2 text-xs">
                        <input
                          type="checkbox"
                          checked={selectedReviewCourseIds.includes(course.externalCourseId)}
                          onChange={() =>
                            setSelectedReviewCourseIds((current) =>
                              toggleSelection(current, course.externalCourseId)
                            )
                          }
                        />
                        <span className="truncate">{course.courseName}</span>
                      </label>
                    ))}
                    {lmsCourses.length === 0 ? (
                      <p className="text-xs text-muted-foreground">Sync Canvas/Moodle to list courses.</p>
                    ) : null}
                  </div>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">
                    Topic filters (comma separated)
                  </p>
                  <Input
                    value={reviewTopicFilter}
                    onChange={(event) => setReviewTopicFilter(event.target.value)}
                    placeholder="blood gas, dermatology, endocrine"
                    className="mt-2"
                  />
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button
                className="rounded-full"
                onClick={() => void handleGenerateReviewItems()}
                disabled={isReviewBusy}
              >
                {isReviewBusy ? <SpinnerGap className="mr-2 size-4 animate-spin" /> : null}
                Build review queue
              </Button>
              <Button
                variant="outline"
                className="rounded-full"
                onClick={() => void refreshReview()}
                disabled={isReviewBusy}
              >
                <ArrowClockwise className="mr-2 size-4" />
                Refresh queue
              </Button>
            </div>
            <div className="grid gap-3 md:grid-cols-4 text-xs">
              <div className="rounded-xl border border-border/70 bg-background p-3">
                <p className="text-muted-foreground">Active</p>
                <p className="text-xl font-semibold">{reviewStats.totalActive}</p>
              </div>
              <div className="rounded-xl border border-border/70 bg-background p-3">
                <p className="text-muted-foreground">Due now</p>
                <p className="text-xl font-semibold">{reviewStats.dueNow}</p>
              </div>
              <div className="rounded-xl border border-border/70 bg-background p-3">
                <p className="text-muted-foreground">Mastered</p>
                <p className="text-xl font-semibold">{reviewStats.mastered}</p>
              </div>
              <div className="rounded-xl border border-border/70 bg-background p-3">
                <p className="text-muted-foreground">Avg interval</p>
                <p className="text-xl font-semibold">{reviewStats.avgIntervalDays}d</p>
              </div>
            </div>
            <div className="space-y-2">
              {reviewQueue.length === 0 ? (
                <div className="rounded-xl border border-border/70 bg-background p-3 text-sm text-muted-foreground">
                  No due items right now. Generate queue or wait for next interval.
                </div>
              ) : (
                reviewQueue.map((item) => (
                  <div key={item.id} className="rounded-xl border border-border/70 bg-background p-3">
                    <p className="text-sm font-medium">{item.prompt}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Difficulty {item.difficulty}/5 · interval {item.intervalDays}d
                    </p>
                    <div className="mt-2 flex flex-wrap gap-1">
                      {[1, 2, 3, 4, 5].map((score) => (
                        <Button
                          key={score}
                          variant="outline"
                          size="sm"
                          className="rounded-full"
                          onClick={() => void handleGradeReview(item, score)}
                          disabled={isReviewBusy}
                        >
                          Score {score}
                        </Button>
                      ))}
                    </div>
                  </div>
                ))
              )}
            </div>
          </TabsContent>

          <TabsContent value="sources" className="mt-5 space-y-4">
            <div>
              <h2 className="text-xl font-semibold">Sources + StudyGraph</h2>
              <p className="text-sm text-muted-foreground">
                Explore file-grounded topics, objectives, deadlines, and weak areas.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Input
                value={studyGraphQuery}
                onChange={(event) => setStudyGraphQuery(event.target.value)}
                placeholder="Search study nodes (topic, objective, deadline)"
              />
              <Button
                variant="outline"
                className="rounded-full"
                onClick={() => {
                  void refreshStudyGraph(studyGraphQuery)
                }}
              >
                Search
              </Button>
            </div>
            <div className="grid gap-3 md:grid-cols-4 text-xs">
              <div className="rounded-xl border border-border/70 bg-background p-3">
                <p className="text-muted-foreground">Nodes</p>
                <p className="text-xl font-semibold">{studyGraphCounts.nodeCount}</p>
              </div>
              <div className="rounded-xl border border-border/70 bg-background p-3">
                <p className="text-muted-foreground">Topics</p>
                <p className="text-xl font-semibold">{studyGraphCounts.topicCount}</p>
              </div>
              <div className="rounded-xl border border-border/70 bg-background p-3">
                <p className="text-muted-foreground">Objectives</p>
                <p className="text-xl font-semibold">{studyGraphCounts.objectiveCount}</p>
              </div>
              <div className="rounded-xl border border-border/70 bg-background p-3">
                <p className="text-muted-foreground">Weak areas</p>
                <p className="text-xl font-semibold">{studyGraphCounts.weakAreaCount}</p>
              </div>
            </div>
            <div className="rounded-2xl border border-border/70 bg-background p-4">
              {isLoadingGraph ? (
                <p className="text-sm text-muted-foreground">Loading study graph...</p>
              ) : (
                <div className="space-y-2">
                  {studyGraphOverview.slice(0, 12).map((node) => (
                    <div key={node.id} className="rounded-xl border border-border/70 bg-muted/20 p-2 text-xs">
                      <p className="font-medium">{node.label}</p>
                      <p className="text-muted-foreground">
                        {node.nodeType} · weak {node.weakScore.toFixed(1)} · {formatDate(node.deadlineAt || null)}
                      </p>
                    </div>
                  ))}
                  {studyGraphOverview.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No study graph nodes yet.</p>
                  ) : null}
                </div>
              )}
            </div>
          </TabsContent>

          <TabsContent value="plugins" className="mt-5 space-y-4">
            <div>
              <h2 className="text-xl font-semibold">Plugin hub</h2>
              <p className="text-sm text-muted-foreground">
                LMS, calendar, literature, and speech/OCR integrations for workspace workflows.
              </p>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              {pluginCatalog.map((plugin) => {
                const status = pluginStatuses[plugin.id]?.status || "not_connected"
                const statusMetadata = pluginStatuses[plugin.id]?.metadata || {}
                const isBusy = pluginBusyId === plugin.id
                const isLms = plugin.id === "lms_canvas" || plugin.id === "lms_moodle"
                const connection = pluginConnectionInputs[plugin.id] || {
                  baseUrl: "",
                  accessToken: "",
                  courseIds: "",
                }
                const pluginCourses = lmsCourses.filter((course) => course.pluginId === plugin.id)
                const pluginArtifacts = lmsArtifacts.filter((artifact) => artifact.pluginId === plugin.id)
                return (
                  <div key={plugin.id} className="rounded-2xl border border-border/70 bg-background p-4">
                    <p className="text-sm font-semibold">{plugin.name}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{plugin.description}</p>
                    <p className="mt-1 text-xs text-muted-foreground">Status: {status}</p>
                    {isLms ? (
                      <div className="mt-3 space-y-2 rounded-xl border border-border/60 bg-muted/10 p-3">
                        <Input
                          value={connection.baseUrl}
                          onChange={(event) =>
                            setPluginConnectionInputs((current) => ({
                              ...current,
                              [plugin.id]: {
                                ...connection,
                                baseUrl: event.target.value,
                              },
                            }))
                          }
                          placeholder="LMS base URL"
                        />
                        <Input
                          value={connection.accessToken}
                          onChange={(event) =>
                            setPluginConnectionInputs((current) => ({
                              ...current,
                              [plugin.id]: {
                                ...connection,
                                accessToken: event.target.value,
                              },
                            }))
                          }
                          placeholder={
                            typeof statusMetadata.accessTokenMasked === "string"
                              ? `Stored token: ${statusMetadata.accessTokenMasked}`
                              : "LMS access token"
                          }
                          type="password"
                        />
                        <Input
                          value={connection.courseIds}
                          onChange={(event) =>
                            setPluginConnectionInputs((current) => ({
                              ...current,
                              [plugin.id]: {
                                ...connection,
                                courseIds: event.target.value,
                              },
                            }))
                          }
                          placeholder="Course IDs (comma separated, optional)"
                        />
                        <p className="text-xs text-muted-foreground">
                          Synced courses: {pluginCourses.length} · Artifacts: {pluginArtifacts.length}
                        </p>
                      </div>
                    ) : null}
                    <div className="mt-3 flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        className="rounded-full"
                        onClick={() => void handleConnectPlugin(plugin.id)}
                        disabled={isBusy}
                      >
                        {isBusy ? <SpinnerGap className="mr-2 size-4 animate-spin" /> : null}
                        Connect
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="rounded-full"
                        onClick={() => void handleSyncPlugin(plugin.id)}
                        disabled={isBusy || status === "not_connected" || status === "coming_soon"}
                      >
                        Sync
                      </Button>
                    </div>
                  </div>
                )
              })}
            </div>
            <div className="rounded-2xl border border-border/70 bg-background p-4">
              <p className="text-sm font-medium">Synced LMS artifacts</p>
              <p className="text-xs text-muted-foreground">
                Recent Moodle/Canvas items transformed into ingestion-ready workspace sources.
              </p>
              <div className="mt-3 max-h-52 space-y-2 overflow-auto">
                {lmsArtifacts.slice(0, 24).map((artifact) => (
                  <div key={artifact.id} className="rounded-xl border border-border/70 bg-muted/10 p-2 text-xs">
                    <p className="font-medium">{artifact.title}</p>
                    <p className="text-muted-foreground">
                      {artifact.provider} · {artifact.courseName} · {artifact.artifactType} ·{" "}
                      {artifact.uploadId ? "ingested" : "pending ingest"}
                    </p>
                  </div>
                ))}
                {lmsArtifacts.length === 0 ? (
                  <p className="text-xs text-muted-foreground">
                    No synced LMS artifacts yet. Connect and sync Moodle or Canvas to populate this list.
                  </p>
                ) : null}
              </div>
            </div>
          </TabsContent>

        </Tabs>
      </div>

      <aside className="hidden w-[320px] shrink-0 space-y-3 lg:block">
        <div className="rounded-2xl border border-border/70 bg-background p-4 shadow-sm">
          <p className="font-medium">Learning profile</p>
          <p className="mt-2 text-sm text-muted-foreground">
            School: {preferences.studentSchool?.trim() || "Not set"}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            Year: {preferences.studentYear?.trim() || "Not set"}
          </p>
        </div>
        <div className="rounded-2xl border border-border/70 bg-background p-4 shadow-sm">
          <p className="font-medium">Pro tips</p>
          <div className="mt-2 space-y-2 text-xs text-muted-foreground">
            <p className="flex items-start gap-2">
              <Sparkle className="mt-0.5 size-3.5 shrink-0" />
              Bulk-upload files in themed collections (module or exam block).
            </p>
            <p className="flex items-start gap-2">
              <Brain className="mt-0.5 size-3.5 shrink-0" />
              Parse timetable docs first, then generate planner blocks in chat.
            </p>
            <p className="flex items-start gap-2">
              <Lightning className="mt-0.5 size-3.5 shrink-0" />
              Run review queue daily so weak topics feed back into plans.
            </p>
          </div>
        </div>
      </aside>
    </div>
  )
}

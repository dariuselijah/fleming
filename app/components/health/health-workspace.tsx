"use client"

import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { listUserUploads } from "@/lib/uploads/api"
import type { UserUploadListItem } from "@/lib/uploads/types"
import { getHealthConnectorCatalog } from "@/lib/health-connectors/catalog"
import {
  getConnectorInitials,
  getConnectorLogoSrc,
  getConnectorTintClassName,
} from "@/lib/health-connectors/branding"
import {
  connectHealthConnector,
  fetchHealthConnectorSummary,
  fetchHealthConnectorStatuses,
  syncHealthConnector,
  type HealthConnectorSummaryPayload,
} from "@/lib/health-connectors/client"
import type {
  HealthConnectorDefinition,
  HealthConnectorRuntimeStatus,
  HealthConnectorStatusRecord,
} from "@/lib/health-connectors/types"
import { useUserPreferences } from "@/lib/user-preference-store/provider"
import { useUser } from "@/lib/user-store/provider"
import {
  ArrowsClockwise,
  CaretRight,
  CheckCircle,
  Link,
  MagnifyingGlass,
  Plus,
} from "@phosphor-icons/react"
import { useCallback, useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { HealthHomeSection } from "./health-home-section"
import {
  buildHealthMemories,
  buildProfileTasks,
  defaultHealthWorkspaceState,
  readHealthWorkspaceState,
  type ConnectorStatus,
  type HealthWorkspaceState,
  writeHealthWorkspaceState,
} from "./workspace-state"

const INSIGHT_CARDS = [
  {
    title: "Your sleep is trending upward",
    detail:
      "You are getting more rest lately. Keeping your bedtime within about 30 minutes most nights can help sustain momentum.",
    prompt: "What habits could help me keep a consistent bedtime?",
  },
  {
    title: "Late-morning focus is your current advantage",
    detail:
      "Your focus tends to peak around 10 a.m. Consider scheduling deep work, important tasks, or workouts during this window.",
    prompt: "How can I structure my day around my peak focus time?",
  },
  {
    title: "Your training load may be driving fatigue today",
    detail:
      "Marathon training can increase fatigue. Prioritizing hydration, recovery, and consistent sleep can help your body adapt.",
    prompt: "What recovery strategies can help reduce fatigue during marathon training?",
  },
]

function connectorStatusLabel(status: ConnectorStatus) {
  if (status === "connected") return "Connected"
  if (status === "pending") return "Connecting"
  if (status === "coming_soon") return "Coming soon"
  if (status === "error") return "Connection failed"
  return "Not connected"
}

function statusBadgeVariant(
  status: HealthConnectorRuntimeStatus
): "default" | "secondary" | "outline" {
  if (status === "connected") return "default"
  if (status === "pending") return "secondary"
  return "outline"
}

function runtimeStatusLabel(status: HealthConnectorRuntimeStatus): string {
  if (status === "not_connected") return "Not connected"
  if (status === "coming_soon") return "Coming soon"
  if (status === "pending") return "Connecting"
  if (status === "error") return "Error"
  return "Connected"
}

function connectorLastSyncLabel(record: HealthConnectorStatusRecord | undefined): string {
  if (!record?.lastSyncAt) return "Not yet synced"
  const time = new Date(record.lastSyncAt).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  })
  return `Last sync ${time}`
}

function normalizeConnectorStatus(
  connector: HealthConnectorDefinition,
  statuses: Record<string, HealthConnectorRuntimeStatus>
): HealthConnectorRuntimeStatus {
  if (connector.availability === "coming_soon") return "coming_soon"
  return statuses[connector.id] || "not_connected"
}

function aggregateConnectorStatus(
  connectors: HealthConnectorDefinition[],
  statuses: Record<string, HealthConnectorRuntimeStatus>
): ConnectorStatus {
  if (connectors.length === 0) return "not_connected"
  const values = connectors.map((connector) =>
    normalizeConnectorStatus(connector, statuses)
  )
  if (values.some((value) => value === "connected")) return "connected"
  if (values.some((value) => value === "pending")) return "pending"
  if (values.every((value) => value === "coming_soon")) return "coming_soon"
  if (values.some((value) => value === "error")) return "error"
  return "not_connected"
}

function shortDate(value: string) {
  return new Date(value).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  })
}

export function HealthWorkspace() {
  const router = useRouter()
  const { user } = useUser()
  const { preferences, updatePreferences } = useUserPreferences()
  const [workspace, setWorkspace] = useState<HealthWorkspaceState>(
    defaultHealthWorkspaceState
  )
  const [activeTab, setActiveTab] = useState("explore")
  const [uploads, setUploads] = useState<UserUploadListItem[]>([])
  const [searchFiles, setSearchFiles] = useState("")
  const [fileStatusFilter, setFileStatusFilter] = useState("all")
  const [filesOpen, setFilesOpen] = useState(false)
  const [bioDialogOpen, setBioDialogOpen] = useState(false)
  const [bioDraft, setBioDraft] = useState("")
  const [connectMedicalOpen, setConnectMedicalOpen] = useState(false)
  const [connectWearablesOpen, setConnectWearablesOpen] = useState(false)
  const [memoryQuery, setMemoryQuery] = useState("")
  const [isLoadingUploads, setIsLoadingUploads] = useState(false)
  const [connectorStatuses, setConnectorStatuses] = useState<
    Record<string, HealthConnectorRuntimeStatus>
  >({})
  const [connectorStatusRecords, setConnectorStatusRecords] = useState<
    Record<string, HealthConnectorStatusRecord>
  >({})
  const [connectorNotice, setConnectorNotice] = useState<string | null>(null)
  const [activeConnectorProviderId, setActiveConnectorProviderId] = useState<
    string | null
  >(null)
  const [activeConnectorSyncId, setActiveConnectorSyncId] = useState<string | null>(null)
  const [activeConnectorAttempt, setActiveConnectorAttempt] = useState<
    "medicalRecords" | "wearables" | null
  >(null)
  const [dashboardSummary, setDashboardSummary] =
    useState<HealthConnectorSummaryPayload | null>(null)

  const connectorCatalog = useMemo(() => getHealthConnectorCatalog(), [])
  const wearableConnectors = useMemo(
    () =>
      connectorCatalog.filter(
        (connector) =>
          connector.category === "wearable" || connector.category === "native_mobile"
      ),
    [connectorCatalog]
  )
  const medicalRecordConnectors = useMemo(
    () =>
      connectorCatalog.filter((connector) => connector.category === "medical_records"),
    [connectorCatalog]
  )
  const smartMedicalConnectors = useMemo(
    () =>
      medicalRecordConnectors.filter(
        (connector) => connector.protocol === "smart_on_fhir"
      ),
    [medicalRecordConnectors]
  )
  const aggregatorMedicalConnectors = useMemo(
    () =>
      medicalRecordConnectors.filter((connector) => connector.protocol === "aggregator"),
    [medicalRecordConnectors]
  )
  const wearableApiConnectors = useMemo(
    () => wearableConnectors.filter((connector) => connector.category === "wearable"),
    [wearableConnectors]
  )
  const wearableNativeConnectors = useMemo(
    () =>
      wearableConnectors.filter((connector) => connector.category === "native_mobile"),
    [wearableConnectors]
  )

  useEffect(() => {
    setWorkspace(readHealthWorkspaceState(user?.id))
  }, [user?.id])

  useEffect(() => {
    writeHealthWorkspaceState(user?.id, workspace)
  }, [user?.id, workspace])

  useEffect(() => {
    let cancelled = false
    setIsLoadingUploads(true)
    listUserUploads({ allowStale: true, revalidateInBackground: true })
      .then((items) => {
        if (!cancelled) setUploads(items)
      })
      .finally(() => {
        if (!cancelled) setIsLoadingUploads(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const tasks = useMemo(
    () => buildProfileTasks(preferences, workspace),
    [preferences, workspace]
  )
  const completedCount = tasks.filter((item) => item.completed).length

  const dashboardCards = useMemo(() => {
    const readiness = dashboardSummary?.readinessScore
    const sleep = dashboardSummary?.sleepScore
    const activity = dashboardSummary?.activityScore
    return [
      {
        title: "Readiness Score",
        value: typeof readiness === "number" ? `${readiness}%` : "--",
        label:
          typeof readiness === "number"
            ? readiness >= 80
              ? "Ready"
              : readiness >= 60
                ? "Moderate"
                : "Low"
            : "No data",
      },
      {
        title: "Sleep Score",
        value: typeof sleep === "number" ? `${sleep}%` : "--",
        label:
          typeof sleep === "number"
            ? sleep >= 80
              ? "Good"
              : sleep >= 60
                ? "Fair"
                : "Low"
            : "No data",
      },
      {
        title: "Activity Score",
        value: typeof activity === "number" ? `${activity}%` : "--",
        label:
          typeof activity === "number"
            ? activity >= 80
              ? "Active"
              : activity >= 60
                ? "Steady"
                : "Low"
            : "No data",
      },
    ]
  }, [dashboardSummary])

  const filteredUploads = useMemo(() => {
    return uploads.filter((upload) => {
      const statusMatches =
        fileStatusFilter === "all" || upload.status === fileStatusFilter
      const queryMatches =
        searchFiles.trim().length === 0 ||
        `${upload.title} ${upload.fileName}`
          .toLowerCase()
          .includes(searchFiles.toLowerCase())
      return statusMatches && queryMatches
    })
  }, [uploads, fileStatusFilter, searchFiles])

  const memories = useMemo(
    () => buildHealthMemories(preferences, workspace),
    [preferences, workspace]
  )

  const visibleMemories = useMemo(() => {
    if (!memoryQuery.trim()) return memories
    return memories.filter((item) =>
      `${item.category} ${item.label} ${item.value}`
        .toLowerCase()
        .includes(memoryQuery.toLowerCase())
    )
  }, [memories, memoryQuery])

  const refreshConnectorStatuses = useCallback(async () => {
    try {
      const statuses = await fetchHealthConnectorStatuses()
      setConnectorStatusRecords(statuses)
      const next = Object.entries(statuses).reduce(
        (acc, [connectorId, record]) => {
          acc[connectorId] = record?.status || "not_connected"
          return acc
        },
        {} as Record<string, HealthConnectorRuntimeStatus>
      )
      setConnectorStatuses(next)
      setWorkspace((current) => ({
        ...current,
        connectors: {
          medicalRecords: aggregateConnectorStatus(medicalRecordConnectors, next),
          wearables: aggregateConnectorStatus(wearableConnectors, next),
        },
      }))
    } catch (error) {
      console.warn("Failed to refresh connector statuses", error)
    }
  }, [medicalRecordConnectors, wearableConnectors])

  const refreshDashboardSummary = useCallback(async () => {
    try {
      const summary = await fetchHealthConnectorSummary()
      setDashboardSummary(summary)
    } catch (error) {
      console.warn("Failed to fetch connector summary", error)
    }
  }, [])

  useEffect(() => {
    refreshConnectorStatuses()
    refreshDashboardSummary()
  }, [refreshConnectorStatuses, refreshDashboardSummary])

  useEffect(() => {
    if (typeof window === "undefined") return
    const params = new URLSearchParams(window.location.search)
    const connectorStatus = params.get("connector_status")
    const connector = params.get("connector")
    if (!connectorStatus) return

    if (connectorStatus === "connected" && connector) {
      setConnectorNotice(`${connector.replace(/_/g, " ")} connected successfully.`)
    } else if (connectorStatus === "error" && connector) {
      setConnectorNotice(`Failed to connect ${connector.replace(/_/g, " ")}.`)
    }

    refreshConnectorStatuses()
    refreshDashboardSummary()
  }, [refreshConnectorStatuses, refreshDashboardSummary])

  const openMedicalRecordsModal = () => {
    setConnectorNotice(null)
    setConnectMedicalOpen(true)
  }

  const openWearablesModal = () => {
    setConnectorNotice(null)
    setConnectWearablesOpen(true)
  }

  const connectConnector = async (
    connector: "medicalRecords" | "wearables",
    providerId: string
  ) => {
    setActiveConnectorAttempt(connector)
    setActiveConnectorProviderId(providerId)
    setConnectorNotice(null)
    try {
      const result = await connectHealthConnector(providerId)
      setConnectorStatuses((current) => ({
        ...current,
        [providerId]: result.status,
      }))
      setConnectorStatusRecords((current) => ({
        ...current,
        [providerId]: {
          connectorId: providerId as HealthConnectorStatusRecord["connectorId"],
          status: result.status,
          updatedAt: new Date().toISOString(),
          lastError: result.status === "error" ? result.message || null : null,
          lastSyncAt: current[providerId]?.lastSyncAt || null,
        },
      }))
      if (result.message) {
        setConnectorNotice(result.message)
      }
      if (result.redirectUrl && typeof window !== "undefined") {
        window.location.assign(result.redirectUrl)
        return
      }
      await refreshConnectorStatuses()
      await refreshDashboardSummary()
    } catch {
      setWorkspace((current) => ({
        ...current,
        connectors: {
          ...current.connectors,
          [connector]: "error",
        },
      }))
      setConnectorNotice("Unable to start connector connection. Please try again.")
    } finally {
      setActiveConnectorAttempt(null)
      setActiveConnectorProviderId(null)
    }
  }

  const runConnectorSync = async (providerId: string) => {
    setActiveConnectorSyncId(providerId)
    setConnectorNotice(null)
    try {
      const summary = await syncHealthConnector(providerId)
      if (summary.status === "ok") {
        setConnectorNotice(
          `${providerId.replace(/_/g, " ")} synced (${summary.metricsIngested} metrics, ${summary.recordsIngested} records).`
        )
      } else if (summary.status === "skipped") {
        setConnectorNotice(summary.error || "Connector sync skipped.")
      } else {
        setConnectorNotice(summary.error || "Connector sync failed.")
      }
      await refreshConnectorStatuses()
      await refreshDashboardSummary()
    } catch (error) {
      setConnectorNotice(
        error instanceof Error
          ? error.message
          : "Connector sync failed. Please try again."
      )
    } finally {
      setActiveConnectorSyncId(null)
    }
  }

  const setHealthGoal = async () => {
    await updatePreferences({
      healthContext:
        preferences.healthContext?.trim() ||
        "Increase energy, manage stress, and keep a consistent bedtime.",
      lifestyleFactors:
        preferences.lifestyleFactors?.trim() ||
        "Walk 8k steps/day, strength train 3x/week, sleep by 11:30 PM.",
    })
  }

  const openBioEditor = () => {
    setBioDraft(workspace.bio)
    setBioDialogOpen(true)
  }

  const saveBio = () => {
    setWorkspace((current) => ({ ...current, bio: bioDraft.trim() }))
    setBioDialogOpen(false)
  }

  const handleJourneyPrompt = (prompt: string) => {
    router.push(`/?prompt=${encodeURIComponent(prompt)}`)
  }

  const renderConnectorCard = (
    provider: HealthConnectorDefinition,
    connector: "medicalRecords" | "wearables"
  ) => {
    const status = normalizeConnectorStatus(provider, connectorStatuses)
    const statusRecord = connectorStatusRecords[provider.id]
    const isConnecting =
      activeConnectorAttempt === connector &&
      activeConnectorProviderId === provider.id
    const isSyncing = activeConnectorSyncId === provider.id
    const canConnect =
      provider.availability !== "coming_soon" &&
      status !== "connected" &&
      status !== "pending" &&
      !isConnecting
    const canSync =
      status === "connected" &&
      !isSyncing &&
      provider.availability !== "coming_soon"

    return (
      <div
        key={provider.id}
        className="group rounded-2xl border border-border/70 bg-gradient-to-b from-background to-muted/20 p-3.5 shadow-sm transition hover:border-border"
      >
        <div className="flex items-start gap-3">
          <Avatar
            className={`size-10 rounded-xl border ${getConnectorTintClassName(provider.id)}`}
          >
            <AvatarImage src={getConnectorLogoSrc(provider)} alt={`${provider.name} logo`} />
            <AvatarFallback className="rounded-xl text-[10px] font-semibold">
              {getConnectorInitials(provider.name)}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold leading-tight">{provider.name}</p>
                <p className="text-muted-foreground mt-1 line-clamp-2 text-xs leading-relaxed">
                  {provider.description}
                </p>
              </div>
              <Badge variant={statusBadgeVariant(status)} className="shrink-0 rounded-full">
                {runtimeStatusLabel(status)}
              </Badge>
            </div>

            <div className="mt-3 flex items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="text-muted-foreground truncate text-[11px]">
                  {provider.domain}
                </p>
                <p className="text-muted-foreground mt-0.5 truncate text-[11px]">
                  {connectorLastSyncLabel(statusRecord)}
                </p>
              </div>
              <Button
                size="sm"
                className="h-8 rounded-full px-3 text-xs"
                variant={status === "connected" ? "outline" : "default"}
                disabled={
                  provider.availability === "coming_soon" ||
                  (status === "connected" ? !canSync : !canConnect)
                }
                onClick={() =>
                  status === "connected"
                    ? runConnectorSync(provider.id)
                    : connectConnector(connector, provider.id)
                }
              >
                {isSyncing ? (
                  <>
                    <ArrowsClockwise className="mr-1.5 size-3.5 animate-spin" />
                    Syncing...
                  </>
                ) : isConnecting ? (
                  <>
                    <ArrowsClockwise className="mr-1.5 size-3.5 animate-spin" />
                    Connecting...
                  </>
                ) : provider.availability === "coming_soon" ? (
                  "Coming soon"
                ) : status === "connected" ? (
                  "Sync now"
                ) : status === "pending" ? (
                  "Pending"
                ) : (
                  "Connect"
                )}
              </Button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto flex w-full max-w-[1200px] gap-6 px-4 pt-22 pb-8">
      <div className="min-w-0 flex-1">
        <div className="mb-6">
          <p className="text-muted-foreground text-sm">AskFleming Health Beta</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight">
            Welcome to AskFleming Health
          </h1>
          <p className="text-muted-foreground mt-2 max-w-3xl text-sm">
            Connect your records and devices to unlock your health dashboard, track
            biomarkers, and get personalized insights to optimize your wellbeing.
          </p>
          <p className="text-muted-foreground mt-2 text-xs">
            Complete profile ({completedCount}/{tasks.length})
          </p>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="bg-transparent p-0">
            <TabsTrigger value="explore" className="rounded-full px-4">
              Explore
            </TabsTrigger>
            <TabsTrigger value="dashboard" className="rounded-full px-4">
              Dashboard
            </TabsTrigger>
            <TabsTrigger value="history" className="rounded-full px-4">
              History
            </TabsTrigger>
          </TabsList>

          <TabsContent value="explore" className="mt-5 space-y-6">
            {!workspace.hideGettingStarted ? (
              <section className="rounded-2xl border border-border/70 bg-background p-4 shadow-sm">
                <div className="mb-3 flex items-center justify-between">
                  <div>
                    <h2 className="font-semibold">Getting started</h2>
                    <p className="text-muted-foreground text-sm">
                      Set up your health data and goals to unlock your personalized experience.
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="rounded-full"
                    onClick={() =>
                      setWorkspace((current) => ({
                        ...current,
                        hideGettingStarted: true,
                      }))
                    }
                  >
                    Hide
                  </Button>
                </div>
                <div className="overflow-hidden rounded-xl border border-border/70">
                  <button
                    type="button"
                    onClick={setHealthGoal}
                    className="hover:bg-muted/30 flex w-full items-start justify-between gap-3 border-b border-border/70 px-4 py-3 text-left"
                  >
                    <div>
                      <p className="font-medium">Complete your health goals</p>
                      <p className="text-muted-foreground text-xs">
                        Set your health goals to get personalized insights and recommendations
                      </p>
                    </div>
                    {tasks[0]?.completed ? (
                      <CheckCircle className="mt-0.5 size-4 text-emerald-500" weight="fill" />
                    ) : (
                      <CaretRight className="mt-0.5 size-4 text-muted-foreground" />
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={openMedicalRecordsModal}
                    className="hover:bg-muted/30 flex w-full items-start justify-between gap-3 border-b border-border/70 px-4 py-3 text-left"
                  >
                    <div>
                      <p className="font-medium">Connect Medical Record provider</p>
                      <p className="text-muted-foreground text-xs">
                        Link labs and health records from your healthcare providers
                      </p>
                    </div>
                    <CaretRight className="mt-0.5 size-4 text-muted-foreground" />
                  </button>
                  <button
                    type="button"
                    onClick={openWearablesModal}
                    className="hover:bg-muted/30 flex w-full items-start justify-between gap-3 px-4 py-3 text-left"
                  >
                    <div>
                      <p className="font-medium">Connect wearable devices</p>
                      <p className="text-muted-foreground text-xs">
                        Sync data from 10+ sources including Oura, Fitbit, and more
                      </p>
                    </div>
                    <CaretRight className="mt-0.5 size-4 text-muted-foreground" />
                  </button>
                </div>
              </section>
            ) : null}

            <HealthHomeSection
              userRole={preferences.userRole}
              showHeader={false}
              showWorkspaceLink={false}
              helperText="Select a journey to open it in AskFleming chat."
              onJourneyPrompt={handleJourneyPrompt}
            />
          </TabsContent>

          <TabsContent value="dashboard" className="mt-5 space-y-5">
            <section className="rounded-2xl border border-border/70 bg-background p-4 shadow-sm">
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-semibold">Health Overview</h2>
                  <p className="text-muted-foreground text-sm">
                    Snapshot of your current health across key metrics
                  </p>
                </div>
                <p className="text-muted-foreground text-xs">
                  {dashboardSummary
                    ? `${dashboardSummary.metricSampleCount} recent metric samples`
                    : "Sync a connector to load metrics"}
                </p>
              </div>
              <div className="grid gap-3 md:grid-cols-3">
                {dashboardCards.map((metric) => (
                  <div key={metric.title} className="rounded-xl border border-border/70 bg-muted/20 p-3">
                    <div className="mb-1 flex items-center justify-between text-sm">
                      <span>{metric.title}</span>
                      <span className="text-emerald-600">{metric.label}</span>
                    </div>
                    <p className="text-2xl font-semibold">{metric.value}</p>
                    <p className="text-muted-foreground text-xs">
                      {dashboardSummary
                        ? `Clinical records: ${dashboardSummary.recentClinicalRecordCount}`
                        : "Connect and sync a source to populate this card."}
                    </p>
                  </div>
                ))}
              </div>
            </section>

            <section>
              <h2 className="mb-3 text-xl font-semibold">Insights & Trends</h2>
              <div className="space-y-3">
                {INSIGHT_CARDS.map((insight) => (
                  <div key={insight.title} className="rounded-xl border border-border/70 bg-background p-4">
                    <p className="font-medium">{insight.title}</p>
                    <p className="text-muted-foreground mt-2 text-sm">{insight.detail}</p>
                    <button type="button" className="text-muted-foreground mt-3 inline-flex items-center gap-1 text-sm">
                      <MagnifyingGlass className="size-4" />
                      {insight.prompt}
                    </button>
                  </div>
                ))}
              </div>
            </section>
          </TabsContent>

          <TabsContent value="history" className="mt-5">
            <section className="rounded-2xl border border-border/70 bg-background p-4 shadow-sm">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-xl font-semibold">Health Memories</h2>
                <div className="flex items-center gap-2">
                  <MagnifyingGlass className="size-4 text-muted-foreground" />
                  <input
                    value={memoryQuery}
                    onChange={(event) => setMemoryQuery(event.target.value)}
                    className="w-52 bg-transparent text-sm outline-none"
                    placeholder="Search memories"
                  />
                </div>
              </div>
              <div className="space-y-3">
                {visibleMemories.map((memory) => (
                  <div key={memory.id} className="rounded-xl border border-border/60 bg-muted/15 p-3">
                    <p className="text-muted-foreground text-xs">
                      {memory.dateLabel} {memory.category}: {memory.label}
                    </p>
                    <p className="mt-1 text-sm">{memory.value}</p>
                  </div>
                ))}
                {visibleMemories.length === 0 ? (
                  <p className="text-muted-foreground text-sm">No memories match your search.</p>
                ) : null}
              </div>
            </section>
          </TabsContent>
        </Tabs>
      </div>

      <aside className="hidden w-[320px] shrink-0 space-y-3 lg:block">
        <div className="rounded-2xl border border-border/70 bg-background p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <p className="font-medium">Bio</p>
            <Button variant="ghost" size="sm" className="h-7 px-2" onClick={openBioEditor}>
              Edit
            </Button>
          </div>
          <p className="text-muted-foreground mt-2 text-sm">
            {workspace.bio || "Your bio will appear here"}
          </p>
        </div>

        <div className="rounded-2xl border border-border/70 bg-background p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <p className="font-medium">Health files</p>
            <button
              type="button"
              className="text-muted-foreground hover:text-foreground"
              onClick={() => setFilesOpen(true)}
            >
              <Plus className="size-4" />
            </button>
          </div>
          <p className="text-muted-foreground mt-2 text-sm">
            {uploads.length > 0
              ? `${uploads.length} uploaded file${uploads.length > 1 ? "s" : ""}`
              : "Your uploaded documents will show up here"}
          </p>
        </div>

        <div className="rounded-2xl border border-border/70 bg-background p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <p className="font-medium">Connectors</p>
            <button
              type="button"
              className="text-muted-foreground hover:text-foreground"
              onClick={openMedicalRecordsModal}
            >
              <Plus className="size-4" />
            </button>
          </div>
          <p className="text-muted-foreground mt-2 text-sm">
            Medical records: {connectorStatusLabel(workspace.connectors.medicalRecords)}
          </p>
          <p className="text-muted-foreground mt-1 text-sm">
            Wearables: {connectorStatusLabel(workspace.connectors.wearables)}
          </p>
        </div>

        <p className="text-muted-foreground px-1 text-xs">
          AskFleming Health is not intended to diagnose, treat, or replace consultation with a medical professional.
        </p>
        <p className="text-muted-foreground flex items-center gap-1 px-1 text-xs">
          <Link className="size-3.5" />
          Encrypted and protected E2E
        </p>
      </aside>

      <Dialog open={bioDialogOpen} onOpenChange={setBioDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Update your health bio</DialogTitle>
            <DialogDescription>
              Add a short note about your goals, baseline, or personal context.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            value={bioDraft}
            onChange={(event) => setBioDraft(event.target.value)}
            placeholder="Example: Training for a half-marathon, tracking resting heart rate, and focused on better sleep."
            rows={5}
          />
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setBioDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={saveBio}>Save bio</Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={filesOpen} onOpenChange={setFilesOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Files</DialogTitle>
            <DialogDescription>
              Files that you sync and upload will be available here.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-wrap items-center gap-2">
            <Input
              value={searchFiles}
              onChange={(event) => setSearchFiles(event.target.value)}
              placeholder="Filter by name..."
              className="max-w-sm"
            />
            <Select value={fileStatusFilter} onValueChange={setFileStatusFilter}>
              <SelectTrigger className="w-[160px]">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All status</SelectItem>
                <SelectItem value="completed">Completed</SelectItem>
                <SelectItem value="processing">Processing</SelectItem>
                <SelectItem value="failed">Failed</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" size="sm">
              <Plus className="mr-1.5 size-4" />
              Add files
            </Button>
          </div>
          <div className="overflow-hidden rounded-xl border border-border/70">
            <div className="grid grid-cols-[2fr_1fr_1fr_1fr] gap-2 border-b border-border/70 px-3 py-2 text-xs text-muted-foreground">
              <span>Name</span>
              <span>Origin</span>
              <span>Date</span>
              <span>Status</span>
            </div>
            <div className="max-h-[320px] overflow-y-auto">
              {isLoadingUploads ? (
                <p className="text-muted-foreground px-3 py-8 text-sm">Loading files...</p>
              ) : filteredUploads.length === 0 ? (
                <p className="text-muted-foreground px-3 py-8 text-sm">
                  Files that you sync will be found here.
                </p>
              ) : (
                filteredUploads.map((upload) => (
                  <div
                    key={upload.id}
                    className="grid grid-cols-[2fr_1fr_1fr_1fr] items-center gap-2 border-b border-border/40 px-3 py-2 text-sm last:border-0"
                  >
                    <span className="truncate">{upload.title}</span>
                    <span className="text-muted-foreground">{upload.uploadKind}</span>
                    <span className="text-muted-foreground">{shortDate(upload.updatedAt)}</span>
                    <span className="capitalize">{upload.status}</span>
                  </div>
                ))
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={connectMedicalOpen} onOpenChange={setConnectMedicalOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Connect your Medical Records</DialogTitle>
            <DialogDescription>
              AskFleming can access your medical records to answer relevant health questions and surface trends.
            </DialogDescription>
          </DialogHeader>
          {connectorNotice ? (
            <p className="text-muted-foreground rounded-xl border border-border/70 bg-muted/30 px-3 py-2 text-sm">
              {connectorNotice}
            </p>
          ) : null}
          <div className="max-h-[62vh] space-y-4 overflow-y-auto pr-1">
            <section className="space-y-2">
              <div className="flex items-center justify-between px-0.5">
                <p className="text-sm font-semibold">SMART on FHIR providers</p>
                <p className="text-muted-foreground text-xs">
                  {smartMedicalConnectors.length} connectors
                </p>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                {smartMedicalConnectors.map((provider) =>
                  renderConnectorCard(provider, "medicalRecords")
                )}
              </div>
            </section>

            <section className="space-y-2">
              <div className="flex items-center justify-between px-0.5">
                <p className="text-sm font-semibold">Aggregator partners</p>
                <p className="text-muted-foreground text-xs">
                  {aggregatorMedicalConnectors.length} connectors
                </p>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                {aggregatorMedicalConnectors.map((provider) =>
                  renderConnectorCard(provider, "medicalRecords")
                )}
              </div>
            </section>
          </div>
          <div className="flex justify-end">
            <Button onClick={() => setConnectMedicalOpen(false)}>Done</Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={connectWearablesOpen} onOpenChange={setConnectWearablesOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Connect your wearable device</DialogTitle>
            <DialogDescription>
              AskFleming can access wearable data to answer relevant health questions and surface trends.
            </DialogDescription>
          </DialogHeader>
          {connectorNotice ? (
            <p className="text-muted-foreground rounded-xl border border-border/70 bg-muted/30 px-3 py-2 text-sm">
              {connectorNotice}
            </p>
          ) : null}
          <div className="max-h-[62vh] space-y-4 overflow-y-auto pr-1">
            <section className="space-y-2">
              <div className="flex items-center justify-between px-0.5">
                <p className="text-sm font-semibold">Wearable API providers</p>
                <p className="text-muted-foreground text-xs">
                  {wearableApiConnectors.length} connectors
                </p>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                {wearableApiConnectors.map((provider) =>
                  renderConnectorCard(provider, "wearables")
                )}
              </div>
            </section>

            <section className="space-y-2">
              <div className="flex items-center justify-between px-0.5">
                <p className="text-sm font-semibold">Native mobile sources</p>
                <p className="text-muted-foreground text-xs">
                  {wearableNativeConnectors.length} coming soon
                </p>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                {wearableNativeConnectors.map((provider) =>
                  renderConnectorCard(provider, "wearables")
                )}
              </div>
            </section>
          </div>
          <div className="flex justify-end">
            <Button onClick={() => setConnectWearablesOpen(false)}>Done</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

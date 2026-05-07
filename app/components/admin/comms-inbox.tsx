"use client"

import { useWorkspace, useWorkspaceStore, type InboxScrollTarget } from "@/lib/clinical-workspace"
import { cn } from "@/lib/utils"
import {
  Phone,
  ChatCircle,
  ChatText,
  Envelope,
  ArrowLeft,
  PaperPlaneTilt,
  ChatDots,
  UserPlus,
  CalendarCheck,
  Check,
  Checks,
  CircleNotch,
  Robot,
  HandWaving,
  Pulse,
  CaretRight,
  X,
  Flask,
} from "@phosphor-icons/react"
import { BentoTile } from "./bento-tile"
import {
  filterNotificationsForStrip,
  LabResultsQueue,
  NotificationChip,
  NotificationPanel,
  SmartImportTile,
} from "./bento-inbox"
import { LiveActivityFeed } from "./live-activity-feed"
import { LabIntegrationsPanel } from "./lab-integrations-panel"
import { useState, useCallback, useEffect, useRef, useMemo } from "react"
import { AnimatePresence, motion } from "motion/react"
import { getVoiceCapabilityState, isMessagingChannelLive } from "@/lib/comms/channel-capability"

// ── Channel styling ──

const CHANNEL_ICON: Record<string, typeof ChatText> = {
  rcs: ChatText,
  voice: Phone,
  sms: ChatText,
  email: Envelope,
}

const CHANNEL_COLOR: Record<string, string> = {
  rcs: "text-emerald-400",
  voice: "text-purple-400",
  sms: "text-blue-500",
  email: "text-rose-400",
}

const CHANNEL_BG: Record<string, string> = {
  rcs: "bg-emerald-500/10",
  voice: "bg-purple-400/10",
  sms: "bg-blue-500/10",
  email: "bg-rose-400/10",
}

const STATUS_STYLE: Record<string, { label: string; color: string; bg: string }> = {
  active: { label: "Auto-reply", color: "text-emerald-400", bg: "bg-emerald-400/10" },
  awaiting_input: { label: "Awaiting Reply", color: "text-blue-400", bg: "bg-blue-400/10" },
  handoff: { label: "Needs Attention", color: "text-amber-400", bg: "bg-amber-400/10" },
  closed: { label: "Closed", color: "text-muted-foreground dark:text-white/30", bg: "bg-muted dark:bg-white/[0.04]" },
}

const PRIORITY_BADGE: Record<string, string> = {
  urgent: "bg-red-500/15 text-red-400",
  high: "bg-amber-500/15 text-amber-400",
  normal: "",
  low: "",
}

const DELIVERY_ICON: Record<string, typeof Check> = {
  sent: Check,
  delivered: Checks,
  read: Checks,
  failed: X,
}

// ── Types ──

interface ThreadItem {
  id: string
  channel: string
  externalParty: string
  patientId?: string
  patientName: string
  status: string
  priority: string
  currentFlow: string
  lastMessageAt: string
  unreadCount: number
}

interface MessageItem {
  id: string
  direction: string
  senderType: string
  contentType: string
  body?: string
  mediaUrl?: string
  mediaMimeType?: string
  deliveryStatus: string
  agentToolCalls?: { tool: string; args: Record<string, unknown>; result?: unknown }[]
  createdAt: string
}

interface VoiceCallItem {
  id: string
  transcript: string | null
  summary: string | null
  durationSeconds: number | null
  recordingUrl: string | null
  intent: string | null
  structuredOutcome: unknown
}

// ── Main component ──

type PracticeChannelRow = {
  channel_type: string
  status: string
  provider?: string | null
  phone_number?: string | null
  phone_number_sid?: string | null
  sender_display_name?: string | null
  vapi_assistant_id?: string | null
  vapi_phone_number_id?: string | null
}

export function CommsInbox() {
  const {
    inboxMessages,
    notifications,
    patients,
    inboxNotificationFilter,
    setInboxNotificationFilter,
    setAdminTab,
    inboxScrollRequest,
  } = useWorkspace()
  const markNotificationRead = useWorkspaceStore((s) => s.markNotificationRead)
  const markAllNotificationsRead = useWorkspaceStore((s) => s.markAllNotificationsRead)
  const addPatient = useWorkspaceStore((s) => s.addPatient)
  const addInboxMessage = useWorkspaceStore((s) => s.addInboxMessage)
  const addNotification = useWorkspaceStore((s) => s.addNotification)
  const inboxNotificationsPanelRequest = useWorkspaceStore((s) => s.inboxNotificationsPanelRequest)

  const labs = useMemo(() => inboxMessages.filter((m) => m.channel === "lab"), [inboxMessages])
  const labsSorted = useMemo(
    () => [...labs].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()),
    [labs]
  )
  const stripNotifications = useMemo(
    () => filterNotificationsForStrip(notifications, inboxNotificationFilter),
    [notifications, inboxNotificationFilter]
  )
  const unreadNotifs = useMemo(() => notifications.filter((n) => !n.read), [notifications])

  const filterSubtitle =
    inboxNotificationFilter === "all"
      ? `${unreadNotifs.length} unread`
      : inboxNotificationFilter === "unread"
        ? `${stripNotifications.length} unread shown`
        : `${stripNotifications.length} need attention`

  const [notifPanelOpen, setNotifPanelOpen] = useState(false)
  const [channels, setChannels] = useState<PracticeChannelRow[]>([])
  const [provisionLoading, setProvisionLoading] = useState(true)
  const [provisionError, setProvisionError] = useState<string | null>(null)

  const lastPanelRequestRef = useRef(0)
  useEffect(() => {
    if (inboxNotificationsPanelRequest > lastPanelRequestRef.current) {
      lastPanelRequestRef.current = inboxNotificationsPanelRequest
      setNotifPanelOpen(true)
    }
  }, [inboxNotificationsPanelRequest])

  const lastScrollNonceRef = useRef(0)
  useEffect(() => {
    if (inboxScrollRequest.nonce <= lastScrollNonceRef.current) return
    lastScrollNonceRef.current = inboxScrollRequest.nonce
    const map: Record<InboxScrollTarget, string> = {
      "smart-import": "inbox-smart-import",
      messages: "inbox-messages",
      activity: "inbox-activity",
      labs: "inbox-labs",
    }
    const elId = map[inboxScrollRequest.target]
    requestAnimationFrame(() => {
      document.getElementById(elId)?.scrollIntoView({ behavior: "smooth", block: "start" })
    })
  }, [inboxScrollRequest])

  const loadProvisionStatus = useCallback(async () => {
    setProvisionError(null)
    setProvisionLoading(true)
    try {
      const res = await fetch("/api/comms/provision/status")
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string }
        setProvisionError(j.error || `Could not load channels (${res.status})`)
        return
      }
      const data = await res.json()
      setChannels(data.channels || [])
    } catch {
      setProvisionError("Network error loading channel status")
    } finally {
      setProvisionLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadProvisionStatus()
  }, [loadProvisionStatus])

  const hasMessagingChannel = useMemo(
    () => (channels || []).some((c) => c.channel_type === "rcs" && isMessagingChannelLive(c)),
    [channels]
  )

  const [threads, setThreads] = useState<ThreadItem[]>([])
  const [selectedThread, setSelectedThread] = useState<ThreadItem | null>(null)
  const [messages, setMessages] = useState<MessageItem[]>([])
  const [voiceCalls, setVoiceCalls] = useState<VoiceCallItem[]>([])
  const [loading, setLoading] = useState(true)
  const [threadsError, setThreadsError] = useState<string | null>(null)
  const [loadingMessages, setLoadingMessages] = useState(false)
  const [filter, setFilter] = useState<"all" | "unread" | "handoff">("all")
  const [channelFilter, setChannelFilter] = useState<string>("all")
  const pollRef = useRef<ReturnType<typeof setInterval> | undefined>(undefined)

  const fetchThreads = useCallback(async () => {
    if (!hasMessagingChannel) {
      setThreads([])
      setThreadsError(null)
      setLoading(false)
      return
    }
    try {
      setThreadsError(null)
      const params = new URLSearchParams()
      if (channelFilter !== "all") params.set("channel", channelFilter)
      const res = await fetch(`/api/comms/threads?${params}`)
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string }
        setThreadsError(j.error || `Could not load conversations (${res.status})`)
        return
      }
      const data = await res.json()
      setThreads(data.threads || [])
    } catch {
      setThreadsError("Network error loading conversations")
    } finally {
      setLoading(false)
    }
  }, [channelFilter, hasMessagingChannel])

  useEffect(() => {
    fetchThreads()
    pollRef.current = setInterval(fetchThreads, 5000)
    return () => clearInterval(pollRef.current)
  }, [fetchThreads])

  const openThread = useCallback(async (thread: ThreadItem) => {
    setSelectedThread(thread)
    setLoadingMessages(true)
    try {
      const res = await fetch(`/api/comms/threads/${thread.id}/messages`)
      if (res.ok) {
        const data = await res.json()
        setMessages(data.messages || [])
        setVoiceCalls(data.voiceCalls || [])
      }
    } catch {
      // silent
    } finally {
      setLoadingMessages(false)
    }
    setThreads((prev) => prev.map((t) => (t.id === thread.id ? { ...t, unreadCount: 0 } : t)))
  }, [])

  const filteredThreads = threads
    .filter((t) => {
      if (filter === "unread" && t.unreadCount === 0) return false
      if (filter === "handoff" && t.status !== "handoff") return false
      return true
    })
    .sort((a, b) => {
      const pa = a.priority === "urgent" ? 0 : a.priority === "high" ? 1 : 2
      const pb = b.priority === "urgent" ? 0 : b.priority === "high" ? 1 : 2
      if (pa !== pb) return pa - pb
      return new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime()
    })

  const panelHeightClass = "min-h-[min(520px,calc(100vh-320px))] max-h-[calc(100vh-180px)]"

  return (
    <div className="relative grid gap-3 pb-12 lg:grid-cols-2">
      <div className="col-span-full">
        <BentoTile
          title="Notifications"
          subtitle={filterSubtitle}
          glow={unreadNotifs.length > 0 ? "red" : undefined}
          action={
            <div className="flex flex-wrap items-center justify-end gap-1.5">
              <div className="flex rounded-lg bg-muted p-0.5 dark:bg-white/[0.05]" role="group" aria-label="Filter notifications">
                {(
                  [
                    { id: "all" as const, label: "All" },
                    { id: "unread" as const, label: "Unread" },
                    { id: "action_required" as const, label: "Action" },
                  ] as const
                ).map((pill) => (
                  <button
                    key={pill.id}
                    type="button"
                    onClick={() => setInboxNotificationFilter(pill.id)}
                    className={cn(
                      "rounded-md px-2 py-1 text-[10px] font-medium transition-colors",
                      inboxNotificationFilter === pill.id
                        ? "bg-foreground text-background"
                        : "text-muted-foreground hover:bg-background hover:text-foreground dark:text-white/40 dark:hover:bg-white/[0.06] dark:hover:text-white/70"
                    )}
                  >
                    {pill.label}
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={() => setNotifPanelOpen((o) => !o)}
                className="flex items-center gap-1 rounded-lg border border-border bg-background px-2.5 py-1 text-[10px] font-medium text-foreground transition-colors hover:bg-muted dark:border-white/[0.08] dark:bg-white/[0.04] dark:hover:bg-white/[0.08]"
              >
                {notifPanelOpen ? "Close feed" : "Open feed"}
                <CaretRight className={cn("size-3 transition-transform", notifPanelOpen && "rotate-180")} />
              </button>
            </div>
          }
        >
          {stripNotifications.length === 0 ? (
            <p className="py-2 text-center text-[11px] text-muted-foreground">
              {notifications.length === 0 ? "No notifications" : "Nothing in this filter — try All or open the panel"}
            </p>
          ) : (
            <div className="flex gap-3 overflow-x-auto pb-1" style={{ scrollbarWidth: "none" }}>
              {stripNotifications.slice(0, 12).map((n) => (
                <NotificationChip key={n.id} notification={n} onClick={() => markNotificationRead(n.id)} />
              ))}
            </div>
          )}
        </BentoTile>
      </div>

      <div
        className={cn(
          "col-span-full grid gap-3 max-lg:grid-cols-1 lg:grid-cols-[minmax(0,2.45fr)_minmax(248px,0.78fr)] lg:items-stretch",
          panelHeightClass
        )}
      >
      <div
        id="inbox-messages"
        className="relative flex min-h-0 w-full min-w-0 flex-1 flex-col scroll-mt-4"
      >
        {provisionLoading ? (
          <BentoTile className={cn("flex w-full flex-1 items-center justify-center", panelHeightClass)}>
            <CircleNotch className="size-6 animate-spin text-muted-foreground/50 dark:text-white/15" />
          </BentoTile>
        ) : provisionError ? (
          <BentoTile
            title="Patient messaging"
            subtitle="Could not load setup"
            className={cn("flex w-full flex-1 flex-col justify-center", panelHeightClass)}
          >
            <p className="text-center text-[11px] text-destructive dark:text-red-300/90">{provisionError}</p>
            <button
              type="button"
              onClick={() => void loadProvisionStatus()}
              className="mx-auto mt-4 rounded-lg border border-border bg-muted/50 px-3 py-2 text-[10px] font-medium dark:border-white/[0.1] dark:bg-white/[0.06]"
            >
              Try again
            </button>
          </BentoTile>
        ) : !hasMessagingChannel ? (
          <div className={cn("flex w-full flex-1 flex-col", panelHeightClass)}>
            <InboxSetupEmptyState onOpenChannels={() => setAdminTab("channels")} />
          </div>
        ) : (
          <div className="flex w-full min-h-0 flex-1 flex-col space-y-3">
            <PracticeNumberBanner channels={channels} />
            <div
              className={cn(
                "grid min-h-0 flex-1 gap-3 max-lg:grid-cols-1 lg:grid-cols-[minmax(220px,31%)_minmax(0,1fr)]"
              )}
            >
            <BentoTile title="Threads" subtitle="SMS · RCS · calls" className="min-h-0 flex flex-col">
              <div className="-mt-2 -mx-1 flex min-h-0 flex-1 flex-col">
                {threadsError && (
                  <p className="mb-2 rounded-lg border border-destructive/25 bg-destructive/10 px-2 py-1.5 text-[10px] text-destructive dark:text-red-300/90">
                    {threadsError}
                  </p>
                )}
                <div className="mb-3 flex items-center gap-1.5">
                  {(["all", "unread", "handoff"] as const).map((f) => (
                    <button
                      key={f}
                      type="button"
                      onClick={() => setFilter(f)}
                      className={cn(
                        "rounded-lg px-2.5 py-1 text-[10px] font-medium capitalize transition-colors",
                        filter === f
                          ? "bg-muted text-foreground dark:bg-white/[0.08] dark:text-white/80"
                          : "text-muted-foreground hover:bg-muted/70 hover:text-foreground dark:text-white/30 dark:hover:bg-white/[0.04] dark:hover:text-white/50"
                      )}
                    >
                      {f === "handoff" ? "Needs Attention" : f}
                    </button>
                  ))}
                </div>
                <div className="mb-3 flex flex-wrap items-center gap-1">
                  {(["all", "rcs", "voice"] as const).map((ch) => {
                    const Icon = ch === "all" ? ChatText : CHANNEL_ICON[ch] || ChatText
                    return (
                      <button
                        key={ch}
                        type="button"
                        onClick={() => setChannelFilter(ch)}
                        className={cn(
                          "flex items-center gap-1 rounded-lg px-2 py-1 text-[10px] transition-colors",
                          channelFilter === ch
                            ? "bg-muted text-foreground dark:bg-white/[0.08] dark:text-white/70"
                            : "text-muted-foreground hover:bg-muted/70 hover:text-foreground dark:text-white/25 dark:hover:bg-white/[0.04] dark:hover:text-white/40"
                        )}
                      >
                        <Icon className="size-3" weight={channelFilter === ch ? "fill" : "regular"} />
                        <span className="capitalize">{ch}</span>
                      </button>
                    )
                  })}
                </div>
                <div className="min-h-0 flex-1 space-y-0.5 overflow-y-auto" style={{ scrollbarWidth: "none" }}>
                  {loading ? (
                    <div className="flex items-center justify-center py-12">
                      <CircleNotch className="size-5 animate-spin text-muted-foreground/50 dark:text-white/20" />
                    </div>
                  ) : filteredThreads.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-10 text-center">
                      <div className="mb-3 rounded-2xl border border-border bg-muted/40 p-4 dark:border-white/[0.06] dark:bg-white/[0.02]">
                        <ChatDots className="mx-auto size-9 text-muted-foreground/40 dark:text-white/12" />
                      </div>
                      <p className="text-[11px] text-muted-foreground">No conversations yet</p>
                      <p className="mt-1 max-w-[220px] text-[10px] leading-relaxed text-muted-foreground/75 dark:text-white/18">
                        Messages appear when patients text your practice number (SMS/RCS) or call.
                      </p>
                    </div>
                  ) : (
                    filteredThreads.map((thread) => (
                      <ThreadRow
                        key={thread.id}
                        thread={thread}
                        isSelected={selectedThread?.id === thread.id}
                        onClick={() => openThread(thread)}
                      />
                    ))
                  )}
                </div>
              </div>
            </BentoTile>

            <BentoTile title="Messages" subtitle="Selected thread" className="min-h-0 flex flex-col">
              <AnimatePresence mode="wait">
                {selectedThread ? (
                  <ThreadDetail
                    key={selectedThread.id}
                    thread={selectedThread}
                    messages={messages}
                    voiceCalls={voiceCalls}
                    loading={loadingMessages}
                    onBack={() => setSelectedThread(null)}
                    onRefresh={() => openThread(selectedThread)}
                  />
                ) : (
                  <motion.div
                    key="empty"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="flex min-h-[280px] flex-1 flex-col items-center justify-center text-center"
                  >
                    <div className="mb-3 rounded-2xl border border-border bg-muted/40 p-5 dark:border-white/[0.06] dark:bg-white/[0.02]">
                      <ChatDots className="size-8 text-muted-foreground/35 dark:text-white/10" />
                    </div>
                    <p className="text-[12px] text-muted-foreground">Select a conversation</p>
                    <p className="mt-1 max-w-[240px] text-[10px] leading-relaxed text-muted-foreground/75 dark:text-white/18">
                      Patient messages and staff replies appear here.
                    </p>
                  </motion.div>
                )}
              </AnimatePresence>
            </BentoTile>
          </div>
          </div>
        )}
      </div>

      <div
        id="inbox-labs"
        className="flex min-h-0 w-full min-w-0 flex-1 flex-col scroll-mt-4"
      >
        <BentoTile
          title="Lab Results"
          subtitle={`${labs.length} in queue · newest first`}
          className="flex h-full min-h-0 w-full flex-1 flex-col"
        >
          <div className="flex min-h-0 flex-1 flex-col gap-3">
            <div className="min-h-0 flex-1 overflow-y-auto" style={{ scrollbarWidth: "thin" }}>
              {labs.length === 0 ? (
                <div className="py-6 text-center">
                  <Flask className="mx-auto mb-2 size-7 text-muted-foreground/35 dark:text-white/10" />
                  <p className="text-[11px] text-muted-foreground">No lab results in inbox</p>
                  <p className="mt-1 text-[10px] text-muted-foreground/70 dark:text-white/15">HL7 or Smart Import can add items here</p>
                </div>
              ) : (
                <LabResultsQueue labs={labsSorted} />
              )}
            </div>
            <LabIntegrationsPanel />
          </div>
        </BentoTile>
      </div>
      </div>

      <div id="inbox-smart-import" className="col-span-full scroll-mt-4">
        <SmartImportTile
          addPatient={addPatient}
          patients={patients}
          addInboxMessage={addInboxMessage}
          addNotification={addNotification}
        />
      </div>

      <div id="inbox-activity" className="col-span-full scroll-mt-4">
        <LiveActivityFeed />
      </div>

      <AnimatePresence>
        {notifPanelOpen && (
          <NotificationPanel
            notifications={notifications}
            onClose={() => setNotifPanelOpen(false)}
            onMarkRead={markNotificationRead}
            onMarkAllRead={markAllNotificationsRead}
          />
        )}
      </AnimatePresence>
    </div>
  )
}

function PracticeNumberBanner({ channels }: { channels: PracticeChannelRow[] }) {
  const messaging = channels.find((c) => c.channel_type === "rcs")
  const voice = channels.find((c) => c.channel_type === "voice")

  if (!messaging && !voice) return null

  const STATUS_LABEL: Record<string, { text: string; color: string }> = {
    active: { text: "Live", color: "text-emerald-400" },
    registering_sender: { text: "Registering", color: "text-sky-400" },
    pending_waba: { text: "Meta signup", color: "text-amber-400" },
    pending_wa_approval: { text: "Pending approval", color: "text-amber-400" },
    provisioning: { text: "Setting up", color: "text-blue-400" },
    suspended: { text: "Suspended", color: "text-red-400" },
  }

  const voiceCap = voice ? getVoiceCapabilityState(voice) : null

  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-2 rounded-xl border border-border bg-muted/30 px-4 py-2.5 dark:border-white/[0.06] dark:bg-white/[0.02]">
      {messaging && (
        <div className="flex items-center gap-2">
          <ChatText className="size-4 text-emerald-400" weight="fill" />
          <span className="font-mono text-sm text-foreground dark:text-white/75">{messaging.phone_number}</span>
          {messaging.sender_display_name && (
            <span className="text-[10px] text-muted-foreground dark:text-white/30">({messaging.sender_display_name})</span>
          )}
          <span className={cn("text-[10px] font-medium", STATUS_LABEL[messaging.status]?.color || "text-muted-foreground dark:text-white/40")}>
            {STATUS_LABEL[messaging.status]?.text || messaging.status}
          </span>
        </div>
      )}
      {voice && voiceCap && (
        <div className="flex items-center gap-2">
          <Phone className="size-4 text-violet-400" weight="fill" />
          <span className="font-mono text-sm text-foreground dark:text-white/75">{voice.phone_number}</span>
          <span
            className={cn(
              "text-[10px] font-medium",
              voiceCap.isReady ? "text-emerald-400" : "text-muted-foreground dark:text-white/40"
            )}
          >
            {voiceCap.isReady ? "Voice ready" : "Voice setup"}
          </span>
        </div>
      )}
    </div>
  )
}

function InboxSetupEmptyState({ onOpenChannels }: { onOpenChannels: () => void }) {
  return (
    <BentoTile
      title="Patient messaging"
      subtitle="Not connected"
      className={cn(
        "min-h-[min(520px,calc(100vh-320px))] overflow-hidden",
        "border border-border bg-gradient-to-b from-card to-background shadow-sm dark:border-white/[0.07] dark:from-white/[0.02] dark:to-transparent dark:shadow-[0_0_0_1px_rgba(255,255,255,0.03)_inset]"
      )}
    >
      <div className="flex flex-col items-center px-4 py-10 text-center sm:py-14">
        <div className="relative mb-5">
          <div
            className="absolute inset-0 rounded-[1.35rem] blur-2xl"
            style={{ background: "radial-gradient(circle, rgba(14,165,233,0.2) 0%, transparent 68%)" }}
            aria-hidden
          />
          <div className="relative flex size-[5.25rem] items-center justify-center rounded-[1.35rem] border border-sky-500/25 bg-sky-50 shadow-[0_12px_40px_-12px_rgba(14,165,233,0.35)] dark:bg-[#0d1110]">
            <ChatCircle className="size-[2.65rem] text-sky-400" weight="fill" aria-hidden />
          </div>
        </div>
        <h3 className="text-[1.05rem] font-semibold tracking-tight text-foreground dark:text-white/[0.92]">
          Connect patient messaging
        </h3>
        <p className="mt-2.5 max-w-[24rem] text-[11px] leading-[1.55] text-muted-foreground dark:text-white/38">
          Link your practice Twilio line in Channels to receive SMS, RCS, and threaded conversations here.
        </p>
        <button
          type="button"
          onClick={onOpenChannels}
          className="mt-7 inline-flex items-center gap-2 rounded-xl border border-sky-500/35 bg-sky-500/12 px-5 py-2.5 text-[11px] font-semibold text-sky-700 transition-colors hover:border-sky-400/50 hover:bg-sky-500/18 dark:text-sky-200"
        >
          <ChatCircle className="size-4 text-sky-400" weight="fill" />
          Open Channels
        </button>
        <p className="mt-6 text-[9px] text-muted-foreground/80 dark:text-white/22">
          Full setup steps are in{" "}
          <span className="text-foreground/70 dark:text-white/35">docs/comms-setup-and-testing.md</span>.
        </p>
      </div>
    </BentoTile>
  )
}

function channelLabel(channel: string): string {
  if (channel === "rcs") return "RCS / SMS"
  if (channel === "voice") return "Phone"
  if (channel === "sms") return "SMS"
  return channel
}

// ── Thread row ──

function ThreadRow({ thread, isSelected, onClick }: { thread: ThreadItem; isSelected: boolean; onClick: () => void }) {
  const Icon = CHANNEL_ICON[thread.channel] || ChatText
  const iconColor = CHANNEL_COLOR[thread.channel] || "text-white/40"
  const bgColor = CHANNEL_BG[thread.channel] || "bg-white/[0.06]"
  const statusInfo = STATUS_STYLE[thread.status] || STATUS_STYLE.active
  const priorityStyle = PRIORITY_BADGE[thread.priority] || ""

  const timeAgo = formatTimeAgo(thread.lastMessageAt)

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex w-full items-start gap-3 rounded-xl px-3 py-2.5 text-left transition-all",
        isSelected ? "bg-white/[0.06]" : "hover:bg-white/[0.03]",
        thread.unreadCount > 0 && !isSelected && "bg-white/[0.02]"
      )}
    >
      <div className={cn("mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg", bgColor)}>
        <Icon className={cn("size-4", iconColor)} weight="fill" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-[12px] font-medium text-white/90">{thread.patientName}</span>
          {thread.unreadCount > 0 && (
            <span className="flex size-4 items-center justify-center rounded-full bg-blue-500 text-[8px] font-bold text-white">
              {thread.unreadCount > 9 ? "9+" : thread.unreadCount}
            </span>
          )}
        </div>
        <div className="mt-0.5 flex items-center gap-1.5">
          <span className={cn("rounded-full px-1.5 py-0.5 text-[8px] font-medium", statusInfo.bg, statusInfo.color)}>
            {statusInfo.label}
          </span>
          {thread.currentFlow !== "none" && (
            <span className="rounded-full bg-white/[0.04] px-1.5 py-0.5 text-[8px] text-white/25 capitalize">
              {thread.currentFlow}
            </span>
          )}
          {priorityStyle && (
            <span className={cn("rounded-full px-1.5 py-0.5 text-[8px] font-medium", priorityStyle)}>
              {thread.priority}
            </span>
          )}
        </div>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1.5">
        <span className="text-[9px] text-white/20">{timeAgo}</span>
        <CaretRight className="size-3 text-white/10" />
      </div>
    </button>
  )
}

// ── Thread detail ──

function ThreadDetail({
  thread,
  messages,
  voiceCalls,
  loading,
  onBack,
  onRefresh,
}: {
  thread: ThreadItem
  messages: MessageItem[]
  voiceCalls: VoiceCallItem[]
  loading: boolean
  onBack: () => void
  onRefresh: () => void
}) {
  const [compose, setCompose] = useState("")
  const [sending, setSending] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages])

  const Icon = CHANNEL_ICON[thread.channel] || ChatText
  const iconColor = CHANNEL_COLOR[thread.channel] || "text-white/40"
  const statusInfo = STATUS_STYLE[thread.status] || STATUS_STYLE.active

  const handleSend = useCallback(async () => {
    if (!compose.trim() || sending) return
    setSending(true)
    try {
      await fetch("/api/comms/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ threadId: thread.id, message: compose.trim() }),
      })
      setCompose("")
      onRefresh()
    } finally {
      setSending(false)
    }
  }, [compose, sending, thread.id, onRefresh])

  return (
    <motion.div
      initial={{ opacity: 0, x: 8 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -8 }}
      transition={{ duration: 0.12 }}
      className="flex h-full flex-col -mt-1 -mx-1"
    >
      {/* Header */}
      <div className="mb-3 flex items-center gap-2 border-b border-white/[0.06] pb-2.5">
        <button
          type="button"
          onClick={onBack}
          className="rounded-lg p-1 text-white/30 transition-colors hover:bg-white/[0.06] hover:text-white/50 lg:hidden"
        >
          <ArrowLeft className="size-3.5" />
        </button>
        <div className={cn("flex size-7 items-center justify-center rounded-lg", CHANNEL_BG[thread.channel] || "bg-white/[0.06]")}>
          <Icon className={cn("size-3.5", iconColor)} weight="fill" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate text-[12px] font-semibold">{thread.patientName}</span>
            <span className={cn("rounded-full px-1.5 py-0.5 text-[8px] font-medium", statusInfo.bg, statusInfo.color)}>
              {statusInfo.label}
            </span>
          </div>
          <p className="text-[10px] text-white/25">
            {thread.externalParty} · {channelLabel(thread.channel)}
          </p>
        </div>
        {thread.status === "handoff" && (
          <button
            type="button"
            onClick={async () => {
              await fetch("/api/comms/send", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ threadId: thread.id, message: "__return_to_ai" }),
              })
              onRefresh()
            }}
            className="rounded-lg bg-emerald-500/10 px-2.5 py-1 text-[10px] font-medium text-emerald-400 transition-colors hover:bg-emerald-500/20"
          >
            <Robot className="mr-1 inline size-3" />
            Resume auto-reply
          </button>
        )}
      </div>

      {thread.channel === "voice" && voiceCalls.length > 0 && (
        <details className="mb-3 rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-2 text-[11px] text-white/70">
          <summary className="cursor-pointer select-none text-[11px] font-medium text-white/50">
            Transcript ({voiceCalls.length} call{voiceCalls.length === 1 ? "" : "s"})
          </summary>
          <div className="mt-2 space-y-3 border-t border-white/[0.06] pt-2">
            {voiceCalls.map((vc) => (
              <div key={vc.id} className="space-y-1">
                {vc.summary && (
                  <p className="text-[10px] text-white/40">
                    <span className="text-white/40">Summary</span>{" "}
                    <span className="text-white/60">{vc.summary}</span>
                  </p>
                )}
                {vc.transcript && (
                  <pre className="max-h-40 overflow-y-auto whitespace-pre-wrap break-words text-[10px] leading-relaxed text-white/45">
                    {vc.transcript}
                  </pre>
                )}
                {!vc.transcript && !vc.summary && (
                  <p className="text-[10px] text-white/25">No transcript text yet.</p>
                )}
              </div>
            ))}
          </div>
        </details>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto space-y-1.5 pr-1" style={{ scrollbarWidth: "none" }}>
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <CircleNotch className="size-5 animate-spin text-white/20" />
          </div>
        ) : messages.length === 0 ? (
          <div className="flex items-center justify-center py-12">
            <p className="text-[11px] text-white/20">No messages yet</p>
          </div>
        ) : (
          messages.map((msg) => <MessageBubble key={msg.id} msg={msg} />)
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Compose */}
      {thread.channel === "rcs" && thread.status !== "closed" && (
        <div className="mt-3 flex items-end gap-2 border-t border-white/[0.06] pt-3">
          <input
            type="text"
            value={compose}
            onChange={(e) => setCompose(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleSend()}
            placeholder={thread.status === "handoff" ? "Reply as staff..." : "Type a message..."}
            className="flex-1 rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-2 text-[11px] text-white/80 placeholder-white/20 outline-none focus:border-white/[0.12]"
          />
          <button
            type="button"
            onClick={handleSend}
            disabled={!compose.trim() || sending}
            className={cn(
              "rounded-xl p-2 transition-colors",
              compose.trim() ? "bg-blue-500/15 text-blue-400 hover:bg-blue-500/25" : "text-white/15"
            )}
          >
            {sending ? <CircleNotch className="size-4 animate-spin" /> : <PaperPlaneTilt className="size-4" weight="fill" />}
          </button>
        </div>
      )}
    </motion.div>
  )
}

// ── Message bubble ──

function MessageBubble({ msg }: { msg: MessageItem }) {
  const isInbound = msg.direction === "inbound"
  const isSystem = msg.senderType === "system"
  const time = new Date(msg.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })

  if (isSystem) {
    return (
      <div className="flex justify-center py-1">
        <span className="rounded-full bg-white/[0.03] px-3 py-1 text-[9px] text-white/20">{msg.body}</span>
      </div>
    )
  }

  if (msg.contentType === "audio") {
    return (
      <div className={cn("flex", isInbound ? "justify-start" : "justify-end")}>
        <div
          className={cn(
            "max-w-[85%] rounded-2xl px-3 py-2",
            isInbound ? "rounded-bl-md bg-white/[0.05]" : "rounded-br-md bg-white/[0.04]"
          )}
        >
          <div className="mb-1 flex items-center gap-2">
            <Phone className="size-3 text-white/35" />
            <span className="text-[10px] font-medium text-white/40">Audio</span>
          </div>
          {msg.body && <p className="text-[11px] leading-relaxed text-white/60">{msg.body}</p>}
          <p className="mt-1 text-[9px] text-white/20">{time}</p>
        </div>
      </div>
    )
  }

  const DeliveryIcon = !isInbound ? DELIVERY_ICON[msg.deliveryStatus] : null

  return (
    <div className={cn("flex", isInbound ? "justify-start" : "justify-end")}>
      <div className={cn(
        "max-w-[85%] rounded-2xl px-3 py-2",
        isInbound
          ? "rounded-bl-md bg-white/[0.05] text-white/70"
          : msg.senderType === "agent"
            ? "rounded-br-md bg-blue-500/10 text-white/70"
            : "rounded-br-md bg-indigo-500/10 text-white/70"
      )}>
        {!isInbound && msg.senderType === "agent" && (
          <div className="mb-1 flex items-center gap-1">
            <Robot className="size-2.5 text-blue-400" />
            <span className="text-[8px] font-medium text-blue-400">Assistant</span>
          </div>
        )}
        {!isInbound && msg.senderType === "staff" && (
          <div className="mb-1 flex items-center gap-1">
            <HandWaving className="size-2.5 text-indigo-400" />
            <span className="text-[8px] font-medium text-indigo-400">Staff</span>
          </div>
        )}

        {/* Media */}
        {msg.contentType === "image" && msg.mediaUrl && (
          <div className="mb-1.5 rounded-lg overflow-hidden bg-white/[0.03]">
            <div className="flex items-center justify-center py-4 text-[10px] text-white/20">
              [Image attachment]
            </div>
          </div>
        )}

        {msg.body && <p className="text-[11px] leading-relaxed whitespace-pre-wrap">{msg.body}</p>}

        {/* Tool calls */}
        {msg.agentToolCalls && msg.agentToolCalls.length > 0 && (
          <div className="mt-1.5 space-y-1">
            {msg.agentToolCalls.map((tc, i) => (
              <div key={i} className="flex items-center gap-1.5 rounded-lg bg-white/[0.03] px-2 py-1">
                {tc.tool === "bookAppointment" && <CalendarCheck className="size-3 text-emerald-400" />}
                {tc.tool === "createPatient" && <UserPlus className="size-3 text-blue-400" />}
                {!["bookAppointment", "createPatient"].includes(tc.tool) && <Pulse className="size-3 text-white/30" />}
                <span className="text-[9px] text-white/30">{formatToolName(tc.tool)}</span>
              </div>
            ))}
          </div>
        )}

        <div className="mt-1 flex items-center justify-end gap-1">
          <span className="text-[9px] text-white/20">{time}</span>
          {DeliveryIcon && (
            <DeliveryIcon
              className={cn("size-3", msg.deliveryStatus === "read" ? "text-blue-400" : msg.deliveryStatus === "failed" ? "text-red-400" : "text-white/20")}
            />
          )}
        </div>
      </div>
    </div>
  )
}

// ── Helpers ──

function formatTimeAgo(dateStr: string): string {
  const now = Date.now()
  const then = new Date(dateStr).getTime()
  const diff = now - then
  if (diff < 60000) return "now"
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m`
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h`
  if (diff < 604800000) return `${Math.floor(diff / 86400000)}d`
  return new Date(dateStr).toLocaleDateString([], { month: "short", day: "numeric" })
}

function formatToolName(tool: string): string {
  return tool.replace(/([A-Z])/g, " $1").replace(/^./, (s) => s.toUpperCase()).trim()
}

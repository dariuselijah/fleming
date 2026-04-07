"use client"

import {
  useWorkspace,
  useWorkspaceStore,
  type InboxMessage,
  type AdminNotification,
  type NotificationType,
  type PracticePatient,
  type InboxNotificationFilter,
} from "@/lib/clinical-workspace"
import { cn } from "@/lib/utils"
import {
  WhatsappLogo,
  ChatText,
  Globe,
  Flask,
  Camera,
  Envelope,
  Bell,
  Warning,
  Info,
  ShieldWarning,
  X,
  Check,
  CheckCircle,
  PaperPlaneTilt,
  CaretRight,
  CaretLeft,
  CurrencyDollar,
  CalendarCheck,
  Package,
  Gear,
  UploadSimple,
  UserPlus,
  Receipt,
  CircleNotch,
  ArrowLeft,
  ChatDots,
  Scan,
  Eraser,
  LinkSimple,
  Code,
  File,
  CaretDown,
} from "@phosphor-icons/react"
import { BentoTile } from "./bento-tile"
import { LabIntegrationsPanel } from "./lab-integrations-panel"
import { useRef, useState, useCallback, useMemo, useEffect } from "react"
import { AnimatePresence, motion } from "motion/react"

// ── Channel maps ──

const CHANNEL_ICON: Record<string, typeof WhatsappLogo> = {
  whatsapp: WhatsappLogo,
  sms: ChatText,
  portal: Globe,
  lab: Flask,
  email: Envelope,
}

const CHANNEL_COLOR: Record<string, string> = {
  whatsapp: "text-green-500",
  sms: "text-blue-500",
  portal: "text-indigo-500",
  lab: "text-amber-500",
  email: "text-rose-400",
}

const CHANNEL_BG: Record<string, string> = {
  whatsapp: "bg-green-500/10",
  sms: "bg-blue-500/10",
  portal: "bg-indigo-500/10",
  lab: "bg-amber-500/10",
  email: "bg-rose-400/10",
}

// ── Notification category maps ──

type NotifCategory = "Alerts" | "Billing" | "Stock" | "System" | "Messages" | "Labs"

const NOTIF_CATEGORY_MAP: Record<NotificationType, NotifCategory> = {
  alert: "Alerts",
  warning: "Alerts",
  medical_aid_rejection: "Billing",
  payment_received: "Billing",
  payment_overdue: "Billing",
  claim_status: "Billing",
  stock_low: "Stock",
  info: "System",
  appointment_reminder: "System",
  patient_message: "Messages",
  lab_result: "Labs",
}

const NOTIF_ICON: Record<NotificationType, typeof Warning> = {
  alert: ShieldWarning,
  warning: Warning,
  info: Info,
  lab_result: Flask,
  claim_status: Receipt,
  appointment_reminder: CalendarCheck,
  patient_message: ChatText,
  stock_low: Package,
  payment_received: CurrencyDollar,
  payment_overdue: CurrencyDollar,
  medical_aid_rejection: ShieldWarning,
}

const NOTIF_COLOR: Record<NotificationType, string> = {
  alert: "text-[#EF5350]",
  warning: "text-[#FFC107]",
  info: "text-blue-400",
  lab_result: "text-[#FFC107]",
  claim_status: "text-blue-400",
  appointment_reminder: "text-blue-400",
  patient_message: "text-green-400",
  stock_low: "text-[#FFC107]",
  payment_received: "text-[#00E676]",
  payment_overdue: "text-[#EF5350]",
  medical_aid_rejection: "text-[#EF5350]",
}

const CATEGORY_ICON: Record<NotifCategory, typeof Warning> = {
  Alerts: ShieldWarning,
  Billing: CurrencyDollar,
  Stock: Package,
  System: Gear,
  Messages: ChatText,
  Labs: Flask,
}

// ── Demo data ──

const QUICK_REPLIES = [
  "Thanks, I'll follow up shortly.",
  "Please bring your medical aid card to your next visit.",
  "Your results are ready — please call to schedule a follow-up.",
  "Appointment confirmed. See you then!",
]

interface DemoThread {
  id: string
  sender: "them" | "me"
  text: string
  time: string
}

function getDemoThread(msg: InboxMessage): DemoThread[] {
  return [
    { id: "t1", sender: "them", text: msg.preview, time: new Date(msg.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) },
    { id: "t2", sender: "me", text: "Thanks for reaching out. Let me check on that for you.", time: new Date(msg.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) },
    { id: "t3", sender: "them", text: "Appreciate it, thanks!", time: new Date(msg.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) },
  ]
}

const ACTION_NOTIF_TYPES = new Set<NotificationType>([
  "medical_aid_rejection",
  "payment_overdue",
  "stock_low",
  "lab_result",
  "patient_message",
  "alert",
  "warning",
])

export function filterNotificationsForStrip(
  list: AdminNotification[],
  filter: InboxNotificationFilter
): AdminNotification[] {
  if (filter === "all") return list
  if (filter === "unread") return list.filter((n) => !n.read)
  return list.filter((n) => !n.read && ACTION_NOTIF_TYPES.has(n.type))
}

// ── Main component ──

export function BentoInbox() {
  const { inboxMessages, notifications } = useWorkspace()
  const markNotificationRead = useWorkspaceStore((s) => s.markNotificationRead)
  const markAllNotificationsRead = useWorkspaceStore((s) => s.markAllNotificationsRead)
  const markMessageRead = useWorkspaceStore((s) => s.markMessageRead)
  const addPatient = useWorkspaceStore((s) => s.addPatient)
  const patients = useWorkspaceStore((s) => s.patients)
  const addInboxMessage = useWorkspaceStore((s) => s.addInboxMessage)
  const addNotification = useWorkspaceStore((s) => s.addNotification)
  const inboxNotificationFilter = useWorkspaceStore((s) => s.inboxNotificationFilter)
  const activeInboxThreadId = useWorkspaceStore((s) => s.activeInboxThreadId)
  const setActiveInboxThreadId = useWorkspaceStore((s) => s.setActiveInboxThreadId)
  const inboxNotificationsPanelRequest = useWorkspaceStore((s) => s.inboxNotificationsPanelRequest)
  const inboxScrollRequest = useWorkspaceStore((s) => s.inboxScrollRequest)
  const setInboxNotificationFilter = useWorkspaceStore((s) => s.setInboxNotificationFilter)

  const conversations = useMemo(() => inboxMessages.filter((m) => m.channel !== "lab"), [inboxMessages])
  const labs = useMemo(() => inboxMessages.filter((m) => m.channel === "lab"), [inboxMessages])
  const labsSorted = useMemo(
    () =>
      [...labs].sort(
        (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
      ),
    [labs]
  )
  const unreadNotifs = useMemo(() => notifications.filter((n) => !n.read), [notifications])
  const stripNotifications = useMemo(
    () => filterNotificationsForStrip(notifications, inboxNotificationFilter),
    [notifications, inboxNotificationFilter]
  )

  const [notifPanelOpen, setNotifPanelOpen] = useState(false)
  const [activeConversation, setActiveConversation] = useState<InboxMessage | null>(null)

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
    const map = {
      "smart-import": "inbox-smart-import",
      messages: "inbox-messages",
      activity: "inbox-activity",
      labs: "inbox-labs",
    } as const
    const elId = map[inboxScrollRequest.target]
    requestAnimationFrame(() => {
      document.getElementById(elId)?.scrollIntoView({ behavior: "smooth", block: "start" })
    })
  }, [inboxScrollRequest])

  useEffect(() => {
    if (!activeInboxThreadId) return
    const msg = conversations.find((m) => m.id === activeInboxThreadId)
    if (msg) {
      setActiveConversation(msg)
      if (!msg.read) markMessageRead(msg.id)
    }
  }, [activeInboxThreadId, conversations, markMessageRead])

  const filterSubtitle =
    inboxNotificationFilter === "all"
      ? `${unreadNotifs.length} unread`
      : inboxNotificationFilter === "unread"
        ? `${stripNotifications.length} unread shown`
        : `${stripNotifications.length} need attention`

  return (
    <div className="relative grid gap-3" style={{ gridTemplateColumns: "1fr 300px", gridTemplateRows: "auto 1fr auto auto" }}>
      {/* ── Notifications (full width) ── */}
      <div className="col-span-2">
        <BentoTile
          title="Notifications"
          subtitle={filterSubtitle}
          glow={unreadNotifs.length > 0 ? "red" : undefined}
          action={
            <div className="flex flex-wrap items-center justify-end gap-1.5">
              <div className="flex rounded-lg bg-white/[0.05] p-0.5" role="group" aria-label="Filter notifications">
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
                        : "text-white/40 hover:bg-white/[0.06] hover:text-white/70"
                    )}
                  >
                    {pill.label}
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={() => setNotifPanelOpen((o) => !o)}
                className="flex items-center gap-1 rounded-lg border border-white/[0.08] bg-white/[0.04] px-2.5 py-1 text-[10px] font-medium text-foreground transition-colors hover:bg-white/[0.08]"
              >
                {notifPanelOpen ? "Close feed" : "Open feed"}
                <CaretRight className={cn("size-3 transition-transform", notifPanelOpen && "rotate-180")} />
              </button>
            </div>
          }
        >
          {stripNotifications.length === 0 ? (
            <p className="py-2 text-center text-[11px] text-white/25">
              {notifications.length === 0 ? "No notifications" : "Nothing in this filter — try All or open the panel"}
            </p>
          ) : (
            <div className="flex gap-3 overflow-x-auto pb-1" style={{ scrollbarWidth: "none" }}>
              {stripNotifications.slice(0, 12).map((n) => (
                <NotificationChip
                  key={n.id}
                  notification={n}
                  onClick={() => markNotificationRead(n.id)}
                />
              ))}
            </div>
          )}
        </BentoTile>
      </div>

      {/* ── Messages (left column) ── */}
      <div id="inbox-messages" className="relative scroll-mt-4 overflow-hidden">
        <BentoTile
          title="Messages"
          subtitle={`${conversations.length} conversations`}
          className="h-full"
        >
          <AnimatePresence mode="popLayout" initial={false}>
            {activeConversation ? (
              <ConversationThread
                key="thread"
                msg={activeConversation}
                onBack={() => {
                  setActiveConversation(null)
                  setActiveInboxThreadId(null)
                }}
                onMarkRead={() => markMessageRead(activeConversation.id)}
              />
            ) : (
              <motion.div
                key="list"
                initial={{ x: -20, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                exit={{ x: -20, opacity: 0 }}
                transition={{ duration: 0.15 }}
              >
                {conversations.length === 0 ? (
                  <p className="py-8 text-center text-[11px] text-white/25">No messages</p>
                ) : (
                  <div className="space-y-0.5 overflow-y-auto pr-1" style={{ maxHeight: "calc(100vh - 380px)", scrollbarWidth: "none" }}>
                    {conversations.map((msg) => (
                      <MessageRow
                        key={msg.id}
                        msg={msg}
                        onClick={() => {
                          setActiveConversation(msg)
                          setActiveInboxThreadId(msg.id)
                          if (!msg.read) markMessageRead(msg.id)
                        }}
                      />
                    ))}
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </BentoTile>
      </div>

      {/* ── Lab Results (right column) ── */}
      <div id="inbox-labs" className="scroll-mt-4">
      <BentoTile
        title="Lab Results"
        subtitle={`${labs.length} in queue · newest first`}
      >
        {labs.length === 0 ? (
          <p className="py-6 text-center text-[11px] text-white/25">No lab results</p>
        ) : (
          <LabResultsQueue labs={labsSorted} />
        )}

        <LabIntegrationsPanel />
      </BentoTile>
      </div>

      {/* ── Smart Import (full width) ── */}
      <div id="inbox-smart-import" className="col-span-2 scroll-mt-4">
        <SmartImportTile
          addPatient={addPatient}
          patients={patients}
          addInboxMessage={addInboxMessage}
          addNotification={addNotification}
        />
      </div>

      {/* ── Activity Feed (full width) ── */}
      <div id="inbox-activity" className="col-span-2 scroll-mt-4">
        <ActivityFeedTile />
      </div>

      {/* ── Notification Slide-Out Panel ── */}
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

// ── Notification Chip ──

export function NotificationChip({ notification, onClick }: { notification: AdminNotification; onClick: () => void }) {
  const Icon = NOTIF_ICON[notification.type] ?? Bell
  const color = NOTIF_COLOR[notification.type] ?? "text-white/40"
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex shrink-0 items-start gap-2.5 rounded-xl border px-3 py-2.5 text-left transition-colors",
        notification.read
          ? "border-white/[0.06] bg-white/[0.01]"
          : "border-white/[0.1] bg-white/[0.03]"
      )}
      style={{ minWidth: 220 }}
    >
      <Icon className={cn("mt-0.5 size-4 shrink-0", color)} weight="fill" />
      <div className="min-w-0">
        <div className="flex items-center gap-1.5">
          <p className="text-[11px] font-semibold">{notification.title}</p>
          {!notification.read && <span className="size-1.5 shrink-0 rounded-full bg-blue-500" />}
        </div>
        {notification.detail && (
          <p className="mt-0.5 text-[10px] leading-tight text-white/35 line-clamp-2">{notification.detail}</p>
        )}
        <p className="mt-1 text-[9px] text-white/20">
          {new Date(notification.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
        </p>
      </div>
    </button>
  )
}

// ── Notification Slide-Out Panel ──

export function NotificationPanel({
  notifications,
  onClose,
  onMarkRead,
  onMarkAllRead,
}: {
  notifications: AdminNotification[]
  onClose: () => void
  onMarkRead: (id: string) => void
  onMarkAllRead: () => void
}) {
  const grouped = useMemo(() => {
    const groups: Record<NotifCategory, AdminNotification[]> = {
      Alerts: [], Billing: [], Stock: [], System: [], Messages: [], Labs: [],
    }
    for (const n of notifications) {
      const cat = NOTIF_CATEGORY_MAP[n.type] ?? "System"
      groups[cat].push(n)
    }
    return groups
  }, [notifications])

  const categories = (Object.keys(grouped) as NotifCategory[]).filter((c) => grouped[c].length > 0)

  return (
    <motion.div
      initial={{ x: 420, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      exit={{ x: 420, opacity: 0 }}
      transition={{ type: "spring", stiffness: 400, damping: 38 }}
      className="absolute inset-y-0 right-0 z-50 flex w-[400px] flex-col border-l border-white/[0.08] bg-[#0a0a0c]/95 backdrop-blur-2xl"
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b border-white/[0.06] px-4 py-3">
        <h3 className="text-[13px] font-semibold">All Notifications</h3>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onMarkAllRead}
            className="rounded-lg px-2 py-1 text-[10px] font-medium text-white/40 transition-colors hover:bg-white/[0.06] hover:text-white/60"
          >
            Mark all read
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-white/30 transition-colors hover:bg-white/[0.06] hover:text-white/50"
          >
            <X className="size-4" />
          </button>
        </div>
      </div>

      {/* Grouped notifications */}
      <div className="flex-1 overflow-y-auto p-3" style={{ scrollbarWidth: "none" }}>
        {categories.map((category) => {
          const CatIcon = CATEGORY_ICON[category]
          return (
            <div key={category} className="mb-4 last:mb-0">
              <div className="mb-2 flex items-center gap-1.5 px-1">
                <CatIcon className="size-3 text-white/30" weight="bold" />
                <span className="text-[10px] font-semibold uppercase tracking-wider text-white/30">
                  {category}
                </span>
                <span className="text-[9px] text-white/20">({grouped[category].length})</span>
              </div>
              <div className="space-y-1">
                {grouped[category].map((n) => {
                  const NIcon = NOTIF_ICON[n.type] ?? Bell
                  const nColor = NOTIF_COLOR[n.type] ?? "text-white/40"
                  return (
                    <button
                      key={n.id}
                      type="button"
                      onClick={() => onMarkRead(n.id)}
                      className={cn(
                        "flex w-full items-start gap-2.5 rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-white/[0.04]",
                        !n.read && "bg-white/[0.03]"
                      )}
                    >
                      <NIcon className={cn("mt-0.5 size-3.5 shrink-0", nColor)} weight="fill" />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <span className="text-[11px] font-medium">{n.title}</span>
                          {!n.read && <span className="size-1.5 shrink-0 rounded-full bg-blue-500" />}
                        </div>
                        {n.detail && (
                          <p className="mt-0.5 text-[10px] leading-tight text-white/35 line-clamp-2">{n.detail}</p>
                        )}
                      </div>
                      <span className="shrink-0 text-[9px] text-white/20">
                        {new Date(n.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                      </span>
                    </button>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>
    </motion.div>
  )
}

// ── Message Row ──

function MessageRow({ msg, onClick }: { msg: InboxMessage; onClick: () => void }) {
  const Icon = CHANNEL_ICON[msg.channel] ?? Envelope
  const iconColor = CHANNEL_COLOR[msg.channel] ?? "text-white/40"
  const bgColor = CHANNEL_BG[msg.channel] ?? "bg-white/[0.06]"

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex w-full items-start gap-3 rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-white/[0.04]",
        !msg.read && "bg-white/[0.02]"
      )}
    >
      <div className={cn("mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg", bgColor)}>
        <Icon className={cn("size-3.5", iconColor)} weight="fill" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-[12px] font-medium">{msg.from}</span>
          {!msg.read && <span className="size-1.5 rounded-full bg-blue-500" />}
        </div>
        <p className="truncate text-[11px] text-white/40">{msg.preview}</p>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1">
        <span className="text-[10px] text-white/20">
          {new Date(msg.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
        </span>
        <CaretRight className="size-3 text-white/15" />
      </div>
    </button>
  )
}

// ── Conversation Thread ──

function ConversationThread({
  msg,
  onBack,
  onMarkRead,
}: {
  msg: InboxMessage
  onBack: () => void
  onMarkRead: () => void
}) {
  const [compose, setCompose] = useState("")
  const [showTemplates, setShowTemplates] = useState(false)
  const [messages, setMessages] = useState<DemoThread[]>(() => getDemoThread(msg))

  const Icon = CHANNEL_ICON[msg.channel] ?? Envelope
  const iconColor = CHANNEL_COLOR[msg.channel] ?? "text-white/40"

  const handleSend = useCallback(() => {
    if (!compose.trim()) return
    setMessages((prev) => [
      ...prev,
      { id: `m-${Date.now()}`, sender: "me", text: compose.trim(), time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) },
    ])
    setCompose("")
    onMarkRead()
  }, [compose, onMarkRead])

  return (
    <motion.div
      initial={{ x: 20, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      exit={{ x: 20, opacity: 0 }}
      transition={{ duration: 0.15 }}
      className="flex h-full flex-col"
    >
      {/* Thread header */}
      <div className="mb-3 flex items-center gap-2 border-b border-white/[0.06] pb-2.5">
        <button
          type="button"
          onClick={onBack}
          className="rounded-lg p-1 text-white/30 transition-colors hover:bg-white/[0.06] hover:text-white/50"
        >
          <ArrowLeft className="size-3.5" />
        </button>
        <Icon className={cn("size-3.5", iconColor)} weight="fill" />
        <span className="text-[12px] font-semibold">{msg.from}</span>
        <span className="ml-auto rounded-full bg-white/[0.06] px-2 py-0.5 text-[9px] capitalize text-white/30">
          {msg.channel}
        </span>
      </div>

      {/* Messages */}
      <div className="flex-1 space-y-2 overflow-y-auto pr-1" style={{ maxHeight: "calc(100vh - 500px)", scrollbarWidth: "none" }}>
        {messages.map((m) => (
          <div
            key={m.id}
            className={cn("flex", m.sender === "me" ? "justify-end" : "justify-start")}
          >
            <div
              className={cn(
                "max-w-[80%] rounded-2xl px-3 py-2",
                m.sender === "me"
                  ? "rounded-br-md bg-blue-500/15 text-white/80"
                  : "rounded-bl-md bg-white/[0.05] text-white/70"
              )}
            >
              <p className="text-[11px] leading-relaxed">{m.text}</p>
              <p className="mt-1 text-[9px] text-white/25">{m.time}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Compose */}
      <div className="mt-3 space-y-2">
        <AnimatePresence>
          {showTemplates && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="overflow-hidden"
            >
              <div className="space-y-1 rounded-xl border border-white/[0.06] bg-white/[0.02] p-2">
                <p className="px-1 text-[9px] font-medium uppercase tracking-wider text-white/25">Quick Replies</p>
                {QUICK_REPLIES.map((tpl) => (
                  <button
                    key={tpl}
                    type="button"
                    onClick={() => {
                      setCompose(tpl)
                      setShowTemplates(false)
                    }}
                    className="block w-full rounded-lg px-2 py-1.5 text-left text-[10px] text-white/50 transition-colors hover:bg-white/[0.04] hover:text-white/70"
                  >
                    {tpl}
                  </button>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="flex items-end gap-2">
          <button
            type="button"
            onClick={() => setShowTemplates((v) => !v)}
            className={cn(
              "rounded-lg p-1.5 transition-colors",
              showTemplates ? "bg-white/[0.08] text-white/50" : "text-white/25 hover:bg-white/[0.04] hover:text-white/40"
            )}
            title="Quick replies"
          >
            <ChatDots className="size-3.5" />
          </button>
          <div className="flex flex-1 items-end rounded-xl border border-white/[0.08] bg-white/[0.02] px-3 py-2">
            <input
              type="text"
              value={compose}
              onChange={(e) => setCompose(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend() }}}
              placeholder="Type a message..."
              className="flex-1 bg-transparent text-[11px] text-white/80 placeholder:text-white/20 focus:outline-none"
            />
          </div>
          <button
            type="button"
            onClick={handleSend}
            disabled={!compose.trim()}
            className="rounded-lg bg-blue-500/15 p-1.5 text-blue-400 transition-colors hover:bg-blue-500/25 disabled:opacity-30"
          >
            <PaperPlaneTilt className="size-3.5" weight="fill" />
          </button>
        </div>
      </div>
    </motion.div>
  )
}

// ── Lab Result Card ──

function LabResultCard({ lab }: { lab: InboxMessage }) {
  const isNew = !lab.read
  return (
    <div
      className={cn(
        "rounded-xl border px-3 py-2.5 transition-colors hover:bg-white/[0.02]",
        isNew ? "border-[#FFC107]/20 bg-[#FFC107]/[0.03]" : "border-white/[0.06]"
      )}
    >
      <div className="flex items-center gap-2">
        <Flask className="size-3.5 text-[#FFC107]" weight="fill" />
        <span className="flex-1 text-[11px] font-medium">{lab.from}</span>
        <span
          className={cn(
            "rounded-full px-1.5 py-0.5 text-[8px] font-semibold uppercase tracking-wider",
            isNew ? "bg-[#FFC107]/15 text-[#FFC107]" : "bg-white/[0.06] text-white/30"
          )}
        >
          {isNew ? "New" : "Reviewed"}
        </span>
      </div>
      <p className="mt-1 text-[10px] leading-relaxed text-white/40">{lab.preview}</p>
      {lab.patientId && (
        <p className="mt-0.5 text-[9px] text-white/25">Patient ID: {lab.patientId}</p>
      )}
      <p className="mt-1 text-[9px] text-white/20">
        {new Date(lab.timestamp).toLocaleString([], {
          month: "short",
          day: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        })}
      </p>
    </div>
  )
}

const LAB_QUEUE_COLLAPSED = 6

export function LabResultsQueue({ labs }: { labs: InboxMessage[] }) {
  const [expanded, setExpanded] = useState(false)
  const unread = useMemo(() => labs.filter((l) => !l.read).length, [labs])
  const showToggle = labs.length > LAB_QUEUE_COLLAPSED
  const visible = expanded || !showToggle ? labs : labs.slice(0, LAB_QUEUE_COLLAPSED)

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <p className="text-[10px] text-white/35">
          <span className="tabular-nums text-white/50">{unread}</span> unread ·{" "}
          <span className="tabular-nums text-white/50">{labs.length}</span> total
        </p>
        {showToggle && (
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="flex items-center gap-1 rounded-lg px-2 py-1 text-[10px] font-medium text-blue-400 transition-colors hover:bg-white/[0.04]"
          >
            {expanded ? "Show fewer" : `Show all ${labs.length}`}
            <CaretDown className={cn("size-3 transition-transform", expanded && "rotate-180")} />
          </button>
        )}
      </div>
      <div
        className="space-y-2 overflow-y-auto overscroll-contain pr-0.5"
        style={{
          maxHeight: expanded ? "min(55vh, 520px)" : 220,
          scrollbarWidth: "thin",
        }}
      >
        {visible.map((lab) => (
          <LabResultCard key={lab.id} lab={lab} />
        ))}
      </div>
    </div>
  )
}

type SmartImportMode = "auto" | "patient_file" | "attach" | "hl7"

// ── Smart Import ──

export function SmartImportTile({
  addPatient,
  patients,
  addInboxMessage,
  addNotification,
}: {
  addPatient: (patient: PracticePatient) => void
  patients: PracticePatient[]
  addInboxMessage: (message: InboxMessage) => void
  addNotification: (n: AdminNotification) => void
}) {
  const [mode, setMode] = useState<SmartImportMode>("auto")
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [fileLabel, setFileLabel] = useState<string | null>(null)
  const [detected, setDetected] = useState<string | null>(null)
  const [extractedFields, setExtractedFields] = useState<Record<string, string> | null>(null)
  const [isExtracting, setIsExtracting] = useState(false)
  const [created, setCreated] = useState<"patient" | "doc" | "lab" | null>(null)
  const [attachPatientId, setAttachPatientId] = useState("")
  const [hl7Text, setHl7Text] = useState(
    "MSH|^~\\&|LIMS|LAB|EMR|CLINIC|20260404120000||ORU^R01|MSG001|P|2.5\rPID|1||MRN12345||Mokoena^Thandi||19850312|F\rOBR|1||CBC^Complete blood count\rOBX|1|NM|WBC||7.2|10*9/L|4.0-11.0|N\rOBX|2|NM|HGB||13.1|g/dL|12.0-16.0|N"
  )
  const [hl7Preview, setHl7Preview] = useState<{ code: string; value: string; unit: string }[] | null>(
    null
  )
  const fileRef = useRef<HTMLInputElement>(null)

  const resetFile = useCallback(() => {
    if (previewUrl) URL.revokeObjectURL(previewUrl)
    setPreviewUrl(null)
    setFileLabel(null)
    setDetected(null)
    setExtractedFields(null)
    setIsExtracting(false)
    setCreated(null)
    setHl7Preview(null)
    if (fileRef.current) fileRef.current.value = ""
  }, [previewUrl])

  const runExtractionMock = useCallback(
    (file: File, importMode: SmartImportMode) => {
      setIsExtracting(true)
      setCreated(null)
      const lower = file.name.toLowerCase()
      const isHl7 =
        importMode === "hl7" || lower.endsWith(".hl7") || lower.endsWith(".txt") || lower.endsWith(".xml")

      window.setTimeout(() => {
        if (isHl7) {
          setDetected("HL7 ORU — lab result message")
          setExtractedFields({
            Patient: "Thandi Mokoena",
            Accession: "LAB-90821",
            Summary: "CBC within reference range",
          })
        } else if (importMode === "patient_file") {
          setDetected("ID / medical aid — onboarding capture")
          setExtractedFields({
            "Full Name": "David Nkosi",
            "ID Number": "8805015012089",
            "Medical Aid": "Discovery Health",
            "Member No.": "DH-12345678",
          })
        } else if (importMode === "attach") {
          setDetected("General document (PDF / scan)")
          setExtractedFields({
            Title: file.name.replace(/\.[^.]+$/, ""),
            Pages: "1",
            Summary: "Ready to attach to a patient file",
          })
        } else {
          const roll = file.size % 3
          if (roll === 0) {
            setDetected("SA ID card — demographic extract")
            setExtractedFields({
              "Full Name": "David Nkosi",
              "ID Number": "8805015012089",
              "Date of Birth": "1988-05-01",
            })
          } else if (roll === 1) {
            setDetected("Medical aid card — scheme details")
            setExtractedFields({
              "Medical Aid": "Discovery Health",
              Plan: "Smart Plan",
              "Member No.": "DH-12345678",
              "Main Member": "David Nkosi",
            })
          } else {
            setDetected("Clinical document — not a membership card")
            setExtractedFields({
              Title: "Referral letter",
              Summary: "Specialist follow-up requested",
              Pages: "2",
            })
          }
        }
        setIsExtracting(false)
      }, 900)
    },
    []
  )

  const handleFile = useCallback(
    (file: File) => {
      const isImage = file.type.startsWith("image/")
      if (isImage) {
        const url = URL.createObjectURL(file)
        if (previewUrl) URL.revokeObjectURL(previewUrl)
        setPreviewUrl(url)
      } else {
        if (previewUrl) URL.revokeObjectURL(previewUrl)
        setPreviewUrl(null)
      }
      setFileLabel(file.name)
      setExtractedFields(null)
      runExtractionMock(file, mode)
    },
    [mode, previewUrl, runExtractionMock]
  )

  const handleCreatePatient = useCallback(() => {
    if (!extractedFields) return
    const name =
      extractedFields["Full Name"] ?? extractedFields["Main Member"] ?? extractedFields["Patient"] ?? "Unknown"
    addPatient({
      id: crypto.randomUUID(),
      name,
      idNumber: extractedFields["ID Number"],
      dateOfBirth: extractedFields["Date of Birth"],
      medicalAidStatus: "pending",
      medicalAidScheme: extractedFields["Medical Aid"],
      memberNumber: extractedFields["Member No."],
      outstandingBalance: 0,
      registeredAt: new Date().toISOString(),
    })
    setCreated("patient")
    addNotification({
      id: `notif-${Date.now()}`,
      type: "info",
      title: "Patient created from import",
      detail: name,
      timestamp: new Date().toISOString(),
      read: false,
    })
  }, [extractedFields, addPatient, addNotification])

  const handleAttachToPatient = useCallback(() => {
    if (!attachPatientId || !fileLabel) return
    const p = patients.find((x) => x.id === attachPatientId)
    if (!p) return
    addNotification({
      id: `notif-${Date.now()}`,
      type: "info",
      title: "Document linked to patient",
      detail: `${fileLabel} → ${p.name}`,
      timestamp: new Date().toISOString(),
      read: false,
    })
    setCreated("doc")
  }, [attachPatientId, fileLabel, patients, addNotification])

  const handleImportHl7AsLab = useCallback(() => {
    const lines = hl7Text.split(/\r?\n/).filter(Boolean)
    const obx: { code: string; value: string; unit: string }[] = []
    for (const line of lines) {
      if (!line.startsWith("OBX|")) continue
      const p = line.split("|")
      obx.push({
        code: (p[3] ?? "").split("^")[0] || "OBX",
        value: p[5] ?? "—",
        unit: p[6] ?? "",
      })
    }
    setHl7Preview(obx.length ? obx : [{ code: "Note", value: "No OBX rows found — paste a full ORU message", unit: "" }])
  }, [hl7Text])

  const handleCommitHl7Lab = useCallback(() => {
    addInboxMessage({
      id: `lab-${Date.now()}`,
      channel: "lab",
      from: "HL7 import",
      preview: hl7Preview?.map((o) => `${o.code}: ${o.value} ${o.unit}`.trim()).join(" · ") ?? "HL7 result",
      timestamp: new Date().toISOString(),
      read: false,
    })
    setCreated("lab")
    addNotification({
      id: `notif-${Date.now()}`,
      type: "lab_result",
      title: "Lab result imported",
      detail: "Queued in Lab Results",
      timestamp: new Date().toISOString(),
      read: false,
    })
  }, [addInboxMessage, addNotification, hl7Preview])

  const modePills: { id: SmartImportMode; label: string; icon: typeof Scan }[] = [
    { id: "auto", label: "Auto-detect", icon: Scan },
    { id: "patient_file", label: "ID & cards", icon: UserPlus },
    { id: "attach", label: "Attach to patient", icon: LinkSimple },
    { id: "hl7", label: "HL7 / lab", icon: Code },
  ]

  return (
    <BentoTile
      title="Smart Import"
      subtitle="Upload ID, medical aid, documents, labs, or paste HL7 — route to patient or file"
      icon={<UploadSimple className="size-4 text-white/30" />}
    >
      <div className="mb-3 flex flex-wrap gap-1.5">
        {modePills.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => {
              setMode(id)
              resetFile()
            }}
            className={cn(
              "flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[10px] font-medium transition-colors",
              mode === id
                ? "bg-white/[0.12] text-foreground"
                : "bg-white/[0.04] text-white/40 hover:bg-white/[0.07] hover:text-white/60"
            )}
          >
            <Icon className="size-3.5" weight={mode === id ? "fill" : "regular"} />
            {label}
          </button>
        ))}
      </div>

      {mode === "hl7" ? (
        <div className="space-y-3">
          <p className="text-[10px] leading-relaxed text-white/35">
            Paste a pipe-delimited message (ORU^R01, ADT, etc.). OBX rows are parsed locally; production can POST to your
            integration layer.
          </p>
          <textarea
            value={hl7Text}
            onChange={(e) => setHl7Text(e.target.value)}
            rows={5}
            spellCheck={false}
            className="w-full rounded-xl border border-white/[0.08] bg-black/30 px-3 py-2 font-mono text-[10px] leading-relaxed text-white/70 focus:border-blue-500/40 focus:outline-none"
          />
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={handleImportHl7AsLab}
              className="rounded-lg bg-white/[0.08] px-3 py-1.5 text-[10px] font-semibold text-foreground hover:bg-white/[0.12]"
            >
              Parse OBX preview
            </button>
            <button
              type="button"
              onClick={handleCommitHl7Lab}
              disabled={!hl7Preview?.length}
              className="rounded-lg bg-[#FFC107]/20 px-3 py-1.5 text-[10px] font-semibold text-[#FFC107] disabled:opacity-30"
            >
              Queue as lab result
            </button>
          </div>
          {hl7Preview && (
            <div className="overflow-x-auto rounded-xl border border-white/[0.06]">
              <table className="w-full text-left text-[10px]">
                <thead>
                  <tr className="border-b border-white/[0.06] text-white/35">
                    <th className="px-2 py-1.5 font-medium">Code</th>
                    <th className="px-2 py-1.5 font-medium">Value</th>
                    <th className="px-2 py-1.5 font-medium">Unit</th>
                  </tr>
                </thead>
                <tbody>
                  {hl7Preview.map((row, i) => (
                    <tr key={i} className="border-b border-white/[0.04] text-white/60">
                      <td className="px-2 py-1.5 font-mono">{row.code}</td>
                      <td className="px-2 py-1.5">{row.value}</td>
                      <td className="px-2 py-1.5 text-white/40">{row.unit}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {created === "lab" && (
            <p className="text-[10px] font-medium text-[#00E676]">Added to Lab Results inbox.</p>
          )}
        </div>
      ) : (
        <>
          {mode === "attach" && (
            <div className="mb-3">
              <label className="mb-1 block text-[9px] font-medium uppercase tracking-wider text-white/25">
                Patient
              </label>
              <select
                value={attachPatientId}
                onChange={(e) => setAttachPatientId(e.target.value)}
                className="w-full rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 py-2 text-[11px] text-foreground focus:border-blue-500/40 focus:outline-none"
              >
                <option value="">Select patient…</option>
                {patients.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {!previewUrl && !fileLabel ? (
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="flex w-full flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-white/[0.1] bg-gradient-to-b from-white/[0.03] to-transparent px-4 py-8 transition-colors hover:border-blue-500/30 hover:from-white/[0.05]"
            >
              <div className="flex items-center gap-3 text-white/35">
                <Camera className="size-5" />
                <span className="text-[10px]">or</span>
                <File className="size-5" />
              </div>
              <p className="text-center text-[11px] text-white/45">
                Drop ID, medical aid card, PDF, photo, or{" "}
                <span className="text-white/60">.hl7</span> file
              </p>
              <span className="rounded-full bg-white/[0.06] px-3 py-1 text-[10px] font-medium text-white/50">
                Browse files
              </span>
            </button>
          ) : (
            <div className="flex flex-col gap-4 sm:flex-row">
              <div className="shrink-0">
                {previewUrl ? (
                  <img
                    src={previewUrl}
                    alt=""
                    className="h-24 max-w-[200px] rounded-xl border border-white/[0.08] object-cover"
                  />
                ) : (
                  <div className="flex h-24 w-28 items-center justify-center rounded-xl border border-white/[0.08] bg-white/[0.04]">
                    <File className="size-8 text-white/25" />
                  </div>
                )}
                {fileLabel && (
                  <p className="mt-1 max-w-[200px] truncate text-[9px] text-white/30">{fileLabel}</p>
                )}
              </div>
              <div className="min-w-0 flex-1">
                {detected && (
                  <p className="mb-2 rounded-lg bg-blue-500/10 px-2 py-1 text-[10px] text-blue-300">{detected}</p>
                )}
                {isExtracting ? (
                  <div className="flex items-center gap-2 py-4">
                    <CircleNotch className="size-4 animate-spin text-blue-400" />
                    <p className="text-[11px] text-blue-400">Classifying &amp; extracting…</p>
                  </div>
                ) : extractedFields ? (
                  <div className="space-y-2.5">
                    <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 sm:grid-cols-3">
                      {Object.entries(extractedFields).map(([key, val]) => (
                        <div key={key}>
                          <p className="text-[9px] uppercase tracking-wider text-white/25">{key}</p>
                          <p className="text-[11px] font-medium text-white/80">{val}</p>
                        </div>
                      ))}
                    </div>
                    <div className="flex flex-wrap gap-2 pt-1">
                      {mode === "attach" ? (
                        <>
                          {created === "doc" ? (
                            <span className="flex items-center gap-1 text-[10px] font-semibold text-[#00E676]">
                              <CheckCircle className="size-3.5" weight="fill" /> Linked
                            </span>
                          ) : (
                            <button
                              type="button"
                              onClick={handleAttachToPatient}
                              disabled={!attachPatientId}
                              className="rounded-lg bg-blue-500/20 px-3 py-1.5 text-[10px] font-semibold text-blue-300 disabled:opacity-30"
                            >
                              Attach to patient file
                            </button>
                          )}
                        </>
                      ) : (
                        <>
                          {created === "patient" ? (
                            <span className="flex items-center gap-1 text-[10px] font-semibold text-[#00E676]">
                              <CheckCircle className="size-3.5" weight="fill" /> Patient created
                            </span>
                          ) : (
                            <>
                              <button
                                type="button"
                                onClick={handleCreatePatient}
                                className="flex items-center gap-1.5 rounded-lg bg-[#00E676]/15 px-3 py-1.5 text-[10px] font-semibold text-[#00E676] hover:bg-[#00E676]/25"
                              >
                                <UserPlus className="size-3.5" weight="bold" />
                                Create patient
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  addNotification({
                                    id: `notif-${Date.now()}`,
                                    type: "info",
                                    title: "Document filed",
                                    detail: "Saved as pending document (demo)",
                                    timestamp: new Date().toISOString(),
                                    read: false,
                                  })
                                  setCreated("doc")
                                }}
                                className="rounded-lg bg-white/[0.06] px-3 py-1.5 text-[10px] text-white/50 hover:bg-white/[0.1]"
                              >
                                Save as document only
                              </button>
                            </>
                          )}
                        </>
                      )}
                      <button
                        type="button"
                        onClick={resetFile}
                        className="flex items-center gap-1.5 rounded-lg bg-white/[0.06] px-3 py-1.5 text-[10px] text-white/40 hover:bg-white/[0.1]"
                      >
                        <Eraser className="size-3.5" />
                        Clear
                      </button>
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
          )}

          <input
            ref={fileRef}
            type="file"
            accept="image/*,application/pdf,.pdf,text/plain,.hl7,.xml,application/xml"
            capture={mode === "patient_file" || mode === "auto" ? "environment" : undefined}
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) handleFile(file)
            }}
          />
        </>
      )}
    </BentoTile>
  )
}

// ── Activity Feed (live workspace timeline) ──

export { LiveActivityFeed as ActivityFeedTile } from "./live-activity-feed"

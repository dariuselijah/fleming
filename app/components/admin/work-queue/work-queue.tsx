"use client"

import { bindWorkQueueThreadRefresh, useWorkQueueStore, useWorkQueueDerived } from "@/lib/admin/work-queue-store"
import type { WorkQueueFilter } from "@/lib/admin/work-queue-types"
import { useWorkspaceStore } from "@/lib/clinical-workspace"
import { buildClaimChildItems } from "@/lib/admin/work-queue-assembler"
import { cn } from "@/lib/utils"
import { CircleNotch, PaperPlaneTilt, Sparkle, X } from "@phosphor-icons/react"
import { useCallback, useEffect, useRef } from "react"
import { QueueRow } from "./queue-row"
import { ResizableSplit } from "./resizable-split"
import { WorkQueueRightPanel } from "./right-panel"
import { WorkQueueBackgroundImport } from "./background-import"
import { SmsComposeModal } from "./sms-compose-modal"

function ChannelEmptyState({
  filter,
  channelStatus,
}: {
  filter: WorkQueueFilter
  channelStatus: { smsConnected: boolean; voiceConnected: boolean; emailConnected: boolean; loaded: boolean }
}) {
  const setAdminTab = useWorkspaceStore((s) => s.setAdminTab)
  const setMode = useWorkspaceStore((s) => s.setMode)

  if (!channelStatus.loaded) return null

  const needsSms = filter === "sms" && !channelStatus.smsConnected
  const needsVoice = filter === "voice" && !channelStatus.voiceConnected
  const needsEmail = filter === "email" && !channelStatus.emailConnected

  if (!needsSms && !needsVoice && !needsEmail) return null

  const label = needsSms
    ? "SMS not connected"
    : needsVoice
      ? "Voice not connected"
      : "Email not connected"

  const focus = needsSms ? "sms" : needsVoice ? "voice" : "email"

  return (
    <div className="mx-4 mt-3 rounded-xl border border-blue-400/20 bg-blue-500/[0.06] px-4 py-3 text-center">
      <p className="text-[11px] font-medium text-foreground/90">{label}</p>
      <p className="mt-1 text-[10px] leading-relaxed text-muted-foreground">
        {filter === "voice"
          ? "Set up your practice phone line and AI voice agent in Channels."
          : filter === "email"
            ? "Enable your practice inbox address in Channels."
            : "Connect a Twilio number to receive patient SMS in Front Desk."}
      </p>
      <button
        type="button"
        onClick={() => {
          setMode("admin")
          setAdminTab("channels")
          if (typeof window !== "undefined") {
            window.sessionStorage.setItem("channels-focus", focus)
          }
        }}
        className="mt-3 rounded-lg bg-foreground px-3 py-1.5 text-[10px] font-semibold text-background"
      >
        Open Channels setup
      </button>
    </div>
  )
}

function TaskList({
  displayList,
  selectedId,
  expandedGroupIds,
  threadsLoading,
  threadsError,
  aiResolvedToday,
  filter,
  channelStatus,
  onSelect,
  onToggleGroup,
  onNewSms,
}: {
  displayList: ReturnType<typeof useWorkQueueDerived>["displayList"]
  selectedId: string | null
  expandedGroupIds: Set<string>
  threadsLoading: boolean
  threadsError: string | null
  aiResolvedToday: number
  filter: WorkQueueFilter
  channelStatus: { smsConnected: boolean; voiceConnected: boolean; emailConnected: boolean; loaded: boolean }
  onSelect: (id: string) => void
  onToggleGroup: (id: string) => void
  onNewSms: () => void
}) {
  const openCount = displayList.filter((i) => !i.resolved && !i.summaryLine.startsWith("↳")).length

  return (
    <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
      <div className="flex shrink-0 items-center justify-between border-b border-border/60 px-4 py-2.5 dark:border-panel-border">
        <div>
          <h2 className="text-[13px] font-semibold tracking-tight text-foreground">Front Desk</h2>
          <p className="text-[10px] text-muted-foreground">
            {openCount} need attention · {displayList.filter((i) => !i.summaryLine.startsWith("↳")).length} shown
          </p>
        </div>
        <div className="flex items-center gap-2">
          {aiResolvedToday > 0 && (
            <div className="flex items-center gap-1.5 rounded-full border border-panel-border bg-panel-muted/50 px-2 py-0.5">
              <Sparkle className="size-3 text-muted-foreground" weight="fill" />
              <span className="text-[9px] font-medium text-muted-foreground">Auto-resolved {aiResolvedToday}</span>
            </div>
          )}
          {(filter === "sms" || filter === "all" || filter === "voice") && (
            <button
              type="button"
              onClick={onNewSms}
              className="flex items-center gap-1 rounded-lg bg-foreground px-2.5 py-1 text-[10px] font-semibold text-background"
            >
              <PaperPlaneTilt className="size-3" weight="fill" />
              New SMS
            </button>
          )}
        </div>
      </div>

      {threadsError && (
        <div className="mx-3 mt-2 rounded-md border border-destructive/25 bg-destructive/10 px-2.5 py-1.5 text-[10px] text-destructive">
          {threadsError}
        </div>
      )}

      <ChannelEmptyState filter={filter} channelStatus={channelStatus} />

      <div className="min-h-0 flex-1 overflow-y-auto divide-y divide-border/50 dark:divide-panel-border/50" style={{ scrollbarWidth: "thin" }}>
        {threadsLoading && displayList.length === 0 ? (
          <div className="flex items-center justify-center py-12">
            <CircleNotch className="size-5 animate-spin text-muted-foreground/50" />
          </div>
        ) : displayList.length === 0 ? (
          <div className="flex flex-col items-center justify-center px-6 py-12 text-center">
            <Sparkle className="mb-2 size-7 text-muted-foreground/25" weight="fill" />
            <p className="text-[12px] text-muted-foreground">All clear</p>
            <p className="mt-1 max-w-[240px] text-[10px] leading-relaxed text-muted-foreground/65">
          Fleming handles routine admin in the background. Select a message or email task on the left to reply in the panel here.
        </p>
          </div>
        ) : (
          displayList.map((item) => (
            <QueueRow
              key={item.id}
              item={item}
              selected={selectedId === item.id}
              onClick={() => onSelect(item.id)}
              onToggleGroup={item.isGroup ? () => onToggleGroup(item.id) : undefined}
              groupExpanded={item.isGroup ? expandedGroupIds.has(item.id) : undefined}
            />
          ))
        )}
      </div>
    </div>
  )
}

export function WorkQueue() {
  const refreshThreads = useWorkQueueStore((s) => s.refreshThreads)
  const refreshInvoices = useWorkQueueStore((s) => s.refreshInvoices)
  const threadsLoading = useWorkQueueStore((s) => s.threadsLoading)
  const threadsError = useWorkQueueStore((s) => s.threadsError)
  const selectedId = useWorkQueueStore((s) => s.selectedId)
  const selectItem = useWorkQueueStore((s) => s.selectItem)
  const toggleGroupExpanded = useWorkQueueStore((s) => s.toggleGroupExpanded)
  const expandedGroupIds = useWorkQueueStore((s) => s.expandedGroupIds)
  const panelWidth = useWorkQueueStore((s) => s.panelWidth)
  const setPanelWidth = useWorkQueueStore((s) => s.setPanelWidth)
  const aiResolvedToday = useWorkQueueStore((s) => s.aiResolvedToday)
  const filter = useWorkQueueStore((s) => s.filter)
  const channelStatus = useWorkQueueStore((s) => s.channelStatus)
  const refreshChannelStatus = useWorkQueueStore((s) => s.refreshChannelStatus)
  const setSmsComposeOpen = useWorkQueueStore((s) => s.setSmsComposeOpen)
  const { displayList, selected, filtered } = useWorkQueueDerived()

  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bindWorkQueueThreadRefresh()
    void refreshThreads()
    void refreshInvoices()
    void refreshChannelStatus()
    const interval = setInterval(() => {
      void refreshThreads()
      void refreshInvoices()
    }, 15_000)
    return () => clearInterval(interval)
  }, [refreshThreads, refreshInvoices, refreshChannelStatus])

  useEffect(() => {
    if (filtered.length === 0) {
      selectItem(null)
      return
    }
    // Keep claim child / derived selections that aren't top-level list rows
    if (selectedId && selected) return
    if (!selectedId || ![...filtered, ...displayList].some((i) => i.id === selectedId)) {
      const first = filtered.find((i) => !i.resolved) ?? filtered[0]
      if (first) selectItem(first.id)
    }
  }, [filtered, displayList, selectedId, selected, selectItem])

  const handleKeyNav = useCallback(
    (e: KeyboardEvent) => {
      const t = e.target as HTMLElement
      if (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable) return
      if (displayList.length === 0) return
      const idx = displayList.findIndex((i) => i.id === selectedId)
      if (e.key === "j") {
        e.preventDefault()
        const next = Math.min(displayList.length - 1, idx + 1)
        selectItem(displayList[next]?.id ?? null)
      }
      if (e.key === "k") {
        e.preventDefault()
        const prev = Math.max(0, idx - 1)
        selectItem(displayList[prev]?.id ?? null)
      }
    },
    [displayList, selectedId, selectItem]
  )

  useEffect(() => {
    window.addEventListener("keydown", handleKeyNav)
    return () => window.removeEventListener("keydown", handleKeyNav)
  }, [handleKeyNav])

  const listPane = (
    <TaskList
      displayList={displayList}
      selectedId={selectedId}
      expandedGroupIds={expandedGroupIds}
      threadsLoading={threadsLoading}
      threadsError={threadsError}
      aiResolvedToday={aiResolvedToday}
      filter={filter}
      channelStatus={channelStatus}
      onSelect={selectItem}
      onToggleGroup={toggleGroupExpanded}
      onNewSms={() => setSmsComposeOpen(true)}
    />
  )

  const detailPane = (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <WorkQueueRightPanel item={selected} />
    </div>
  )

  return (
    <div ref={listRef} className="relative flex h-full min-h-0 overflow-hidden">
      <WorkQueueBackgroundImport />
      <SmsComposeModal />

      {/* Desktop: resizable split */}
      <div className="hidden h-full min-h-0 flex-1 md:flex">
        <ResizableSplit
          left={listPane}
          right={detailPane}
          width={panelWidth}
          onWidthChange={setPanelWidth}
          className="flex-1"
        />
      </div>

      {/* Mobile: list full width + slide-over panel */}
      <div className="flex h-full min-h-0 flex-1 flex-col md:hidden">{listPane}</div>
      {selected && (
        <div
          className={cn(
            "fixed inset-0 z-40 md:hidden",
            "bg-black/40 backdrop-blur-[1px]"
          )}
          onClick={() => selectItem(null)}
          aria-hidden
        />
      )}
      {selected && (
        <div className="fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col border-l border-panel-border bg-background shadow-2xl md:hidden">
          <div className="flex shrink-0 items-center justify-end border-b border-panel-border px-2 py-1">
            <button
              type="button"
              onClick={() => selectItem(null)}
              className="flex size-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-panel-muted"
              aria-label="Close panel"
            >
              <X className="size-4" />
            </button>
          </div>
          <div className="min-h-0 flex-1">{detailPane}</div>
        </div>
      )}
    </div>
  )
}

/** @deprecated alias — use WorkQueue */
export const FrontDeskQueue = WorkQueue

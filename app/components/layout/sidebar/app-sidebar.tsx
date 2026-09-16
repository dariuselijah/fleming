"use client"

import { groupChatsByDate } from "@/app/components/history/utils"
import { useBreakpoint } from "@/app/hooks/use-breakpoint"
import { ScrollArea } from "@/components/ui/scroll-area"
import { EmptyState } from "@/components/ui/empty-state"
import { IconButton } from "@/components/ui/icon-button"
import { startNewChatClientSide } from "@/lib/chat-store/new-chat"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  useSidebar,
} from "@/components/ui/sidebar"
import { useChats } from "@/lib/chat-store/chats/provider"
import {
  ChatTeardropText,
  FolderSimple,
  MagnifyingGlass,
  NotePencilIcon,
  X,
  ShieldCheck,
  CurrencyDollar,
  Warning,
  Clock,
  UserCircle,
  ToggleLeft,
  ToggleRight,
  Syringe,
  FileText,
  FileXls,
  Receipt,
  ChatCircle,
} from "@phosphor-icons/react"
import Image from "next/image"
import Link from "next/link"
import { useParams, usePathname, useRouter } from "next/navigation"
import { useEffect, useMemo, useRef, useState, useCallback } from "react"
import { FeedbackTrigger } from "../feedback/feedback-trigger"
import { HistoryTrigger } from "../../history/history-trigger"
import { SidebarList } from "./sidebar-list"
import { SidebarProject } from "./sidebar-project"
import { cn } from "@/lib/utils"
import { formatDate, formatZAR } from "@/lib/format"
import { useWorkspaceStore, type PracticeClaim, type InventoryItem } from "@/lib/clinical-workspace"
import { SessionDocumentRow } from "@/app/components/workspace/session-document-row"
import { PatientConsultChatsBar } from "@/app/components/workspace/patient-consult-chats-bar"
import {
  ClinicalSidebarAllergiesSection,
  ClinicalSidebarChronicSection,
  ClinicalSidebarEncounterProblemsSection,
  ClinicalSidebarLabsSection,
  ClinicalSidebarMedicationsSection,
  ClinicalSidebarSocialHistorySection,
  ClinicalSidebarVitalsSection,
  ClinicalSidebarImagingSection,
  SidebarSection,
} from "@/app/components/layout/sidebar/clinical-sidebar-patient-sections"
import { ChannelsSidebarPanel } from "@/app/components/layout/sidebar/sidebar-panel-placeholder"
import { MasterSidebarNav } from "@/app/components/layout/sidebar/master-sidebar-nav"
import { WorkQueueSidebarPanel } from "@/app/components/admin/work-queue/work-queue-sidebar-panel"
import {
  SidebarBadge,
  SidebarDivider,
  SidebarEmpty,
  SidebarHeadline,
  SidebarLinkRow,
  SidebarSectionGroup,
  SidebarStatRow,
} from "@/app/components/layout/sidebar/sidebar-primitives"

function useWorkspaceSafe() {
  const mode = useWorkspaceStore((s) => s.mode)
  const activeAdminTab = useWorkspaceStore((s) => s.activeAdminTab)
  const practiceProviders = useWorkspaceStore((s) => s.practiceProviders)
  const activeDoctorId = useWorkspaceStore((s) => s.activeDoctorId)
  const inventory = useWorkspaceStore((s) => s.inventory)
  const notifications = useWorkspaceStore((s) => s.notifications)
  const inboxMessages = useWorkspaceStore((s) => s.inboxMessages)
  const claims = useWorkspaceStore((s) => s.claims)
  const patients = useWorkspaceStore((s) => s.patients)
  const appointments = useWorkspaceStore((s) => s.appointments)
  const activePatientId = useWorkspaceStore((s) => s.activePatientId)
  const openPatients = useWorkspaceStore((s) => s.openPatients)
  const selectedDate = useWorkspaceStore((s) => s.selectedDate)
  return { mode, activeAdminTab, practiceProviders, activeDoctorId, inventory, notifications, inboxMessages, claims, patients, appointments, activePatientId, openPatients, selectedDate }
}

const SIDEBAR_MIN_W = 240
const SIDEBAR_MAX_W = 480
const SIDEBAR_LS_KEY = "fleming:sidebar-width"
const formatWholeZAR = (amount: number) =>
  formatZAR(amount, { minimumFractionDigits: 0, maximumFractionDigits: 0 })

function useResizableSidebar(enabled: boolean) {
  /** Must match server render — read localStorage in useEffect to avoid hydration mismatch. */
  const [width, setWidth] = useState(256)
  const dragging = useRef(false)
  const startX = useRef(0)
  const startW = useRef(width)

  useEffect(() => {
    if (!enabled) return
    if (typeof window === "undefined") return
    const stored = localStorage.getItem(SIDEBAR_LS_KEY)
    if (!stored) return
    const n = Number(stored)
    if (!Number.isFinite(n)) return
    setWidth(Math.max(SIDEBAR_MIN_W, Math.min(SIDEBAR_MAX_W, n)))
  }, [enabled])

  useEffect(() => {
    if (!enabled) return
    const onMove = (e: MouseEvent) => {
      if (!dragging.current) return
      const delta = e.clientX - startX.current
      const next = Math.max(SIDEBAR_MIN_W, Math.min(SIDEBAR_MAX_W, startW.current + delta))
      setWidth(next)
    }
    const onUp = () => {
      if (dragging.current) {
        dragging.current = false
        document.body.style.cursor = ""
        document.body.style.userSelect = ""
        localStorage.setItem(SIDEBAR_LS_KEY, String(width))
      }
    }
    window.addEventListener("mousemove", onMove)
    window.addEventListener("mouseup", onUp)
    return () => {
      window.removeEventListener("mousemove", onMove)
      window.removeEventListener("mouseup", onUp)
    }
  }, [enabled, width])

  const onDragStart = useCallback(
    (e: React.MouseEvent) => {
      if (!enabled) return
      e.preventDefault()
      dragging.current = true
      startX.current = e.clientX
      startW.current = width
      document.body.style.cursor = "col-resize"
      document.body.style.userSelect = "none"
    },
    [enabled, width]
  )

  return { width, onDragStart, isDragging: dragging }
}

export function AppSidebar() {
  const isMobile = useBreakpoint(768)
  const { setOpenMobile } = useSidebar()
  const { chats, isLoading } = useChats()
  const params = useParams<{ chatId: string }>()
  const currentChatId = params.chatId
  const router = useRouter()
  const pathname = usePathname()

  const workspace = useWorkspaceSafe()
  const isAdmin = workspace?.mode === "admin"
  const isClinical = workspace?.mode === "clinical"
  const { width, onDragStart } = useResizableSidebar(isClinical ?? false)

  useEffect(() => {
    if (isMobile) setOpenMobile(false)
  }, [isMobile, pathname, setOpenMobile, workspace?.activeAdminTab, workspace?.mode])

  const groupedChats = useMemo(() => {
    const result = groupChatsByDate(chats, "")
    return result
  }, [chats])
  const hasChats = chats.length > 0

  const sidebarStyle = isClinical
    ? ({ "--sidebar-width": `${width}px` } as React.CSSProperties)
    : undefined

  return (
    <Sidebar
      collapsible="offcanvas"
      variant="sidebar"
      className="border-r border-sidebar-border/60 bg-sidebar/98"
      style={sidebarStyle}
    >
      <SidebarHeader className="h-14 border-b border-sidebar-border/40 px-4">
        <div className="flex h-full items-center justify-between">
          <Link href="/" className="flex min-w-0 items-center gap-2.5">
            <Image
              src="/logo-white.png"
              alt="Fleming"
              width={26}
              height={26}
              priority
              className="size-[22px] shrink-0 select-none object-contain"
            />
            <div className="min-w-0">
              <p className="truncate text-[13px] font-semibold tracking-tight text-sidebar-foreground">
                Fleming
              </p>
              <p className="text-micro truncate uppercase tracking-[0.18em] text-sidebar-foreground/45">
                {isAdmin ? "Practice" : isClinical ? "Clinical" : "Assistant"}
              </p>
            </div>
          </Link>
          {isMobile ? (
            <IconButton
              aria-label="Close navigation"
              variant="ghost"
              onClick={() => setOpenMobile(false)}
              className="text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground"
            >
              <X size={20} />
            </IconButton>
          ) : null}
        </div>
      </SidebarHeader>

      <SidebarContent className="mask-t-from-98% mask-t-to-100% mask-b-from-98% mask-b-to-100% px-2.5">
        <ScrollArea className="flex h-full [&>div>div]:!block">
          {isAdmin && workspace ? (
            <AdminWorkspaceSidebarContent workspace={workspace} />
          ) : isClinical && workspace ? (
            <ClinicalSidebarContent workspace={workspace} />
          ) : (
            <ChatSidebarContent
              pathname={pathname}
              router={router}
              isLoading={isLoading}
              hasChats={hasChats}
              groupedChats={groupedChats}
              currentChatId={currentChatId}
            />
          )}
        </ScrollArea>
      </SidebarContent>

      <SidebarFooter className="mb-1 border-t border-sidebar-border/40 px-2.5 py-2">
        {isAdmin ? (
          <div className="flex items-center gap-2.5 rounded-md px-2 py-1.5">
            <UserCircle className="size-5 shrink-0 text-sidebar-foreground/65" weight="fill" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-[12px] font-medium tracking-tight text-sidebar-foreground">
                {workspace?.practiceProviders?.find(p => p.id === workspace?.activeDoctorId)?.name ?? "Admin"}
              </p>
              <p className="text-micro truncate text-sidebar-foreground/45">
                Practice management
              </p>
            </div>
          </div>
        ) : isClinical && workspace ? (
          <ClinicalSidebarFooter workspace={workspace} />
        ) : (
          <FeedbackTrigger>
            <div
              className="hover:bg-sidebar-accent flex items-center gap-2.5 rounded-md px-2 py-1.5"
              aria-label="Tell us how to improve Fleming"
            >
              <ChatTeardropText className="size-4 shrink-0 text-sidebar-foreground/70" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[12px] font-medium tracking-tight text-sidebar-foreground">
                  Help us improve
                </p>
                <p className="text-micro truncate text-sidebar-foreground/45">
                  Share what would make Fleming better
                </p>
              </div>
            </div>
          </FeedbackTrigger>
        )}
      </SidebarFooter>

      {/* Resize handle — right edge */}
      {isClinical && !isMobile && (
        <div
          onMouseDown={onDragStart}
          className="absolute inset-y-0 right-0 z-20 w-1 cursor-col-resize transition-colors hover:bg-sidebar-accent active:bg-sidebar-accent"
          aria-label="Resize sidebar"
        />
      )}
    </Sidebar>
  )
}

function ChatSidebarContent({
  pathname,
  router,
  isLoading,
  hasChats,
  groupedChats,
  currentChatId,
}: {
  pathname: string
  router: ReturnType<typeof useRouter>
  isLoading: boolean
  hasChats: boolean
  groupedChats: ReturnType<typeof groupChatsByDate> | undefined
  currentChatId: string
}) {
  return (
    <>
      <div className="mt-3 mb-4">
        <MasterSidebarNav />
      </div>
      <SidebarDivider className="mb-3" />
      <div className="mb-4 space-y-px">
        <button
          className="group/new-chat relative flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-[12px] font-medium text-sidebar-foreground/70 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
          type="button"
          onClick={() => {
            startNewChatClientSide(pathname)
          }}
        >
          <NotePencilIcon size={14} className="shrink-0 opacity-70" />
          <span className="flex-1">New chat</span>
          <span className="text-micro tabular-nums text-sidebar-foreground/45 opacity-0 transition-opacity group-hover/new-chat:opacity-100 group-focus-within/new-chat:opacity-100">
            ⌘⇧U
          </span>
        </button>
        <HistoryTrigger
          hasSidebar={false}
          classNameTrigger="bg-transparent hover:bg-sidebar-accent hover:text-sidebar-accent-foreground text-sidebar-foreground/70 group/search relative flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-[12px] font-medium transition-colors"
          icon={<MagnifyingGlass size={14} className="shrink-0 opacity-70" />}
          label={
            <span className="flex w-full items-center gap-2">
              <span className="flex-1 text-left">Search</span>
              <span className="text-micro tabular-nums text-sidebar-foreground/45 opacity-0 transition-opacity group-hover/search:opacity-100 group-focus-within/search:opacity-100">
                ⌘K
              </span>
            </span>
          }
          hasPopover={false}
        />
        <Link
          href="/uploads"
          prefetch
          onMouseEnter={() => router.prefetch("/uploads")}
          onFocus={() => router.prefetch("/uploads")}
          className={cn(
            "flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-[12px] font-medium transition-colors",
            pathname === "/uploads"
              ? "bg-sidebar-accent text-sidebar-foreground"
              : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
          )}
        >
          <FolderSimple size={14} className="shrink-0 opacity-70" />
          <span className="flex-1">Uploads</span>
        </Link>
      </div>
      <SidebarProject />
      {isLoading ? (
        <div className="h-full" />
      ) : hasChats ? (
        <div className="space-y-5">
          {groupedChats?.map((group) => (
            <SidebarList
              key={group.name}
              title={group.name}
              items={group.chats}
              currentChatId={currentChatId}
            />
          ))}
        </div>
      ) : (
        <EmptyState
          compact
          className="h-[calc(100vh-220px)] text-sidebar-foreground"
          icon={<ChatTeardropText size={20} weight="duotone" />}
          title="No chats yet"
          description="Start a new conversation"
        />
      )}
    </>
  )
}

function AdminWorkspaceSidebarContent({ workspace }: { workspace: ReturnType<typeof useWorkspaceSafe> & {} }) {
  const { activeAdminTab, practiceProviders, inventory, claims } = workspace!

  if (activeAdminTab === "front_desk") {
    return (
      <div className="mt-3 space-y-5">
        <MasterSidebarNav />
        <SidebarDivider />
        <WorkQueueSidebarPanel />
      </div>
    )
  }

  return (
    <div className="mt-3 space-y-5">
      <MasterSidebarNav />
      <SidebarDivider />

      {activeAdminTab === "calendar" && (
        <CalendarSidebarPanel providers={practiceProviders} appointments={workspace.appointments} selectedDate={workspace.selectedDate} />
      )}
      {activeAdminTab === "billing" && (
        <BillingSidebarPanel claims={claims} />
      )}
      {activeAdminTab === "inventory" && (
        <InventorySidebarPanel inventory={inventory} />
      )}
      {activeAdminTab === "analytics" && (
        <AnalyticsSidebarPanel claims={claims} />
      )}
      {activeAdminTab === "patients" && (
        <PatientsSidebarPanel patients={workspace.patients ?? []} />
      )}
      {activeAdminTab === "channels" && <ChannelsSidebarPanel />}
    </div>
  )
}

function CalendarSidebarPanel({ providers, appointments, selectedDate }: { providers: { id: string; name: string; specialty?: string }[]; appointments?: { id: string; patientName: string; startTime: string; status: string; date: string }[]; selectedDate?: string }) {
  const requestCalendarFocusAppointment = useWorkspaceStore((s) => s.requestCalendarFocusAppointment)
  const calendarHiddenProviderIds = useWorkspaceStore((s) => s.calendarHiddenProviderIds)
  const toggleCalendarProviderHidden = useWorkspaceStore((s) => s.toggleCalendarProviderHidden)
  const today = selectedDate ?? new Date().toISOString().slice(0, 10)

  const todayAppts = useMemo(() => (appointments ?? []).filter((a) => a.date === today), [appointments, today])
  const booked = todayAppts.filter((a) => a.status !== "cancelled").length
  const done = todayAppts.filter((a) => a.status === "completed").length
  const waiting = todayAppts.filter((a) => a.status === "checked_in" || a.status === "in_progress").length
  const noShow = todayAppts.filter((a) => a.status === "no_show").length
  const upcoming = todayAppts.filter((a) => a.status === "booked" || a.status === "confirmed").slice(0, 4)

  return (
    <div className="space-y-5">
      <SidebarHeadline label="Today" value={booked} delta={`${done} done · ${waiting} in clinic`} />

      <SidebarSectionGroup title="Schedule">
        <SidebarStatRow label="Booked" value={booked} />
        <SidebarStatRow label="Completed" value={done} tone="good" />
        <SidebarStatRow label="In clinic" value={waiting} tone="default" />
        <SidebarStatRow label="No show" value={noShow} tone={noShow > 0 ? "bad" : "muted"} />
      </SidebarSectionGroup>

      {upcoming.length > 0 && (
        <SidebarSectionGroup title="Upcoming">
          {upcoming.map((a) => (
            <button
              key={a.id}
              type="button"
              onClick={() => requestCalendarFocusAppointment(a.id)}
              className="flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-sidebar-accent"
            >
              <span className="text-micro w-10 shrink-0 font-medium tabular-nums text-sidebar-foreground/45">{a.startTime}</span>
              <span className="flex-1 truncate text-[11.5px] text-sidebar-foreground/80">{a.patientName}</span>
            </button>
          ))}
        </SidebarSectionGroup>
      )}

      <SidebarSectionGroup title="Providers" trailing="Toggle">
        {providers.map((p) => {
          const isOn = !calendarHiddenProviderIds.includes(p.id)
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => toggleCalendarProviderHidden(p.id)}
              className="flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-sidebar-accent"
            >
              {isOn ? (
                <ToggleRight className="size-4 shrink-0 text-emerald-400" weight="fill" />
              ) : (
                <ToggleLeft className="size-4 shrink-0 text-sidebar-foreground/45" weight="fill" />
              )}
              <span className="min-w-0 flex-1">
                <span className={cn("block truncate text-[11.5px] font-medium", isOn ? "text-sidebar-foreground/85" : "text-sidebar-foreground/45")}>{p.name}</span>
                {p.specialty && <span className="text-micro block truncate text-sidebar-foreground/45">{p.specialty}</span>}
              </span>
            </button>
          )
        })}
      </SidebarSectionGroup>
    </div>
  )
}

function BillingSidebarPanel({ claims }: { claims: PracticeClaim[] }) {
  const requestBillingFocusClaim = useWorkspaceStore((s) => s.requestBillingFocusClaim)
  const setBillingSubTab = useWorkspaceStore((s) => s.setBillingSubTab)
  const setBillingQueueFilter = useWorkspaceStore((s) => s.setBillingQueueFilter)

  const stats = useMemo(() => {
    let maTotal = 0,
      cashTotal = 0,
      outstanding = 0,
      todayTotal = 0
    let maCount = 0,
      cashCount = 0,
      outCount = 0,
      draftCount = 0,
      paidTotal = 0
    const today = new Date().toISOString().slice(0, 10)
    for (const c of claims) {
      if (c.medicalAidAmount > 0) {
        maTotal += c.medicalAidAmount
        maCount++
      }
      if (c.cashAmount > 0) {
        cashTotal += c.cashAmount
        cashCount++
      }
      if (["draft", "submitted", "rejected", "partial"].includes(c.status)) {
        outstanding += c.totalAmount
        outCount++
      }
      if (c.status === "draft") draftCount++
      if (c.status === "paid") paidTotal += c.totalAmount
      if (c.createdAt.startsWith(today)) todayTotal += c.totalAmount
    }
    return {
      maTotal,
      cashTotal,
      outstanding,
      maCount,
      cashCount,
      outCount,
      draftCount,
      todayTotal,
      paidTotal,
    }
  }, [claims])

  const recentClaims = useMemo(() => {
    return [...claims]
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 6)
  }, [claims])

  return (
    <div className="space-y-5">
      <SidebarHeadline
        label="Created today"
        value={formatWholeZAR(stats.todayTotal)}
        delta={`${formatWholeZAR(stats.paidTotal)} settled all-time`}
        tone={stats.todayTotal > 0 ? "default" : "default"}
      />

      <SidebarSectionGroup title="Lanes">
        <SidebarStatRow
          label="Medical aid"
          value={formatWholeZAR(stats.maTotal)}
          hint={`${stats.maCount}`}
        />
        <SidebarStatRow
          label="Cash / private"
          value={formatWholeZAR(stats.cashTotal)}
          tone="good"
          hint={`${stats.cashCount}`}
        />
        <SidebarStatRow
          label="Outstanding"
          value={formatWholeZAR(stats.outstanding)}
          tone={stats.outCount > 0 ? "warn" : "muted"}
          hint={`${stats.outCount}`}
        />
      </SidebarSectionGroup>

      <SidebarSectionGroup title="Jump in billing">
        <SidebarLinkRow
          icon={<Warning className="size-3.5" weight="fill" />}
          label="Drafts & outstanding"
          onClick={() => {
            setBillingSubTab("outstanding")
            setBillingQueueFilter("needs_action")
          }}
          trailing={<SidebarBadge>{stats.draftCount}</SidebarBadge>}
        />
        <SidebarLinkRow
          icon={<Receipt className="size-3.5" />}
          label="Payments & remittance"
          onClick={() => {
            setBillingSubTab("payments")
            setBillingQueueFilter("paid")
          }}
        />
        <SidebarLinkRow
          icon={<CurrencyDollar className="size-3.5" weight="fill" />}
          label="Analytics"
          onClick={() => {
            setBillingSubTab("payments")
            setBillingQueueFilter("analytics")
          }}
        />
        <SidebarLinkRow
          icon={<FileText className="size-3.5" />}
          label="Invoices"
          onClick={() => {
            setBillingSubTab("invoices")
            setBillingQueueFilter("unpaid")
          }}
        />
        <SidebarLinkRow
          icon={<ShieldCheck className="size-3.5" />}
          label="Medical aid claims"
          onClick={() => {
            setBillingSubTab("claims")
            setBillingQueueFilter("claims")
          }}
        />
      </SidebarSectionGroup>

      {recentClaims.length > 0 && (
        <SidebarSectionGroup title="Recent claims">
          {recentClaims.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => requestBillingFocusClaim(c.id)}
              className="flex w-full items-center gap-3 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-sidebar-accent"
            >
              <span className="flex-1 truncate text-[11.5px] text-sidebar-foreground/80">{c.patientName}</span>
              <span
                className={cn(
                  "text-micro shrink-0 font-semibold uppercase tracking-wide",
                  c.status === "paid"
                    ? "text-emerald-400"
                    : c.status === "rejected"
                      ? "text-rose-400"
                      : c.status === "draft"
                        ? "text-amber-400"
                        : "text-sidebar-foreground/45"
                )}
              >
                {c.status}
              </span>
            </button>
          ))}
        </SidebarSectionGroup>
      )}
    </div>
  )
}

function InventorySidebarPanel({ inventory }: { inventory: InventoryItem[] }) {
  const requestInventoryImportPanelOpen = useWorkspaceStore((s) => s.requestInventoryImportPanelOpen)

  const lowStock = useMemo(
    () => inventory.filter((i) => i.currentStock <= i.minStock),
    [inventory]
  )
  const expiring = useMemo(() => {
    const cutoff = new Date()
    cutoff.setDate(cutoff.getDate() + 30)
    return inventory.filter((i) => i.expiresAt && new Date(i.expiresAt) <= cutoff)
  }, [inventory])

  const stockValue = useMemo(
    () =>
      inventory.reduce(
        (sum, i) => sum + i.currentStock * (i.costPrice ?? i.unitPrice * 0.75),
        0
      ),
    [inventory]
  )

  const topCategories = useMemo(() => {
    const m = new Map<string, number>()
    for (const i of inventory) m.set(i.category, (m.get(i.category) ?? 0) + 1)
    return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5)
  }, [inventory])

  return (
    <div className="space-y-5">
      <SidebarHeadline
        label="On hand"
        value={formatWholeZAR(stockValue)}
        delta={`${inventory.length} SKUs`}
      />

      <button
        type="button"
        onClick={() => requestInventoryImportPanelOpen()}
        className="flex w-full items-center gap-2.5 rounded-md border border-sidebar-border bg-sidebar-accent/50 px-3 py-2 text-left transition-colors hover:border-sidebar-border hover:bg-sidebar-accent"
      >
        <FileXls className="size-4 shrink-0 text-emerald-400" weight="bold" />
        <div className="min-w-0 flex-1">
          <p className="text-[11.5px] font-semibold text-sidebar-foreground/85">Smart Import</p>
          <p className="text-micro truncate text-sidebar-foreground/45">Excel, CSV, column mapping</p>
        </div>
      </button>

      {topCategories.length > 0 && (
        <SidebarSectionGroup title="Top categories">
          {topCategories.map(([cat, n]) => (
            <SidebarStatRow key={cat} label={cat} value={n} tone="muted" />
          ))}
        </SidebarSectionGroup>
      )}

      <SidebarSectionGroup
        title={`Low stock (${lowStock.length})`}
        trailing={lowStock.length > 0 ? <Warning className="size-3 text-amber-400" weight="fill" /> : null}
      >
        {lowStock.length === 0 ? (
          <SidebarEmpty>All items above minimum</SidebarEmpty>
        ) : (
          <>
            {lowStock.slice(0, 8).map((item) => (
              <div
                key={item.id}
                className="flex items-center gap-2.5 rounded-md px-2 py-1.5 transition-colors hover:bg-sidebar-accent"
              >
                <span className="size-1.5 shrink-0 rounded-full bg-amber-400" />
                <span className="flex-1 truncate text-[11.5px] text-sidebar-foreground/80">{item.name}</span>
                <span className="text-micro shrink-0 font-semibold tabular-nums text-amber-400">
                  {item.currentStock}/{item.minStock}
                </span>
              </div>
            ))}
            {lowStock.length > 8 && (
              <p className="text-micro px-2 pt-1 text-sidebar-foreground/45">+{lowStock.length - 8} more</p>
            )}
          </>
        )}
      </SidebarSectionGroup>

      <SidebarSectionGroup
        title={`Expiring (${expiring.length})`}
        trailing={expiring.length > 0 ? <Clock className="size-3 text-rose-400" weight="fill" /> : null}
      >
        {expiring.length === 0 ? (
          <SidebarEmpty>None in next 30 days</SidebarEmpty>
        ) : (
          expiring.slice(0, 6).map((item) => (
            <div
              key={item.id}
              className="flex items-center gap-2.5 rounded-md px-2 py-1.5 transition-colors hover:bg-sidebar-accent"
            >
              <span className="size-1.5 shrink-0 rounded-full bg-rose-400" />
              <span className="flex-1 truncate text-[11.5px] text-sidebar-foreground/80">{item.name}</span>
              <span className="text-micro shrink-0 tabular-nums text-rose-400">
                {formatDate(item.expiresAt!, { month: "short", day: "numeric", year: undefined })}
              </span>
            </div>
          ))
        )}
      </SidebarSectionGroup>
    </div>
  )
}

function AnalyticsSidebarPanel({ claims }: { claims: { status: string; totalAmount: number; medicalAidAmount: number; cashAmount: number }[] }) {
  const stats = useMemo(() => {
    let paid = 0, pending = 0, total = 0, revenue = 0, maRevenue = 0, cashRevenue = 0
    for (const c of claims) {
      total++
      if (c.status === "paid" || c.status === "approved") { paid++; revenue += c.totalAmount; maRevenue += c.medicalAidAmount; cashRevenue += c.cashAmount }
      if (c.status === "submitted") pending++
    }
    return { paid, pending, total, revenue, maRevenue, cashRevenue }
  }, [claims])

  const collectionRate = stats.total > 0 ? Math.round((stats.paid / stats.total) * 100) : 0

  return (
    <div className="space-y-5">
      <SidebarHeadline
        label="Total revenue"
        value={formatWholeZAR(stats.revenue)}
        delta={`${collectionRate}% collection rate`}
        tone="good"
      />

      <SidebarSectionGroup title="By lane">
        <SidebarStatRow label="Medical aid" value={formatWholeZAR(stats.maRevenue)} />
        <SidebarStatRow label="Cash / private" value={formatWholeZAR(stats.cashRevenue)} tone="good" />
      </SidebarSectionGroup>

      <SidebarSectionGroup title="Claims">
        <SidebarStatRow label="Total" value={stats.total} />
        <SidebarStatRow label="Settled" value={stats.paid} tone="good" />
        <SidebarStatRow label="Pending" value={stats.pending} tone="warn" />
      </SidebarSectionGroup>
    </div>
  )
}

function PatientsSidebarPanel({ patients }: { patients: { id: string; name: string; medicalAidStatus: string; outstandingBalance?: number; chronicConditions?: string[]; lastVisit?: string }[] }) {
  const verified = patients.filter((p) => p.medicalAidStatus === "verified").length
  const pending = patients.filter((p) => p.medicalAidStatus === "pending" || p.medicalAidStatus === "unknown").length
  const chronic = patients.filter((p) => (p.chronicConditions?.length ?? 0) > 0)
  const recentPatients = useMemo(() => [...patients].sort((a, b) => (b.lastVisit ?? "").localeCompare(a.lastVisit ?? "")).slice(0, 5), [patients])
  const withBalance = useMemo(() => patients.filter((p) => (p.outstandingBalance ?? 0) > 0).sort((a, b) => (b.outstandingBalance ?? 0) - (a.outstandingBalance ?? 0)).slice(0, 4), [patients])

  return (
    <div className="space-y-5">
      <SidebarHeadline label="Patients" value={patients.length} delta={`${verified} verified MA`} />

      <SidebarSectionGroup title="Coverage">
        <SidebarStatRow label="Verified" value={verified} tone="good" />
        <SidebarStatRow label="Pending / unknown" value={pending} tone={pending > 0 ? "warn" : "muted"} />
        <SidebarStatRow label="Chronic" value={chronic.length} />
      </SidebarSectionGroup>

      <SidebarSectionGroup title="Recent">
        {recentPatients.map((p) => (
          <div key={p.id} className="flex items-center gap-2.5 rounded-md px-2 py-1.5 transition-colors hover:bg-sidebar-accent">
            <span className="text-micro flex size-5 shrink-0 items-center justify-center rounded-full bg-sidebar-accent font-bold text-sidebar-foreground/65">
              {p.name.split(" ").map((n) => n[0]).join("")}
            </span>
            <span className="flex-1 truncate text-[11.5px] text-sidebar-foreground/80">{p.name}</span>
          </div>
        ))}
      </SidebarSectionGroup>

      {withBalance.length > 0 && (
        <SidebarSectionGroup title="Outstanding" trailing={<Warning className="size-3 text-amber-400" weight="fill" />}>
          {withBalance.map((p) => (
            <SidebarStatRow
              key={p.id}
              label={p.name}
              value={formatWholeZAR(p.outstandingBalance ?? 0)}
              tone="warn"
            />
          ))}
        </SidebarSectionGroup>
      )}

      {chronic.length > 0 && (
        <SidebarSectionGroup title="Chronic">
          {chronic.slice(0, 4).map((p) => (
            <div key={p.id} className="flex items-center gap-2.5 rounded-md px-2 py-1.5 transition-colors hover:bg-sidebar-accent">
              <span className="size-1.5 shrink-0 rounded-full bg-rose-400" />
              <span className="flex-1 truncate text-[11.5px] text-sidebar-foreground/80">{p.name}</span>
              <span className="text-micro shrink-0 truncate text-sidebar-foreground/45">{p.chronicConditions?.join(", ")}</span>
            </div>
          ))}
        </SidebarSectionGroup>
      )}
    </div>
  )
}

function ClinicalSidebarContent({ workspace }: { workspace: ReturnType<typeof useWorkspaceSafe> & {} }) {
  const activePatient = workspace.openPatients?.find((p) => p.patientId === workspace.activePatientId) ?? null
  const openDocumentContent = useWorkspaceStore((s) => s.openDocumentContent)
  const setSidecarContent = useWorkspaceStore((s) => s.setSidecarContent)
  const sidecarContent = useWorkspaceStore((s) => s.sidecarContent)
  const pathname = usePathname()

  return (
    <div className="mt-3 flex flex-col gap-0.5">
      <div className="mb-3">
        <MasterSidebarNav />
      </div>
      <SidebarDivider className="mb-2" />

      <button
        type="button"
        onClick={() => {
          startNewChatClientSide(pathname)
        }}
        className="mb-2 flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-[12px] font-medium text-sidebar-foreground/75 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground/85"
      >
        <ChatCircle size={14} className="opacity-70" weight="bold" />
        Chat
      </button>

      {activePatient ? (
        <>
          <div className="mb-2 rounded-xl border border-sidebar-border/60 bg-gradient-to-br from-sidebar-accent/40 to-sidebar-accent/10 px-3 py-2.5 shadow-sm">
            <div className="flex items-center gap-2.5">
              <div className="text-micro flex size-8 shrink-0 items-center justify-center rounded-full bg-sidebar-accent font-bold text-sidebar-foreground/75 ring-1 ring-sidebar-border/50">
                {activePatient.name.split(" ").map((n) => n[0]).join("").slice(0, 2)}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[12.5px] font-semibold tracking-tight text-sidebar-foreground/90">{activePatient.name}</p>
                <div className="text-micro flex items-center gap-1.5 text-sidebar-foreground/45">
                  {activePatient.age && <span>{activePatient.age}{activePatient.sex ? ` ${activePatient.sex}` : ""}</span>}
                  {activePatient.age && activePatient.medicalAidScheme && <span>·</span>}
                  {activePatient.medicalAidScheme && <span className="truncate">{activePatient.medicalAidScheme}</span>}
                </div>
              </div>
              <span
                className={cn(
                  "text-micro shrink-0 rounded-full px-1.5 py-0.5 font-bold uppercase tracking-wide",
                  activePatient.medicalAidStatus === "active"
                    ? "bg-emerald-500/12 text-emerald-700 dark:text-emerald-400"
                    : activePatient.medicalAidStatus === "inactive"
                      ? "bg-rose-500/12 text-rose-700 dark:text-rose-400"
                      : "bg-amber-500/12 text-amber-700 dark:text-amber-400"
                )}
              >
                {activePatient.medicalAidStatus === "active" ? "Active" : activePatient.medicalAidStatus === "inactive" ? "Inactive" : "Pending"}
              </span>
            </div>
            {activePatient.memberNumber && (
              <p className="text-micro mt-1.5 tabular-nums text-sidebar-foreground/45">
                Member {activePatient.memberNumber}
              </p>
            )}
          </div>

          <PatientConsultChatsBar variant="sidebar" />
          <SidebarDivider className="my-1.5" />

          <ClinicalSidebarEncounterProblemsSection />
          <ClinicalSidebarAllergiesSection />
          <ClinicalSidebarVitalsSection />
          <ClinicalSidebarMedicationsSection />
          <ClinicalSidebarChronicSection />
          <ClinicalSidebarLabsSection />
          <ClinicalSidebarImagingSection />
          <ClinicalSidebarSocialHistorySection />

          {(activePatient.sessionDocuments?.length ?? 0) > 0 && (
            <SidebarSection
              icon={<FileText className="size-3.5" />}
              iconColor="text-sidebar-foreground/45"
              title="Documents"
              count={activePatient.sessionDocuments!.length}
              defaultOpen
            >
              <div className="space-y-1">
                {activePatient.sessionDocuments!.slice(0, 5).map((sd) => (
                  <SessionDocumentRow
                    key={sd.id}
                    entry={sd}
                    variant="sidebar"
                    onOpen={() => {
                      openDocumentContent(sd.document)
                      setSidecarContent(
                        sidecarContent
                          ? { ...sidecarContent, tab: "documents" }
                          : { tab: "documents" }
                      )
                    }}
                  />
                ))}
              </div>
            </SidebarSection>
          )}

          {(activePatient.soapNote.subjective || activePatient.soapNote.assessment) && (
            <SidebarSection
              icon={<FileText className="size-3.5" />}
              iconColor="text-sidebar-foreground/45"
              title="SOAP Note"
              defaultOpen={false}
            >
              <div className="space-y-1.5 pl-0.5">
                {activePatient.soapNote.subjective && (
                  <div>
                    <p className="text-micro font-semibold uppercase tracking-wider text-sidebar-foreground/45">S</p>
                    <p className="text-micro line-clamp-3 leading-relaxed text-sidebar-foreground/70">{activePatient.soapNote.subjective}</p>
                  </div>
                )}
                {activePatient.soapNote.assessment && (
                  <div>
                    <p className="text-micro font-semibold uppercase tracking-wider text-sidebar-foreground/45">A</p>
                    <p className="text-micro line-clamp-3 leading-relaxed text-sidebar-foreground/70">{activePatient.soapNote.assessment}</p>
                  </div>
                )}
              </div>
            </SidebarSection>
          )}
        </>
      ) : (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <Syringe className="mb-2 size-5 text-sidebar-foreground/45" weight="duotone" />
          <p className="text-[11px] font-medium text-sidebar-foreground/45">No active patient</p>
          <p className="text-micro mt-0.5 text-sidebar-foreground/45">Open from calendar or patient list</p>
        </div>
      )}
    </div>
  )
}

function ClinicalSidebarFooter({ workspace }: { workspace: ReturnType<typeof useWorkspaceSafe> & {} }) {
  const activePatient = workspace.openPatients?.find((p) => p.patientId === workspace.activePatientId) ?? null
  if (!activePatient) return null

  const statusLabels: Record<string, { label: string; color: string; dot: string }> = {
    scribing: { label: "Scribing", color: "text-emerald-400", dot: "bg-emerald-400" },
    reviewing: { label: "Reviewing", color: "text-blue-400", dot: "bg-blue-400" },
    billing: { label: "Billing", color: "text-amber-400", dot: "bg-amber-400" },
    finished: { label: "Complete", color: "text-sidebar-foreground/45", dot: "bg-sidebar-foreground/25" },
    waiting: { label: "Waiting", color: "text-sidebar-foreground/45", dot: "bg-sidebar-foreground/20" },
    checked_in: { label: "Checked in", color: "text-amber-400", dot: "bg-amber-400" },
  }
  const st = statusLabels[activePatient.status] ?? { label: activePatient.status, color: "text-sidebar-foreground/45", dot: "bg-sidebar-foreground/20" }

  return (
    <div className="flex items-center gap-2.5 rounded-md px-2 py-1.5">
      <span className={cn("size-1.5 shrink-0 rounded-full", st.dot, activePatient.status === "scribing" && "animate-pulse")} />
      <p className="min-w-0 flex-1 truncate text-[11.5px] font-medium text-sidebar-foreground/75">{activePatient.name}</p>
      <span className={cn("text-micro shrink-0 font-semibold uppercase tracking-wide", st.color)}>{st.label}</span>
    </div>
  )
}

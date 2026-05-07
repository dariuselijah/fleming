"use client"

import { groupChatsByDate } from "@/app/components/history/utils"
import { useBreakpoint } from "@/app/hooks/use-breakpoint"
import { ScrollArea } from "@/components/ui/scroll-area"
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
  Package,
  UsersThree,
  Syringe,
  FileText,
  FileXls,
  Heartbeat,
  ChatText,
  Flask,
  Scan,
  UserPlus,
  Receipt,
  Bell,
  CalendarBlank,
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
import {
  SidebarBadge,
  SidebarDivider,
  SidebarEmpty,
  SidebarHeadline,
  SidebarLinkRow,
  SidebarSectionGroup,
  SidebarSectionLabel,
  SidebarStatRow,
} from "@/app/components/layout/sidebar/sidebar-primitives"

function useWorkspaceSafe() {
  try {
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
  } catch {
    return null
  }
}

const SIDEBAR_MIN_W = 240
const SIDEBAR_MAX_W = 480
const SIDEBAR_LS_KEY = "fleming:sidebar-width"

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
              <p className="truncate text-[9px] uppercase tracking-[0.2em] text-sidebar-foreground/30">
                {isAdmin ? "Practice" : isClinical ? "Clinical" : "Assistant"}
              </p>
            </div>
          </Link>
          {isMobile ? (
            <button
              type="button"
              onClick={() => setOpenMobile(false)}
              className="text-muted-foreground hover:text-foreground hover:bg-muted inline-flex size-8 items-center justify-center rounded-md bg-transparent transition-colors focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
            >
              <X size={20} />
            </button>
          ) : null}
        </div>
      </SidebarHeader>

      <SidebarContent className="mask-t-from-98% mask-t-to-100% mask-b-from-98% mask-b-to-100% px-2.5">
        <ScrollArea className="flex h-full [&>div>div]:!block">
          {isAdmin && workspace ? (
            <AdminSidebarContent workspace={workspace} />
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
            <UserCircle className="size-5 shrink-0 text-white/45" weight="fill" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-[12px] font-medium tracking-tight text-sidebar-foreground">
                {workspace?.practiceProviders?.find(p => p.id === workspace?.activeDoctorId)?.name ?? "Admin"}
              </p>
              <p className="truncate text-[10px] text-sidebar-foreground/40">
                Practice management
              </p>
            </div>
          </div>
        ) : isClinical && workspace ? (
          <ClinicalSidebarFooter workspace={workspace} />
        ) : (
          <FeedbackTrigger>
            <div
              className="hover:bg-white/[0.04] flex items-center gap-2.5 rounded-md px-2 py-1.5"
              aria-label="Tell us how to improve Fleming"
            >
              <ChatTeardropText className="size-4 shrink-0 text-white/50" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[12px] font-medium tracking-tight text-sidebar-foreground">
                  Help us improve
                </p>
                <p className="truncate text-[10px] text-sidebar-foreground/40">
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
          className="absolute inset-y-0 right-0 z-20 w-1 cursor-col-resize transition-colors hover:bg-white/[0.08] active:bg-white/[0.12]"
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
          className="group/new-chat relative flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-[12px] font-medium text-white/70 transition-colors hover:bg-white/[0.035] hover:text-white"
          type="button"
          onClick={() => {
            startNewChatClientSide(pathname)
          }}
        >
          <NotePencilIcon size={14} className="shrink-0 opacity-70" />
          <span className="flex-1">New chat</span>
          <span className="text-[9px] tabular-nums text-white/25 opacity-0 transition-opacity group-hover/new-chat:opacity-100">
            ⌘⇧U
          </span>
        </button>
        <HistoryTrigger
          hasSidebar={false}
          classNameTrigger="bg-transparent hover:bg-white/[0.035] hover:text-white text-white/70 group/search relative flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-[12px] font-medium transition-colors"
          icon={<MagnifyingGlass size={14} className="shrink-0 opacity-70" />}
          label={
            <span className="flex w-full items-center gap-2">
              <span className="flex-1 text-left">Search</span>
              <span className="text-[9px] tabular-nums text-white/25 opacity-0 transition-opacity group-hover/search:opacity-100">
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
              ? "bg-white/[0.05] text-white"
              : "text-white/70 hover:bg-white/[0.035] hover:text-white"
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
        <div className="flex h-[calc(100vh-220px)] flex-col items-center justify-center px-6 text-center">
          <ChatTeardropText
            size={20}
            className="mb-2 text-white/15"
            weight="duotone"
          />
          <p className="text-[12px] font-medium text-white/55">No chats yet</p>
          <p className="mt-0.5 text-[10.5px] text-white/30">Start a new conversation</p>
        </div>
      )}
    </>
  )
}

function AdminSidebarContent({ workspace }: { workspace: ReturnType<typeof useWorkspaceSafe> & {} }) {
  const { activeAdminTab, practiceProviders, inventory, claims } = workspace!

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
      {activeAdminTab === "inbox" && <InboxSidebarPanel />}
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
  const [visible, setVisible] = useState<Record<string, boolean>>({})
  const today = selectedDate ?? new Date().toISOString().slice(0, 10)

  const todayAppts = useMemo(() => (appointments ?? []).filter((a) => a.date === today), [appointments, today])
  const booked = todayAppts.length
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
              className="flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-white/[0.035]"
            >
              <span className="w-10 shrink-0 text-[10px] font-medium tabular-nums text-white/35">{a.startTime}</span>
              <span className="flex-1 truncate text-[11.5px] text-white/80">{a.patientName}</span>
            </button>
          ))}
        </SidebarSectionGroup>
      )}

      <SidebarSectionGroup title="Providers" trailing="Toggle">
        {providers.map((p) => {
          const isOn = visible[p.id] !== false
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => setVisible((prev) => ({ ...prev, [p.id]: !isOn }))}
              className="flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-white/[0.035]"
            >
              {isOn ? (
                <ToggleRight className="size-4 shrink-0 text-emerald-400" weight="fill" />
              ) : (
                <ToggleLeft className="size-4 shrink-0 text-white/20" weight="fill" />
              )}
              <span className="min-w-0 flex-1">
                <span className={cn("block truncate text-[11.5px] font-medium", isOn ? "text-white/85" : "text-white/30")}>{p.name}</span>
                {p.specialty && <span className="block truncate text-[9px] text-white/30">{p.specialty}</span>}
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
        value={`R${stats.todayTotal.toLocaleString()}`}
        delta={`R${stats.paidTotal.toLocaleString()} settled all-time`}
        tone={stats.todayTotal > 0 ? "default" : "default"}
      />

      <SidebarSectionGroup title="Lanes">
        <SidebarStatRow
          label="Medical aid"
          value={`R${stats.maTotal.toLocaleString()}`}
          hint={`${stats.maCount}`}
        />
        <SidebarStatRow
          label="Cash / private"
          value={`R${stats.cashTotal.toLocaleString()}`}
          tone="good"
          hint={`${stats.cashCount}`}
        />
        <SidebarStatRow
          label="Outstanding"
          value={`R${stats.outstanding.toLocaleString()}`}
          tone={stats.outCount > 0 ? "warn" : "muted"}
          hint={`${stats.outCount}`}
        />
      </SidebarSectionGroup>

      <SidebarSectionGroup title="Jump in billing">
        <SidebarLinkRow
          icon={<Warning className="size-3.5" weight="fill" />}
          label="Drafts & outstanding"
          onClick={() => setBillingSubTab("outstanding")}
          trailing={<SidebarBadge>{stats.draftCount}</SidebarBadge>}
        />
        <SidebarLinkRow
          icon={<Receipt className="size-3.5" />}
          label="Payments & remittance"
          onClick={() => setBillingSubTab("payments")}
        />
        <SidebarLinkRow
          icon={<FileText className="size-3.5" />}
          label="Invoices"
          onClick={() => setBillingSubTab("invoices")}
        />
        <SidebarLinkRow
          icon={<ShieldCheck className="size-3.5" />}
          label="Medical aid claims"
          onClick={() => setBillingSubTab("claims")}
        />
      </SidebarSectionGroup>

      {recentClaims.length > 0 && (
        <SidebarSectionGroup title="Recent claims">
          {recentClaims.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => requestBillingFocusClaim(c.id)}
              className="flex w-full items-center gap-3 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-white/[0.035]"
            >
              <span className="flex-1 truncate text-[11.5px] text-white/80">{c.patientName}</span>
              <span
                className={cn(
                  "shrink-0 text-[9px] font-semibold uppercase tracking-wide",
                  c.status === "paid"
                    ? "text-emerald-400"
                    : c.status === "rejected"
                      ? "text-rose-400"
                      : c.status === "draft"
                        ? "text-amber-400"
                        : "text-white/35"
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
        value={`R${Math.round(stockValue).toLocaleString()}`}
        delta={`${inventory.length} SKUs`}
      />

      <button
        type="button"
        onClick={() => requestInventoryImportPanelOpen()}
        className="flex w-full items-center gap-2.5 rounded-md border border-white/[0.06] bg-white/[0.025] px-3 py-2 text-left transition-colors hover:border-white/[0.1] hover:bg-white/[0.05]"
      >
        <FileXls className="size-4 shrink-0 text-emerald-400" weight="bold" />
        <div className="min-w-0 flex-1">
          <p className="text-[11.5px] font-semibold text-white/85">Smart Import</p>
          <p className="truncate text-[9px] text-white/35">Excel, CSV, column mapping</p>
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
                className="flex items-center gap-2.5 rounded-md px-2 py-1.5 transition-colors hover:bg-white/[0.035]"
              >
                <span className="size-1.5 shrink-0 rounded-full bg-amber-400" />
                <span className="flex-1 truncate text-[11.5px] text-white/80">{item.name}</span>
                <span className="shrink-0 text-[10px] font-semibold tabular-nums text-amber-400">
                  {item.currentStock}/{item.minStock}
                </span>
              </div>
            ))}
            {lowStock.length > 8 && (
              <p className="px-2 pt-1 text-[9px] text-white/25">+{lowStock.length - 8} more</p>
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
              className="flex items-center gap-2.5 rounded-md px-2 py-1.5 transition-colors hover:bg-white/[0.035]"
            >
              <span className="size-1.5 shrink-0 rounded-full bg-rose-400" />
              <span className="flex-1 truncate text-[11.5px] text-white/80">{item.name}</span>
              <span className="shrink-0 text-[10px] tabular-nums text-rose-400">
                {new Date(item.expiresAt!).toLocaleDateString([], { month: "short", day: "numeric" })}
              </span>
            </div>
          ))
        )}
      </SidebarSectionGroup>
    </div>
  )
}

function InboxSidebarPanel() {
  const notifications = useWorkspaceStore((s) => s.notifications)
  const messages = useWorkspaceStore((s) => s.inboxMessages)
  const patients = useWorkspaceStore((s) => s.patients)
  const appointments = useWorkspaceStore((s) => s.appointments)
  const claims = useWorkspaceStore((s) => s.claims)
  const inventory = useWorkspaceStore((s) => s.inventory)
  const selectedDate = useWorkspaceStore((s) => s.selectedDate)
  const requestInboxNotificationsPanelOpen = useWorkspaceStore((s) => s.requestInboxNotificationsPanelOpen)
  const requestInboxScrollTo = useWorkspaceStore((s) => s.requestInboxScrollTo)
  const setAdminTab = useWorkspaceStore((s) => s.setAdminTab)
  const setMode = useWorkspaceStore((s) => s.setMode)

  const conversations = useMemo(
    () => messages.filter((m) => m.channel !== "lab"),
    [messages]
  )
  const labs = useMemo(() => messages.filter((m) => m.channel === "lab"), [messages])
  const unreadMsgs = useMemo(() => conversations.filter((m) => !m.read).length, [conversations])
  const unreadLabs = useMemo(() => labs.filter((l) => !l.read).length, [labs])
  const unreadNotifs = useMemo(() => notifications.filter((n) => !n.read).length, [notifications])

  const draftClaims = useMemo(
    () => claims.filter((c) => c.status === "draft").length,
    [claims]
  )
  const lowStockCount = useMemo(
    () => inventory.filter((i) => i.currentStock <= i.minStock).length,
    [inventory]
  )
  const pendingVerify = useMemo(
    () =>
      patients.filter(
        (p) => p.medicalAidStatus === "pending" || p.medicalAidStatus === "unknown"
      ).length,
    [patients]
  )

  const today = selectedDate ?? new Date().toISOString().slice(0, 10)
  const todaySchedule = useMemo(() => {
    return appointments
      .filter((a) => a.date === today)
      .filter((a) =>
        ["booked", "confirmed", "checked_in", "in_progress"].includes(a.status)
      )
      .sort((a, b) => a.startTime.localeCompare(b.startTime))
  }, [appointments, today])

  const nextAppt = todaySchedule[0] ?? null
  const restToday = todaySchedule.slice(1, 4)

  const overduePatients = useMemo(
    () =>
      [...patients]
        .filter((p) => (p.outstandingBalance ?? 0) > 0)
        .sort((a, b) => (b.outstandingBalance ?? 0) - (a.outstandingBalance ?? 0))
        .slice(0, 4),
    [patients]
  )

  const goCalendar = useCallback(() => {
    setMode("admin")
    setAdminTab("calendar")
  }, [setMode, setAdminTab])

  return (
    <div className="space-y-5">
      {/* Notifications hero */}
      <div className="space-y-1.5">
        <SidebarSectionLabel title="Alerts & updates" />
        <button
          type="button"
          onClick={() => requestInboxNotificationsPanelOpen()}
          className="flex w-full items-center justify-between gap-2 rounded-md border border-white/[0.06] bg-white/[0.025] px-3 py-2 text-left transition-colors hover:border-white/[0.1] hover:bg-white/[0.05]"
        >
          <span className="flex items-center gap-2.5">
            <Bell className="size-4 text-blue-400" weight="fill" />
            <span className="text-[11.5px] font-semibold text-white/85">Open notification feed</span>
          </span>
          {unreadNotifs > 0 && <SidebarBadge tone="bad">{unreadNotifs}</SidebarBadge>}
        </button>
        <p className="px-2 text-[9.5px] leading-snug text-white/30">
          Use <span className="text-white/45">All · Unread · Action</span> on the main card to filter.
        </p>
      </div>

      <SidebarSectionGroup title="Jump to inbox">
        <SidebarLinkRow
          icon={<ChatText className="size-3.5" weight="fill" />}
          label="Messages"
          onClick={() => requestInboxScrollTo("messages")}
          trailing={unreadMsgs > 0 ? <SidebarBadge tone="info">{unreadMsgs}</SidebarBadge> : undefined}
        />
        <SidebarLinkRow
          icon={<Flask className="size-3.5" weight="fill" />}
          label="Lab results"
          onClick={() => requestInboxScrollTo("labs")}
          trailing={unreadLabs > 0 ? <SidebarBadge tone="warn">{unreadLabs}</SidebarBadge> : undefined}
        />
        <SidebarLinkRow
          icon={<Clock className="size-3.5" />}
          label="Activity feed"
          onClick={() => requestInboxScrollTo("activity")}
        />
      </SidebarSectionGroup>

      <SidebarSectionGroup
        title="Today"
        trailing={
          <button
            type="button"
            onClick={goCalendar}
            className="text-[9px] font-semibold uppercase tracking-wide text-blue-400 hover:text-blue-300"
          >
            Calendar
          </button>
        }
      >
        {nextAppt ? (
          <>
            <button
              type="button"
              onClick={goCalendar}
              className="w-full rounded-md border border-white/[0.06] bg-white/[0.02] px-2.5 py-2 text-left transition-colors hover:bg-white/[0.04]"
            >
              <p className="text-[8.5px] font-medium uppercase tracking-[0.2em] text-white/30">Next up</p>
              <p className="mt-0.5 truncate text-[11.5px] font-semibold text-white/90">{nextAppt.patientName}</p>
              <p className="text-[10px] tabular-nums text-white/40">
                {nextAppt.startTime}
                {nextAppt.reason ? ` · ${nextAppt.reason}` : ""}
              </p>
            </button>
            {restToday.length > 0 && (
              <div className="space-y-px pt-1">
                {restToday.map((a) => (
                  <div key={a.id} className="flex items-center justify-between gap-2 rounded-md px-2 py-1 text-[10.5px]">
                    <span className="truncate text-white/55">{a.patientName}</span>
                    <span className="shrink-0 tabular-nums text-white/30">{a.startTime}</span>
                  </div>
                ))}
              </div>
            )}
          </>
        ) : (
          <SidebarEmpty>No appointments today</SidebarEmpty>
        )}
      </SidebarSectionGroup>

      <SidebarSectionGroup title="Practice pulse">
        <SidebarStatRow
          label="Draft claims"
          value={draftClaims}
          tone={draftClaims > 0 ? "warn" : "muted"}
          onClick={() => {
            setMode("admin")
            setAdminTab("billing")
          }}
        />
        <SidebarStatRow
          label="Low stock"
          value={lowStockCount}
          tone={lowStockCount > 0 ? "warn" : "muted"}
          onClick={() => {
            setMode("admin")
            setAdminTab("inventory")
          }}
        />
        <SidebarStatRow
          label="MA pending / unknown"
          value={pendingVerify}
          tone={pendingVerify > 0 ? "warn" : "muted"}
          onClick={() => {
            setMode("admin")
            setAdminTab("patients")
          }}
        />
      </SidebarSectionGroup>

      <SidebarSectionGroup title="Quick actions">
        <SidebarLinkRow
          icon={<ChatCircle className="size-3.5" weight="fill" />}
          label="Inbox"
          onClick={() => requestInboxScrollTo("messages")}
        />
        <SidebarLinkRow
          icon={<Scan className="size-3.5" />}
          label="Smart Import"
          onClick={() => requestInboxScrollTo("smart-import")}
        />
        <SidebarLinkRow
          icon={<CalendarBlank className="size-3.5" />}
          label="Day schedule"
          onClick={goCalendar}
        />
        <SidebarLinkRow
          icon={<Package className="size-3.5" />}
          label="Inventory"
          onClick={() => {
            setMode("admin")
            setAdminTab("inventory")
          }}
        />
        <SidebarLinkRow
          icon={<UserPlus className="size-3.5" />}
          label="Register patient"
          onClick={() => {
            setMode("admin")
            setAdminTab("patients")
          }}
        />
        <SidebarLinkRow
          icon={<Receipt className="size-3.5" />}
          label="Billing"
          onClick={() => {
            setMode("admin")
            setAdminTab("billing")
          }}
        />
      </SidebarSectionGroup>

      {overduePatients.length > 0 && (
        <SidebarSectionGroup title="Outstanding" trailing={<Warning className="size-3 text-amber-400" weight="fill" />}>
          {overduePatients.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => {
                setMode("admin")
                setAdminTab("patients")
              }}
              className="flex w-full items-center justify-between gap-3 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-white/[0.035]"
            >
              <span className="truncate text-[11.5px] text-white/80">{p.name}</span>
              <span className="shrink-0 text-[10.5px] font-semibold tabular-nums text-amber-400">
                R{(p.outstandingBalance ?? 0).toLocaleString()}
              </span>
            </button>
          ))}
        </SidebarSectionGroup>
      )}
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
        value={`R${stats.revenue.toLocaleString()}`}
        delta={`${collectionRate}% collection rate`}
        tone="good"
      />

      <SidebarSectionGroup title="By lane">
        <SidebarStatRow label="Medical aid" value={`R${stats.maRevenue.toLocaleString()}`} />
        <SidebarStatRow label="Cash / private" value={`R${stats.cashRevenue.toLocaleString()}`} tone="good" />
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
          <div key={p.id} className="flex items-center gap-2.5 rounded-md px-2 py-1.5 transition-colors hover:bg-white/[0.035]">
            <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-white/[0.06] text-[8.5px] font-bold text-white/45">
              {p.name.split(" ").map((n) => n[0]).join("")}
            </span>
            <span className="flex-1 truncate text-[11.5px] text-white/80">{p.name}</span>
          </div>
        ))}
      </SidebarSectionGroup>

      {withBalance.length > 0 && (
        <SidebarSectionGroup title="Outstanding" trailing={<Warning className="size-3 text-amber-400" weight="fill" />}>
          {withBalance.map((p) => (
            <SidebarStatRow
              key={p.id}
              label={p.name}
              value={`R${(p.outstandingBalance ?? 0).toLocaleString()}`}
              tone="warn"
            />
          ))}
        </SidebarSectionGroup>
      )}

      {chronic.length > 0 && (
        <SidebarSectionGroup title="Chronic">
          {chronic.slice(0, 4).map((p) => (
            <div key={p.id} className="flex items-center gap-2.5 rounded-md px-2 py-1.5 transition-colors hover:bg-white/[0.035]">
              <span className="size-1.5 shrink-0 rounded-full bg-rose-400" />
              <span className="flex-1 truncate text-[11.5px] text-white/80">{p.name}</span>
              <span className="shrink-0 truncate text-[9px] text-white/30">{p.chronicConditions?.join(", ")}</span>
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
  const router = useRouter()
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
        className="mb-2 flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-[12px] font-medium text-white/55 transition-colors hover:bg-white/[0.035] hover:text-white/85"
      >
        <ChatCircle size={14} className="opacity-70" weight="bold" />
        Chat
      </button>

      {activePatient ? (
        <>
          <div className="mb-2 rounded-md bg-white/[0.025] px-3 py-2.5">
            <div className="flex items-center gap-2.5">
              <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-white/[0.06] text-[10px] font-bold text-white/55">
                {activePatient.name.split(" ").map((n) => n[0]).join("").slice(0, 2)}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[12.5px] font-semibold tracking-tight text-white/90">{activePatient.name}</p>
                <div className="flex items-center gap-1.5 text-[10px] text-white/35">
                  {activePatient.age && <span>{activePatient.age}{activePatient.sex ? ` ${activePatient.sex}` : ""}</span>}
                  {activePatient.age && activePatient.medicalAidScheme && <span>·</span>}
                  {activePatient.medicalAidScheme && <span className="truncate">{activePatient.medicalAidScheme}</span>}
                </div>
              </div>
              <span
                className={cn(
                  "shrink-0 rounded-full px-1.5 py-0.5 text-[8.5px] font-bold uppercase tracking-wide",
                  activePatient.medicalAidStatus === "active"
                    ? "bg-emerald-500/12 text-emerald-400"
                    : activePatient.medicalAidStatus === "inactive"
                      ? "bg-rose-500/12 text-rose-400"
                      : "bg-amber-500/12 text-amber-400"
                )}
              >
                {activePatient.medicalAidStatus === "active" ? "Active" : activePatient.medicalAidStatus === "inactive" ? "Inactive" : "Pending"}
              </span>
            </div>
            {activePatient.memberNumber && (
              <p className="mt-1.5 text-[9.5px] tabular-nums text-white/30">
                Member {activePatient.memberNumber}
              </p>
            )}
          </div>

          <PatientConsultChatsBar variant="sidebar" />
          <SidebarDivider className="my-1.5" />

          <ClinicalSidebarVitalsSection />
          <ClinicalSidebarAllergiesSection />
          <ClinicalSidebarEncounterProblemsSection />
          <ClinicalSidebarChronicSection />
          <ClinicalSidebarMedicationsSection />
          <ClinicalSidebarLabsSection />
          <ClinicalSidebarImagingSection />
          <ClinicalSidebarSocialHistorySection />

          {(activePatient.sessionDocuments?.length ?? 0) > 0 && (
            <SidebarSection
              icon={<FileText className="size-3.5" />}
              iconColor="text-white/40"
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
              iconColor="text-white/40"
              title="SOAP Note"
              defaultOpen={false}
            >
              <div className="space-y-1.5 pl-0.5">
                {activePatient.soapNote.subjective && (
                  <div>
                    <p className="text-[8px] font-semibold uppercase tracking-wider text-white/20">S</p>
                    <p className="line-clamp-3 text-[10px] leading-relaxed text-white/50">{activePatient.soapNote.subjective}</p>
                  </div>
                )}
                {activePatient.soapNote.assessment && (
                  <div>
                    <p className="text-[8px] font-semibold uppercase tracking-wider text-white/20">A</p>
                    <p className="line-clamp-3 text-[10px] leading-relaxed text-white/50">{activePatient.soapNote.assessment}</p>
                  </div>
                )}
              </div>
            </SidebarSection>
          )}
        </>
      ) : (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <Syringe className="mb-2 size-5 text-white/10" weight="duotone" />
          <p className="text-[11px] font-medium text-white/40">No active patient</p>
          <p className="mt-0.5 text-[9.5px] text-white/20">Open from calendar or patient list</p>
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
    finished: { label: "Complete", color: "text-white/35", dot: "bg-white/25" },
    waiting: { label: "Waiting", color: "text-white/30", dot: "bg-white/20" },
    checked_in: { label: "Checked in", color: "text-amber-400", dot: "bg-amber-400" },
  }
  const st = statusLabels[activePatient.status] ?? { label: activePatient.status, color: "text-white/35", dot: "bg-white/20" }

  return (
    <div className="flex items-center gap-2.5 rounded-md px-2 py-1.5">
      <span className={cn("size-1.5 shrink-0 rounded-full", st.dot, activePatient.status === "scribing" && "animate-pulse")} />
      <p className="min-w-0 flex-1 truncate text-[11.5px] font-medium text-white/75">{activePatient.name}</p>
      <span className={cn("shrink-0 text-[10px] font-semibold uppercase tracking-wide", st.color)}>{st.label}</span>
    </div>
  )
}

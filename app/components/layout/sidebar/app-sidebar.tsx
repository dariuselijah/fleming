"use client"

import { groupChatsByDate } from "@/app/components/history/utils"
import { useBreakpoint } from "@/app/hooks/use-breakpoint"
import { ScrollArea } from "@/components/ui/scroll-area"
import { resetChatClientState } from "@/lib/chat-store/new-chat"
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
  Funnel,
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
    <Sidebar collapsible="offcanvas" variant="sidebar" className="border-none" style={sidebarStyle}>
      <SidebarHeader className="h-14 pl-3">
        <div className="flex justify-between">
          {isMobile ? (
            <button
              type="button"
              onClick={() => setOpenMobile(false)}
              className="text-muted-foreground hover:text-foreground hover:bg-muted inline-flex size-9 items-center justify-center rounded-md bg-transparent transition-colors focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
            >
              <X size={24} />
            </button>
          ) : (
            <div className="h-full" />
          )}
        </div>
      </SidebarHeader>

      <SidebarContent className="mask-t-from-98% mask-t-to-100% mask-b-from-98% mask-b-to-100% px-2">
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

      <SidebarFooter className="mb-2 p-3">
        {isAdmin ? (
          <div className="flex items-center gap-2 rounded-md p-2">
            <div className="rounded-full border border-white/[0.1] p-1">
              <UserCircle className="size-4 text-white/40" weight="fill" />
            </div>
            <div className="flex flex-col">
              <div className="text-sidebar-foreground text-sm font-medium">
                {workspace?.practiceProviders?.find(p => p.id === workspace?.activeDoctorId)?.name ?? "Admin"}
              </div>
              <div className="text-sidebar-foreground/50 text-xs">
                Practice Management
              </div>
            </div>
          </div>
        ) : isClinical && workspace ? (
          <ClinicalSidebarFooter workspace={workspace} />
        ) : (
          <FeedbackTrigger>
            <div
              className="hover:bg-muted flex items-center gap-2 rounded-md p-2"
              aria-label="Tell us how to improve Fleming"
            >
              <div className="rounded-full border p-1">
                <ChatTeardropText className="size-4" />
              </div>
              <div className="flex flex-col">
                <div className="text-sidebar-foreground text-sm font-medium">
                  Help us improve
                </div>
                <div className="text-sidebar-foreground/70 text-xs">
                  Tell us how to improve Fleming
                </div>
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
      <div className="mt-3 mb-5 flex w-full flex-col items-start gap-0">
        <button
          className="hover:bg-accent/80 hover:text-foreground text-primary group/new-chat relative inline-flex w-full items-center rounded-md bg-transparent px-2 py-2 text-sm transition-colors"
          type="button"
          onClick={() => {
            resetChatClientState(pathname)
            router.push("/")
          }}
        >
          <div className="flex items-center gap-2">
            <NotePencilIcon size={20} />
            New Chat
          </div>
          <div className="text-muted-foreground ml-auto text-xs opacity-0 duration-150 group-hover/new-chat:opacity-100">
            ⌘⇧U
          </div>
        </button>
        <HistoryTrigger
          hasSidebar={false}
          classNameTrigger="bg-transparent hover:bg-accent/80 hover:text-foreground text-primary relative inline-flex w-full items-center rounded-md px-2 py-2 text-sm transition-colors group/search"
          icon={<MagnifyingGlass size={24} className="mr-2" />}
          label={
            <div className="flex w-full items-center gap-2">
              <span>Search</span>
              <div className="text-muted-foreground ml-auto text-xs opacity-0 duration-150 group-hover/search:opacity-100">
                ⌘+K
              </div>
            </div>
          }
          hasPopover={false}
        />
        <Link
          href="/uploads"
          prefetch
          onMouseEnter={() => router.prefetch("/uploads")}
          onFocus={() => router.prefetch("/uploads")}
          className={`relative inline-flex w-full items-center rounded-md px-2 py-2 text-sm transition-colors ${
            pathname === "/uploads"
              ? "bg-accent text-foreground"
              : "text-primary hover:bg-accent/80 hover:text-foreground bg-transparent"
          }`}
        >
          <div className="flex items-center gap-2">
            <FolderSimple size={20} />
            Uploads
          </div>
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
        <div className="flex h-[calc(100vh-160px)] flex-col items-center justify-center">
          <ChatTeardropText
            size={24}
            className="text-muted-foreground mb-1 opacity-40"
          />
          <div className="text-muted-foreground text-center">
            <p className="mb-1 text-base font-medium">No chats yet</p>
            <p className="text-sm opacity-70">Start a new conversation</p>
          </div>
        </div>
      )}
    </>
  )
}

function AdminSidebarContent({ workspace }: { workspace: ReturnType<typeof useWorkspaceSafe> & {} }) {
  const { activeAdminTab, practiceProviders, inventory, claims } = workspace!

  return (
    <div className="mt-3 space-y-5">
      <div className="px-1">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-white/25">
          Practice Management
        </p>
      </div>

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
      {/* Mini stats */}
      <div>
        <div className="mb-2 px-1">
          <p className="text-xs font-semibold text-foreground">Today&apos;s Schedule</p>
        </div>
        <div className="grid grid-cols-2 gap-1.5">
          {[
            { label: "Booked", value: booked, color: "text-foreground" },
            { label: "Done", value: done, color: "text-[#00E676]" },
            { label: "Waiting", value: waiting, color: "text-blue-400" },
            { label: "No-show", value: noShow, color: "text-[#EF5350]" },
          ].map((s) => (
            <div key={s.label} className="rounded-lg bg-white/[0.03] px-2.5 py-2">
              <p className="text-[9px] uppercase tracking-wider text-white/25">{s.label}</p>
              <p className={cn("mt-0.5 text-sm font-bold tabular-nums", s.color)}>{s.value}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Upcoming */}
      {upcoming.length > 0 && (
        <div>
          <div className="mb-2 flex items-center gap-2 px-1">
            <Clock className="size-3.5 text-blue-400" weight="fill" />
            <p className="text-xs font-semibold text-foreground">Upcoming</p>
          </div>
          <div className="space-y-0.5">
            {upcoming.map((a) => (
              <button
                key={a.id}
                type="button"
                onClick={() => requestCalendarFocusAppointment(a.id)}
                className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-white/[0.04]"
              >
                <span className="text-[10px] tabular-nums text-white/30">{a.startTime}</span>
                <span className="flex-1 truncate text-[11px] text-foreground">{a.patientName}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Providers */}
      <div>
        <div className="mb-2 px-1">
          <p className="text-xs font-semibold text-foreground">Providers</p>
          <p className="text-[10px] text-white/30">Toggle schedule visibility</p>
        </div>
        <div className="space-y-1">
          {providers.map((p) => {
            const isOn = visible[p.id] !== false
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => setVisible((prev) => ({ ...prev, [p.id]: !isOn }))}
                className="flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left transition-colors hover:bg-white/[0.04]"
              >
                {isOn ? (
                  <ToggleRight className="size-5 shrink-0 text-[#00E676]" weight="fill" />
                ) : (
                  <ToggleLeft className="size-5 shrink-0 text-white/20" weight="fill" />
                )}
                <div className="min-w-0 flex-1">
                  <p className={cn("text-[12px] font-medium", isOn ? "text-foreground" : "text-white/30")}>{p.name}</p>
                  {p.specialty && <p className="text-[10px] text-white/20">{p.specialty}</p>}
                </div>
              </button>
            )
          })}
        </div>
      </div>
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
      <div>
        <div className="mb-2 px-1">
          <p className="text-xs font-semibold text-foreground">Today &amp; pipeline</p>
        </div>
        <div className="grid grid-cols-2 gap-1.5 px-0.5">
          <div className="rounded-lg bg-white/[0.03] px-2 py-2">
            <p className="text-[9px] uppercase tracking-wider text-white/25">Created today</p>
            <p className="mt-0.5 text-sm font-bold tabular-nums text-foreground">
              R{stats.todayTotal.toLocaleString()}
            </p>
          </div>
          <div className="rounded-lg bg-white/[0.03] px-2 py-2">
            <p className="text-[9px] uppercase tracking-wider text-white/25">Paid (all)</p>
            <p className="mt-0.5 text-sm font-bold tabular-nums text-[#00E676]">
              R{stats.paidTotal.toLocaleString()}
            </p>
          </div>
        </div>
      </div>

      <div>
        <div className="mb-2 px-1">
          <p className="text-xs font-semibold text-foreground">Totals by lane</p>
        </div>
        <div className="space-y-1">
          {[
            {
              label: "Medical aid billed",
              count: stats.maCount,
              total: stats.maTotal,
              icon: ShieldCheck,
              color: "text-blue-400",
            },
            {
              label: "Cash / private",
              count: stats.cashCount,
              total: stats.cashTotal,
              icon: CurrencyDollar,
              color: "text-[#00E676]",
            },
            {
              label: "Outstanding / work queue",
              count: stats.outCount,
              total: stats.outstanding,
              icon: Warning,
              color: "text-[#FFC107]",
            },
          ].map((cat) => (
            <div
              key={cat.label}
              className="flex items-center gap-2.5 rounded-lg px-2 py-2 transition-colors hover:bg-white/[0.04]"
            >
              <cat.icon className={cn("size-4 shrink-0", cat.color)} weight="fill" />
              <div className="min-w-0 flex-1">
                <p className="text-[11px] font-medium text-foreground">{cat.label}</p>
                <p className="text-[10px] text-white/30">{cat.count} claims</p>
              </div>
              <span className={cn("text-[11px] font-bold tabular-nums", cat.color)}>
                R{cat.total.toLocaleString()}
              </span>
            </div>
          ))}
        </div>
      </div>

      <div>
        <div className="mb-2 px-1">
          <p className="text-xs font-semibold text-foreground">Jump in billing</p>
        </div>
        <div className="flex flex-col gap-1">
          <button
            type="button"
            onClick={() => setBillingSubTab("outstanding")}
            className="flex items-center justify-between rounded-lg px-2 py-2 text-left text-[11px] text-white/55 transition-colors hover:bg-white/[0.04] hover:text-foreground"
          >
            <span>Drafts &amp; outstanding</span>
            <span className="rounded-full bg-white/[0.08] px-1.5 py-0.5 text-[9px] font-bold tabular-nums text-white/50">
              {stats.draftCount}
            </span>
          </button>
          <button
            type="button"
            onClick={() => setBillingSubTab("payments")}
            className="flex items-center justify-between rounded-lg px-2 py-2 text-left text-[11px] text-white/55 transition-colors hover:bg-white/[0.04] hover:text-foreground"
          >
            <span>Payments &amp; remittance</span>
            <Receipt className="size-3.5 text-white/25" />
          </button>
          <button
            type="button"
            onClick={() => setBillingSubTab("invoices")}
            className="flex items-center justify-between rounded-lg px-2 py-2 text-left text-[11px] text-white/55 transition-colors hover:bg-white/[0.04] hover:text-foreground"
          >
            <span>Invoices</span>
            <FileText className="size-3.5 text-white/25" />
          </button>
        </div>
      </div>

      {recentClaims.length > 0 && (
        <div>
          <div className="mb-2 px-1">
            <p className="text-xs font-semibold text-foreground">Recent claims</p>
            <p className="text-[10px] text-white/30">Opens detail drawer</p>
          </div>
          <div className="space-y-0.5">
            {recentClaims.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => requestBillingFocusClaim(c.id)}
                className="flex w-full items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-white/[0.04]"
              >
                <span className="truncate text-[11px] text-foreground">{c.patientName}</span>
                <span className="shrink-0 text-[9px] font-semibold uppercase text-white/35">{c.status}</span>
              </button>
            ))}
          </div>
        </div>
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
      <div>
        <div className="mb-2 px-1">
          <p className="text-xs font-semibold text-foreground">Stock overview</p>
        </div>
        <div className="grid grid-cols-2 gap-1.5">
          <div className="rounded-lg bg-white/[0.03] px-2 py-2">
            <p className="text-[9px] uppercase tracking-wider text-white/25">SKUs</p>
            <p className="mt-0.5 text-sm font-bold tabular-nums text-foreground">{inventory.length}</p>
          </div>
          <div className="rounded-lg bg-white/[0.03] px-2 py-2">
            <p className="text-[9px] uppercase tracking-wider text-white/25">Est. value</p>
            <p className="mt-0.5 text-sm font-bold tabular-nums text-[#00E676]">
              R{Math.round(stockValue).toLocaleString()}
            </p>
          </div>
        </div>
      </div>

      <div>
        <button
          type="button"
          onClick={() => requestInventoryImportPanelOpen()}
          className="flex w-full items-center justify-center gap-2 rounded-xl border border-white/[0.08] bg-white/[0.04] px-3 py-2.5 text-left transition-colors hover:bg-white/[0.07]"
        >
          <FileXls className="size-4 text-[#00E676]" weight="bold" />
          <div className="flex-1">
            <p className="text-[11px] font-semibold text-foreground">Smart Import</p>
            <p className="text-[9px] text-white/30">Excel, CSV, column mapping</p>
          </div>
        </button>
      </div>

      {topCategories.length > 0 && (
        <div>
          <div className="mb-2 px-1">
            <p className="text-xs font-semibold text-foreground">Top categories</p>
          </div>
          <div className="space-y-1">
            {topCategories.map(([cat, n]) => (
              <div
                key={cat}
                className="flex items-center justify-between rounded-lg px-2 py-1.5 text-[11px] text-white/50"
              >
                <span className="truncate">{cat}</span>
                <span className="shrink-0 tabular-nums text-white/30">{n}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div>
        <div className="mb-2 flex items-center gap-2 px-1">
          <Warning className="size-3.5 text-[#FFC107]" weight="fill" />
          <p className="text-xs font-semibold text-foreground">Low stock ({lowStock.length})</p>
        </div>
        {lowStock.length === 0 ? (
          <p className="px-2 text-[11px] text-white/25">All items above minimum</p>
        ) : (
          <div className="space-y-0.5">
            {lowStock.slice(0, 8).map((item) => (
              <div
                key={item.id}
                className="flex items-center gap-2 rounded-lg px-2 py-1.5 transition-colors hover:bg-white/[0.04]"
              >
                <span className="size-1.5 rounded-full bg-[#FFC107]" />
                <span className="flex-1 truncate text-[11px] text-foreground">{item.name}</span>
                <span className="text-[10px] tabular-nums text-[#FFC107]">
                  {item.currentStock}/{item.minStock}
                </span>
              </div>
            ))}
            {lowStock.length > 8 && (
              <p className="px-2 pt-1 text-[9px] text-white/20">+{lowStock.length - 8} more in main table</p>
            )}
          </div>
        )}
      </div>
      <div>
        <div className="mb-2 flex items-center gap-2 px-1">
          <Clock className="size-3.5 text-[#EF5350]" weight="fill" />
          <p className="text-xs font-semibold text-foreground">Expiring ({expiring.length})</p>
        </div>
        {expiring.length === 0 ? (
          <p className="px-2 text-[11px] text-white/25">None in next 30 days</p>
        ) : (
          <div className="space-y-0.5">
            {expiring.slice(0, 6).map((item) => (
              <div
                key={item.id}
                className="flex items-center gap-2 rounded-lg px-2 py-1.5 transition-colors hover:bg-white/[0.04]"
              >
                <span className="size-1.5 rounded-full bg-[#EF5350]" />
                <span className="flex-1 truncate text-[11px] text-foreground">{item.name}</span>
                <span className="text-[10px] text-[#EF5350]">
                  {new Date(item.expiresAt!).toLocaleDateString([], { month: "short", day: "numeric" })}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
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
      {/* Single entry to full notification feed — no duplicate list */}
      <div>
        <div className="mb-2 px-1">
          <p className="text-xs font-semibold text-foreground">Alerts &amp; updates</p>
          <p className="text-[10px] text-white/30">Full list opens on the right</p>
        </div>
        <button
          type="button"
          onClick={() => requestInboxNotificationsPanelOpen()}
          className="flex w-full items-center justify-between gap-2 rounded-xl border border-white/[0.08] bg-white/[0.04] px-3 py-2.5 text-left transition-colors hover:bg-white/[0.07]"
        >
          <span className="flex items-center gap-2">
            <Bell className="size-4 text-blue-400" weight="fill" />
            <span className="text-[12px] font-medium text-foreground">Open notification feed</span>
          </span>
          {unreadNotifs > 0 && (
            <span className="rounded-full bg-[#EF5350] px-2 py-0.5 text-[10px] font-bold text-white tabular-nums">
              {unreadNotifs}
            </span>
          )}
        </button>
        <p className="mt-1.5 px-1 text-[9px] leading-snug text-white/25">
          Use <span className="text-white/40">All · Unread · Action</span> on the main card to filter the strip.
        </p>
      </div>

      {/* Jump to inbox sections — no second message/lab UI */}
      <div>
        <div className="mb-2 px-1">
          <p className="text-xs font-semibold text-foreground">Jump to inbox</p>
        </div>
        <div className="space-y-1">
          <button
            type="button"
            onClick={() => requestInboxScrollTo("messages")}
            className="flex w-full items-center justify-between rounded-lg px-2 py-2 text-left text-[11px] text-white/60 transition-colors hover:bg-white/[0.04] hover:text-foreground"
          >
            <span className="flex items-center gap-2">
              <ChatText className="size-3.5 text-blue-400" weight="fill" />
              Messages
            </span>
            {unreadMsgs > 0 && (
              <span className="rounded-full bg-blue-500/20 px-1.5 py-0.5 text-[9px] font-bold text-blue-400">
                {unreadMsgs}
              </span>
            )}
          </button>
          <button
            type="button"
            onClick={() => requestInboxScrollTo("labs")}
            className="flex w-full items-center justify-between rounded-lg px-2 py-2 text-left text-[11px] text-white/60 transition-colors hover:bg-white/[0.04] hover:text-foreground"
          >
            <span className="flex items-center gap-2">
              <Flask className="size-3.5 text-[#FFC107]" weight="fill" />
              Lab results
            </span>
            {unreadLabs > 0 && (
              <span className="rounded-full bg-amber-500/20 px-1.5 py-0.5 text-[9px] font-bold text-[#FFC107]">
                {unreadLabs}
              </span>
            )}
          </button>
          <button
            type="button"
            onClick={() => requestInboxScrollTo("activity")}
            className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-[11px] text-white/60 transition-colors hover:bg-white/[0.04] hover:text-foreground"
          >
            <Clock className="size-3.5 text-white/40" />
            Activity feed
          </button>
        </div>
      </div>

      {/* Today’s schedule — utility the slide-out doesn’t provide */}
      <div>
        <div className="mb-2 flex items-center justify-between px-1">
          <div className="flex items-center gap-2">
            <Clock className="size-3.5 text-blue-400" weight="fill" />
            <p className="text-xs font-semibold text-foreground">Today</p>
          </div>
          <button
            type="button"
            onClick={goCalendar}
            className="text-[9px] font-medium text-blue-400 hover:text-blue-300"
          >
            Calendar
          </button>
        </div>
        {nextAppt ? (
          <div className="space-y-1">
            <button
              type="button"
              onClick={goCalendar}
              className="w-full rounded-lg border border-white/[0.06] bg-white/[0.02] px-2.5 py-2 text-left transition-colors hover:bg-white/[0.04]"
            >
              <p className="text-[9px] font-medium uppercase tracking-wider text-white/25">Next up</p>
              <p className="mt-0.5 truncate text-[11px] font-medium text-foreground">{nextAppt.patientName}</p>
              <p className="text-[10px] tabular-nums text-white/40">
                {nextAppt.startTime}
                {nextAppt.reason ? ` · ${nextAppt.reason}` : ""}
              </p>
            </button>
            {restToday.length > 0 && (
              <div className="rounded-lg bg-white/[0.02] px-2 py-1.5">
                <p className="mb-1 text-[9px] uppercase tracking-wider text-white/25">Then</p>
                <ul className="space-y-1">
                  {restToday.map((a) => (
                    <li key={a.id} className="flex justify-between gap-1 text-[10px] text-white/45">
                      <span className="truncate">{a.patientName}</span>
                      <span className="shrink-0 tabular-nums text-white/30">{a.startTime}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        ) : (
          <p className="px-1 text-[11px] text-white/25">No appointments today</p>
        )}
      </div>

      {/* Practice pulse — counts only, links to work */}
      <div>
        <div className="mb-2 px-1">
          <p className="text-xs font-semibold text-foreground">Practice pulse</p>
        </div>
        <div className="grid grid-cols-2 gap-1.5">
          <button
            type="button"
            onClick={() => {
              setMode("admin")
              setAdminTab("billing")
            }}
            className="rounded-lg bg-white/[0.03] px-2 py-2 text-left transition-colors hover:bg-white/[0.06]"
          >
            <p className="text-[9px] text-white/30">Draft claims</p>
            <p className="text-lg font-bold tabular-nums text-foreground">{draftClaims}</p>
          </button>
          <button
            type="button"
            onClick={() => {
              setMode("admin")
              setAdminTab("inventory")
            }}
            className="rounded-lg bg-white/[0.03] px-2 py-2 text-left transition-colors hover:bg-white/[0.06]"
          >
            <p className="text-[9px] text-white/30">Low stock</p>
            <p className={cn("text-lg font-bold tabular-nums", lowStockCount > 0 ? "text-[#FFC107]" : "text-foreground")}>
              {lowStockCount}
            </p>
          </button>
          <button
            type="button"
            onClick={() => {
              setMode("admin")
              setAdminTab("patients")
            }}
            className="col-span-2 rounded-lg bg-white/[0.03] px-2 py-2 text-left transition-colors hover:bg-white/[0.06]"
          >
            <p className="text-[9px] text-white/30">Patients · MA pending / unknown</p>
            <p className={cn("text-lg font-bold tabular-nums", pendingVerify > 0 ? "text-[#FFC107]" : "text-foreground")}>
              {pendingVerify}
            </p>
          </button>
        </div>
      </div>

      {/* Quick actions */}
      <div>
        <div className="mb-2 px-1">
          <p className="text-xs font-semibold text-foreground">Quick actions</p>
        </div>
        <div className="flex flex-col gap-1">
          <button
            type="button"
            onClick={() => requestInboxScrollTo("messages")}
            className="flex items-center gap-2 rounded-lg px-2 py-2 text-left text-[11px] text-white/60 transition-colors hover:bg-white/[0.04] hover:text-foreground"
          >
            <ChatCircle className="size-3.5 shrink-0 text-emerald-400/90" weight="fill" />
            Inbox
          </button>
          <button
            type="button"
            onClick={() => requestInboxScrollTo("labs")}
            className="flex items-center gap-2 rounded-lg px-2 py-2 text-left text-[11px] text-white/60 transition-colors hover:bg-white/[0.04] hover:text-foreground"
          >
            <Flask className="size-3.5 shrink-0 text-[#FFC107]" weight="fill" />
            Lab results
          </button>
          <button
            type="button"
            onClick={() => requestInboxScrollTo("activity")}
            className="flex items-center gap-2 rounded-lg px-2 py-2 text-left text-[11px] text-white/60 transition-colors hover:bg-white/[0.04] hover:text-foreground"
          >
            <Clock className="size-3.5 shrink-0 text-white/40" />
            Recent activity
          </button>
          <button
            type="button"
            onClick={() => requestInboxScrollTo("smart-import")}
            className="flex items-center gap-2 rounded-lg px-2 py-2 text-left text-[11px] text-white/60 transition-colors hover:bg-white/[0.04] hover:text-foreground"
          >
            <Scan className="size-3.5 shrink-0 text-[#00E676]" />
            Smart Import
          </button>
          <button
            type="button"
            onClick={goCalendar}
            className="flex items-center gap-2 rounded-lg px-2 py-2 text-left text-[11px] text-white/60 transition-colors hover:bg-white/[0.04] hover:text-foreground"
          >
            <CalendarBlank className="size-3.5 shrink-0 text-indigo-400" />
            Day schedule
          </button>
          <button
            type="button"
            onClick={() => {
              setMode("admin")
              setAdminTab("inventory")
            }}
            className="flex items-center gap-2 rounded-lg px-2 py-2 text-left text-[11px] text-white/60 transition-colors hover:bg-white/[0.04] hover:text-foreground"
          >
            <Package className="size-3.5 shrink-0 text-[#FFC107]" />
            Inventory
          </button>
          <button
            type="button"
            onClick={() => {
              setMode("admin")
              setAdminTab("patients")
            }}
            className="flex items-center gap-2 rounded-lg px-2 py-2 text-left text-[11px] text-white/60 transition-colors hover:bg-white/[0.04] hover:text-foreground"
          >
            <UserPlus className="size-3.5 shrink-0 text-indigo-400" />
            Register patient
          </button>
          <button
            type="button"
            onClick={() => {
              setMode("admin")
              setAdminTab("billing")
            }}
            className="flex items-center gap-2 rounded-lg px-2 py-2 text-left text-[11px] text-white/60 transition-colors hover:bg-white/[0.04] hover:text-foreground"
          >
            <Receipt className="size-3.5 shrink-0 text-amber-400" />
            Billing
          </button>
        </div>
      </div>

      {overduePatients.length > 0 && (
        <div>
          <div className="mb-2 flex items-center gap-2 px-1">
            <Warning className="size-3.5 text-[#FFC107]" weight="fill" />
            <p className="text-xs font-semibold text-foreground">Outstanding</p>
          </div>
          <div className="space-y-0.5">
            {overduePatients.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => {
                  setMode("admin")
                  setAdminTab("patients")
                }}
                className="flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-white/[0.04]"
              >
                <span className="truncate text-[11px] text-foreground">{p.name}</span>
                <span className="shrink-0 text-[10px] font-bold tabular-nums text-[#FFC107]">
                  R{(p.outstandingBalance ?? 0).toLocaleString()}
                </span>
              </button>
            ))}
          </div>
        </div>
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

  return (
    <div className="space-y-5">
      <div>
        <div className="mb-2 px-1">
          <p className="text-xs font-semibold text-foreground">Performance</p>
        </div>
        <div className="space-y-2 px-1">
          <div className="rounded-lg bg-white/[0.03] px-2.5 py-2">
            <p className="text-[9px] uppercase tracking-wider text-white/25">Total Revenue</p>
            <p className="mt-0.5 text-lg font-bold tabular-nums text-foreground">R{stats.revenue.toLocaleString()}</p>
          </div>
          <div className="grid grid-cols-2 gap-1.5">
            <div className="rounded-lg bg-white/[0.03] px-2.5 py-2">
              <p className="text-[9px] uppercase tracking-wider text-white/25">MA</p>
              <p className="mt-0.5 text-sm font-bold tabular-nums text-blue-400">R{stats.maRevenue.toLocaleString()}</p>
            </div>
            <div className="rounded-lg bg-white/[0.03] px-2.5 py-2">
              <p className="text-[9px] uppercase tracking-wider text-white/25">Cash</p>
              <p className="mt-0.5 text-sm font-bold tabular-nums text-[#00E676]">R{stats.cashRevenue.toLocaleString()}</p>
            </div>
          </div>
          <div className="flex items-center justify-between text-[11px]">
            <span className="text-white/40">Total Claims</span>
            <span className="font-bold tabular-nums">{stats.total}</span>
          </div>
          <div className="flex items-center justify-between text-[11px]">
            <span className="text-white/40">Settled</span>
            <span className="font-bold tabular-nums text-[#00E676]">{stats.paid}</span>
          </div>
          <div className="flex items-center justify-between text-[11px]">
            <span className="text-white/40">Pending</span>
            <span className="font-bold tabular-nums text-[#FFC107]">{stats.pending}</span>
          </div>
          <div className="flex items-center justify-between text-[11px]">
            <span className="text-white/40">Collection Rate</span>
            <span className="font-bold tabular-nums text-[#00E676]">
              {stats.total > 0 ? ((stats.paid / stats.total) * 100).toFixed(0) : 0}%
            </span>
          </div>
        </div>
      </div>
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
      <div>
        <div className="mb-2 flex items-center gap-2 px-1">
          <UsersThree className="size-3.5 text-blue-400" weight="fill" />
          <p className="text-xs font-semibold text-foreground">Overview</p>
        </div>
        <div className="space-y-1.5 px-1">
          <div className="flex items-center justify-between text-[11px]">
            <span className="text-white/40">Total</span>
            <span className="font-bold tabular-nums">{patients.length}</span>
          </div>
          <div className="flex items-center justify-between text-[11px]">
            <span className="text-white/40">Verified MA</span>
            <span className="font-bold tabular-nums text-[#00E676]">{verified}</span>
          </div>
          <div className="flex items-center justify-between text-[11px]">
            <span className="text-white/40">Pending</span>
            <span className="font-bold tabular-nums text-[#FFC107]">{pending}</span>
          </div>
        </div>
      </div>
      <div>
        <div className="mb-2 flex items-center gap-2 px-1">
          <Clock className="size-3.5 text-white/40" weight="fill" />
          <p className="text-xs font-semibold text-foreground">Recent Patients</p>
        </div>
        <div className="space-y-0.5">
          {recentPatients.map((p) => (
            <div key={p.id} className="flex items-center gap-2 rounded-lg px-2 py-1.5 transition-colors hover:bg-white/[0.04]">
              <div className="flex size-5 items-center justify-center rounded-full bg-white/[0.06] text-[8px] font-bold text-white/40">
                {p.name.split(" ").map((n) => n[0]).join("")}
              </div>
              <span className="flex-1 truncate text-[11px] text-foreground">{p.name}</span>
            </div>
          ))}
        </div>
      </div>
      {withBalance.length > 0 && (
        <div>
          <div className="mb-2 flex items-center gap-2 px-1">
            <Warning className="size-3.5 text-[#FFC107]" weight="fill" />
            <p className="text-xs font-semibold text-foreground">Outstanding</p>
          </div>
          <div className="space-y-0.5">
            {withBalance.map((p) => (
              <div key={p.id} className="flex items-center justify-between rounded-lg px-2 py-1.5 transition-colors hover:bg-white/[0.04]">
                <span className="truncate text-[11px] text-foreground">{p.name}</span>
                <span className="text-[10px] font-bold tabular-nums text-[#FFC107]">R{(p.outstandingBalance ?? 0).toLocaleString()}</span>
              </div>
            ))}
          </div>
        </div>
      )}
      {chronic.length > 0 && (
        <div>
          <div className="mb-2 flex items-center gap-2 px-1">
            <Heartbeat className="size-3.5 text-[#EF5350]" weight="fill" />
            <p className="text-xs font-semibold text-foreground">Chronic</p>
          </div>
          <div className="space-y-0.5">
            {chronic.slice(0, 4).map((p) => (
              <div key={p.id} className="flex items-center gap-2 rounded-lg px-2 py-1.5 transition-colors hover:bg-white/[0.04]">
                <span className="size-1.5 rounded-full bg-[#EF5350]" />
                <span className="flex-1 truncate text-[11px] text-foreground">{p.name}</span>
                <span className="text-[9px] text-white/20">{p.chronicConditions?.join(", ")}</span>
              </div>
            ))}
          </div>
        </div>
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
    <div className="mt-2 flex flex-col gap-0.5">
      {/* Nav row */}
      <button
        type="button"
        onClick={() => {
          resetChatClientState(pathname)
          router.push("/")
        }}
        className="mb-1 flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-[12px] font-medium text-white/50 transition-colors hover:bg-white/[0.04] hover:text-white/80"
      >
        <ChatCircle size={15} weight="bold" />
        Chat
      </button>

      {activePatient ? (
        <>
          {/* Patient header — always visible, compact */}
          <div className="mb-1 rounded-lg bg-white/[0.03] px-3 py-2.5">
            <div className="flex items-center gap-2.5">
              <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-white/[0.1] to-white/[0.04] text-[10px] font-bold text-white/50">
                {activePatient.name.split(" ").map((n) => n[0]).join("").slice(0, 2)}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] font-semibold text-white/90">{activePatient.name}</p>
                <div className="flex items-center gap-1.5 text-[10px] text-white/35">
                  {activePatient.age && <span>{activePatient.age}{activePatient.sex ? ` ${activePatient.sex}` : ""}</span>}
                  {activePatient.age && activePatient.medicalAidScheme && <span>·</span>}
                  {activePatient.medicalAidScheme && <span className="truncate">{activePatient.medicalAidScheme}</span>}
                </div>
              </div>
              <span
                className={cn(
                  "shrink-0 rounded-full px-2 py-0.5 text-[9px] font-semibold",
                  activePatient.medicalAidStatus === "active"
                    ? "bg-emerald-500/12 text-emerald-400"
                    : activePatient.medicalAidStatus === "inactive"
                      ? "bg-red-500/12 text-red-400"
                      : "bg-amber-500/12 text-amber-400"
                )}
              >
                {activePatient.medicalAidStatus === "active" ? "Active" : activePatient.medicalAidStatus === "inactive" ? "Inactive" : "Pending"}
              </span>
            </div>
            {activePatient.memberNumber && (
              <p className="mt-1.5 text-[10px] tabular-nums text-white/25">
                Member {activePatient.memberNumber}
              </p>
            )}
          </div>

          <PatientConsultChatsBar variant="sidebar" />

          {/* Divider */}
          <div className="mx-2 my-1 border-t border-white/[0.05]" />

          <ClinicalSidebarVitalsSection />

          <ClinicalSidebarAllergiesSection />
          <ClinicalSidebarEncounterProblemsSection />
          <ClinicalSidebarChronicSection />
          <ClinicalSidebarMedicationsSection />
          <ClinicalSidebarLabsSection />
          <ClinicalSidebarImagingSection />
          <ClinicalSidebarSocialHistorySection />

          {/* Documents */}
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

          {/* SOAP Note */}
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
        <div className="flex flex-col items-center justify-center py-20">
          <Syringe className="mb-2 size-5 text-white/8" />
          <p className="text-[11px] text-white/25">No active patient</p>
          <p className="mt-0.5 text-[9px] text-white/12">Open from calendar or patient list</p>
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
    <div className="flex items-center gap-2.5 rounded-lg bg-white/[0.03] px-3 py-2">
      <span className={cn("size-1.5 shrink-0 rounded-full", st.dot, activePatient.status === "scribing" && "animate-pulse")} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-[11px] font-medium text-white/70">{activePatient.name}</p>
      </div>
      <span className={cn("shrink-0 text-[10px] font-medium", st.color)}>{st.label}</span>
    </div>
  )
}

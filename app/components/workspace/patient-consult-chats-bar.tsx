"use client"

import { useUser } from "@/lib/user-store/provider"
import { useChats } from "@/lib/chat-store/chats/provider"
import { useWorkspace } from "@/lib/clinical-workspace"
import { useUserPreferences } from "@/lib/user-preference-store/provider"
import type { Chats } from "@/lib/chat-store/types"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { cn } from "@/lib/utils"
import { isPracticePatientUuid } from "@/lib/clinical-workspace/clinical-uuid"
import { ChatCircle, Plus, Trash } from "@phosphor-icons/react"
import { usePathname, useRouter } from "next/navigation"
import { useCallback, useMemo, useState } from "react"
import { toast } from "sonner"

type ConsultChatsBarVariant = "canvas" | "sidebar"

function formatConsultThreadLabel(patientName: string, chat: Chats): string {
  const d = new Date(chat.updated_at || chat.created_at || Date.now())
  const when = d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
  return `${patientName} · ${when}`
}

/**
 * Lists consult chats for the active clinical patient and supports starting a new thread.
 */
export function PatientConsultChatsBar(props?: { variant?: ConsultChatsBarVariant }) {
  const variant = props?.variant ?? "canvas"
  const { user } = useUser()
  const { preferences } = useUserPreferences()
  const { chats, createNewChat, deleteChat } = useChats()
  const { activePatient, setPatientSessionChatId } = useWorkspace()
  const pathname = usePathname()
  const router = useRouter()
  const [creating, setCreating] = useState(false)
  const [chatToDelete, setChatToDelete] = useState<Chats | null>(null)

  const routeChatId = useMemo(() => {
    if (!pathname?.startsWith("/c/")) return null
    return pathname.split("/c/")[1]?.split("/")[0] ?? null
  }, [pathname])

  const patientChats = useMemo(() => {
    const pid = activePatient?.patientId
    if (!pid) return []
    return chats
      .filter((c) => c.patient_id === pid && !c.id.startsWith("optimistic-"))
      .sort(
        (a, b) =>
          +new Date(b.updated_at || b.created_at || 0) -
          +new Date(a.updated_at || a.created_at || 0)
      )
  }, [chats, activePatient?.patientId])

  const openChat = useCallback(
    (chatId: string) => {
      if (!activePatient) return
      setPatientSessionChatId(activePatient.patientId, chatId)
      router.push(`/c/${chatId}`, { scroll: false })
    },
    [activePatient, router, setPatientSessionChatId]
  )

  const patientUuidOk = activePatient ? isPracticePatientUuid(activePatient.patientId) : false

  const handleNewConsult = useCallback(async () => {
    const uid = user?.id
    if (!uid || !activePatient || creating) return
    if (!isPracticePatientUuid(activePatient.patientId)) {
      toast.error(
        "This patient record does not have a valid practice UUID. Open them from the patient directory or re-add the patient."
      )
      return
    }
    setCreating(true)
    try {
      const label = new Date().toLocaleString(undefined, {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
      const chat = await createNewChat(
        uid,
        `${activePatient.name} · ${label}`,
        undefined,
        true,
        undefined,
        undefined,
        "doctor",
        activePatient.patientId
      )
      if (chat?.id && !chat.id.startsWith("optimistic-")) {
        setPatientSessionChatId(activePatient.patientId, chat.id)
        router.push(`/c/${chat.id}`, { scroll: false })
      } else if (!chat?.id) {
        toast.error("Could not create a new consult chat.")
      }
    } catch {
      toast.error("Could not create a new consult chat.")
    } finally {
      setCreating(false)
    }
  }, [
    activePatient,
    createNewChat,
    creating,
    router,
    setPatientSessionChatId,
    user?.id,
  ])

  const confirmDeleteConsult = useCallback(() => {
    if (!chatToDelete?.id) return
    const id = chatToDelete.id
    const others = patientChats.filter((c) => c.id !== id)
    const isOpen = routeChatId === id
    deleteChat(
      id,
      routeChatId ?? undefined,
      isOpen
        ? () => {
            if (others[0]) {
              router.push(`/c/${others[0].id}`, { scroll: false })
            } else {
              router.push("/", { scroll: false })
            }
          }
        : undefined
    )
    setChatToDelete(null)
  }, [chatToDelete?.id, deleteChat, patientChats, routeChatId, router])

  if (
    preferences.userRole !== "doctor" ||
    !activePatient ||
    !user?.id
  ) {
    return null
  }

  const deleteDialog = (
    <AlertDialog open={!!chatToDelete} onOpenChange={(open) => !open && setChatToDelete(null)}>
      <AlertDialogContent className="border-white/10 bg-zinc-950 text-white sm:max-w-md">
        <AlertDialogHeader>
          <AlertDialogTitle className="text-white">Delete this consult?</AlertDialogTitle>
          <AlertDialogDescription className="text-white/55">
            {chatToDelete?.title
              ? `“${(chatToDelete.title || "Consult").slice(0, 120)}${(chatToDelete.title?.length ?? 0) > 120 ? "…" : ""}” will be removed. This cannot be undone.`
              : "This consult thread will be removed. This cannot be undone."}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel className="border-white/15 bg-transparent text-white hover:bg-white/10">
            Cancel
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => {
              e.preventDefault()
              confirmDeleteConsult()
            }}
            className="bg-red-600 text-white hover:bg-red-700"
          >
            Delete
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )

  if (variant === "sidebar") {
    return (
      <>
        {deleteDialog}
        <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-3.5">
          <div className="mb-3 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wider text-white/35">
              <ChatCircle className="size-3.5 text-indigo-400" weight="bold" />
              Consults
            </div>
            <button
              type="button"
              onClick={handleNewConsult}
              disabled={creating || !patientUuidOk}
              className="inline-flex items-center gap-1 rounded-lg border border-dashed border-white/15 bg-white/[0.04] px-2.5 py-1.5 text-[10px] font-medium text-white/50 transition-colors hover:border-indigo-400/40 hover:bg-indigo-500/10 hover:text-white/90 disabled:opacity-50"
              title={
                patientUuidOk
                  ? "New consult chat"
                  : "Patient ID must be a practice UUID to start consults"
              }
            >
              <Plus className="size-3" weight="bold" />
              New
            </button>
          </div>
          <div
            className="flex max-h-52 flex-col gap-2 overflow-y-auto pr-0.5"
            style={{ scrollbarWidth: "thin" }}
          >
            {patientChats.length === 0 ? (
              <p className="py-2 text-center text-[11px] leading-relaxed text-white/25">
                No consult threads yet
              </p>
            ) : (
              patientChats.map((c) => {
                const active = routeChatId === c.id
                const title = formatConsultThreadLabel(activePatient.name, c).slice(0, 72)
                return (
                  <div
                    key={c.id}
                    className={cn(
                      "flex w-full items-stretch gap-1 rounded-xl border transition-colors",
                      active
                        ? "border-indigo-400/35 bg-indigo-500/15"
                        : "border-transparent bg-white/[0.03] hover:bg-white/[0.06]"
                    )}
                  >
                    <button
                      type="button"
                      onClick={() => openChat(c.id)}
                      className={cn(
                        "min-w-0 flex-1 px-3 py-2 text-left text-[11px] font-medium transition-colors",
                        active ? "text-white" : "text-white/55 hover:text-white/85"
                      )}
                    >
                      <span className="line-clamp-2">{title}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setChatToDelete(c)}
                      className="shrink-0 rounded-r-xl px-2 text-white/25 transition-colors hover:bg-red-500/15 hover:text-red-300"
                      title="Delete consult"
                      aria-label="Delete consult"
                    >
                      <Trash className="size-3.5" weight="bold" />
                    </button>
                  </div>
                )
              })
            )}
          </div>
        </div>
      </>
    )
  }

  return (
    <>
      {deleteDialog}
      <div className="flex shrink-0 items-center gap-2 border-b border-border/40 bg-muted/10 px-3 py-2">
        <div className="flex items-center gap-1.5 text-[10px] font-medium text-muted-foreground">
          <ChatCircle className="size-3" weight="bold" />
          <span className="hidden sm:inline">Consults</span>
        </div>
        <div className="flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto pb-0.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {patientChats.map((c) => {
            const active = routeChatId === c.id
            const title = formatConsultThreadLabel(activePatient.name, c).slice(0, 48)
            return (
              <div
                key={c.id}
                className={cn(
                  "flex shrink-0 items-stretch rounded-md border",
                  active ? "border-primary/40 bg-primary/10" : "border-transparent bg-muted/40"
                )}
              >
                <button
                  type="button"
                  onClick={() => openChat(c.id)}
                  className={cn(
                    "max-w-[10rem] truncate px-2 py-1 text-left text-[10px] font-medium transition-colors",
                    active ? "text-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground"
                  )}
                >
                  {title}
                </button>
                <button
                  type="button"
                  onClick={() => setChatToDelete(c)}
                  className="border-l border-border/30 px-1.5 text-muted-foreground/50 hover:bg-destructive/10 hover:text-destructive"
                  title="Delete"
                  aria-label="Delete consult"
                >
                  <Trash className="size-3" weight="bold" />
                </button>
              </div>
            )
          })}
        </div>
        <button
          type="button"
          onClick={handleNewConsult}
          disabled={creating || !patientUuidOk}
          className="inline-flex shrink-0 items-center gap-1 rounded-md border border-dashed border-border/60 bg-background/80 px-2 py-1 text-[10px] font-medium text-muted-foreground transition-colors hover:border-primary/30 hover:bg-primary/5 hover:text-foreground disabled:opacity-50"
          title={
            patientUuidOk
              ? "New consult chat for this patient"
              : "Patient ID must be a practice UUID to start consults"
          }
        >
          <Plus className="size-3" weight="bold" />
          <span className="hidden sm:inline">New</span>
        </button>
      </div>
    </>
  )
}

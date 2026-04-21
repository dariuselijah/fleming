"use client"

import { useUserPreferences } from "@/lib/user-preference-store/provider"
import { useUser } from "@/lib/user-store/provider"
import { useChats } from "@/lib/chat-store/chats/provider"
import { getChatsForPatientInDb } from "@/lib/chat-store/chats/api"
import { useWorkspaceStore } from "@/lib/clinical-workspace"
import { isPracticePatientUuid } from "@/lib/clinical-workspace/clinical-uuid"
import { usePathname, useRouter } from "next/navigation"
import { useEffect, useRef } from "react"

/**
 * Keeps the URL consult chat aligned with the active clinical patient.
 * Supports multiple chats per patient; prefers the current route when it matches the patient.
 */
export function PatientChatSync() {
  const { preferences } = useUserPreferences()
  const { user } = useUser()
  const { createNewChat } = useChats()
  const pathname = usePathname()
  const router = useRouter()
  const mode = useWorkspaceStore((s) => s.mode)
  const activePatientId = useWorkspaceStore((s) => s.activePatientId)

  const inFlightRef = useRef<string | null>(null)

  useEffect(() => {
    if (preferences.userRole !== "doctor" || mode !== "clinical") return
    const userId = user?.id
    if (!userId || !activePatientId) return

    const { openPatients, setPatientSessionChatId } = useWorkspaceStore.getState()
    const activePatient = openPatients.find((p) => p.patientId === activePatientId)
    if (!activePatient || !isPracticePatientUuid(activePatient.patientId)) return

    const routeChatId =
      pathname?.startsWith("/c/") ? pathname.split("/c/")[1]?.split("/")[0] ?? null : null

    let cancelled = false
    const patientKey = activePatient.patientId
    inFlightRef.current = patientKey

    ;(async () => {
      try {
        const list = await getChatsForPatientInDb(userId, patientKey)

        if (cancelled || inFlightRef.current !== patientKey) return

        if (routeChatId && list.some((c) => c.id === routeChatId)) {
          setPatientSessionChatId(patientKey, routeChatId)
          return
        }

        const sessionChatId = activePatient.chatId
        const sessionValid = sessionChatId && list.some((c) => c.id === sessionChatId)

        let targetId: string | null = null
        if (sessionValid && sessionChatId) {
          targetId = sessionChatId
        } else if (list.length > 0) {
          targetId = list[0].id
        }

        if (!targetId) {
          try {
            const created = await createNewChat(
              userId,
              `${activePatient.name} — Consult`,
              undefined,
              true,
              undefined,
              undefined,
              "doctor",
              patientKey
            )
            if (created?.id && !created.id.startsWith("optimistic-")) {
              targetId = created.id
            }
          } catch {
            /* fall through to refetch */
          }
          if (!targetId) {
            const again = await getChatsForPatientInDb(userId, patientKey)
            targetId = again[0]?.id ?? null
          }
        }

        if (cancelled || inFlightRef.current !== patientKey || !targetId) return

        setPatientSessionChatId(patientKey, targetId)

        const currentRoute =
          pathname?.startsWith("/c/")
            ? pathname.split("/c/")[1]?.split("/")[0] ?? null
            : null
        if (currentRoute !== targetId) {
          router.replace(`/c/${targetId}`, { scroll: false })
        }
      } catch (e) {
        console.error("[PatientChatSync]", e)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [
    activePatientId,
    createNewChat,
    mode,
    pathname,
    preferences.userRole,
    router,
    user?.id,
  ])

  return null
}

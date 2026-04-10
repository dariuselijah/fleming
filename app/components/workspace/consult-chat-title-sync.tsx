"use client"

import { createClient } from "@/lib/supabase/client"
import { useUser } from "@/lib/user-store/provider"
import { usePathname } from "next/navigation"
import { useEffect, useRef } from "react"

const DELAY_MS = 5000

/**
 * Marks patient-linked consult chats so we do not run legacy AI title flows.
 * Consult list labels are shown as "{patient name} · {date/time}" in the UI.
 */
export function ConsultChatTitleSync() {
  const { user } = useUser()
  const pathname = usePathname()
  const doneRef = useRef<Set<string>>(new Set())

  useEffect(() => {
    const chatId =
      pathname?.startsWith("/c/") ? pathname.split("/c/")[1]?.split("/")[0] ?? null : null
    if (!chatId || !user?.id) return
    if (doneRef.current.has(chatId)) return

    const supabase = createClient()
    if (!supabase) return

    let cancelled = false
    const timer = setTimeout(async () => {
      try {
        const { data: chat } = await supabase
          .from("chats")
          .select("patient_id")
          .eq("id", chatId)
          .eq("user_id", user.id)
          .maybeSingle()

        if (cancelled || !chat?.patient_id) return
        doneRef.current.add(chatId)
      } catch {
        /* ignore */
      }
    }, DELAY_MS)

    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [pathname, user?.id])

  return null
}

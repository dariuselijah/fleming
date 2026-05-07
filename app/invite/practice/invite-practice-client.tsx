"use client"

import { Button } from "@/components/ui/button"
import { toast } from "@/components/ui/toast"
import { fetchClient } from "@/lib/fetch"
import { createClient } from "@/lib/supabase/client"
import { isSupabaseEnabled } from "@/lib/supabase/config"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { useCallback, useEffect, useState } from "react"

const STORAGE_KEY = "fleming_practice_invite_token"

export function InvitePracticeClient() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const [status, setStatus] = useState<"idle" | "working" | "done" | "error">("idle")
  const [message, setMessage] = useState<string | null>(null)

  const tryAccept = useCallback(
    async (token: string) => {
      setStatus("working")
      setMessage(null)
      try {
        const res = await fetchClient("/api/practice/members/accept-invite", {
          method: "POST",
          body: JSON.stringify({ token }),
        })
        const j = (await res.json()) as {
          error?: string
          practiceId?: string
          alreadyMember?: boolean
          alreadyAccepted?: boolean
        }
        if (!res.ok) throw new Error(j.error || "Could not accept invitation")

        try {
          sessionStorage.removeItem(STORAGE_KEY)
        } catch {
          /* ignore */
        }

        setStatus("done")
        if (j.alreadyMember || j.alreadyAccepted) {
          toast({ title: "You are already part of this practice", status: "success" })
        } else {
          toast({ title: "Welcome to the practice", status: "success" })
        }
        router.replace("/")
      } catch (e) {
        setStatus("error")
        setMessage(e instanceof Error ? e.message : "Something went wrong")
      }
    },
    [router]
  )

  useEffect(() => {
    const q = searchParams.get("token")?.trim()
    if (q) {
      try {
        sessionStorage.setItem(STORAGE_KEY, q)
      } catch {
        /* ignore */
      }
    }
  }, [searchParams])

  useEffect(() => {
    if (!isSupabaseEnabled) return
    const fromQuery = searchParams.get("token")?.trim()
    let token = fromQuery
    if (!token) {
      try {
        token = sessionStorage.getItem(STORAGE_KEY) ?? undefined
      } catch {
        token = undefined
      }
    }
    if (!token) {
      setStatus("idle")
      return
    }

    const supabase = createClient()
    if (!supabase) return

    let cancelled = false
    ;(async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (cancelled) return
      if (!user) {
        setStatus("idle")
        setMessage("Sign in with the invited email address to continue.")
        return
      }
      await tryAccept(token)
    })()

    return () => {
      cancelled = true
    }
  }, [searchParams, tryAccept])

  const tokenFromQuery = searchParams.get("token")?.trim()
  const signInHref = tokenFromQuery
    ? `/auth?next=${encodeURIComponent(`/invite/practice?token=${encodeURIComponent(tokenFromQuery)}`)}`
    : "/auth?next=%2Finvite%2Fpractice"

  if (!isSupabaseEnabled) {
    return (
      <div className="bg-background flex min-h-dvh flex-col items-center justify-center px-4">
        <p className="text-muted-foreground text-sm">Invitations require Supabase auth.</p>
        <Link href="/" className="text-foreground mt-4 text-sm underline">
          Home
        </Link>
      </div>
    )
  }

  return (
    <div className="bg-background flex min-h-dvh flex-col items-center justify-center px-4">
      <div className="w-full max-w-md space-y-4 text-center">
        <h1 className="text-xl font-medium">Practice invitation</h1>
        {status === "working" && (
          <p className="text-muted-foreground text-sm">Joining your practice…</p>
        )}
        {status === "idle" && message && (
          <>
            <p className="text-muted-foreground text-sm">{message}</p>
            <Button asChild className="mt-2">
              <Link href={signInHref}>Sign in to continue</Link>
            </Button>
          </>
        )}
        {status === "error" && message && (
          <>
            <p className="text-destructive text-sm">{message}</p>
            <Button variant="outline" asChild className="mt-2">
              <Link href="/">Back to app</Link>
            </Button>
          </>
        )}
        {status === "done" && (
          <p className="text-muted-foreground text-sm">Redirecting…</p>
        )}
      </div>
    </div>
  )
}

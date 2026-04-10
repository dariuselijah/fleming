"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { CircleNotch } from "@phosphor-icons/react"

declare global {
  interface Window {
    FB?: {
      init: (config: {
        appId: string
        cookie?: boolean
        xfbml?: boolean
        version: string
      }) => void
      login: (callback: (response: unknown) => void, options: Record<string, unknown>) => void
    }
    fbAsyncInit?: () => void
  }
}

export type EmbeddedSignupFlags = {
  provisioningEnabled: boolean
  facebookSdkConfigured: boolean
}

function loadFacebookSdk(appId: string, onReady: () => void) {
  if (typeof window === "undefined") return

  if (window.FB) {
    onReady()
    return
  }

  const prior = window.fbAsyncInit
  window.fbAsyncInit = () => {
    prior?.()
    window.FB?.init({
      appId,
      cookie: true,
      xfbml: true,
      version: "v21.0",
    })
    onReady()
  }

  if (document.getElementById("facebook-jssdk")) return

  const s = document.createElement("script")
  s.id = "facebook-jssdk"
  s.async = true
  s.src = "https://connect.facebook.net/en_US/sdk.js"
  document.body.appendChild(s)
}

/**
 * Meta WhatsApp Embedded Signup (Twilio Tech Provider).
 * Uses `only_waba_sharing` because the Twilio number is already assigned (OTP handled by Senders API).
 */
export function WhatsAppEmbeddedConnect({
  channelStatus,
  embeddedSignup,
  onComplete,
}: {
  channelStatus: string
  embeddedSignup: EmbeddedSignupFlags
  onComplete: () => void
}) {
  const [fbReady, setFbReady] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const completingRef = useRef(false)

  const appId = process.env.NEXT_PUBLIC_META_APP_ID || ""
  const configId = process.env.NEXT_PUBLIC_META_WHATSAPP_CONFIG_ID || ""
  const solutionId = process.env.NEXT_PUBLIC_TWILIO_PARTNER_SOLUTION_ID || ""

  useEffect(() => {
    if (
      channelStatus !== "pending_waba" ||
      !embeddedSignup.provisioningEnabled ||
      !embeddedSignup.facebookSdkConfigured ||
      !appId
    ) {
      return
    }
    loadFacebookSdk(appId, () => setFbReady(true))
  }, [
    appId,
    channelStatus,
    embeddedSignup.facebookSdkConfigured,
    embeddedSignup.provisioningEnabled,
  ])

  const handleMessage = useCallback(
    (event: MessageEvent) => {
      if (!event.origin.endsWith("facebook.com")) return
      if (completingRef.current) return
      try {
        const data = JSON.parse(event.data as string) as {
          type?: string
          event?: string
          data?: { waba_id?: string; error_message?: string }
        }
        if (data.type !== "WA_EMBEDDED_SIGNUP") return

        if (data.event === "FINISH" || data.event === "FINISH_ONLY_WABA") {
          const wabaId = data.data?.waba_id
          if (!wabaId) {
            setError("Meta did not return a WABA id. Check your Meta app Embedded Signup configuration.")
            setBusy(false)
            return
          }
          completingRef.current = true
          void (async () => {
            try {
              const res = await fetch("/api/comms/whatsapp/embedded-signup/complete", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ wabaId: String(wabaId) }),
              })
              const j = (await res.json().catch(() => ({}))) as { error?: string }
              if (!res.ok) {
                setError(typeof j.error === "string" ? j.error : "Sender registration failed")
                completingRef.current = false
                setBusy(false)
                return
              }
              onComplete()
            } catch {
              setError("Network error")
              completingRef.current = false
            } finally {
              setBusy(false)
            }
          })()
        } else if (data.event === "CANCEL") {
          setBusy(false)
        } else if (data.event === "ERROR") {
          setError(data.data?.error_message || "Meta Embedded Signup error")
          setBusy(false)
        }
      } catch {
        /* non-json postMessage */
      }
    },
    [onComplete]
  )

  useEffect(() => {
    if (channelStatus !== "pending_waba" || !embeddedSignup.provisioningEnabled) return
    window.addEventListener("message", handleMessage)
    return () => window.removeEventListener("message", handleMessage)
  }, [channelStatus, embeddedSignup.provisioningEnabled, handleMessage])

  if (channelStatus !== "pending_waba" || !embeddedSignup.provisioningEnabled) {
    return null
  }

  if (!embeddedSignup.facebookSdkConfigured || !appId || !configId || !solutionId) {
    return (
      <div className="rounded-xl border border-amber-500/25 bg-amber-500/[0.06] px-3 py-2.5 text-[11px] leading-relaxed text-amber-100/85">
        <p className="font-semibold text-amber-200/95">Embedded Signup not configured</p>
        <p className="mt-1 text-amber-100/70">
          Set{" "}
          <span className="font-mono text-[10px] text-amber-200/90">
            NEXT_PUBLIC_META_APP_ID
          </span>
          ,{" "}
          <span className="font-mono text-[10px] text-amber-200/90">
            NEXT_PUBLIC_META_WHATSAPP_CONFIG_ID
          </span>{" "}
          (Facebook Login for Business configuration id), and{" "}
          <span className="font-mono text-[10px] text-amber-200/90">
            NEXT_PUBLIC_TWILIO_PARTNER_SOLUTION_ID
          </span>{" "}
          (Twilio Partner Solution id from the Tech Provider onboarding).
        </p>
      </div>
    )
  }

  const launch = () => {
    if (!window.FB || !fbReady) return
    setBusy(true)
    setError(null)
    completingRef.current = false
    window.FB.login(
      () => {
        /* Twilio: response unused; WABA arrives via postMessage */
      },
      {
        config_id: configId,
        auth_type: "rerequest",
        response_type: "code",
        override_default_response_type: true,
        extras: {
          sessionInfoVersion: 3,
          featureType: "only_waba_sharing",
          setup: {
            solutionID: solutionId,
          },
        },
      }
    )
  }

  return (
    <div className="space-y-3 rounded-xl border border-[#1877F2]/30 bg-[#1877F2]/[0.06] p-3.5">
      <p className="text-[11px] font-semibold text-[#8cb4ff]">Connect WhatsApp Business (Meta)</p>
      <p className="text-[10px] leading-relaxed text-white/40">
        Opens Meta&apos;s Embedded Signup so this practice can create or select a Business Portfolio and
        WhatsApp Business Account (WABA). Fleming then registers the Twilio number against that WABA.
      </p>
      <button
        type="button"
        onClick={() => launch()}
        disabled={busy || !fbReady}
        className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-[#1877F2]/40 bg-[#1877F2]/20 px-3 py-2.5 text-[11px] font-semibold text-white transition-colors hover:bg-[#1877F2]/28 disabled:opacity-45"
      >
        {busy || !fbReady ? (
          <CircleNotch className="size-4 animate-spin text-white/80" />
        ) : null}
        {!fbReady ? "Loading Meta SDK…" : busy ? "Finishing…" : "Continue with Meta"}
      </button>
      {error && (
        <p className="rounded-lg border border-red-500/25 bg-red-500/10 px-2.5 py-2 text-[10px] text-red-200/90">
          {error}
        </p>
      )}
    </div>
  )
}

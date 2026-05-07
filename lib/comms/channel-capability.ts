/**
 * Provider-agnostic readiness for admin Channel / Inbox UI.
 * Backend may still store Vapi-specific IDs on `practice_channels`.
 */

export interface MessagingChannelLike {
  channel_type?: string
  status?: string
  phone_number?: string | null
  phone_number_sid?: string | null
}

export function isMessagingChannelLive(c: MessagingChannelLike | undefined): boolean {
  if (!c || c.channel_type !== "rcs") return false
  if (c.status === "suspended") return false
  if (c.status === "provisioning" && !c.phone_number_sid) return false
  if (c.status === "active") return true
  return !!(c.phone_number_sid && c.phone_number?.trim())
}

export type VoiceCapabilityStatus = "ready" | "needs_setup" | "not_configured"

export interface VoiceChannelLike {
  channel_type?: string
  provider?: string | null
  vapi_assistant_id?: string | null
  vapi_phone_number_id?: string | null
}

export function getVoiceCapabilityState(voiceChannel: VoiceChannelLike | undefined): {
  status: VoiceCapabilityStatus
  /** Human label for the row’s provider field (not necessarily the recommended next provider). */
  connectedProviderLabel: string
  isReady: boolean
} {
  if (!voiceChannel || voiceChannel.channel_type !== "voice") {
    return { status: "not_configured", connectedProviderLabel: "—", isReady: false }
  }

  const isReady = !!voiceChannel.vapi_assistant_id && !!voiceChannel.vapi_phone_number_id
  const raw = (voiceChannel.provider || "").trim()
  const connectedProviderLabel =
    raw === "vapi"
      ? "Vapi (connected)"
      : raw
        ? `${raw.charAt(0).toUpperCase()}${raw.slice(1)}`
        : "Voice stack"

  return {
    status: isReady ? "ready" : "needs_setup",
    connectedProviderLabel,
    isReady,
  }
}

export type VoiceProviderRecommendation = {
  id: string
  name: string
  summary: string
  docsUrl: string
  /** Best for … */
  fit: string
}

/** Shown in Channels as orientation; actual migration is a separate effort. */
export const VOICE_PROVIDER_RECOMMENDATIONS: VoiceProviderRecommendation[] = [
  {
    id: "retell",
    name: "Retell AI",
    fit: "Phone agents, Twilio-friendly, fast API iteration",
    summary: "Strong default when you want a hosted voice agent with phone numbers and webhooks similar to your current stack.",
    docsUrl: "https://docs.retellai.com/",
  },
  {
    id: "openai-realtime",
    name: "OpenAI Realtime API",
    fit: "First-party model, browser or server audio",
    summary: "Use when you want OpenAI-hosted speech-to-speech with your own orchestration and SIP/WebRTC where supported.",
    docsUrl: "https://platform.openai.com/docs/guides/realtime",
  },
]

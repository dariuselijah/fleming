/**
 * Presets for the admin Channel Test Lab: inbound roleplay scripts and outbound Vapi metadata/overrides.
 * Keep this file free of server-only imports so it can be used from client components.
 */

export type VoiceTestFirstMessageMode =
  | "assistant-speaks-first"
  | "assistant-waits-for-user"
  | "assistant-speaks-first-with-model-generated-message"

export type VoiceTestScenario = {
  id: string
  title: string
  shortLabel: string
  description: string
  /** Logged in Vapi call metadata.purpose */
  purpose: string
  /** Extra keys merged into Vapi call metadata (always includes practiceId + scenarioId server-side). */
  metadataExtra?: Record<string, unknown>
  /**
   * Outbound: who speaks first after you answer.
   * - assistant-speaks-first: hear the receptionist greeting, then roleplay.
   * - assistant-waits-for-user: you speak first (good for cancel/reschedule/emergency drills).
   */
  outboundFirstMessageMode?: VoiceTestFirstMessageMode
  /** Optional opening line override; omit to use assistant default copy. */
  outboundFirstMessage?: string
  /** Suggested lines for the human tester (inbound dial-in or outbound callback). */
  roleplayLines: string[]
  /** What to verify in dashboard / inbox after the call. */
  verifyHint?: string
}

export const DEFAULT_VOICE_TEST_SCENARIO_ID = "voice_channel_smoke"

export const VOICE_TEST_SCENARIOS: VoiceTestScenario[] = [
  {
    id: DEFAULT_VOICE_TEST_SCENARIO_ID,
    title: "Smoke test — channel lab",
    shortLabel: "Smoke / sanity",
    description: "Default check that Vapi + Twilio + webhooks are wired.",
    purpose: "channel_test",
    outboundFirstMessageMode: "assistant-speaks-first",
    roleplayLines: [
      "Answer (outbound) or call your practice number (inbound).",
      "Say a short greeting and ask what the practice can help with.",
      "Hang up cleanly after the assistant responds.",
    ],
    verifyHint: "voice_calls row + Comms inbox thread; optional admin strip notification.",
  },
  {
    id: "voice_reception_general",
    title: "General reception",
    shortLabel: "General",
    description: "Typical questions: hours, location, services.",
    purpose: "test_reception_general",
    outboundFirstMessageMode: "assistant-speaks-first",
    roleplayLines: [
      "Ask: “What are your opening hours today?”",
      "Ask whether a specific service (e.g. GP consult) is offered.",
    ],
    verifyHint: "Thread stays open; transcript in Inbox for voice threads.",
  },
  {
    id: "voice_book",
    title: "Book an appointment",
    shortLabel: "Book",
    description: "Walk through booking a new slot (patient may be stub-created for voice).",
    purpose: "test_book",
    outboundFirstMessageMode: "assistant-waits-for-user",
    roleplayLines: [
      "Say you’d like to book an appointment for a general check-up.",
      "Give a preferred day and rough time when asked.",
      "Confirm details if the assistant reads them back.",
    ],
    verifyHint: "practice_appointments may get a new row; structured outcome / follow-up templates.",
  },
  {
    id: "voice_cancel",
    title: "Cancel an appointment",
    shortLabel: "Cancel",
    description: "Assistant should list upcoming visits, confirm, then cancel in DB.",
    purpose: "test_cancel",
    outboundFirstMessageMode: "assistant-waits-for-user",
    roleplayLines: [
      "Say you need to cancel your upcoming appointment.",
      "If asked, confirm which slot or agree to cancel the next one.",
      "Give a short reason if prompted.",
    ],
    verifyHint: "Appointment status → cancelled; calendar notification if wired.",
  },
  {
    id: "voice_reschedule",
    title: "Reschedule an appointment",
    shortLabel: "Reschedule",
    description: "Move an existing booking to a new time without duplicating rows.",
    purpose: "test_reschedule",
    outboundFirstMessageMode: "assistant-waits-for-user",
    roleplayLines: [
      "Say you want to reschedule your appointment.",
      "Agree to a new date and time the assistant offers (or suggest one).",
      "Confirm when the assistant repeats the new slot.",
    ],
    verifyHint: "Same appointment row updated; metadata rescheduled_*.",
  },
  {
    id: "voice_payment",
    title: "Billing or payment question",
    shortLabel: "Payment",
    description: "Triggers payment / admin handoff intent in structured outcome.",
    purpose: "test_payment",
    outboundFirstMessageMode: "assistant-waits-for-user",
    roleplayLines: [
      "Ask how to pay an outstanding balance or request a statement.",
      "If offered a portal link or callback, accept.",
    ],
    verifyHint: "Thread may move to handoff; intent payment in voice_calls.",
  },
  {
    id: "voice_emergency",
    title: "Urgent / emergency (handoff)",
    shortLabel: "Emergency",
    description: "Simulates urgent symptoms — should prioritise staff handoff.",
    purpose: "test_emergency",
    outboundFirstMessageMode: "assistant-waits-for-user",
    roleplayLines: [
      "Clearly state you have severe chest pain and shortness of breath (roleplay only).",
      "Stay on the line until the assistant responds with next steps.",
    ],
    verifyHint: "Handoff / urgent priority; alert-style admin notification on SMS path; voice outcome triage.",
  },
  {
    id: "voice_wrong_number",
    title: "Wrong number / short call",
    shortLabel: "Wrong #",
    description: "Very short interaction; tests clean end-of-call handling.",
    purpose: "test_wrong_number",
    outboundFirstMessageMode: "assistant-speaks-first",
    roleplayLines: [
      "Say you may have dialled the wrong number and apologise.",
      "Hang up after one exchange.",
    ],
    verifyHint: "Short transcript; end-of-call report still stored.",
  },
]

const byId = new Map(VOICE_TEST_SCENARIOS.map((s) => [s.id, s]))

export function getVoiceTestScenario(id: string): VoiceTestScenario | undefined {
  return byId.get(id)
}

export function isVoiceTestScenarioId(id: string): boolean {
  return byId.has(id)
}

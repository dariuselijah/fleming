import type { AdminTab, PracticePatient } from "@/lib/clinical-workspace/types"

export type AssistantPatientContext = {
  id: string
  name: string
  kind: "patient" | "appointment"
}

/** Short given name — avoid using for prompts when the record starts with an honorific (e.g. "Mr"). */
export function firstNameFromFull(full: string) {
  const p = full.trim().split(/\s+/)[0]
  return p && p.length > 0 ? p : full
}

const HONORIFIC_PREFIX = /^(mr|mrs|ms|miss|dr|prof)\.?\s+/i

/** Full name for suggestion copy and chips (never truncates "Mr Rogers Naidoo" to "Mr"). */
export function patientDisplayNameForPrompts(
  patient: PracticePatient | undefined,
  contextName: string
): string {
  const raw = (patient?.name ?? contextName).trim()
  if (!raw) return "this patient"
  return raw
}

/** Casual first name for prose when you need a short form; skips leading Mr/Mrs/Dr. */
export function familiarNameForPrompts(patient: PracticePatient | undefined, contextName: string): string {
  const raw = (patient?.name ?? contextName).trim()
  if (!raw) return "them"
  const rest = raw.replace(HONORIFIC_PREFIX, "").trim()
  const parts = rest.split(/\s+/).filter(Boolean)
  if (parts.length === 0) return raw
  return parts[0]!
}

function dedupeStrings(xs: string[], limit: number) {
  const seen = new Set<string>()
  const out: string[] = []
  for (const s of xs) {
    const t = s.trim()
    if (!t || seen.has(t)) continue
    seen.add(t)
    out.push(t)
    if (out.length >= limit) break
  }
  return out
}

/**
 * Suggest follow-up prompts from admin tab + optional primary patient (from workspace data).
 */
export function buildSmartSuggestionPrompts(
  tab: AdminTab,
  patientsById: Map<string, PracticePatient>,
  ctx: AssistantPatientContext[],
  workspaceMode?: "chat" | "clinical" | "admin"
): string[] {
  const primary = ctx.find((c) => c.kind === "patient")
  const p = primary ? patientsById.get(primary.id) : undefined

  const scheme =
    p?.memberNumber?.trim() || p?.medicalAidScheme?.trim()
      ? [`Run MediKredit eligibility`, `List scheme dependants (famcheck)`]
      : []

  const tabDefaults: Record<AdminTab, string[]> = {
    front_desk: ["Summarize my unread patient messages", "Draft a reply template for appointment confirmations"],
    calendar: ["Show me tomorrow's schedule gaps", "Who still needs a confirmation call?"],
    billing: ["Summarize today's cash drawer vs yesterday", "List invoices still unpaid after 14 days"],
    inventory: ["Which items are below minimum stock?", "What expires in the next 60 days?"],
    analytics: ["Give me a quick revenue snapshot for this week", "Which schemes had the most rejections lately?"],
    patients: ["Walk me through adding a patient from a scan", "Who has incomplete registration?"],
    channels: ["How do I send a bulk SMS to booked patients?", "Check messaging setup status"],
  }

  if (!primary) {
    if (workspaceMode === "clinical") {
      return dedupeStrings(
        [
          "Summarize this visit so far",
          "Draft a referral letter",
          "Check drug interactions",
          "Prepare a Medikredit claim",
          "Run eligibility + famcheck",
        ],
        6
      )
    }
    return dedupeStrings([...tabDefaults[tab], "Find today's appointments", "Open billing tab"], 6)
  }

  if (workspaceMode === "clinical") {
    return dedupeStrings(
      [
        `Summarize this visit`,
        `Draft a referral letter`,
        `Check drug interactions for current meds`,
        `Suggest ICD-10 codes from the transcript`,
        `Prepare a Medikredit claim`,
        ...scheme,
      ],
      6
    )
  }

  // Chip provides the subject — suggestions stay short and subject-free.
  const owes = p ? (p.outstandingBalance ?? 0) > 0 : false
  const balanceHint = owes
    ? `Help me collect their outstanding balance`
    : `Check for open invoices or account balance`

  const clinical: string[] = [
    `Summarize their last visit`,
    `Double-check chronic conditions & allergies`,
    `Draft a post-visit instruction SMS`,
  ]

  const money: string[] = [
    balanceHint,
    `Create and send an invoice`,
    `Send a secure payment link by SMS`,
  ]

  const schedule: string[] = [
    `Find the next available slot`,
    `Send an appointment reminder`,
    `Reschedule to a better time`,
  ]

  const claims: string[] = [
    `Prepare a Medikredit claim`,
    `What's the status of their last claim?`,
  ]

  let ranked: string[] = []

  switch (tab) {
    case "billing":
      ranked = [...money, ...claims, ...scheme.slice(0, 1), ...schedule.slice(0, 1), ...clinical.slice(0, 1)]
      break
    case "calendar":
      ranked = [...schedule, ...scheme, ...clinical.slice(0, 2), ...money.slice(0, 1)]
      break
    case "patients":
      ranked = [
        `Update registration details`,
        ...scheme,
        ...clinical,
        ...money.slice(0, 2),
      ]
      break
    case "front_desk":
      ranked = [`Summarize threads involving them`, ...clinical.slice(0, 1), ...money.slice(0, 1)]
      break
    case "inventory":
      ranked = [...tabDefaults.inventory, ...clinical.slice(0, 1)]
      break
    case "analytics":
      ranked = [...tabDefaults.analytics, ...money.slice(0, 1)]
      break
    case "channels":
      ranked = [...tabDefaults.channels, ...schedule.slice(0, 1)]
      break
    default:
      ranked = [...clinical, ...money, ...schedule]
  }

  return dedupeStrings([...ranked, ...tabDefaults[tab]], 6)
}

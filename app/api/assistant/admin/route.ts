import { requirePracticePermission } from "@/lib/auth/guard"
import { buildPracticeAdminTools, type TrustedPatientSnapshot } from "@/lib/ai/admin-tools"
import { insertAssistantEvent } from "@/lib/ai/assistant-audit"
import type { MedikreditPatientPayload } from "@/lib/medikredit/types"
import { openproviders } from "@/lib/openproviders"
import { convertToCoreMessages, streamText, type Message as AiMessage } from "ai"
import { NextResponse } from "next/server"

export const runtime = "nodejs"
export const maxDuration = 60

const DEFAULT_MODEL = "gpt-4o-mini"

type PatientContextItem = { id: string; name: string; kind: "patient" | "appointment" }

export async function POST(req: Request) {
  const guard = await requirePracticePermission("admin:access")
  if (!guard.ok) return guard.response
  const ctx = {
    supabase: guard.context.supabase,
    userId: guard.context.userId,
    practiceId: guard.context.activePracticeId,
    role: guard.context.activeRole,
  }

  let body: {
    messages?: AiMessage[]
    threadId?: string
    activeAdminTab?: string
    mode?: string
    activePatientId?: string | null
    clinicalSnapshot?: Record<string, unknown>
    patientContext?: PatientContextItem[]
    /** Optional decrypted fields for @mentioned patients (E2EE); only merged for verified practice patient IDs. */
    patientSnapshots?: Record<string, unknown>
  }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  const messages = Array.isArray(body.messages) ? body.messages : []
  const threadId =
    typeof body.threadId === "string" && body.threadId.length > 10 ? body.threadId : crypto.randomUUID()
  const tabRaw = typeof body.activeAdminTab === "string" ? body.activeAdminTab : "front_desk"
  const tab = tabRaw === "inbox" ? "front_desk" : tabRaw
  const workspaceMode = typeof body.mode === "string" ? body.mode : "admin"
  const activePatientId =
    typeof body.activePatientId === "string" ? body.activePatientId : null
  const rawCtx = Array.isArray(body.patientContext) ? body.patientContext : []

  // Only trust patient IDs that actually belong to this practice. Cheap indexed lookup
  // — keyed by (practice_id, id) primary key — so this stays sub-ms.
  const patientIds = [...new Set(rawCtx.filter((c) => c?.kind === "patient" && typeof c?.id === "string").map((c) => c.id))]
  let resolvedPatients: Array<{ id: string; name: string }> = []
  if (patientIds.length > 0) {
    const { data } = await ctx.supabase
      .from("practice_patients")
      .select("id, display_name_hint")
      .eq("practice_id", ctx.practiceId)
      .in("id", patientIds)
    resolvedPatients = (data ?? []).map((row) => ({
      id: row.id as string,
      name: ((row as { display_name_hint?: string }).display_name_hint || "").trim() ||
        rawCtx.find((c) => c.id === row.id)?.name ||
        "patient",
    }))
  }

  const appointmentIds = [...new Set(rawCtx.filter((c) => c?.kind === "appointment" && typeof c?.id === "string").map((c) => c.id))]

  const snapHints = new Map<string, string[]>()
  const rawSnapsEarly = body.patientSnapshots
  if (rawSnapsEarly && typeof rawSnapsEarly === "object") {
    for (const pid of patientIds) {
      const c = rawSnapsEarly[pid]
      if (!c || typeof c !== "object") continue
      const s = c as { phone?: unknown; email?: unknown; medicalAidScheme?: unknown; medicalAidPlan?: unknown; memberNumber?: unknown }
      const flags: string[] = []
      if (typeof s.phone === "string" && s.phone.trim()) flags.push("has phone on file")
      if (typeof s.email === "string" && s.email.trim()) flags.push("has email on file")
      if (
        (typeof s.medicalAidScheme === "string" && s.medicalAidScheme.trim()) ||
        (typeof s.medicalAidPlan === "string" && s.medicalAidPlan.trim())
      ) {
        flags.push("has medical aid scheme on file")
      }
      if (typeof s.memberNumber === "string" && s.memberNumber.trim()) flags.push("has member number on file")
      if (flags.length > 0) snapHints.set(pid, flags)
    }
  }

  const contextLines: string[] = []
  for (const p of resolvedPatients) {
    const hints = snapHints.get(p.id)
    const tail = hints && hints.length > 0 ? ` — ${hints.join(", ")}` : ""
    contextLines.push(`- patient "${p.name}" (patient_id=${p.id})${tail}`)
  }
  for (const id of appointmentIds) {
    contextLines.push(`- appointment (appointment_id=${id})`)
  }

  const trustedSnapshots: Record<string, TrustedPatientSnapshot> = {}
  const rawSnaps = body.patientSnapshots
  if (rawSnaps && typeof rawSnaps === "object" && patientIds.length > 0) {
    const allowed = new Set(patientIds)
    for (const pid of patientIds) {
      if (!allowed.has(pid)) continue
      const chunk = rawSnaps[pid]
      if (!chunk || typeof chunk !== "object") continue
      const c = chunk as Partial<MedikreditPatientPayload> & { phone?: unknown; email?: unknown }
      const fallbackName = resolvedPatients.find((p) => p.id === pid)?.name ?? "Patient"
      const name =
        typeof c.name === "string" && c.name.trim() ? c.name.trim() : fallbackName
      const schemeFromClient =
        (typeof c.medicalAidScheme === "string" && c.medicalAidScheme.trim()) ||
        (typeof (c as { medicalAidPlan?: string }).medicalAidPlan === "string" &&
          (c as { medicalAidPlan: string }).medicalAidPlan.trim()) ||
        undefined
      trustedSnapshots[pid] = {
        id: pid,
        name,
        idNumber: typeof c.idNumber === "string" ? c.idNumber : undefined,
        memberNumber: typeof c.memberNumber === "string" ? c.memberNumber : undefined,
        medicalAidScheme: schemeFromClient,
        medicalAidSchemeCode: typeof c.medicalAidSchemeCode === "string" ? c.medicalAidSchemeCode : undefined,
        dependentCode: typeof c.dependentCode === "string" ? c.dependentCode : undefined,
        mainMemberName: typeof c.mainMemberName === "string" ? c.mainMemberName : undefined,
        dateOfBirth: typeof c.dateOfBirth === "string" ? c.dateOfBirth : undefined,
        sex: c.sex === "M" || c.sex === "F" || c.sex === "Other" ? c.sex : undefined,
        phone: typeof c.phone === "string" && c.phone.trim() ? c.phone.trim() : undefined,
        email: typeof c.email === "string" && c.email.trim() ? c.email.trim() : undefined,
      }
    }
  }

  const url = new URL(req.url)
  const fetchBilling = async (path: string, jsonBody?: Record<string, unknown>, initHeaders?: Record<string, string>) => {
    const headers = new Headers()
    headers.set("Content-Type", "application/json")
    const cookie = req.headers.get("cookie")
    if (cookie) headers.set("Cookie", cookie)
    if (initHeaders) {
      for (const [k, v] of Object.entries(initHeaders)) headers.set(k, v)
    }
    return fetch(`${url.origin}${path}`, {
      method: "POST",
      headers,
      body: jsonBody ? JSON.stringify(jsonBody) : undefined,
    })
  }

  const fetchBillingGet = async (path: string) => {
    const headers = new Headers()
    const cookie = req.headers.get("cookie")
    if (cookie) headers.set("Cookie", cookie)
    return fetch(`${url.origin}${path}`, { headers, redirect: "follow" })
  }

  const modelId = (process.env.ASSISTANT_ADMIN_MODEL as string) || DEFAULT_MODEL
  const model = openproviders(modelId as never)

  const todayIso = new Date().toISOString().slice(0, 10)

  const baseSystem =
    workspaceMode === "clinical"
      ? `You are Fleming's clinical chart assistant. The clinician is in an active patient workspace.
Current admin tab: ${tab}. Today is ${todayIso}.
${activePatientId ? `Active chart patient id: ${activePatientId}.` : "No patient chart is open — ask which patient if needed."}

Focus on this visit: summarize transcript/SOAP, draft referrals, check interactions, suggest ICD-10, prepare claims, run eligibility/famcheck, add chart notes.
Prefer tools over guessing. Keep answers concise and action-oriented. Use chart tools (get_encounter_state, summarize_current_visit, search_patient_clinical_record) for this visit; use upsert_session_document to draft SOAP/referrals; send_patient_email / send_patient_sms when the user asks to message the patient; admin billing tools only if your role allows them.

TOOL USE RULES (non-negotiable):
- Prefer tools over guessing. Never invent IDs, dates, or times.
- When the user wants navigation or to open a patient, call navigate / open_patient / scan_id — they return clientAction payloads.
- Never claim a write action succeeded unless the tool result has \`ok: true\`.
- For MediKredit eligibility or famcheck, call \`run_eligibility_check\` or \`run_family_check\`.
- For visit summaries use \`summarize_patient_recent_visits\`; for referrals \`generate_referral_letter\`; for meds \`check_drug_interactions\`.

Keep answers concise. Never paste internal UUIDs in user-facing text.

FORMATTING: Use GFM Markdown with compact lists and **bold** labels.`
      : `You are Fleming's practice assistant. The user works in a healthcare admin workspace.
Current admin tab: ${tab}. Today is ${todayIso}.

TOOL USE RULES (non-negotiable):
- Prefer tools over guessing. Never invent IDs, dates, or times.
- When the user wants navigation or to open a patient, call navigate / open_patient / scan_id — they return clientAction payloads.
- Never claim a write action (cancel/reschedule/update/book) succeeded unless the tool result has \`ok: true\`. If the tool returns \`ok: false\` (e.g. \`cancelled: false\`, \`slot_invalid\`, or \`not found\`), say so plainly and suggest the next step.
- For availability questions, ALWAYS use \`find_available_slots\`. Never infer availability from \`find_appointments\` or \`find_patient_appointments\` — those return *booked* rows, so an empty list means the window is OPEN, not closed.
- When \`find_available_slots\` returns \`ok: true\`, do **not** repeat the times in prose or as a numbered list—the workspace renders them as selectable chips. At most one short line (e.g. “Pick a time below.”).
- To **reschedule**, first resolve the appointment id via \`find_patient_appointments\` or \`find_appointments\`. Then call \`begin_reschedule_in_chat\` with that id, then \`find_available_slots\` over a sensible window with \`excludeAppointmentId\` set to the same id (and \`providerStaffId\` / \`service\` from \`begin_reschedule_in_chat\` when present). Do **not** call \`reschedule_appointment\` for the normal in-panel flow—the user confirms the new time in the assistant UI. Use \`reschedule_appointment\` only when the user gives an explicit new date/time to apply immediately without using the slot list.
- To **cancel**: resolve the appointment via \`find_patient_appointments\` or \`find_appointments\`. **Skip any row whose \`status\` is already \`cancelled\`**—they're read-only historical records. When the user refers to an appointment by ordinal ("appointment 2"), count only **active** rows (exclude status = cancelled); if that ordinal would land on a cancelled row, ask the user to clarify instead of calling the tool. Then call \`cancel_appointment\` with the chosen id.
- To **book** a new visit: call \`find_available_slots\`, then **stop** for that turn — do not call any more tools in the same assistant response. The user picks a time in the assistant; payment and service are confirmed in the booking card which writes via the app. **Never call \`book_appointment\` in the same turn as \`find_available_slots\`.** Only call \`book_appointment\` when the user gave an explicit date+time directly (e.g. "book 09:00 tomorrow") and no slot picker is on screen. \`book_appointment\` does NOT create the appointment — it opens the booking card for the user to confirm, so never say "Booked" after calling it; say something like "Opened the booking card for Tue 28 April at 09:00 — confirm payment and service to book." Confirm the patient id from context or \`find_patients\`. After the UI shows a **Booked** confirmation for a patient+date+time, do **not** call \`book_appointment\` again for that same slot — it is already booked. Never narrate that there was a booking "issue" or failure when the user has already confirmed a booking in the panel — the UI is authoritative.
- For cash drawer questions: ALWAYS call \`get_cash_drawer_status\` first. Only call \`close_cash_shift\` if a shift is open; only call \`open_cash_shift\` if none is open.
- For unpaid / outstanding / aging invoices: call \`list_outstanding_invoices\`. Map phrases like "after 14 days" to \`agingDays: 14\`. If \`ok: true\` and \`invoices\` is empty, say clearly there are none — never invent a "system error".
- To send an SMS reminder: call \`send_appointment_reminder\` with the appointment id. Treat attached patient context as authoritative — if the context line says "has phone on file" then the patient **does** have a phone; the tool will find it (column, WhatsApp thread, or trusted snapshot). If the tool returns \`ok:false\` with \`needsPhone:true\`, the UI renders an inline "Add phone" card automatically — just say one short line like "No phone on file — add one below to send." and **do not** re-ask for the phone in prose or suggest updating contact info.
- To update patient demographics, call \`propose_patient_edit\` with field-level changes; the user confirms in the UI before encrypted profile data is written.
- For MediKredit **eligibility** or **dependants / famcheck**, call \`run_eligibility_check\` or \`run_family_check\` with the patient_id from context. The client sends decrypted fields for @mentioned patients: **scheme name** may come from \`medicalAidScheme\` or \`medicalAidPlan\`; **member number** must be on file — if the tool returns missing scheme/member, ask the user to add them on the patient record or type scheme + member in chat so they can be saved.
- To **bulk-import stock**, call \`import_inventory_csv\` (opens the import UI). To add one SKU, use \`add_inventory_item\`.
- When searching availability for a known service, pass \`service\` to \`find_available_slots\` so slot length matches the catalog default.

Keep answers concise. Never re-ask for a name or ID already in the attached context below.

PRIVACY / DISPLAY:
- **Never** paste internal UUIDs (patient, appointment, encounter) in user-facing text. Use the patient's name and natural dates only. Tool results for recent visits omit encounter ids — summarize with **Summary**, **Key findings** (bullets), **Follow-up**; avoid headings larger than \`####\`.

FORMATTING (the UI renders Markdown — use it):
- Use **GFM Markdown**: \`- \` or numbered lists for schedules and steps; **bold** for labels (e.g. **Time:** 08:00, **Status:** Booked); \`###\` for section titles when you have multiple blocks (summary, findings, follow-up).
- For appointment lists from tools, prefer a compact numbered list with one line per slot (time, status, service if known) rather than a single paragraph.`

  const contextSystem =
    contextLines.length > 0
      ? `Attached context for this turn (authoritative — use these IDs without re-asking):\n${contextLines.join("\n")}\nIf the user asks anything about "them", "this patient", or uses a pronoun, resolve it to the patient above. Use \`find_patient_appointments\` for their appointments. For **new** bookings use \`find_available_slots\` only, then end your turn — the user confirms in the booking card; never chain \`book_appointment\` after \`find_available_slots\` in the same response.`
      : ""

  const system = contextSystem ? `${baseSystem}\n\n${contextSystem}` : baseSystem

  const adminTools = buildPracticeAdminTools({
    supabase: ctx.supabase,
    practiceId: ctx.practiceId,
    userId: ctx.userId,
    role: ctx.role,
    threadId,
    modelLabel: modelId,
    patientSnapshots: Object.keys(trustedSnapshots).length > 0 ? trustedSnapshots : undefined,
    fetchBilling,
    fetchBillingGet,
  })

  let tools = adminTools
  if (workspaceMode === "clinical" && activePatientId) {
    const { buildPatientClinicalTools } = await import("@/lib/clinical/chat-patient-tools")
    const { buildClinicalAssistantExtras } = await import("@/lib/ai/clinical-assistant-tools")
    tools = {
      ...adminTools,
      ...buildPatientClinicalTools({
        supabase: ctx.supabase,
        userId: ctx.userId,
        practiceId: ctx.practiceId,
        patientId: activePatientId,
        omitRetrievalTools: false,
      }),
      ...buildClinicalAssistantExtras({
        supabase: ctx.supabase,
        userId: ctx.userId,
        practiceId: ctx.practiceId,
        patientId: activePatientId,
      }),
    }
  }

  const lastUser = messages.filter((m) => m.role === "user").pop()
  const lastContent =
    lastUser && typeof lastUser === "object" && "content" in lastUser
      ? String((lastUser as { content?: unknown }).content ?? "")
      : ""

  await insertAssistantEvent(ctx.supabase, {
    practiceId: ctx.practiceId,
    actorUserId: ctx.userId,
    threadId,
    roleAtEvent: ctx.role,
    kind: "user_message",
    content: lastContent.slice(0, 8000),
    model: modelId,
    mentions: rawCtx as never,
  })

  const result = streamText({
    model,
    system,
    messages: convertToCoreMessages(messages as never),
    tools,
    maxSteps: 8,
    onFinish: async ({ text }) => {
      await insertAssistantEvent(ctx.supabase, {
        practiceId: ctx.practiceId,
        actorUserId: ctx.userId,
        threadId,
        roleAtEvent: ctx.role,
        kind: "assistant_message",
        content: text?.slice(0, 12000) ?? null,
        model: modelId,
      })
    },
  })

  return result.toDataStreamResponse()
}

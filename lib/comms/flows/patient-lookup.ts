import type { CommsAgentContext, CommsAgentResponse, FlowState } from "../types"
import { createAdminClient } from "@/lib/supabase/admin"

export interface PatientLookupFlowState extends FlowState {
  step?: "ask_method" | "collect_id" | "collect_phone" | "show_result"
  collected?: {
    method?: "id" | "phone"
    idNumber?: string
    phone?: string
    patientId?: string
    patientName?: string
  }
}

export async function runPatientLookupFlow(
  ctx: CommsAgentContext,
  message: string,
  state: FlowState,
  _media?: { storagePath: string; mimeType: string }
): Promise<CommsAgentResponse> {
  const ps = state as PatientLookupFlowState
  const step = ps.step || "ask_method"
  const collected = ps.collected || {}

  switch (step) {
    case "ask_method":
      return handleAskMethod(ctx, message, collected)
    case "collect_id":
      return handleCollectId(ctx, message, collected)
    case "collect_phone":
      return handleCollectPhone(ctx, message, collected)
    case "show_result":
      return handleShowResult(ctx, message, collected)
    default:
      return handleAskMethod(ctx, message, collected)
  }
}

function handleAskMethod(
  ctx: CommsAgentContext,
  message: string,
  collected: PatientLookupFlowState["collected"]
): CommsAgentResponse {
  const lower = message.toLowerCase()

  if (/\b\d{13}\b/.test(message.replace(/\s/g, ""))) {
    return handleCollectId(ctx, message, collected)
  }

  if (lower.includes("id") || lower.includes("number")) {
    return {
      text: "Please enter your *13-digit SA ID number* and I'll look up your record.",
      flowUpdate: {
        currentFlow: "patient_lookup",
        flowState: { step: "collect_id", collected: { method: "id" } },
      },
    }
  }

  if (lower.includes("phone") || lower.includes("cell") || lower.includes("mobile")) {
    return {
      text: "I'll search using the phone number you're messaging from. Give me a moment...",
      flowUpdate: {
        currentFlow: "patient_lookup",
        flowState: { step: "collect_phone", collected: { method: "phone", phone: ctx.thread.externalParty } },
      },
    }
  }

  return {
    text: `I can look up your patient record at *${ctx.practiceName}*. How would you like to search?`,
    interactive: {
      type: "buttons",
      buttons: [
        { id: "lookup_id", title: "SA ID Number" },
        { id: "lookup_phone", title: "This phone number" },
      ],
    },
    flowUpdate: {
      currentFlow: "patient_lookup",
      flowState: { step: "ask_method", collected },
    },
  }
}

async function handleCollectId(
  ctx: CommsAgentContext,
  message: string,
  collected: PatientLookupFlowState["collected"]
): Promise<CommsAgentResponse> {
  if (message === "lookup_id") {
    return {
      text: "Please enter your *13-digit SA ID number*:",
      flowUpdate: {
        currentFlow: "patient_lookup",
        flowState: { step: "collect_id", collected: { ...collected, method: "id" } },
      },
    }
  }

  const idNum = message.replace(/\s/g, "")
  if (!/^\d{13}$/.test(idNum)) {
    return {
      text: "That doesn't look like a valid SA ID number (13 digits). Please try again.",
      flowUpdate: {
        currentFlow: "patient_lookup",
        flowState: { step: "collect_id", collected },
      },
    }
  }

  const result = await searchPatientById(ctx.practiceId, idNum)

  if (result) {
    return buildFoundResponse(ctx, result, idNum)
  }

  return buildNotFoundResponse(ctx, idNum)
}

async function handleCollectPhone(
  ctx: CommsAgentContext,
  message: string,
  collected: PatientLookupFlowState["collected"]
): Promise<CommsAgentResponse> {
  const phone = collected?.phone || ctx.thread.externalParty
  const result = await searchPatientByPhone(ctx.practiceId, phone)

  if (result) {
    return buildFoundResponse(ctx, result)
  }

  return buildNotFoundResponse(ctx)
}

function handleShowResult(
  ctx: CommsAgentContext,
  message: string,
  collected: PatientLookupFlowState["collected"]
): CommsAgentResponse {
  const lower = message.toLowerCase()

  if (lower.includes("book") || message === "action_book") {
    return {
      text: "Let me help you book an appointment.",
      flowUpdate: {
        currentFlow: "booking",
        flowState: { step: "detect_reason", collected: { patientId: collected?.patientId, patientName: collected?.patientName } },
      },
    }
  }

  return {
    text: "Is there anything else I can help you with?",
    flowUpdate: { currentFlow: "none", flowState: {} },
  }
}

async function searchPatientById(
  practiceId: string,
  idNumber: string
): Promise<{ id: string; displayNameHint: string; createdAt: string } | null> {
  const db = createAdminClient()

  // display_name_hint can contain the ID for matching since profile is encrypted
  const { data: patients } = await db
    .from("practice_patients")
    .select("id, display_name_hint, created_at")
    .eq("practice_id", practiceId)

  if (!patients) return null

  const lastFour = idNumber.slice(-4)
  const firstSix = idNumber.slice(0, 6)

  for (const p of patients) {
    const hint = (p.display_name_hint || "").toLowerCase()
    if (hint.includes(idNumber)) return { id: p.id, displayNameHint: p.display_name_hint, createdAt: p.created_at }
    if (hint.includes(lastFour) && hint.includes(firstSix)) return { id: p.id, displayNameHint: p.display_name_hint, createdAt: p.created_at }
  }

  return null
}

async function searchPatientByPhone(
  practiceId: string,
  phone: string
): Promise<{ id: string; displayNameHint: string; createdAt: string } | null> {
  const db = createAdminClient()
  const cleanPhone = phone.replace(/\D/g, "").slice(-9)

  const { data: patients } = await db
    .from("practice_patients")
    .select("id, display_name_hint, created_at")
    .eq("practice_id", practiceId)

  if (!patients) return null

  for (const p of patients) {
    const hint = (p.display_name_hint || "").toLowerCase()
    if (hint.includes(cleanPhone)) return { id: p.id, displayNameHint: p.display_name_hint, createdAt: p.created_at }
  }

  return null
}

function buildFoundResponse(
  ctx: CommsAgentContext,
  patient: { id: string; displayNameHint: string; createdAt: string },
  idNumber?: string
): CommsAgentResponse {
  const namePart = patient.displayNameHint.split("|")[0]?.trim() || "Patient"
  const masked = idNumber ? `${idNumber.slice(0, 6)}****${idNumber.slice(-2)}` : ""

  return {
    text: `✅ *Record found!*\n\n👤 ${namePart}${masked ? `\n🆔 ${masked}` : ""}\n📅 Registered: ${new Date(patient.createdAt).toLocaleDateString("en-ZA")}\n\nWhat would you like to do?`,
    interactive: {
      type: "buttons",
      buttons: [
        { id: "action_book", title: "Book appointment" },
        { id: "action_done", title: "That's all" },
      ],
    },
    flowUpdate: {
      currentFlow: "patient_lookup",
      flowState: { step: "show_result", collected: { patientId: patient.id, patientName: namePart } },
    },
    threadUpdate: { patientId: patient.id },
  }
}

function buildNotFoundResponse(
  ctx: CommsAgentContext,
  idNumber?: string
): CommsAgentResponse {
  return {
    text: `I couldn't find a patient record${idNumber ? ` for ID ending in ...${idNumber.slice(-4)}` : " linked to this phone number"} at *${ctx.practiceName}*.\n\nWould you like to register as a new patient?`,
    interactive: {
      type: "buttons",
      buttons: [
        { id: "register_yes", title: "Register now" },
        { id: "register_no", title: "No thanks" },
      ],
    },
    flowUpdate: { currentFlow: "none", flowState: {} },
  }
}

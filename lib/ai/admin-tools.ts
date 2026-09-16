import { createInvoiceFromClaim } from "@/lib/billing/invoices"
import type { PracticeMemberRole } from "@/lib/billing/context"
import type { BillingMode } from "@/lib/billing/types"
import { insertAssistantEvent } from "@/lib/ai/assistant-audit"
import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "@/app/types/database.types"
import { tool, type CoreTool, generateText } from "ai"
import { z } from "zod"
import { openproviders } from "@/lib/openproviders"
import { getPracticeMessagingNumber } from "@/lib/comms/threads"
import { getOrCreateThread, appendMessage } from "@/lib/comms"
import { sendSmsMessage } from "@/lib/comms/twilio"
import { normalizePhoneE164Za, resolvePatientPhoneE164 } from "@/lib/comms/patient-phone"
import type { PatientRegistrationPrefill } from "@/lib/clinical/smart-import-patient"
import type { PracticeBusinessHour } from "@/lib/clinical-workspace/types"
import { computeAvailableSlots, type BookedAppointmentRow } from "@/lib/practice/availability"
import { rescheduleAppointmentForPractice } from "@/lib/practice/reschedule-appointment-server"
import { durationMinutesForCatalogService } from "@/lib/practice/service-catalog"
import { checkEligibility, checkFamilyEligibility } from "@/lib/medikredit/eligibility-service"
import { isMedikreditConfigured } from "@/lib/medikredit/env"
import { insertEligibilityCheck } from "@/lib/medikredit/persist"
import { fetchMedikreditProviderSettings } from "@/lib/medikredit/provider-settings"
import type { FamilyDependentRow, MedikreditPatientPayload } from "@/lib/medikredit/types"

const REFRESH_APPOINTMENTS = { type: "refresh_appointments" as const }

function mapHoursRows(rows: unknown): PracticeBusinessHour[] {
  if (!Array.isArray(rows)) return []
  return rows.map((row) => {
    const r = row as Record<string, unknown>
    return {
      dayOfWeek: Number(r.day_of_week ?? 0),
      openTime: String(r.open_time ?? "08:00"),
      closeTime: String(r.close_time ?? "17:00"),
      isClosed: Boolean(r.is_closed),
    }
  })
}

function clampWindow(fromDate: string, toDate: string, maxDays: number): { from: string; to: string } {
  const from = new Date(`${fromDate}T00:00:00Z`)
  const to = new Date(`${toDate}T00:00:00Z`)
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || to < from) {
    return { from: fromDate, to: fromDate }
  }
  const maxTo = new Date(from)
  maxTo.setUTCDate(maxTo.getUTCDate() + maxDays)
  return {
    from: from.toISOString().slice(0, 10),
    to: (to > maxTo ? maxTo : to).toISOString().slice(0, 10),
  }
}

function maskPhone(e164: string): string {
  const digits = e164.replace(/\D/g, "")
  if (digits.length < 4) return "•••"
  return `+${digits.slice(0, digits.length - 4).replace(/\d/g, "•")}${digits.slice(-4)}`
}

const FRONT_ROLES: PracticeMemberRole[] = ["owner", "admin", "reception"]

function isFrontDesk(role: PracticeMemberRole) {
  return FRONT_ROLES.includes(role)
}

function isOwnerOrAdmin(role: PracticeMemberRole) {
  return role === "owner" || role === "admin"
}

/** Role gate per tool name — extend when adding tools. */
export function canUseAdminTool(role: PracticeMemberRole, name: string): boolean {
  if (isFrontDesk(role)) {
    if (name === "send_bulk_sms") return isOwnerOrAdmin(role)
    return true
  }
  const clinical = new Set([
    "find_patients",
    "find_appointments",
    "find_patient_appointments",
    "find_available_slots",
    "book_appointment",
    "navigate",
    "open_patient",
    "scan_id",
    "update_appointment",
    "reschedule_appointment",
    "begin_reschedule_in_chat",
    "cancel_appointment",
    "submit_claim",
    "create_claim_for_patient",
    "attach_files_to_patient",
    "add_patient_note",
    "summarize_patient_recent_visits",
    "run_eligibility_check",
    "run_family_check",
    "import_inventory_csv",
    "add_inventory_item",
    "generate_referral_letter",
    "check_drug_interactions",
    "quick_add_patient_from_dictation",
    "quick_add_patient_from_cards",
    "propose_patient_edit",
    "send_appointment_reminder",
    "low_stock_report",
    "list_outstanding_invoices",
    "get_cash_drawer_status",
  ])
  return clinical.has(name)
}

export type TrustedPatientSnapshot = MedikreditPatientPayload & {
  phone?: string
  email?: string
  medicalAidPlan?: string
  medicalAidStatus?: string
}

type Ctx = {
  supabase: SupabaseClient<Database>
  practiceId: string
  userId: string
  role: PracticeMemberRole
  threadId: string
  modelLabel: string
  /**
   * Decrypted patient fields from the assistant client (for MediKredit when DB row is E2EE).
   * Also carries plain-contact fields (`phone`, `email`) used by comms tools as a fallback
   * when the public `phone_e164` column is empty.
   */
  patientSnapshots?: Record<string, TrustedPatientSnapshot>
  /** POST same-origin billing routes with session cookies */
  fetchBilling: (path: string, body?: Record<string, unknown>, initHeaders?: Record<string, string>) => Promise<Response>
  /** GET same-origin billing routes (e.g. statements redirect) */
  fetchBillingGet: (path: string) => Promise<Response>
}

async function loadMedikreditPatientPayload(
  ctx: Ctx,
  patientId: string
): Promise<{ ok: true; payload: MedikreditPatientPayload } | { ok: false; error: string }> {
  const { data: row, error } = await ctx.supabase
    .from("practice_patients")
    .select("id, display_name_hint")
    .eq("id", patientId)
    .eq("practice_id", ctx.practiceId)
    .maybeSingle()
  if (error || !row) {
    return { ok: false, error: error?.message ?? "Patient not found" }
  }
  const snap = ctx.patientSnapshots?.[patientId]
  const name =
    (snap?.name && String(snap.name).trim()) ||
    (row as { display_name_hint?: string | null }).display_name_hint?.trim() ||
    "Patient"
  const schemeLabel =
    snap?.medicalAidScheme?.trim() ||
    (snap as { medicalAidPlan?: string } | undefined)?.medicalAidPlan?.trim() ||
    undefined
  const payload: MedikreditPatientPayload = {
    id: patientId,
    name,
    idNumber: snap?.idNumber,
    memberNumber: snap?.memberNumber,
    medicalAidScheme: schemeLabel,
    medicalAidSchemeCode: snap?.medicalAidSchemeCode,
    dependentCode: snap?.dependentCode,
    mainMemberName: snap?.mainMemberName,
    dateOfBirth: snap?.dateOfBirth,
    sex: snap?.sex,
  }
  return { ok: true, payload }
}

function compactEligibilityForUi(r: Awaited<ReturnType<typeof checkEligibility>>) {
  return {
    status: r.status,
    planDescription: r.planDescription,
    responseMessage: r.responseMessage,
    responseCode: r.responseCode,
    res: r.res,
    rejectionDescription: r.rejectionDescription,
  }
}

async function auditTool(
  ctx: Ctx,
  name: string,
  args: Record<string, unknown>,
  result: Record<string, unknown>,
  status: "succeeded" | "failed" | "skipped"
) {
  await insertAssistantEvent(ctx.supabase, {
    practiceId: ctx.practiceId,
    actorUserId: ctx.userId,
    threadId: ctx.threadId,
    roleAtEvent: ctx.role,
    kind: "tool_result",
    toolName: name,
    toolArgs: args,
    toolResult: result,
    toolStatus: status,
    model: ctx.modelLabel,
  })
}

export function buildPracticeAdminTools(ctx: Ctx): Record<string, CoreTool> {
  return {
    find_patients: tool({
      description: "Search patients by name (partial match)",
      parameters: z.object({
        query: z.string().min(1).max(120),
        limit: z.number().min(1).max(50).optional(),
      }),
      execute: async ({ query, limit }) => {
        const lim = limit ?? 15
        if (!canUseAdminTool(ctx.role, "find_patients")) {
          const r = { ok: false, error: "Forbidden" }
          await auditTool(ctx, "find_patients", { query, limit: lim }, r, "skipped")
          return r
        }
        const { data, error } = await ctx.supabase
          .from("practice_patients")
          .select("id, display_name_hint")
          .eq("practice_id", ctx.practiceId)
          .ilike("display_name_hint", `%${query}%`)
          .limit(lim)
        const r = error
          ? { ok: false, error: error.message }
          : { ok: true, patients: data ?? [] }
        await auditTool(ctx, "find_patients", { query, limit: lim }, r as Record<string, unknown>, error ? "failed" : "succeeded")
        return r
      },
    }) as CoreTool,

    find_appointments: tool({
      description:
        "List appointments on a single day or across a date range. Provide `date` for one day, or `fromDate`+`toDate` (inclusive, max 180 days) to span a window. Cancelled rows are **excluded** unless `includeCancelled: true`.",
      parameters: z
        .object({
          date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
          fromDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
          toDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
          includeCancelled: z.boolean().optional(),
          limit: z.number().min(1).max(200).optional(),
        })
        .refine((v) => !!v.date || (!!v.fromDate && !!v.toDate), {
          message: "Provide `date` or both `fromDate` and `toDate`",
        }),
      execute: async ({ date, fromDate, toDate, includeCancelled, limit }) => {
        const lim = limit ?? 40
        const args = { date, fromDate, toDate, includeCancelled, limit: lim }
        if (!canUseAdminTool(ctx.role, "find_appointments")) {
          const r = { ok: false, error: "Forbidden" }
          await auditTool(ctx, "find_appointments", args, r, "skipped")
          return r
        }
        let q = ctx.supabase
          .from("practice_appointments")
          .select("id, appt_date, start_time, end_time, patient_id, patient_name_snapshot, service, status")
          .eq("practice_id", ctx.practiceId)
        if (date) q = q.eq("appt_date", date)
        else if (fromDate && toDate) q = q.gte("appt_date", fromDate).lte("appt_date", toDate)
        if (!includeCancelled) q = q.neq("status", "cancelled")
        const { data, error } = await q
          .order("appt_date", { ascending: true })
          .order("start_time", { ascending: true })
          .limit(lim)
        const rows = (data ?? []) as Array<Record<string, unknown>>
        const r = error
          ? { ok: false, error: error.message }
          : {
              ok: true,
              appointments: rows,
              activeCount: rows.filter((x) => String(x.status ?? "") !== "cancelled").length,
              includesCancelled: !!includeCancelled,
            }
        await auditTool(ctx, "find_appointments", args, r as Record<string, unknown>, error ? "failed" : "succeeded")
        return r
      },
    }) as CoreTool,

    find_patient_appointments: tool({
      description:
        "List appointments for a specific patient. Defaults to today + next 180 days and excludes cancelled rows; pass `includePast: true` for history, `includeCancelled: true` to surface cancelled rows. Uses an indexed (practice_id, patient_id, appt_date) query — fast.",
      parameters: z.object({
        patientId: z.string().uuid(),
        fromDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
        toDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
        includePast: z.boolean().optional(),
        includeCancelled: z.boolean().optional(),
        limit: z.number().min(1).max(100).optional(),
      }),
      execute: async ({ patientId, fromDate, toDate, includePast, includeCancelled, limit }) => {
        const lim = limit ?? 40
        const args = { patientId, fromDate, toDate, includePast, includeCancelled, limit: lim }
        if (!canUseAdminTool(ctx.role, "find_patient_appointments")) {
          const r = { ok: false, error: "Forbidden" }
          await auditTool(ctx, "find_patient_appointments", args, r, "skipped")
          return r
        }
        const today = new Date().toISOString().slice(0, 10)
        const effectiveFrom = fromDate ?? (includePast ? undefined : today)
        let q = ctx.supabase
          .from("practice_appointments")
          .select("id, appt_date, start_time, end_time, patient_id, patient_name_snapshot, service, status, provider_staff_id")
          .eq("practice_id", ctx.practiceId)
          .eq("patient_id", patientId)
        if (effectiveFrom) q = q.gte("appt_date", effectiveFrom)
        if (toDate) q = q.lte("appt_date", toDate)
        if (!includeCancelled) q = q.neq("status", "cancelled")
        const { data, error } = await q
          .order("appt_date", { ascending: includePast ? false : true })
          .order("start_time", { ascending: true })
          .limit(lim)
        const rows = (data ?? []) as Array<Record<string, unknown>>
        const r = error
          ? { ok: false, error: error.message }
          : {
              ok: true,
              appointments: rows,
              activeCount: rows.filter((x) => String(x.status ?? "") !== "cancelled").length,
              includesCancelled: !!includeCancelled,
            }
        await auditTool(
          ctx,
          "find_patient_appointments",
          args,
          r as Record<string, unknown>,
          error ? "failed" : "succeeded"
        )
        return r
      },
    }) as CoreTool,

    begin_reschedule_in_chat: tool({
      description:
        "Start rescheduling in the assistant panel: opens an in-chat confirmation card and slot list. Call after you have the appointment id (from find_patient_appointments or find_appointments). In the same turn or next, call find_available_slots with excludeAppointmentId set to this appointment id, plus providerStaffId and service from this tool's result when present, so the current booking does not block its own slot and lengths match.",
      parameters: z.object({
        appointmentId: z.string().uuid(),
      }),
      execute: async ({ appointmentId }) => {
        if (!canUseAdminTool(ctx.role, "begin_reschedule_in_chat")) {
          const r = { ok: false, error: "Forbidden" }
          await auditTool(ctx, "begin_reschedule_in_chat", { appointmentId }, r, "skipped")
          return r
        }
        const { data: row, error } = await ctx.supabase
          .from("practice_appointments")
          .select(
            "id, patient_id, patient_name_snapshot, appt_date, start_time, end_time, duration_minutes, provider_staff_id, service, status"
          )
          .eq("id", appointmentId)
          .eq("practice_id", ctx.practiceId)
          .maybeSingle()
        if (error || !row) {
          const r = { ok: false as const, error: "Appointment not found for this practice" }
          await auditTool(ctx, "begin_reschedule_in_chat", { appointmentId }, r, "failed")
          return r
        }
        const st = String((row as { status?: string }).status ?? "")
        if (st === "cancelled") {
          const r = { ok: false as const, error: "Appointment is cancelled" }
          await auditTool(ctx, "begin_reschedule_in_chat", { appointmentId }, r, "failed")
          return r
        }
        const patientId = (row as { patient_id?: string | null }).patient_id ?? null
        const patientName = String((row as { patient_name_snapshot?: string | null }).patient_name_snapshot ?? "Patient")
        const apptDate = String((row as { appt_date: string }).appt_date)
        const startTime = String((row as { start_time: string }).start_time)
        const endTime = String((row as { end_time: string }).end_time)
        const durationMinutes = Number((row as { duration_minutes?: number }).duration_minutes ?? 30)
        const providerStaffId = (row as { provider_staff_id?: string | null }).provider_staff_id ?? null
        const service = (row as { service?: string | null }).service ?? null
        const r = {
          ok: true as const,
          appointmentId,
          patientName,
          excludeAppointmentId: appointmentId,
          providerStaffId: providerStaffId ?? undefined,
          service: service ?? undefined,
          durationMinutes,
          currentSlot: { date: apptDate, startTime, endTime },
          clientAction: {
            type: "assistant_begin_reschedule" as const,
            appointmentId,
            patientId,
            patientName,
            apptDate,
            startTime,
            endTime,
            durationMinutes,
            providerStaffId,
            service,
          },
        }
        await auditTool(ctx, "begin_reschedule_in_chat", { appointmentId }, r as unknown as Record<string, unknown>, "succeeded")
        return r
      },
    }) as CoreTool,

    navigate: tool({
      description: "Navigate the admin UI (executed on the client)",
      parameters: z.object({
        mode: z.enum(["admin", "clinical"]),
        adminTab: z
          .enum(["front_desk", "calendar", "billing", "inventory", "analytics", "patients", "channels"])
          .optional(),
      }),
      execute: async (args) => {
        if (!canUseAdminTool(ctx.role, "navigate")) {
          const r = { ok: false, error: "Forbidden" }
          await auditTool(ctx, "navigate", args as Record<string, unknown>, r, "skipped")
          return r
        }
        const r = { ok: true, clientAction: { type: "navigate", ...args } }
        await auditTool(ctx, "navigate", args as Record<string, unknown>, r, "succeeded")
        return r
      },
    }) as CoreTool,

    open_patient: tool({
      description: "Open a patient chart session (client-side)",
      parameters: z.object({ patientId: z.string().uuid() }),
      execute: async ({ patientId }) => {
        if (!canUseAdminTool(ctx.role, "open_patient")) {
          const r = { ok: false, error: "Forbidden" }
          await auditTool(ctx, "open_patient", { patientId }, r, "skipped")
          return r
        }
        const r = { ok: true, clientAction: { type: "open_patient", patientId } }
        await auditTool(ctx, "open_patient", { patientId }, r, "succeeded")
        return r
      },
    }) as CoreTool,

    scan_id: tool({
      description: "Open smart ID scan import (client-side)",
      parameters: z.object({}),
      execute: async () => {
        if (!canUseAdminTool(ctx.role, "scan_id")) {
          const r = { ok: false, error: "Forbidden" }
          await auditTool(ctx, "scan_id", {}, r, "skipped")
          return r
        }
        const res = { ok: true, clientAction: { type: "scan_id" } }
        await auditTool(ctx, "scan_id", {}, res, "succeeded")
        return res
      },
    }) as CoreTool,

    update_appointment: tool({
      description: "Update appointment status or notes. Returns ok:false if the appointment doesn't belong to this practice.",
      parameters: z.object({
        appointmentId: z.string().uuid(),
        status: z
          .enum(["booked", "confirmed", "checked_in", "in_progress", "completed", "no_show", "cancelled"])
          .optional(),
        notes: z.string().max(2000).optional(),
      }),
      execute: async ({ appointmentId, status, notes }) => {
        if (!canUseAdminTool(ctx.role, "update_appointment")) {
          const r = { ok: false, error: "Forbidden" }
          await auditTool(ctx, "update_appointment", { appointmentId, status, notes }, r, "skipped")
          return r
        }
        const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
        if (status) patch.status = status
        if (notes !== undefined) patch.notes = notes
        const { data, error } = await ctx.supabase
          .from("practice_appointments")
          .update(patch as never)
          .eq("id", appointmentId)
          .eq("practice_id", ctx.practiceId)
          .select("id, status, notes, appt_date, start_time, end_time")
        const updated = (data ?? []) as Array<Record<string, unknown>>
        const r = error
          ? { ok: false as const, error: error.message }
          : updated.length === 0
            ? { ok: false as const, error: "Appointment not found for this practice" }
            : { ok: true as const, updated: updated[0], clientAction: REFRESH_APPOINTMENTS }
        await auditTool(
          ctx,
          "update_appointment",
          { appointmentId, status, notes },
          r as Record<string, unknown>,
          r.ok ? "succeeded" : "failed"
        )
        return r
      },
    }) as CoreTool,

    reschedule_appointment: tool({
      description:
        "Change appointment date and/or start/end time. Validates the new slot against practice hours and existing bookings before writing. Prefer `begin_reschedule_in_chat` when the user is rescheduling interactively (slot picker in the assistant); use this tool when they give an explicit new date/time to apply immediately without the picker.",
      parameters: z.object({
        appointmentId: z.string().uuid(),
        startTime: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/),
        endTime: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/),
        apptDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      }),
      execute: async ({ appointmentId, startTime, endTime, apptDate }) => {
        if (!canUseAdminTool(ctx.role, "reschedule_appointment")) {
          const r = { ok: false, error: "Forbidden" }
          await auditTool(ctx, "reschedule_appointment", { appointmentId, startTime, endTime, apptDate }, r, "skipped")
          return r
        }

        const result = await rescheduleAppointmentForPractice(ctx.supabase, ctx.practiceId, {
          appointmentId,
          startTime,
          endTime,
          apptDate,
        })
        const r = result.ok
          ? {
              ok: true as const,
              appointmentId: result.appointmentId,
              apptDate: result.apptDate,
              startTime: result.startTime,
              endTime: result.endTime,
              clientAction: REFRESH_APPOINTMENTS,
            }
          : { ok: false as const, error: result.error }
        await auditTool(
          ctx,
          "reschedule_appointment",
          { appointmentId, startTime, endTime, apptDate },
          r as Record<string, unknown>,
          r.ok ? "succeeded" : "failed"
        )
        return r
      },
    }) as CoreTool,

    cancel_appointment: tool({
      description:
        "Cancel an appointment. Resolve the appointment id from `find_patient_appointments` or `find_appointments` first. Skip rows whose `status` is already `cancelled` — don't re-cancel them. Returns ok:false with `cancelled:false` if id is wrong, in a different practice, or already cancelled.",
      parameters: z.object({
        appointmentId: z.string().uuid(),
        reason: z.string().max(2000).optional(),
        notifySms: z.boolean().optional(),
      }),
      execute: async ({ appointmentId, reason, notifySms }) => {
        if (!canUseAdminTool(ctx.role, "cancel_appointment")) {
          const r = { ok: false, error: "Forbidden" }
          await auditTool(ctx, "cancel_appointment", { appointmentId, reason, notifySms }, r, "skipped")
          return r
        }
        const { data: before } = await ctx.supabase
          .from("practice_appointments")
          .select("id, status, appt_date, start_time, patient_name_snapshot")
          .eq("id", appointmentId)
          .eq("practice_id", ctx.practiceId)
          .maybeSingle()
        if (!before) {
          const r = { ok: false as const, cancelled: false as const, error: "Appointment not found for this practice" }
          await auditTool(ctx, "cancel_appointment", { appointmentId, reason, notifySms }, r, "failed")
          return r
        }
        const currentStatus = String((before as { status?: string }).status ?? "")
        if (currentStatus === "cancelled") {
          const r = {
            ok: false as const,
            cancelled: false as const,
            alreadyCancelled: true,
            error: "Already cancelled — pick a different appointment.",
            appointment: before as Record<string, unknown>,
          }
          await auditTool(ctx, "cancel_appointment", { appointmentId, reason, notifySms }, r as Record<string, unknown>, "failed")
          return r
        }
        const patch: Record<string, unknown> = {
          status: "cancelled",
          updated_at: new Date().toISOString(),
        }
        if (reason) patch.notes = reason
        const { data, error } = await ctx.supabase
          .from("practice_appointments")
          .update(patch as never)
          .eq("id", appointmentId)
          .eq("practice_id", ctx.practiceId)
          .neq("status", "cancelled")
          .select("id, status, appt_date, start_time, patient_name_snapshot")
        const rows = (data ?? []) as Array<Record<string, unknown>>
        let r:
          | { ok: true; cancelled: true; appointmentId: string; cancelledAppointment: Record<string, unknown>; clientAction: typeof REFRESH_APPOINTMENTS }
          | { ok: false; cancelled: false; error: string }
        if (error) {
          r = { ok: false, cancelled: false, error: error.message }
        } else if (rows.length === 0) {
          r = {
            ok: false,
            cancelled: false,
            error: "Appointment not found or already cancelled",
          }
        } else {
          r = {
            ok: true,
            cancelled: true,
            appointmentId,
            cancelledAppointment: rows[0]!,
            clientAction: REFRESH_APPOINTMENTS,
          }
        }
        await auditTool(
          ctx,
          "cancel_appointment",
          { appointmentId, reason, notifySms },
          r as Record<string, unknown>,
          r.ok ? "succeeded" : "failed"
        )
        return r
      },
    }) as CoreTool,

    find_available_slots: tool({
      description:
        "Compute free appointment slots from practice hours minus existing bookings. Always use this (never infer availability from find_appointments). Returns a list of {date,startTime,endTime,durationMinutes} on a 15-minute grid. When rescheduling, pass excludeAppointmentId so that appointment is omitted from overlap checks (use the id from begin_reschedule_in_chat).",
      parameters: z.object({
        fromDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        toDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        durationMinutes: z.number().int().min(5).max(480).optional(),
        /** When set and durationMinutes is omitted, slot length follows the service catalog default. */
        service: z.string().max(120).optional(),
        providerStaffId: z.string().uuid().optional(),
        /** Omit this appointment when computing busy intervals (reschedule flow). */
        excludeAppointmentId: z.string().uuid().optional(),
        limit: z.number().int().min(1).max(80).optional(),
        perDayLimit: z.number().int().min(1).max(40).optional(),
      }),
      execute: async (args) => {
        if (!canUseAdminTool(ctx.role, "find_available_slots")) {
          const r = { ok: false, error: "Forbidden" }
          await auditTool(ctx, "find_available_slots", args as Record<string, unknown>, r, "skipped")
          return r
        }
        const durationResolved =
          args.durationMinutes && args.durationMinutes > 0
            ? args.durationMinutes
            : durationMinutesForCatalogService(args.service)
        const { from, to } = clampWindow(args.fromDate, args.toDate, 180)
        let bookedQuery = ctx.supabase
          .from("practice_appointments")
          .select("appt_date, start_time, end_time, duration_minutes, provider_staff_id, status")
          .eq("practice_id", ctx.practiceId)
          .gte("appt_date", from)
          .lte("appt_date", to)
        if (args.excludeAppointmentId) {
          bookedQuery = bookedQuery.neq("id", args.excludeAppointmentId)
        }
        const [{ data: hrs }, { data: booked }] = await Promise.all([
          ctx.supabase.from("practice_hours").select("*").eq("practice_id", ctx.practiceId),
          bookedQuery,
        ])
        const slots = computeAvailableSlots({
          hours: mapHoursRows(hrs),
          booked: (booked ?? []) as BookedAppointmentRow[],
          fromDate: from,
          toDate: to,
          durationMinutes: durationResolved,
          providerStaffId: args.providerStaffId ?? null,
          limit: args.limit,
          perDayLimit: args.perDayLimit,
          notBefore: new Date().toISOString(),
        })
        const r = {
          ok: true as const,
          windowFrom: from,
          windowTo: to,
          durationMinutes: durationResolved,
          slots,
          count: slots.length,
          ...(args.excludeAppointmentId ? { excludeAppointmentId: args.excludeAppointmentId } : {}),
          note:
            slots.length === 0
              ? "No free slots in range. Try a longer window or a shorter duration."
              : undefined,
        }
        await auditTool(ctx, "find_available_slots", args as Record<string, unknown>, r as unknown as Record<string, unknown>, "succeeded")
        return r
      },
    }) as CoreTool,

    book_appointment: tool({
      description:
        "Open the in-chat booking card prefilled with a chosen slot for the patient to confirm. This does NOT create the appointment directly — the booking card writes via the app after the user confirms payment/service. Use this ONLY when the user has given an explicit date+time (e.g. 'book 09:00 tomorrow'); otherwise use `find_available_slots` and let the user pick. Never call this in the same turn as `find_available_slots`.",
      parameters: z.object({
        patientId: z.string().uuid(),
        apptDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        startTime: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/),
        endTime: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/).optional(),
        durationMinutes: z.number().int().min(5).max(480).optional(),
        providerStaffId: z.string().uuid().optional(),
        service: z.string().max(200).optional(),
        reason: z.string().max(2000).optional(),
        paymentType: z.enum(["cash", "card", "medical_aid"]).optional(),
        medicalAid: z.string().max(200).optional(),
        memberNumber: z.string().max(80).optional(),
        notes: z.string().max(2000).optional(),
        icdCodes: z.array(z.string().max(16)).max(24).optional(),
        totalFee: z.number().min(0).optional(),
      }),
      execute: async (args) => {
        if (!canUseAdminTool(ctx.role, "book_appointment")) {
          const r = { ok: false, error: "Forbidden" }
          await auditTool(ctx, "book_appointment", args as Record<string, unknown>, r, "skipped")
          return r
        }

        const [{ data: patientRow }, { data: existingOverlap }] = await Promise.all([
          ctx.supabase
            .from("practice_patients")
            .select("id, display_name_hint")
            .eq("id", args.patientId)
            .eq("practice_id", ctx.practiceId)
            .maybeSingle(),
          ctx.supabase
            .from("practice_appointments")
            .select("id, patient_id")
            .eq("practice_id", ctx.practiceId)
            .eq("appt_date", args.apptDate)
            .eq("start_time", args.startTime)
            .neq("status", "cancelled")
            .limit(1),
        ])

        if (!patientRow) {
          const out = { ok: false as const, error: "Patient not found in this practice" }
          await auditTool(ctx, "book_appointment", args as Record<string, unknown>, out, "failed")
          return out
        }

        const overlapRow = Array.isArray(existingOverlap) ? existingOverlap[0] : undefined
        if (overlapRow && (overlapRow as { patient_id?: string | null }).patient_id === args.patientId) {
          const out = {
            ok: true as const,
            alreadyBooked: true as const,
            note: "This time is already booked for this patient in the practice calendar.",
          }
          await auditTool(
            ctx,
            "book_appointment",
            args as Record<string, unknown>,
            out as unknown as Record<string, unknown>,
            "succeeded"
          )
          return out
        }
        if (overlapRow) {
          const out = {
            ok: false as const,
            error: "That slot is already taken. Use `find_available_slots` to show alternatives.",
          }
          await auditTool(ctx, "book_appointment", args as Record<string, unknown>, out, "failed")
          return out
        }

        const out = {
          ok: true as const,
          note: "Booking card opened. The user must confirm payment and service before the appointment is created.",
          clientAction: {
            type: "assistant_open_booking_card" as const,
            patientId: args.patientId,
            patientName: String(
              (patientRow as { display_name_hint?: string | null }).display_name_hint ?? "Patient"
            ),
            apptDate: args.apptDate,
            startTime: args.startTime,
            endTime: args.endTime ?? null,
            durationMinutes: args.durationMinutes ?? null,
            providerStaffId: args.providerStaffId ?? null,
            service: args.service ?? null,
            paymentType: args.paymentType ?? null,
            medicalAid: args.medicalAid ?? null,
            memberNumber: args.memberNumber ?? null,
          },
        }
        await auditTool(
          ctx,
          "book_appointment",
          args as Record<string, unknown>,
          out as unknown as Record<string, unknown>,
          "succeeded"
        )
        return out
      },
    }) as CoreTool,

    create_claim_for_patient: tool({
      description: "Open claim submission for a patient (same as submit_claim)",
      parameters: z.object({ patientId: z.string().uuid() }),
      execute: async ({ patientId }) => {
        if (!canUseAdminTool(ctx.role, "create_claim_for_patient")) {
          const r = { ok: false, error: "Forbidden" }
          await auditTool(ctx, "create_claim_for_patient", { patientId }, r, "skipped")
          return r
        }
        const r = { ok: true, clientAction: { type: "submit_claim", patientId } }
        await auditTool(ctx, "create_claim_for_patient", { patientId }, r, "succeeded")
        return r
      },
    }) as CoreTool,

    list_outstanding_invoices: tool({
      description:
        "List invoices with amount_due_cents > 0 (unpaid or partial). Pass agingDays when the user wants invoices *older than* N days (e.g. unpaid after 14 days → agingDays: 14). Joins patient display names.",
      parameters: z.object({
        limit: z.number().min(1).max(100).optional(),
        agingDays: z.number().int().min(1).max(3650).optional(),
      }),
      execute: async ({ limit, agingDays }) => {
        const lim = limit ?? 40
        if (!canUseAdminTool(ctx.role, "list_outstanding_invoices")) {
          const r = { ok: false, error: "Forbidden" }
          await auditTool(ctx, "list_outstanding_invoices", { limit: lim, agingDays }, r, "skipped")
          return r
        }
        try {
          let q = ctx.supabase
            .from("practice_invoices")
            .select(
              "id, invoice_number, patient_id, status, total_cents, amount_paid_cents, amount_due_cents, created_at"
            )
            .eq("practice_id", ctx.practiceId)
            .gt("amount_due_cents", 0)
          if (agingDays != null) {
            const cutoff = new Date()
            cutoff.setUTCDate(cutoff.getUTCDate() - agingDays)
            q = q.lte("created_at", cutoff.toISOString())
          }
          const { data, error } = await q.order("created_at", { ascending: false }).limit(lim)
          if (error) {
            const detail = [error.message, (error as { details?: string }).details, (error as { code?: string }).code]
              .filter(Boolean)
              .join(" — ")
            const r = { ok: false as const, error: detail || "query_failed" }
            await auditTool(ctx, "list_outstanding_invoices", { limit: lim, agingDays }, r, "failed")
            return r
          }
          const rows = data ?? []
          const pids = [...new Set(rows.map((row) => row.patient_id).filter(Boolean))] as string[]
          const nameById: Record<string, string> = {}
          if (pids.length > 0) {
            const { data: pts } = await ctx.supabase
              .from("practice_patients")
              .select("id, display_name_hint")
              .eq("practice_id", ctx.practiceId)
              .in("id", pids)
            for (const p of pts ?? []) {
              const row = p as { id: string; display_name_hint?: string }
              nameById[row.id] = String(row.display_name_hint ?? "").trim()
            }
          }
          const invoices = rows.map((row) => ({
            ...row,
            patientName: row.patient_id ? nameById[String(row.patient_id)] || null : null,
          }))
          const totalDueCents = invoices.reduce((s, x) => s + (x.amount_due_cents ?? 0), 0)
          const r = {
            ok: true as const,
            invoices,
            totalCount: invoices.length,
            totalDueCents,
          }
          await auditTool(ctx, "list_outstanding_invoices", { limit: lim, agingDays }, r as Record<string, unknown>, "succeeded")
          return r
        } catch (e) {
          const r = { ok: false as const, error: e instanceof Error ? e.message : "unknown_error" }
          await auditTool(ctx, "list_outstanding_invoices", { limit: lim, agingDays }, r, "failed")
          return r
        }
      },
    }) as CoreTool,

    generate_patient_statement: tool({
      description: "Generate a monthly PDF statement URL for a patient (GET billing/statements)",
      parameters: z.object({
        patientId: z.string().uuid(),
        yearMonth: z.string().regex(/^\d{4}-\d{2}$/).optional(),
      }),
      execute: async ({ patientId, yearMonth }) => {
        if (!isFrontDesk(ctx.role)) {
          const r = { ok: false, error: "Only billing/front-desk roles" }
          await auditTool(ctx, "generate_patient_statement", { patientId, yearMonth }, r, "skipped")
          return r
        }
        const ym = yearMonth ?? new Date().toISOString().slice(0, 7)
        const path = `/api/billing/statements?patientId=${encodeURIComponent(patientId)}&month=${encodeURIComponent(ym)}`
        const res = await ctx.fetchBillingGet(path)
        const url = res.ok ? res.url : ""
        const r = res.ok ? { ok: true, statementUrl: url } : { ok: false, error: res.statusText }
        await auditTool(ctx, "generate_patient_statement", { patientId, yearMonth: ym }, r as Record<string, unknown>, res.ok ? "succeeded" : "failed")
        return r
      },
    }) as CoreTool,

    attach_files_to_patient: tool({
      description: "Prompt the user to pick files to attach to a patient chart",
      parameters: z.object({
        patientId: z.string().uuid(),
        description: z.string().max(500).optional(),
      }),
      execute: async ({ patientId, description }) => {
        if (!canUseAdminTool(ctx.role, "attach_files_to_patient")) {
          const r = { ok: false, error: "Forbidden" }
          await auditTool(ctx, "attach_files_to_patient", { patientId, description }, r, "skipped")
          return r
        }
        const r = {
          ok: true,
          clientAction: {
            type: "request_attachment",
            patientId,
            hint: description ?? "Drop a file onto the assistant or use the paperclip.",
          },
        }
        await auditTool(ctx, "attach_files_to_patient", { patientId, description }, r, "succeeded")
        return r
      },
    }) as CoreTool,

    add_patient_note: tool({
      description: "Add a quick staff/assistant note on a patient",
      parameters: z.object({
        patientId: z.string().uuid(),
        note: z.string().min(1).max(8000),
        tags: z.array(z.string()).max(20).optional(),
      }),
      execute: async ({ patientId, note, tags }) => {
        if (!canUseAdminTool(ctx.role, "add_patient_note")) {
          const r = { ok: false, error: "Forbidden" }
          await auditTool(ctx, "add_patient_note", { patientId, note: note.slice(0, 100), tags }, r, "skipped")
          return r
        }
        const { error } = await ctx.supabase.from("patient_notes").insert({
          practice_id: ctx.practiceId,
          patient_id: patientId,
          author_user_id: ctx.userId,
          body: note,
          tags: tags ?? [],
          source: "assistant",
        } as never)
        const r = error ? { ok: false, error: error.message } : { ok: true }
        await auditTool(
          ctx,
          "add_patient_note",
          { patientId, tags },
          r as Record<string, unknown>,
          error ? "failed" : "succeeded"
        )
        return r
      },
    }) as CoreTool,

    summarize_patient_recent_visits: tool({
      description: "Read stored AI summaries for recent encounters",
      parameters: z.object({
        patientId: z.string().uuid(),
        count: z.number().min(1).max(20).optional(),
      }),
      execute: async ({ patientId, count }) => {
        const n = count ?? 10
        if (!canUseAdminTool(ctx.role, "summarize_patient_recent_visits")) {
          const r = { ok: false, error: "Forbidden" }
          await auditTool(ctx, "summarize_patient_recent_visits", { patientId, count: n }, r, "skipped")
          return r
        }
        const { data, error } = await ctx.supabase
          .from("practice_encounter_summaries")
          .select("summary_text, key_findings, follow_up, created_at, chief_complaint")
          .eq("practice_id", ctx.practiceId)
          .eq("patient_id", patientId)
          .order("created_at", { ascending: false })
          .limit(n)
        const rows = (data ?? []) as Array<{
          summary_text?: string | null
          key_findings?: unknown
          follow_up?: string | null
          created_at?: string | null
          chief_complaint?: string | null
        }>
        const summaries = rows.map((row) => ({
          date: row.created_at,
          chiefComplaint: row.chief_complaint ?? null,
          summary: row.summary_text ?? null,
          keyFindings: row.key_findings ?? null,
          followUp: row.follow_up ?? null,
        }))
        const r = error ? { ok: false, error: error.message } : { ok: true, summaries }
        await auditTool(
          ctx,
          "summarize_patient_recent_visits",
          { patientId, count: n },
          r as Record<string, unknown>,
          error ? "failed" : "succeeded"
        )
        return r
      },
    }) as CoreTool,

    run_eligibility_check: tool({
      description:
        "Run MediKredit eligibility for a patient (scheme + member must be on file or in the assistant patient snapshot). Persists to eligibility_checks.",
      parameters: z.object({ patientId: z.string().uuid() }),
      execute: async ({ patientId }) => {
        if (!canUseAdminTool(ctx.role, "run_eligibility_check")) {
          const r = { ok: false, error: "Forbidden" }
          await auditTool(ctx, "run_eligibility_check", { patientId }, r, "skipped")
          return r
        }
        if (!isMedikreditConfigured()) {
          const r = { ok: false, error: "MediKredit is not configured on the server" }
          await auditTool(ctx, "run_eligibility_check", { patientId }, r, "failed")
          return r
        }
        const loaded = await loadMedikreditPatientPayload(ctx, patientId)
        if (!loaded.ok) {
          const r = { ok: false, error: loaded.error }
          await auditTool(ctx, "run_eligibility_check", { patientId }, r, "failed")
          return r
        }
        const { payload } = loaded
        if (!payload.memberNumber?.trim() || !payload.medicalAidScheme?.trim()) {
          const r = {
            ok: false,
            error: "Patient needs scheme name and member number on file (or @mention them so the app can send a snapshot).",
          }
          await auditTool(ctx, "run_eligibility_check", { patientId }, r, "failed")
          return r
        }
        const provider = await fetchMedikreditProviderSettings(ctx.supabase, ctx.practiceId)
        try {
          const result = await checkEligibility(payload, provider)
          await insertEligibilityCheck(ctx.supabase, {
            practiceId: ctx.practiceId,
            patientId,
            checkType: "eligibility",
            response: result,
            rawXml: result.rawXml,
            userId: ctx.userId,
          })
          const r = {
            ok: true as const,
            patientId,
            eligibility: compactEligibilityForUi(result),
          }
          await auditTool(ctx, "run_eligibility_check", { patientId }, r as Record<string, unknown>, "succeeded")
          return r
        } catch (e) {
          const msg = e instanceof Error ? e.message : "Eligibility failed"
          const r = { ok: false as const, error: msg }
          await auditTool(ctx, "run_eligibility_check", { patientId }, r as Record<string, unknown>, "failed")
          return r
        }
      },
    }) as CoreTool,

    run_family_check: tool({
      description:
        "Run MediKredit family / dependant listing (famcheck) for the principal patient. Requires scheme + member number. Persists to eligibility_checks.",
      parameters: z.object({ patientId: z.string().uuid() }),
      execute: async ({ patientId }) => {
        if (!canUseAdminTool(ctx.role, "run_family_check")) {
          const r = { ok: false, error: "Forbidden" }
          await auditTool(ctx, "run_family_check", { patientId }, r, "skipped")
          return r
        }
        if (!isMedikreditConfigured()) {
          const r = { ok: false, error: "MediKredit is not configured on the server" }
          await auditTool(ctx, "run_family_check", { patientId }, r, "failed")
          return r
        }
        const loaded = await loadMedikreditPatientPayload(ctx, patientId)
        if (!loaded.ok) {
          const r = { ok: false, error: loaded.error }
          await auditTool(ctx, "run_family_check", { patientId }, r, "failed")
          return r
        }
        const { payload } = loaded
        if (!payload.memberNumber?.trim() || !payload.medicalAidScheme?.trim()) {
          const r = {
            ok: false,
            error: "Patient needs scheme name and member number on file (or @mention them so the app can send a snapshot).",
          }
          await auditTool(ctx, "run_family_check", { patientId }, r, "failed")
          return r
        }
        const provider = await fetchMedikreditProviderSettings(ctx.supabase, ctx.practiceId)
        try {
          const result = await checkFamilyEligibility(payload, provider)
          await insertEligibilityCheck(ctx.supabase, {
            practiceId: ctx.practiceId,
            patientId,
            checkType: "famcheck",
            response: result,
            rawXml: result.rawXml,
            userId: ctx.userId,
          })
          const deps = (result.dependents ?? []) as FamilyDependentRow[]
          const r = {
            ok: true as const,
            patientId,
            principal: {
              name: payload.name,
              scheme: payload.medicalAidScheme,
              schemeCode: payload.medicalAidSchemeCode,
              memberNumber: payload.memberNumber,
              mainMemberName: payload.mainMemberName,
            },
            memberChId: result.memberChId,
            memberDependentCount: result.memberDependentCount,
            dependents: deps,
          }
          await auditTool(ctx, "run_family_check", { patientId }, r as Record<string, unknown>, "succeeded")
          return r
        } catch (e) {
          const msg = e instanceof Error ? e.message : "Family check failed"
          const r = { ok: false as const, error: msg }
          await auditTool(ctx, "run_family_check", { patientId }, r as Record<string, unknown>, "failed")
          return r
        }
      },
    }) as CoreTool,

    generate_referral_letter: tool({
      description: "Draft a short referral letter text (no auto-send)",
      parameters: z.object({
        patientId: z.string().uuid(),
        specialty: z.string().min(1).max(200),
        reason: z.string().min(1).max(4000),
      }),
      execute: async ({ patientId, specialty, reason }) => {
        if (!canUseAdminTool(ctx.role, "generate_referral_letter")) {
          const r = { ok: false, error: "Forbidden" }
          await auditTool(ctx, "generate_referral_letter", { patientId, specialty }, r, "skipped")
          return r
        }
        const { data: hint } = await ctx.supabase
          .from("practice_patients")
          .select("display_name_hint")
          .eq("id", patientId)
          .eq("practice_id", ctx.practiceId)
          .maybeSingle()
        const name = (hint as { display_name_hint?: string } | null)?.display_name_hint ?? "Patient"
        const model = openproviders((ctx.modelLabel || "gpt-4o-mini") as never)
        const { text } = await generateText({
          model,
          prompt: `Draft a formal referral letter from a GP to a ${specialty} specialist for patient ${name}. Reason: ${reason}. Use professional tone, 2-3 short paragraphs, no invented diagnoses.`,
        })
        const r = { ok: true, letter: text, patientId, specialty }
        await auditTool(ctx, "generate_referral_letter", { patientId, specialty }, r as Record<string, unknown>, "succeeded")
        return r
      },
    }) as CoreTool,

    check_drug_interactions: tool({
      description: "Remind to review meds in chart; does not run automated interaction database",
      parameters: z.object({
        patientId: z.string().uuid(),
        newMedication: z.string().max(500).optional(),
      }),
      execute: async ({ patientId, newMedication }) => {
        if (!canUseAdminTool(ctx.role, "check_drug_interactions")) {
          const r = { ok: false, error: "Forbidden" }
          await auditTool(ctx, "check_drug_interactions", { patientId, newMedication }, r, "skipped")
          return r
        }
        const r = {
          ok: true,
          message:
            "Open the patient chart to review current medications and any new prescription. Use clinical decision support or pharmacist review for formal interaction checking.",
          clientAction: { type: "open_patient", patientId },
          newMedication: newMedication ?? null,
        }
        await auditTool(ctx, "check_drug_interactions", { patientId, newMedication }, r, "succeeded")
        return r
      },
    }) as CoreTool,

    quick_add_patient_from_dictation: tool({
      description: "Parse dictated registration details and open the add-patient modal prefilled",
      parameters: z.object({ transcript: z.string().min(3).max(8000) }),
      execute: async ({ transcript }) => {
        if (!canUseAdminTool(ctx.role, "quick_add_patient_from_dictation")) {
          const r = { ok: false, error: "Forbidden" }
          await auditTool(ctx, "quick_add_patient_from_dictation", { transcript: transcript.slice(0, 200) }, r, "skipped")
          return r
        }
        const model = openproviders((ctx.modelLabel || "gpt-4o-mini") as never)
        const { text } = await generateText({
          model,
          prompt: `Extract patient registration fields from this dictated text. Return JSON only: {"firstName","lastName","idNumber","dateOfBirth","sex","phone","email","scheme","memberNumber"}. Use null for unknown. Transcript:\n${transcript.slice(0, 4000)}`,
        })
        let prefill: PatientRegistrationPrefill = {}
        try {
          prefill = JSON.parse(text.replace(/```json\s*|\s*```/g, "").trim()) as PatientRegistrationPrefill
        } catch {
          prefill = { firstName: transcript.slice(0, 80) }
        }
        const r = { ok: true, clientAction: { type: "open_patient_add_modal", prefill } }
        await auditTool(ctx, "quick_add_patient_from_dictation", { transcript: transcript.slice(0, 200) }, r, "succeeded")
        return r
      },
    }) as CoreTool,

    quick_add_patient_from_cards: tool({
      description: "Open file picker to scan ID / medical aid cards into registration (smart import)",
      parameters: z.object({}),
      execute: async () => {
        if (!canUseAdminTool(ctx.role, "quick_add_patient_from_cards")) {
          const r = { ok: false, error: "Forbidden" }
          await auditTool(ctx, "quick_add_patient_from_cards", {}, r, "skipped")
          return r
        }
        const r = { ok: true, clientAction: { type: "open_file_picker", context: "smart_import" } }
        await auditTool(ctx, "quick_add_patient_from_cards", {}, r, "succeeded")
        return r
      },
    }) as CoreTool,

    propose_patient_edit: tool({
      description:
        "Propose edits to a patient registration profile. Does NOT write — the user must confirm in the UI (encrypted profile requires client-side apply). Use for phone, email, address, medical aid scheme/member #, name, DOB, ID number.",
      parameters: z.object({
        patientId: z.string().uuid(),
        changes: z
          .array(
            z.object({
              field: z.enum([
                "name",
                "phone",
                "email",
                "address",
                "dateOfBirth",
                "idNumber",
                "medicalAidScheme",
                "memberNumber",
                "passportNumber",
                "nationality",
              ]),
              newValue: z.string().min(1).max(2000),
            })
          )
          .min(1)
          .max(24),
      }),
      execute: async ({ patientId, changes }) => {
        if (!canUseAdminTool(ctx.role, "propose_patient_edit")) {
          const r = { ok: false, error: "Forbidden" }
          await auditTool(ctx, "propose_patient_edit", { patientId, changes }, r, "skipped")
          return r
        }
        const { data: row } = await ctx.supabase
          .from("practice_patients")
          .select("id")
          .eq("id", patientId)
          .eq("practice_id", ctx.practiceId)
          .maybeSingle()
        if (!row) {
          const r = { ok: false as const, error: "Patient not found for this practice" }
          await auditTool(ctx, "propose_patient_edit", { patientId, changes }, r, "failed")
          return r
        }
        const requireTypedConfirm = changes.some((c) =>
          ["name", "dateOfBirth", "idNumber"].includes(c.field)
        )
        const r = {
          ok: true as const,
          patientId,
          changes,
          requireTypedConfirm,
        }
        await auditTool(ctx, "propose_patient_edit", { patientId, changes }, r as Record<string, unknown>, "succeeded")
        return r
      },
    }) as CoreTool,

    send_appointment_reminder: tool({
      description:
        "Send a simple SMS reminder for an appointment. Resolves the patient phone from (a) phone_e164 column, (b) WhatsApp thread / display hint, then (c) the trusted snapshot provided by the client. If no phone is found anywhere, returns `{ ok: false, needsPhone: true, ... }` and the UI renders an inline 'Add phone' card — do **not** re-ask the user in prose when that happens.",
      parameters: z.object({ appointmentId: z.string().uuid() }),
      execute: async ({ appointmentId }) => {
        if (!canUseAdminTool(ctx.role, "send_appointment_reminder")) {
          const r = { ok: false, error: "Forbidden" }
          await auditTool(ctx, "send_appointment_reminder", { appointmentId }, r, "skipped")
          return r
        }
        const { data: appt, error: aErr } = await ctx.supabase
          .from("practice_appointments")
          .select("id, patient_id, appt_date, start_time, patient_name_snapshot, service")
          .eq("id", appointmentId)
          .eq("practice_id", ctx.practiceId)
          .maybeSingle()
        if (aErr || !appt) {
          const r = { ok: false, error: "Appointment not found" }
          await auditTool(ctx, "send_appointment_reminder", { appointmentId }, r, "failed")
          return r
        }
        const pid = appt.patient_id as string | null
        if (!pid) {
          const r = { ok: false, error: "Appointment has no patient" }
          await auditTool(ctx, "send_appointment_reminder", { appointmentId }, r, "failed")
          return r
        }

        let resolvedPhone: string | null = null
        let source: "column" | "resolver" | "snapshot" = "column"

        const { data: pat } = await ctx.supabase
          .from("practice_patients")
          .select("phone_e164")
          .eq("id", pid)
          .eq("practice_id", ctx.practiceId)
          .maybeSingle()
        const col = (pat as { phone_e164?: string | null } | null)?.phone_e164
        if (col && col.trim()) resolvedPhone = col.trim()

        if (!resolvedPhone) {
          const viaResolver = await resolvePatientPhoneE164(ctx.supabase, ctx.practiceId, pid)
          if (viaResolver) {
            resolvedPhone = viaResolver
            source = "resolver"
          }
        }

        if (!resolvedPhone) {
          const snapPhone = ctx.patientSnapshots?.[pid]?.phone
          if (typeof snapPhone === "string" && snapPhone.trim()) {
            resolvedPhone = normalizePhoneE164Za(snapPhone.trim())
            source = "snapshot"
          }
        }

        if (!resolvedPhone) {
          const patientName =
            ctx.patientSnapshots?.[pid]?.name ??
            (appt.patient_name_snapshot as string | null) ??
            "the patient"
          const r = {
            ok: false as const,
            needsPhone: true as const,
            patientId: pid,
            patientName,
            appointmentId,
            apptDate: appt.appt_date as string,
            startTime: appt.start_time as string,
            service: (appt.service as string | null) ?? null,
            error: `No phone on file for ${patientName}.`,
          }
          await auditTool(ctx, "send_appointment_reminder", { appointmentId }, r as Record<string, unknown>, "failed")
          return r
        }

        const normalized = normalizePhoneE164Za(resolvedPhone)
        if (source !== "column") {
          await ctx.supabase
            .from("practice_patients")
            .update({ phone_e164: normalized } as never)
            .eq("id", pid)
            .eq("practice_id", ctx.practiceId)
        }

        const from = await getPracticeMessagingNumber(ctx.practiceId)
        if (!from) {
          const r = { ok: false, error: "Practice messaging number not configured" }
          await auditTool(ctx, "send_appointment_reminder", { appointmentId }, r, "failed")
          return r
        }
        const body = `Reminder: ${appt.patient_name_snapshot ?? "You"} — appointment on ${appt.appt_date} at ${(appt.start_time as string)?.slice(0, 5) ?? ""}. ${appt.service ? `(${appt.service})` : ""} Reply if you need to reschedule.`
        try {
          await sendSmsMessage({ to: normalized, from, body })
          const r = {
            ok: true as const,
            sent: true,
            appointmentId,
            patientId: pid,
            patientName: (appt.patient_name_snapshot as string | null) ?? null,
            apptDate: appt.appt_date as string,
            startTime: appt.start_time as string,
            phoneMasked: maskPhone(normalized),
          }
          await auditTool(ctx, "send_appointment_reminder", { appointmentId }, r as Record<string, unknown>, "succeeded")
          return r
        } catch (e) {
          const r = { ok: false, error: e instanceof Error ? e.message : "SMS failed" }
          await auditTool(ctx, "send_appointment_reminder", { appointmentId }, r, "failed")
          return r
        }
      },
    }) as CoreTool,

    send_patient_sms: tool({
      description: "Send an SMS to a patient from Front Desk (requires patient phone on file).",
      parameters: z.object({
        patientId: z.string().uuid(),
        message: z.string().min(10).max(1600),
      }),
      execute: async ({ patientId, message }) => {
        if (!canUseAdminTool(ctx.role, "send_patient_sms")) {
          const r = { ok: false, error: "Forbidden" }
          await auditTool(ctx, "send_patient_sms", { patientId, message: message.slice(0, 80) }, r, "skipped")
          return r
        }

        let phone: string | null = null
        const { data: pat } = await ctx.supabase
          .from("practice_patients")
          .select("phone_e164, display_name_hint")
          .eq("id", patientId)
          .eq("practice_id", ctx.practiceId)
          .maybeSingle()
        const col = (pat as { phone_e164?: string | null } | null)?.phone_e164
        if (col?.trim()) phone = col.trim()
        if (!phone) phone = await resolvePatientPhoneE164(ctx.supabase, ctx.practiceId, patientId)
        if (!phone) {
          const r = { ok: false, error: "Patient has no phone on file." }
          await auditTool(ctx, "send_patient_sms", { patientId }, r, "failed")
          return r
        }

        const from = await getPracticeMessagingNumber(ctx.practiceId)
        if (!from) {
          const r = { ok: false, error: "Practice messaging number not configured." }
          await auditTool(ctx, "send_patient_sms", { patientId }, r, "failed")
          return r
        }

        const normalized = normalizePhoneE164Za(phone)
        try {
          const { messageSid } = await sendSmsMessage({ to: normalized, from, body: message })
          if (!col?.trim()) {
            await ctx.supabase
              .from("practice_patients")
              .update({ phone_e164: normalized })
              .eq("id", patientId)
              .eq("practice_id", ctx.practiceId)
          }
          const thread = await getOrCreateThread(ctx.practiceId, "rcs", normalized)
          await appendMessage({
            threadId: thread.id,
            practiceId: ctx.practiceId,
            direction: "outbound",
            senderType: "staff",
            body: message,
            providerMessageId: messageSid,
            deliveryStatus: "sent",
          })
          const r = {
            ok: true,
            channel: "sms" as const,
            threadId: thread.id,
            phoneMasked: maskPhone(normalized),
          }
          await auditTool(ctx, "send_patient_sms", { patientId }, r, "succeeded")
          return r
        } catch (e) {
          const r = { ok: false, error: e instanceof Error ? e.message : "SMS failed" }
          await auditTool(ctx, "send_patient_sms", { patientId }, r, "failed")
          return r
        }
      },
    }) as CoreTool,

    send_bulk_sms: tool({
      description: "Open Channels tab for bulk / campaign messaging (owner/admin)",
      parameters: z.object({ message: z.string().min(1).max(1000) }),
      execute: async ({ message }) => {
        if (!canUseAdminTool(ctx.role, "send_bulk_sms")) {
          const r = { ok: false, error: "Forbidden" }
          await auditTool(ctx, "send_bulk_sms", { message: message.slice(0, 80) }, r, "skipped")
          return r
        }
        const r = {
          ok: true,
          clientAction: { type: "navigate", mode: "admin" as const, adminTab: "channels" as const },
          note: "Bulk campaigns are sent from the Channels tab; draft saved in chat context only.",
          draft: message,
        }
        await auditTool(ctx, "send_bulk_sms", { message: message.slice(0, 80) }, r, "succeeded")
        return r
      },
    }) as CoreTool,

    low_stock_report: tool({
      description: "List inventory items at or below minimum stock",
      parameters: z.object({
        thresholdOverride: z.number().int().min(0).optional(),
      }),
      execute: async ({ thresholdOverride }) => {
        if (!canUseAdminTool(ctx.role, "low_stock_report")) {
          const r = { ok: false, error: "Forbidden" }
          await auditTool(ctx, "low_stock_report", { thresholdOverride }, r, "skipped")
          return r
        }
        const { data, error } = await ctx.supabase
          .from("practice_inventory_items")
          .select("id, name, current_stock, min_stock, unit, category")
          .eq("practice_id", ctx.practiceId)
          .order("name", { ascending: true })
          .limit(200)
        const rows = (data ?? []).filter((row) => {
          const min = thresholdOverride ?? row.min_stock ?? 0
          return row.current_stock <= min
        })
        const r = error ? { ok: false, error: error.message } : { ok: true, items: rows }
        await auditTool(ctx, "low_stock_report", { thresholdOverride }, r as Record<string, unknown>, error ? "failed" : "succeeded")
        return r
      },
    }) as CoreTool,

    import_inventory_csv: tool({
      description:
        "Open the Inventory tab and the stock CSV / spreadsheet import dialog so the user can upload inventory in bulk.",
      parameters: z.object({}),
      execute: async () => {
        if (!canUseAdminTool(ctx.role, "import_inventory_csv")) {
          const r = { ok: false, error: "Forbidden" }
          await auditTool(ctx, "import_inventory_csv", {}, r, "skipped")
          return r
        }
        const r = {
          ok: true as const,
          clientAction: { type: "open_inventory_import" as const },
        }
        await auditTool(ctx, "import_inventory_csv", {}, r as Record<string, unknown>, "succeeded")
        return r
      },
    }) as CoreTool,

    add_inventory_item: tool({
      description: "Add a single stock line to practice inventory (medications or consumables).",
      parameters: z.object({
        name: z.string().min(1).max(200),
        nappiCode: z.string().max(32).optional(),
        category: z.string().max(80).optional(),
        unit: z.string().max(40).optional(),
        currentStock: z.number().int().min(0).optional(),
        minStock: z.number().int().min(0).optional(),
        unitPrice: z.number().min(0).optional(),
        costPrice: z.number().min(0).optional(),
        supplier: z.string().max(200).optional(),
      }),
      execute: async (args) => {
        if (!canUseAdminTool(ctx.role, "add_inventory_item")) {
          const r = { ok: false, error: "Forbidden" }
          await auditTool(ctx, "add_inventory_item", args as Record<string, unknown>, r, "skipped")
          return r
        }
        const now = new Date().toISOString()
        const { error } = await ctx.supabase.from("practice_inventory_items").insert({
          practice_id: ctx.practiceId,
          name: args.name.trim(),
          nappi_code: args.nappiCode?.trim() || null,
          category: (args.category?.trim() || "Medications").slice(0, 80),
          unit: (args.unit?.trim() || "unit").slice(0, 40),
          current_stock: args.currentStock ?? 0,
          min_stock: args.minStock ?? 0,
          unit_price: args.unitPrice ?? 0,
          cost_price: args.costPrice ?? null,
          supplier: args.supplier?.trim() || null,
          updated_at: now,
        } as never)
        const r = error
          ? { ok: false as const, error: error.message }
          : { ok: true as const, name: args.name.trim() }
        await auditTool(
          ctx,
          "add_inventory_item",
          args as Record<string, unknown>,
          r as Record<string, unknown>,
          error ? "failed" : "succeeded"
        )
        return r
      },
    }) as CoreTool,

    today_revenue_snapshot: tool({
      description: "Sum succeeded payments recorded today",
      parameters: z.object({}),
      execute: async () => {
        if (!isFrontDesk(ctx.role)) {
          const r = { ok: false, error: "Only billing/front-desk roles" }
          await auditTool(ctx, "today_revenue_snapshot", {}, r, "skipped")
          return r
        }
        const start = new Date()
        start.setHours(0, 0, 0, 0)
        const { data, error } = await ctx.supabase
          .from("practice_payments")
          .select("amount_cents")
          .eq("practice_id", ctx.practiceId)
          .eq("status", "succeeded")
          .gte("created_at", start.toISOString())
        const total = (data ?? []).reduce((s, row) => s + (row.amount_cents ?? 0), 0)
        const r = error ? { ok: false, error: error.message } : { ok: true, totalCents: total, paymentCount: data?.length ?? 0 }
        await auditTool(ctx, "today_revenue_snapshot", {}, r as Record<string, unknown>, error ? "failed" : "succeeded")
        return r
      },
    }) as CoreTool,

    create_invoice: tool({
      description: "Create a draft invoice from an existing claim",
      parameters: z.object({
        claimId: z.string().uuid(),
        billingMode: z.enum(["cash", "card", "eft_instant", "split", "scheme_only"]),
      }),
      execute: async ({ claimId, billingMode }) => {
        if (!isFrontDesk(ctx.role)) {
          const r = { ok: false, error: "Only reception/billing roles can create invoices" }
          await auditTool(ctx, "create_invoice", { claimId, billingMode }, r, "skipped")
          return r
        }
        try {
          const { invoiceId } = await createInvoiceFromClaim(ctx.supabase, {
            practiceId: ctx.practiceId,
            claimId,
            billingMode: billingMode as BillingMode,
            actorUserId: ctx.userId,
          })
          const r = { ok: true, invoiceId }
          await auditTool(ctx, "create_invoice", { claimId, billingMode }, r, "succeeded")
          return r
        } catch (e) {
          const r = { ok: false, error: e instanceof Error ? e.message : "Failed" }
          await auditTool(ctx, "create_invoice", { claimId, billingMode }, r, "failed")
          return r
        }
      },
    }) as CoreTool,

    issue_invoice: tool({
      description: "Issue a draft invoice (generates PDF)",
      parameters: z.object({ invoiceId: z.string().uuid() }),
      execute: async ({ invoiceId }) => {
        if (!isFrontDesk(ctx.role)) {
          const r = { ok: false, error: "Forbidden" }
          await auditTool(ctx, "issue_invoice", { invoiceId }, r, "skipped")
          return r
        }
        const mod = await import("@/lib/billing/invoices")
        try {
          await mod.issueInvoice(ctx.supabase, {
            practiceId: ctx.practiceId,
            invoiceId,
            actorUserId: ctx.userId,
          })
          const r = { ok: true }
          await auditTool(ctx, "issue_invoice", { invoiceId }, r, "succeeded")
          return r
        } catch (e) {
          const r = { ok: false, error: e instanceof Error ? e.message : "Failed" }
          await auditTool(ctx, "issue_invoice", { invoiceId }, r, "failed")
          return r
        }
      },
    }) as CoreTool,

    send_invoice: tool({
      description: "Send invoice SMS pay link (issues first if draft)",
      parameters: z.object({ invoiceId: z.string().uuid() }),
      execute: async ({ invoiceId }) => {
        if (!isFrontDesk(ctx.role)) {
          const r = { ok: false, error: "Forbidden" }
          await auditTool(ctx, "send_invoice", { invoiceId }, r, "skipped")
          return r
        }
        const res = await ctx.fetchBilling(`/api/billing/invoices/${invoiceId}/send`, {
          channels: ["sms"],
          issueFirst: true,
        })
        const j = (await res.json().catch(() => ({}))) as { error?: string; portalUrl?: string }
        const r = res.ok ? { ok: true, portalUrl: j.portalUrl } : { ok: false, error: j.error || res.statusText }
        await auditTool(ctx, "send_invoice", { invoiceId }, r as Record<string, unknown>, res.ok ? "succeeded" : "failed")
        return r
      },
    }) as CoreTool,

    record_payment: tool({
      description: "Record a cash payment on an invoice",
      parameters: z.object({
        invoiceId: z.string().uuid(),
        amountCents: z.number().int().positive(),
      }),
      execute: async ({ invoiceId, amountCents }) => {
        if (!isFrontDesk(ctx.role)) {
          const r = { ok: false, error: "Forbidden" }
          await auditTool(ctx, "record_payment", { invoiceId, amountCents }, r, "skipped")
          return r
        }
        const res = await ctx.fetchBilling(
          `/api/billing/invoices/${invoiceId}/payments`,
          {
            provider: "cash",
            amountCents,
          },
          { "X-Idempotency-Key": `assistant-${invoiceId}-${crypto.randomUUID()}` }
        )
        const j = (await res.json().catch(() => ({}))) as { error?: string }
        const ok = res.ok
        const r = ok ? { ok: true } : { ok: false, error: j.error || res.statusText }
        await auditTool(ctx, "record_payment", { invoiceId, amountCents }, r as Record<string, unknown>, ok ? "succeeded" : "failed")
        return r
      },
    }) as CoreTool,

    get_cash_drawer_status: tool({
      description:
        "Read-only: current cash drawer session and totals. ALWAYS call this before open_cash_shift or close_cash_shift so you know whether a shift is open.",
      parameters: z.object({}),
      execute: async () => {
        if (!canUseAdminTool(ctx.role, "get_cash_drawer_status")) {
          const r = { ok: false, error: "Forbidden" }
          await auditTool(ctx, "get_cash_drawer_status", {}, r, "skipped")
          return r
        }
        const res = await ctx.fetchBillingGet("/api/billing/cash-drawer/status")
        const j = (await res.json().catch(() => ({}))) as Record<string, unknown> & { error?: string }
        const r = res.ok
          ? { ok: true as const, drawer: j }
          : { ok: false as const, error: j.error || res.statusText }
        await auditTool(ctx, "get_cash_drawer_status", {}, r as Record<string, unknown>, res.ok ? "succeeded" : "failed")
        return r
      },
    }) as CoreTool,

    open_cash_shift: tool({
      description: "Open cash drawer shift with opening float (cents)",
      parameters: z.object({ openingFloatCents: z.number().int().min(0) }),
      execute: async ({ openingFloatCents }) => {
        if (!isFrontDesk(ctx.role)) {
          const r = { ok: false, error: "Forbidden" }
          await auditTool(ctx, "open_cash_shift", { openingFloatCents }, r, "skipped")
          return r
        }
        const res = await ctx.fetchBilling("/api/billing/cash-drawer/open", { openingFloatCents })
        const j = (await res.json().catch(() => ({}))) as { error?: string }
        const r = res.ok ? { ok: true } : { ok: false, error: j.error || res.statusText }
        await auditTool(
          ctx,
          "open_cash_shift",
          { openingFloatCents },
          r as Record<string, unknown>,
          res.ok ? "succeeded" : "failed"
        )
        return r
      },
    }) as CoreTool,

    close_cash_shift: tool({
      description: "Close the open cash drawer shift",
      parameters: z.object({
        countedCashCents: z.number().int().min(0),
        notes: z.string().max(2000).optional(),
      }),
      execute: async ({ countedCashCents, notes }) => {
        if (!isFrontDesk(ctx.role)) {
          const r = { ok: false, error: "Forbidden" }
          await auditTool(ctx, "close_cash_shift", { countedCashCents, notes }, r, "skipped")
          return r
        }
        const res = await ctx.fetchBilling("/api/billing/cash-drawer/close", {
          countedCashCents,
          notes: notes ?? "",
        })
        const j = (await res.json().catch(() => ({}))) as { error?: string }
        const r = res.ok ? { ok: true } : { ok: false, error: j.error || res.statusText }
        await auditTool(
          ctx,
          "close_cash_shift",
          { countedCashCents, notes },
          r as Record<string, unknown>,
          res.ok ? "succeeded" : "failed"
        )
        return r
      },
    }) as CoreTool,

    submit_claim: tool({
      description: "Focus claim submission UI for a patient (client-side)",
      parameters: z.object({ patientId: z.string().uuid() }),
      execute: async ({ patientId }) => {
        if (!canUseAdminTool(ctx.role, "submit_claim")) {
          const r = { ok: false, error: "Forbidden" }
          await auditTool(ctx, "submit_claim", { patientId }, r, "skipped")
          return r
        }
        const r = { ok: true, clientAction: { type: "submit_claim", patientId } }
        await auditTool(ctx, "submit_claim", { patientId }, r, "succeeded")
        return r
      },
    }) as CoreTool,
  }
}

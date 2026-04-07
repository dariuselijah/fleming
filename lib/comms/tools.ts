import { createAdminClient } from "@/lib/supabase/admin"
import type { PracticeHours, PracticeService, PracticeFAQ } from "./types"

const supabase = () => createAdminClient()

export async function checkAvailability(opts: {
  practiceId: string
  date?: string
  providerId?: string
  serviceId?: string
  daysAhead?: number
}): Promise<{ date: string; slots: { startTime: string; endTime: string; providerId?: string; providerName?: string }[] }[]> {
  const db = supabase()
  const daysToCheck = opts.daysAhead ?? 3
  const results: { date: string; slots: { startTime: string; endTime: string; providerId?: string; providerName?: string }[] }[] = []

  const { data: hours } = await db
    .from("practice_hours")
    .select("*")
    .eq("practice_id", opts.practiceId)

  const { data: staff } = await db
    .from("practice_staff")
    .select("id, display_name, role")
    .eq("practice_id", opts.practiceId)

  const providers = (staff || []).filter(
    (s) => s.role === "physician" || s.role === "owner"
  )

  let service: { duration_minutes: number } | null = null
  if (opts.serviceId) {
    const { data } = await db
      .from("practice_services")
      .select("duration_minutes")
      .eq("id", opts.serviceId)
      .single()
    service = data
  }
  const slotDuration = service?.duration_minutes || 30

  const startDate = opts.date ? new Date(opts.date) : new Date()
  for (let d = 0; d < daysToCheck; d++) {
    const checkDate = new Date(startDate)
    checkDate.setDate(checkDate.getDate() + d)
    const dayOfWeek = checkDate.getDay()
    const dateStr = checkDate.toISOString().split("T")[0]

    const dayHours = (hours || []).find((h) => h.day_of_week === dayOfWeek)
    if (!dayHours || dayHours.is_closed) continue

    const { data: booked } = await db
      .from("practice_appointments")
      .select("start_time, end_time, provider_staff_id")
      .eq("practice_id", opts.practiceId)
      .eq("appt_date", dateStr)
      .in("status", ["booked", "confirmed", "checked_in", "in_progress"])

    const bookedSet = new Set(
      (booked || []).map((a) => `${a.start_time}-${a.provider_staff_id || "any"}`)
    )

    const slots: { startTime: string; endTime: string; providerId?: string; providerName?: string }[] = []
    const openMinutes = timeToMinutes(dayHours.open_time)
    const closeMinutes = timeToMinutes(dayHours.close_time)

    for (let m = openMinutes; m + slotDuration <= closeMinutes; m += slotDuration) {
      const st = minutesToTime(m)
      const et = minutesToTime(m + slotDuration)

      if (providers.length > 0) {
        for (const prov of providers) {
          if (opts.providerId && prov.id !== opts.providerId) continue
          if (!bookedSet.has(`${st}-${prov.id}`)) {
            slots.push({ startTime: st, endTime: et, providerId: prov.id, providerName: prov.display_name })
          }
        }
      } else {
        if (!bookedSet.has(`${st}-any`)) {
          slots.push({ startTime: st, endTime: et })
        }
      }
    }

    if (slots.length > 0) {
      results.push({ date: dateStr, slots: slots.slice(0, 8) })
    }
  }

  return results
}

export async function bookAppointment(opts: {
  practiceId: string
  patientId?: string
  patientName: string
  date: string
  startTime: string
  endTime?: string
  durationMinutes?: number
  service?: string
  reason?: string
  providerStaffId?: string
  paymentType?: string
}): Promise<{ id: string; success: boolean; message: string }> {
  const db = supabase()
  const duration = opts.durationMinutes || 30
  const endTime = opts.endTime || minutesToTime(timeToMinutes(opts.startTime) + duration)

  // Conflict check
  const { data: conflicts } = await db
    .from("practice_appointments")
    .select("id")
    .eq("practice_id", opts.practiceId)
    .eq("appt_date", opts.date)
    .eq("start_time", opts.startTime)
    .in("status", ["booked", "confirmed", "checked_in", "in_progress"])
    .limit(1)

  if (conflicts && conflicts.length > 0) {
    return { id: "", success: false, message: "That time slot is no longer available. Please choose another." }
  }

  const hourVal = parseInt(opts.startTime.split(":")[0])
  const minuteVal = parseInt(opts.startTime.split(":")[1])

  const { data, error } = await db
    .from("practice_appointments")
    .insert({
      practice_id: opts.practiceId,
      patient_id: opts.patientId || null,
      patient_name_snapshot: opts.patientName,
      provider_staff_id: opts.providerStaffId || null,
      appt_date: opts.date,
      start_time: opts.startTime,
      end_time: endTime,
      hour_val: hourVal,
      minute_val: minuteVal,
      duration_minutes: duration,
      reason: opts.reason,
      service: opts.service,
      status: "booked",
      payment_type: opts.paymentType || "cash",
    })
    .select("id")
    .single()

  if (error) {
    return { id: "", success: false, message: `Booking failed: ${error.message}` }
  }

  return {
    id: data.id,
    success: true,
    message: `Appointment booked for ${opts.date} at ${opts.startTime}`,
  }
}

export async function getHours(practiceId: string): Promise<PracticeHours[]> {
  const { data } = await supabase()
    .from("practice_hours")
    .select("*")
    .eq("practice_id", practiceId)
    .order("day_of_week")

  return (data || []).map((r) => ({
    id: r.id,
    practiceId: r.practice_id,
    dayOfWeek: r.day_of_week,
    openTime: r.open_time,
    closeTime: r.close_time,
    isClosed: r.is_closed,
    label: r.label || undefined,
  }))
}

export async function getServices(practiceId: string): Promise<PracticeService[]> {
  const { data } = await supabase()
    .from("practice_services")
    .select("*")
    .eq("practice_id", practiceId)
    .eq("active", true)
    .order("name")

  return (data || []).map((r) => ({
    id: r.id,
    practiceId: r.practice_id,
    name: r.name,
    description: r.description || undefined,
    durationMinutes: r.duration_minutes,
    fee: r.fee ? Number(r.fee) : undefined,
    category: r.category || undefined,
    requiresReferral: r.requires_referral,
    preparationInstructions: r.preparation_instructions || undefined,
    active: r.active,
  }))
}

export async function getFAQs(practiceId: string, question?: string): Promise<PracticeFAQ[]> {
  const db = supabase()
  let query = db
    .from("practice_faqs")
    .select("*")
    .eq("practice_id", practiceId)
    .eq("active", true)
    .order("sort_order")

  const { data } = await query

  if (!data) return []

  const faqs: PracticeFAQ[] = data.map((r) => ({
    id: r.id,
    practiceId: r.practice_id,
    category: r.category as PracticeFAQ["category"],
    question: r.question,
    answer: r.answer,
    keywords: r.keywords || [],
    sortOrder: r.sort_order,
    active: r.active,
  }))

  if (!question) return faqs

  // Simple keyword matching
  const words = question.toLowerCase().split(/\s+/)
  return faqs
    .map((faq) => {
      const score = words.reduce((acc, w) => {
        if (faq.question.toLowerCase().includes(w)) acc += 2
        if (faq.answer.toLowerCase().includes(w)) acc += 1
        if (faq.keywords.some((k) => k.toLowerCase().includes(w))) acc += 3
        return acc
      }, 0)
      return { faq, score }
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map((x) => x.faq)
}

export async function createPatientRecord(opts: {
  practiceId: string
  displayNameHint: string
  phone?: string
}): Promise<string> {
  const db = supabase()
  const hint = opts.phone ? `${opts.displayNameHint} | ${opts.phone}` : opts.displayNameHint

  const { data, error } = await db
    .from("practice_patients")
    .insert({
      practice_id: opts.practiceId,
      display_name_hint: hint,
      profile_version: 1,
    })
    .select("id")
    .single()

  if (error) throw new Error(`Failed to create patient: ${error.message}`)
  return data.id
}

export async function getPracticeName(practiceId: string): Promise<string> {
  const { data } = await supabase()
    .from("practices")
    .select("name")
    .eq("id", practiceId)
    .single()
  return data?.name || "the practice"
}

function timeToMinutes(t: string): number {
  const [h, m] = t.split(":").map(Number)
  return h * 60 + m
}

function minutesToTime(m: number): string {
  const h = Math.floor(m / 60)
  const min = m % 60
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`
}

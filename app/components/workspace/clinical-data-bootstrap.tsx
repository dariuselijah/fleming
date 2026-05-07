"use client"

import { useUser } from "@/lib/user-store/provider"
import { fetchClient } from "@/lib/fetch"
import { createClient } from "@/lib/supabase/client"
import { useAuthContext } from "@/lib/auth/provider"
import {
  decryptPatientProfile,
  usePracticeCrypto,
} from "@/lib/clinical-workspace/practice-crypto-context"
import { useWorkspaceStore } from "@/lib/clinical-workspace"
import { fetchPracticeClaimsForWorkspace } from "@/lib/clinical-workspace/refresh-practice-claims"
import type {
  AdminNotification,
  AdminTab,
  InboxMessage,
  InventoryItem,
  PracticeAppointment,
  PracticeBusinessHour,
  PracticeFlowEntry,
  PracticePatient,
  PracticeProvider,
} from "@/lib/clinical-workspace/types"
import { useEffect } from "react"

/** Resolve practice id: first membership row, else POST bootstrap. */
export function PracticeIdBootstrap() {
  const { user } = useUser()
  const auth = useAuthContext()
  const { practiceId, setPracticeId } = usePracticeCrypto()

  useEffect(() => {
    if (!user?.id) return
    if (auth.activePracticeId && practiceId !== auth.activePracticeId) {
      setPracticeId(auth.activePracticeId)
      return
    }
    if (practiceId) return
    let cancelled = false
    ;(async () => {
      const res = await fetchClient("/api/clinical/practice/bootstrap", {
        method: "POST",
        body: JSON.stringify({ name: "My practice" }),
      })
      if (cancelled) return
      if (!res.ok) return
      const j = (await res.json()) as { practiceId?: string }
      if (j.practiceId) {
        await auth.setActivePractice(j.practiceId)
        setPracticeId(j.practiceId)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [auth, user?.id, practiceId, setPracticeId])

  return null
}

function mapAppointmentRow(r: Record<string, unknown>): PracticeAppointment {
  return {
    id: String(r.id),
    patientId: r.patient_id ? String(r.patient_id) : "",
    patientName: String(r.patient_name_snapshot ?? ""),
    providerId: r.provider_staff_id ? String(r.provider_staff_id) : "",
    date: String(r.appt_date ?? ""),
    startTime: String(r.start_time ?? ""),
    endTime: String(r.end_time ?? ""),
    hour: Number(r.hour_val ?? 0),
    minute: Number(r.minute_val ?? 0),
    duration: Number(r.duration_minutes ?? 30),
    reason: r.reason ? String(r.reason) : undefined,
    service: r.service ? String(r.service) : undefined,
    status: (r.status as PracticeAppointment["status"]) ?? "booked",
    paymentType: (r.payment_type as PracticeAppointment["paymentType"]) ?? "cash",
    medicalAid: r.medical_aid ? String(r.medical_aid) : undefined,
    memberNumber: r.member_number ? String(r.member_number) : undefined,
    notes: r.notes ? String(r.notes) : undefined,
    icdCodes: Array.isArray(r.icd_codes) ? (r.icd_codes as string[]) : undefined,
    totalFee: r.total_fee != null ? Number(r.total_fee) : undefined,
    linkedConsultId: r.linked_consult_id ? String(r.linked_consult_id) : undefined,
  }
}

function mapInventoryRow(r: Record<string, unknown>): InventoryItem {
  return {
    id: String(r.id),
    name: String(r.name ?? ""),
    nappiCode: r.nappi_code ? String(r.nappi_code) : undefined,
    category: String(r.category ?? ""),
    currentStock: Number(r.current_stock ?? 0),
    minStock: Number(r.min_stock ?? 0),
    unit: String(r.unit ?? ""),
    unitPrice: Number(r.unit_price ?? 0),
    costPrice: r.cost_price != null ? Number(r.cost_price) : undefined,
    supplier: r.supplier ? String(r.supplier) : undefined,
    expiresAt: r.expires_at ? String(r.expires_at) : undefined,
    lastRestocked: r.last_restocked ? String(r.last_restocked) : new Date().toISOString().slice(0, 10),
  }
}

function mapInboxRow(r: Record<string, unknown>): InboxMessage {
  return {
    id: String(r.id),
    channel: r.channel as InboxMessage["channel"],
    from: String(r.from_label ?? ""),
    preview: String(r.preview ?? ""),
    timestamp: String(r.message_at ?? r.created_at ?? new Date().toISOString()),
    read: Boolean(r.read_flag),
    patientId: r.patient_id ? String(r.patient_id) : undefined,
  }
}

function mapNotifRow(r: Record<string, unknown>): AdminNotification {
  const tab = r.action_tab ? (String(r.action_tab) as AdminTab) : undefined
  return {
    id: String(r.id),
    type: r.type as AdminNotification["type"],
    title: String(r.title ?? ""),
    detail: r.detail ? String(r.detail) : undefined,
    timestamp: String(r.notif_at ?? r.created_at ?? new Date().toISOString()),
    read: Boolean(r.read_flag),
    actionRoute:
      tab && ["inbox", "calendar", "billing", "inventory", "analytics", "patients", "channels"].includes(tab)
        ? { tab, entityId: r.action_entity_id ? String(r.action_entity_id) : undefined }
        : undefined,
  }
}

function mapFlowRow(r: Record<string, unknown>): PracticeFlowEntry {
  return {
    patientId: r.patient_id ? String(r.patient_id) : "",
    patientName: String(r.patient_name_snapshot ?? ""),
    status: r.status as PracticeFlowEntry["status"],
    doctorId: r.doctor_staff_id ? String(r.doctor_staff_id) : undefined,
    roomNumber: r.room_number ? String(r.room_number) : undefined,
    appointmentTime: r.appointment_time ? new Date(String(r.appointment_time)) : undefined,
    checkInTime: r.check_in_time ? new Date(String(r.check_in_time)) : undefined,
    startTime: r.start_time ? new Date(String(r.start_time)) : undefined,
    endTime: r.end_time ? new Date(String(r.end_time)) : undefined,
  }
}

function mapStaffRow(r: Record<string, unknown>): PracticeProvider {
  return {
    id: String(r.id),
    name: String(r.display_name ?? ""),
    specialty: undefined,
    role: r.role as PracticeProvider["role"],
    credentialStatus: r.credential_status as PracticeProvider["credentialStatus"],
    email: r.email ? String(r.email) : undefined,
  }
}

function mapPracticeHourRow(r: Record<string, unknown>): PracticeBusinessHour {
  return {
    dayOfWeek: Number(r.day_of_week ?? 0),
    openTime: String(r.open_time ?? "09:00"),
    closeTime: String(r.close_time ?? "17:00"),
    isClosed: Boolean(r.is_closed),
  }
}

export function ClinicalDataBootstrap() {
  const { user } = useUser()
  const { practiceId, dekKey, unlocked } = usePracticeCrypto()

  useEffect(() => {
    if (!user?.id || !practiceId) return
    const supabase = createClient()
    if (!supabase) return
    let cancelled = false
    ;(async () => {
      try {
        const { data: appts } = await supabase
          .from("practice_appointments")
          .select("*")
          .eq("practice_id", practiceId)
          .order("appt_date", { ascending: true })
        const { data: inv } = await supabase
          .from("practice_inventory_items")
          .select("*")
          .eq("practice_id", practiceId)
        const { data: inbox } = await supabase
          .from("practice_inbox_messages")
          .select("*")
          .eq("practice_id", practiceId)
          .order("message_at", { ascending: false })
        const { data: notifs } = await supabase
          .from("practice_admin_notifications")
          .select("*")
          .eq("practice_id", practiceId)
          .order("notif_at", { ascending: false })
        const { data: flow } = await supabase
          .from("practice_flow_entries")
          .select("*")
          .eq("practice_id", practiceId)
          .order("updated_at", { ascending: false })
        let { data: staff } = await supabase.from("practice_staff").select("*").eq("practice_id", practiceId)

        if (!cancelled && (!staff || staff.length === 0)) {
          const displayName =
            user.display_name?.trim() || user.email?.split("@")[0] || "Provider"
          const { data: inserted } = await supabase
            .from("practice_staff")
            .insert({
              practice_id: practiceId,
              linked_user_id: user.id,
              display_name: displayName,
              role: "physician",
            })
            .select("*")
          if (inserted?.length) staff = inserted
        }

        const { data: hrs } = await supabase.from("practice_hours").select("*").eq("practice_id", practiceId)

        const claims = await fetchPracticeClaimsForWorkspace(practiceId)

        if (cancelled) return
        useWorkspaceStore.setState({
          appointments: (appts ?? []).map((r) => mapAppointmentRow(r as Record<string, unknown>)),
          inventory: (inv ?? []).map((r) => mapInventoryRow(r as Record<string, unknown>)),
          inboxMessages: (inbox ?? []).map((r) => mapInboxRow(r as Record<string, unknown>)),
          notifications: (notifs ?? []).map((r) => mapNotifRow(r as Record<string, unknown>)),
          practiceFlow: (flow ?? []).map((r) => mapFlowRow(r as Record<string, unknown>)),
          practiceProviders: (staff ?? []).map((r) => mapStaffRow(r as Record<string, unknown>)),
          practiceHours: (hrs ?? []).map((r) => mapPracticeHourRow(r as Record<string, unknown>)),
          claims,
        })
      } catch (e) {
        console.warn("[ClinicalDataBootstrap] admin lists", e)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [user?.id, practiceId, user?.display_name, user?.email])

  useEffect(() => {
    if (!user?.id || !practiceId || !unlocked || !dekKey) return
    const supabase = createClient()
    if (!supabase) return
    let cancelled = false
    ;(async () => {
      try {
        const { data: rows } = await supabase
          .from("practice_patients")
          .select("id, profile_ciphertext, profile_iv, display_name_hint")
          .eq("practice_id", practiceId)
        const patients: PracticePatient[] = []
        for (const row of rows ?? []) {
          const r = row as Record<string, unknown>
          if (!r.profile_ciphertext || !r.profile_iv) {
            if (r.display_name_hint) {
              patients.push({
                id: String(r.id),
                name: String(r.display_name_hint),
                medicalAidStatus: "unknown",
                outstandingBalance: 0,
                registeredAt: new Date().toISOString().slice(0, 10),
              })
            }
            continue
          }
          try {
            const profile = await decryptPatientProfile<Partial<PracticePatient>>(
              dekKey,
              String(r.profile_ciphertext),
              String(r.profile_iv)
            )
            patients.push({
              id: String(r.id),
              name: String(profile.name ?? r.display_name_hint ?? "Patient"),
              idNumber: profile.idNumber,
              dateOfBirth: profile.dateOfBirth,
              age: profile.age,
              sex: profile.sex,
              phone: profile.phone,
              email: profile.email,
              address: profile.address,
              emergencyContact: profile.emergencyContact,
              medicalAidStatus: profile.medicalAidStatus ?? "unknown",
              medicalAidScheme: profile.medicalAidScheme,
              medicalAidSchemeCode: profile.medicalAidSchemeCode,
              memberNumber: profile.memberNumber,
              dependentCode: profile.dependentCode,
              mainMemberName: profile.mainMemberName,
              mainMemberId: profile.mainMemberId,
              chronicConditions: profile.chronicConditions,
              allergies: profile.allergies,
              currentMedications: profile.currentMedications,
              lastVisit: profile.lastVisit,
              outstandingBalance: profile.outstandingBalance ?? 0,
              registeredAt: profile.registeredAt ?? new Date().toISOString().slice(0, 10),
              profileIncomplete: profile.profileIncomplete,
            })
          } catch {
            /* skip row */
          }
        }
        if (!cancelled) useWorkspaceStore.setState({ patients })
      } catch (e) {
        console.warn("[ClinicalDataBootstrap] patients", e)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [user?.id, practiceId, unlocked, dekKey])

  return null
}

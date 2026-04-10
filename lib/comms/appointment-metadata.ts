import { createAdminClient } from "@/lib/supabase/admin"

export async function mergePracticeAppointmentMetadata(
  appointmentId: string,
  patch: Record<string, unknown>
): Promise<void> {
  const db = createAdminClient()
  const { data: row } = await db
    .from("practice_appointments")
    .select("metadata")
    .eq("id", appointmentId)
    .single()
  const prev = (row?.metadata as Record<string, unknown>) || {}
  await db
    .from("practice_appointments")
    .update({
      metadata: { ...prev, ...patch },
      updated_at: new Date().toISOString(),
    })
    .eq("id", appointmentId)
}

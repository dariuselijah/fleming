import { validateUserIdentity } from "@/lib/server/api"
import { checkUsageByModel } from "@/lib/usage"
import type { SupportedModel } from "@/lib/openproviders/types"
import { isPracticePatientUuid } from "@/lib/clinical-workspace/clinical-uuid"

type CreateChatInput = {
  userId: string
  title?: string
  model: SupportedModel
  isAuthenticated: boolean
  projectId?: string
  /** When set, this chat is scoped to a clinical workspace patient (one per user+patient). */
  patientId?: string
}

export async function createChatInDb({
  userId,
  title,
  model,
  isAuthenticated,
  projectId,
  patientId,
}: CreateChatInput) {
  if (patientId && !isPracticePatientUuid(patientId)) {
    throw new Error("patientId must be a UUID for practice patient-scoped chats")
  }

  const supabase = await validateUserIdentity(userId, isAuthenticated)
  if (!supabase) {
    return {
      id: crypto.randomUUID(),
      user_id: userId,
      title,
      model,
      public: true,
      patient_id: patientId ?? null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }
  }

  await checkUsageByModel(supabase, userId, model, isAuthenticated)

  const insertData: {
    user_id: string
    title: string
    model: SupportedModel
    project_id?: string
    patient_id?: string
  } = {
    user_id: userId,
    title: title || "New Chat",
    model,
  }

  if (projectId) {
    insertData.project_id = projectId
  }
  if (patientId) {
    if (!isPracticePatientUuid(patientId)) {
      throw new Error("patientId must be a UUID for practice patient-scoped chats")
    }
    insertData.patient_id = patientId
  }

  const { data, error } = await supabase
    .from("chats")
    .insert(insertData)
    .select("*")
    .single()

  if (error || !data) {
    console.error("Error creating chat:", error)
    const err = new Error(
      error?.message || "Failed to create chat in database"
    ) as Error & { pgCode?: string }
    if (error?.code) err.pgCode = error.code
    throw err
  }

  return data
}

import { createChatInDb } from "./api"
import { isPracticePatientUuid } from "@/lib/clinical-workspace/clinical-uuid"

export async function POST(request: Request) {
  try {
    const { userId, title, model, isAuthenticated, projectId, patientId } =
      await request.json()

    if (!userId) {
      return new Response(JSON.stringify({ error: "Missing userId" }), {
        status: 400,
      })
    }

    const trimmedPatient =
      typeof patientId === "string" && patientId.trim().length > 0
        ? patientId.trim()
        : undefined
    if (trimmedPatient && !isPracticePatientUuid(trimmedPatient)) {
      return new Response(
        JSON.stringify({
          error: "patientId must be a UUID for practice patient-scoped chats",
        }),
        { status: 422 }
      )
    }

    const chat = await createChatInDb({
      userId,
      title,
      model,
      isAuthenticated,
      projectId,
      patientId: trimmedPatient,
    })

    return new Response(JSON.stringify({ chat }), { status: 200 })
  } catch (err: unknown) {
    console.error("Error in create-chat endpoint:", err)

    if (err instanceof Error && err.message === "DAILY_LIMIT_REACHED") {
      return new Response(
        JSON.stringify({ error: err.message, code: "DAILY_LIMIT_REACHED" }),
        { status: 403 }
      )
    }

    const msg = err instanceof Error ? err.message : String(err)
    const pgCode =
      typeof err === "object" &&
      err !== null &&
      "pgCode" in err &&
      typeof (err as { pgCode: unknown }).pgCode === "string"
        ? (err as { pgCode: string }).pgCode
        : undefined

    if (
      pgCode === "23505" ||
      msg.includes("chats_user_id_patient_id_key") ||
      msg.includes("duplicate key value violates unique constraint")
    ) {
      return new Response(
        JSON.stringify({
          error:
            "Only one consult chat per patient is allowed with your current database rules. Either open the existing chat from the Consults bar, or apply the migration that drops the unique index: supabase/migrations/20260405230000_chats_multiple_per_patient.sql",
          code: "PATIENT_CHAT_UNIQUE",
        }),
        { status: 409 }
      )
    }

    return new Response(
      JSON.stringify({
        error: msg || "Internal server error",
      }),
      { status: 500 }
    )
  }
}

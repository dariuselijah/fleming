import { createClient } from "@/lib/supabase/server"
import { generateText } from "ai"
import { openai } from "@ai-sdk/openai"
import { NextResponse } from "next/server"

export const runtime = "nodejs"

/**
 * Generates a short AI title from recent messages and updates `chats.title`.
 */
export async function POST(
  _req: Request,
  context: { params: Promise<{ chatId: string }> }
) {
  const supabase = await createClient()
  if (!supabase) {
    return NextResponse.json({ error: "Service unavailable" }, { status: 500 })
  }

  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser()
  if (authErr || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { chatId } = await context.params
  if (!chatId?.trim()) {
    return NextResponse.json({ error: "chatId required" }, { status: 400 })
  }

  const { data: chat, error: chatErr } = await supabase
    .from("chats")
    .select("id, user_id, title, patient_id")
    .eq("id", chatId)
    .maybeSingle()

  if (chatErr || !chat || chat.user_id !== user.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }

  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json({ error: "OPENAI_API_KEY not configured" }, { status: 503 })
  }

  const { data: msgRows, error: msgErr } = await supabase
    .from("messages")
    .select("role, content")
    .eq("chat_id", chatId)
    .order("created_at", { ascending: true })
    .limit(30)

  if (msgErr) {
    return NextResponse.json({ error: msgErr.message }, { status: 500 })
  }

  const lines = (msgRows ?? [])
    .filter((m) => m.role === "user" || m.role === "assistant")
    .map((m) => {
      const body = (m.content ?? "").trim().slice(0, 800)
      return `${m.role}: ${body}`
    })
    .filter((l) => l.length > 8)

  if (lines.length < 2) {
    return NextResponse.json({ skipped: true, reason: "not_enough_messages" })
  }

  const transcript = lines.join("\n")

  const { text } = await generateText({
    model: openai("gpt-4o-mini"),
    system:
      "You name clinical consult chat threads. Reply with a short title only: max 6 words, no quotation marks, professional tone.",
    prompt: `Suggest a concise thread title for this exchange:\n\n${transcript}`,
  })

  const title = text
    .trim()
    .replace(/^["'\s]+|["'\s]+$/g, "")
    .slice(0, 120)
  if (!title) {
    return NextResponse.json({ error: "empty_title" }, { status: 422 })
  }

  const { error: upErr } = await supabase
    .from("chats")
    .update({ title, updated_at: new Date().toISOString() })
    .eq("id", chatId)
    .eq("user_id", user.id)

  if (upErr) {
    return NextResponse.json({ error: upErr.message }, { status: 500 })
  }

  return NextResponse.json({ title })
}

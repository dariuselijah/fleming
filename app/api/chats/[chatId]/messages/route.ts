import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { normalizeStoredMessageRow } from "@/lib/chat-store/messages/normalize"

type Params = {
  params: Promise<{ chatId: string }>
}

export async function GET(_: Request, context: Params) {
  const noStoreHeaders = {
    "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
    Pragma: "no-cache",
    Expires: "0",
  }

  try {
    const { chatId } = await context.params
    if (!chatId) {
      return NextResponse.json({ error: "Missing chatId" }, { status: 400, headers: noStoreHeaders })
    }

    const supabase = await createClient()
    if (!supabase) {
      return NextResponse.json({ error: "Supabase unavailable" }, { status: 500, headers: noStoreHeaders })
    }

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: noStoreHeaders })
    }

    const { data: chat, error: chatError } = await supabase
      .from("chats")
      .select("id")
      .eq("id", chatId)
      .eq("user_id", user.id)
      .maybeSingle()

    if (chatError) {
      return NextResponse.json({ error: "Failed to validate chat" }, { status: 500, headers: noStoreHeaders })
    }

    if (!chat) {
      return NextResponse.json({ error: "Chat not found" }, { status: 404, headers: noStoreHeaders })
    }

    const { data, error } = await supabase
      .from("messages")
      .select(
        "id, content, content_iv, role, experimental_attachments, created_at, parts, message_group_id, model"
      )
      .eq("chat_id", chatId)
      .order("created_at", { ascending: true })

    if (error) {
      return NextResponse.json({ error: "Failed to load messages" }, { status: 500, headers: noStoreHeaders })
    }

    const messages = Array.isArray(data)
      ? data.map((row) => normalizeStoredMessageRow(row as any))
      : []

    return NextResponse.json({ messages }, { headers: noStoreHeaders })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load messages" },
      { status: 500, headers: noStoreHeaders }
    )
  }
}

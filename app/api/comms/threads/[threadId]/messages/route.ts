import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ threadId: string }> }
) {
  try {
    const { threadId } = await params
    const supabase = await createClient()
    if (!supabase) return NextResponse.json({ error: "Unavailable" }, { status: 500 })

    const { data: { user }, error: authErr } = await supabase.auth.getUser()
    if (authErr || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const limit = parseInt(new URL(req.url).searchParams.get("limit") || "50")

    const { data, error } = await supabase
      .from("thread_messages")
      .select("*")
      .eq("thread_id", threadId)
      .order("created_at", { ascending: true })
      .limit(limit)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    // Mark thread as read
    await supabase
      .from("conversation_threads")
      .update({ unread_count: 0 })
      .eq("id", threadId)

    const messages = (data || []).map((m) => ({
      id: m.id,
      direction: m.direction,
      senderType: m.sender_type,
      contentType: m.content_type,
      body: m.body,
      mediaUrl: m.media_url,
      mediaMimeType: m.media_mime_type,
      mediaStoragePath: m.media_storage_path,
      deliveryStatus: m.delivery_status,
      agentToolCalls: m.agent_tool_calls,
      createdAt: m.created_at,
    }))

    return NextResponse.json({ messages })
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}

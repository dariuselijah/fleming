import { createClient } from "@/lib/supabase/server"
import { NextRequest, NextResponse } from "next/server"

export async function POST(request: NextRequest) {
  try {
    const { chatId, userId } = await request.json()

    if (!chatId || !userId) {
      return NextResponse.json({ error: "chatId and userId are required" }, { status: 400 })
    }

    const supabase = await createClient()
    if (!supabase) {
      return NextResponse.json({ error: "Supabase not available" }, { status: 500 })
    }

    // Verify user is authenticated
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Skip database query for temporary chats
    const isTemporaryChat = chatId.startsWith('temp-chat-')
    
    if (isTemporaryChat) {
      console.log(`Skipping database query for temporary chat: ${chatId}`)
      return NextResponse.json({
        success: true,
        attachments: []
      })
    }

    // Fetch attachments from database
    const { data, error } = await supabase
      .from("chat_attachments")
      .select("*")
      .eq("chat_id", chatId)
      .eq("user_id", userId)
      .order("created_at", { ascending: true })

    if (error) {
      console.error("Error fetching attachments:", error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    const attachments = []

    for (const record of data || []) {
      try {
        // Generate a fresh signed URL for each file
        const { data: signedUrlData, error: signedUrlError } = await supabase.storage
          .from("chat-attachments")
          .createSignedUrl(record.file_url, 3600)

        if (signedUrlError) {
          console.error(`Error generating signed URL for ${record.file_name}:`, signedUrlError)
          continue
        }

        attachments.push({
          name: record.file_name || "Unknown file",
          contentType: record.file_type || "application/octet-stream",
          url: signedUrlData.signedUrl,
          filePath: record.file_url
        })
      } catch (error) {
        console.error(`Error processing attachment ${record.file_name}:`, error)
      }
    }

    return NextResponse.json({
      success: true,
      attachments
    })

  } catch (error) {
    console.error("Get attachments error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
} 
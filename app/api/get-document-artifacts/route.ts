import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { validateUserIdentity } from "@/lib/server/api"

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const chatId = searchParams.get('chatId')
    const userId = searchParams.get('userId')
    const isAuthenticated = searchParams.get('isAuthenticated') === 'true'

    if (!chatId || !userId) {
      return NextResponse.json({ 
        error: "Missing required fields: chatId, userId" 
      }, { status: 400 })
    }

    // Validate user identity
    const supabase = await validateUserIdentity(userId, isAuthenticated)
    if (!supabase) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Retrieve document artifacts for the chat
    const { data: artifacts, error: fetchError } = await supabase
      .from('document_artifacts')
      .select('*')
      .eq('chat_id', chatId)
      .eq('user_id', userId)
      .order('created_at', { ascending: false })

    if (fetchError) {
      console.error("Error fetching artifacts:", fetchError)
      return NextResponse.json({ 
        error: "Failed to fetch document artifacts" 
      }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      artifacts: artifacts || []
    })

  } catch (error) {
    console.error("Document artifacts fetch error:", error)
    return NextResponse.json({ 
      error: "Failed to fetch document artifacts",
      details: error instanceof Error ? error.message : "Unknown error"
    }, { status: 500 })
  }
}

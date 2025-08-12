import { NextRequest, NextResponse } from "next/server"
import { validateUserIdentity } from "@/lib/server/api"

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const chatId = searchParams.get('chatId')
    const userId = searchParams.get('userId')
    const isAuthenticated = searchParams.get('isAuthenticated') === 'true'

    if (!chatId || !userId) {
      return NextResponse.json(
        { error: "Missing required parameters: chatId, userId" },
        { status: 400 }
      )
    }

    // Validate user identity
    const supabase = await validateUserIdentity(userId, isAuthenticated)
    if (!supabase) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Fetch AI artifacts for the specific chat and user
    const { data: artifacts, error: fetchError } = await supabase
      .from('ai_artifacts')
      .select('*')
      .eq('chat_id', chatId)
      .eq('user_id', userId)
      .order('created_at', { ascending: false })

    if (fetchError) {
      console.error("Error fetching AI artifacts:", fetchError)
      
      // Check if it's a missing table error
      if (fetchError.code === '42P01') {
        console.error("❌ CRITICAL: Database table 'ai_artifacts' does not exist!")
        console.error("Please run the SQL migration in your Supabase dashboard")
        return NextResponse.json(
          { 
            error: "Database table missing. Please run the migration first.",
            details: "Table 'ai_artifacts' does not exist. Run create-artifact-tables.sql in Supabase SQL Editor."
          },
          { status: 500 }
        )
      }
      
      return NextResponse.json(
        { error: "Failed to fetch AI artifacts" },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      artifacts: artifacts || []
    })

  } catch (error) {
    console.error("Error fetching AI artifacts:", error)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}

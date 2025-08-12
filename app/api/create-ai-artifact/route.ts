import { NextRequest, NextResponse } from "next/server"
import { validateUserIdentity } from "@/lib/server/api"

export async function POST(request: NextRequest) {
  try {
    const { chatId, userId, title, content, contentType = "text", metadata = {}, isAuthenticated = true } = await request.json()

    if (!chatId || !userId || !title || !content) {
      return NextResponse.json(
        { error: "Missing required fields: chatId, userId, title, content" },
        { status: 400 }
      )
    }

    // Validate user identity
    const supabase = await validateUserIdentity(userId, isAuthenticated)
    if (!supabase) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Generate unique ID for the artifact
    const artifactId = crypto.randomUUID()

    // Insert the AI artifact into the database
    const { data: artifact, error: insertError } = await supabase
      .from('ai_artifacts')
      .insert({
        id: artifactId,
        chat_id: chatId,
        user_id: userId,
        title,
        content,
        content_type: contentType,
        metadata: {
          ...metadata,
          generated_by: "ai",
          timestamp: new Date().toISOString()
        }
      })
      .select()
      .single()

    if (insertError) {
      console.error("Error inserting AI artifact:", insertError)
      return NextResponse.json(
        { error: "Failed to create AI artifact" },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      artifact: {
        id: artifact.id,
        title: artifact.title,
        content: artifact.content,
        content_type: artifact.content_type,
        metadata: artifact.metadata,
        created_at: artifact.created_at
      }
    })

  } catch (error) {
    console.error("Error creating AI artifact:", error)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}

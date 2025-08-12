import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { validateUserIdentity } from "@/lib/server/api"

export async function POST(request: NextRequest) {
  try {
    const { fileUrl, fileName, contentType, userId, isAuthenticated, chatId } = await request.json()

    if (!fileUrl || !fileName || !contentType || !userId || !chatId) {
      return NextResponse.json({ 
        error: "Missing required fields: fileUrl, fileName, contentType, userId, chatId" 
      }, { status: 400 })
    }

    // Validate user identity
    const supabase = await validateUserIdentity(userId, isAuthenticated)
    if (!supabase) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Fetch the file from the URL
    const fileResponse = await fetch(fileUrl)
    if (!fileResponse.ok) {
      return NextResponse.json({ 
        error: "Failed to fetch file from URL" 
      }, { status: 400 })
    }

    const fileBuffer = await fileResponse.arrayBuffer()
    const file = new File([fileBuffer], fileName, { type: contentType })

    // Import the document processing service
    const { documentProcessingService } = await import("@/lib/document-processing")

    // Check if file type is supported
    if (!documentProcessingService.isSupported(file)) {
      return NextResponse.json({
        error: "File type not supported for text extraction",
        supported: false
      }, { status: 400 })
    }

    // Extract text content
    const extractedContent = await documentProcessingService.extractText(file)

    // Create a unique artifact ID
    const artifactId = `artifact_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`

    // Store the document artifact in the database
    const { data: artifact, error: insertError } = await supabase
      .from('document_artifacts')
      .insert({
        id: artifactId,
        chat_id: chatId,
        user_id: userId,
        file_name: fileName,
        content_type: contentType,
        file_url: fileUrl,
        extracted_content: extractedContent.text,
        metadata: extractedContent.metadata,
        created_at: new Date().toISOString()
      })
      .select()
      .single()

    if (insertError) {
      console.error("Error inserting artifact:", insertError)
      return NextResponse.json({ 
        error: "Failed to store document artifact" 
      }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      artifact: {
        id: artifactId,
        fileName,
        contentType,
        content: extractedContent.text,
        metadata: extractedContent.metadata,
        createdAt: artifact.created_at
      }
    })

  } catch (error) {
    console.error("Document artifact creation error:", error)
    return NextResponse.json({ 
      error: "Failed to create document artifact",
      details: error instanceof Error ? error.message : "Unknown error"
    }, { status: 500 })
  }
}

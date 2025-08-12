import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { validateUserIdentity } from "@/lib/server/api"

export async function POST(request: NextRequest) {
  try {
    const { fileUrl, fileName, contentType, userId, isAuthenticated } = await request.json()

    if (!fileUrl || !fileName || !contentType || !userId) {
      return NextResponse.json({ 
        error: "Missing required fields: fileUrl, fileName, contentType, userId" 
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

    return NextResponse.json({
      success: true,
      content: extractedContent.text,
      metadata: extractedContent.metadata,
      fileName,
      contentType
    })

  } catch (error) {
    console.error("Document processing error:", error)
    return NextResponse.json({ 
      error: "Failed to process document",
      details: error instanceof Error ? error.message : "Unknown error"
    }, { status: 500 })
  }
}

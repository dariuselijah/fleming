import { createClient } from "@/lib/supabase/server"
import { validateUserIdentity } from "@/lib/server/api"
import { NextRequest, NextResponse } from "next/server"

// CACHE for signed URLs to avoid regeneration
const signedUrlCache = new Map<string, { url: string; expiresAt: number }>()
const CACHE_DURATION = 3000000 // 50 minutes (signed URLs last 1 hour)

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const file = formData.get("file") as File
    const userId = formData.get("userId") as string
    const chatId = formData.get("chatId") as string
    const isAuthenticated = formData.get("isAuthenticated") === "true"

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 })
    }

    if (!userId || !chatId) {
      return NextResponse.json({ error: "Missing userId or chatId" }, { status: 400 })
    }

    // Validate user identity
    const supabase = await validateUserIdentity(userId, isAuthenticated)
    if (!supabase) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Validate file
    const validation = await validateFile(file)
    if (!validation.isValid) {
      return NextResponse.json({ error: validation.error }, { status: 400 })
    }

    // Upload file to Supabase storage
    const fileExt = file.name.split(".").pop()
    const fileName = `${Math.random().toString(36).substring(2)}.${fileExt}`
    const filePath = `uploads/${fileName}`

    // PARALLEL PROCESSING: Upload file and prepare database operation simultaneously
    const [uploadResult, dbPreparation] = await Promise.all([
      // Upload file to storage
      supabase.storage
        .from("chat-attachments")
        .upload(filePath, file, {
          cacheControl: '3600',
          upsert: false
        }),
      // Prepare database insertion data
      Promise.resolve({
        chat_id: chatId,
        user_id: userId,
        file_url: filePath,
        file_name: file.name,
        file_type: file.type,
        file_size: file.size,
      })
    ])

    if (uploadResult.error) {
      console.error("Upload error:", uploadResult.error)
      return NextResponse.json({ error: `Upload failed: ${uploadResult.error.message}` }, { status: 500 })
    }

    // Check cache for existing signed URL
    const cacheKey = `${filePath}-3600`
    const cached = signedUrlCache.get(cacheKey)
    let signedUrl: string

    if (cached && cached.expiresAt > Date.now()) {
      // Use cached signed URL
      signedUrl = cached.url
      console.log("Using cached signed URL for:", filePath)
    } else {
      // Generate new signed URL
      const signedUrlData = await supabase.storage
        .from("chat-attachments")
        .createSignedUrl(filePath, 3600)

      if (signedUrlData.error) {
        console.error("Signed URL error:", signedUrlData.error)
        return NextResponse.json({ error: `Failed to generate signed URL: ${signedUrlData.error.message}` }, { status: 500 })
      }

      signedUrl = signedUrlData.data.signedUrl
      
      // Cache the signed URL
      signedUrlCache.set(cacheKey, {
        url: signedUrl,
        expiresAt: Date.now() + (3600 * 1000) - 600000 // Cache for 50 minutes
      })
    }

    // Only insert into database if chatId is a valid UUID (not a temporary chat)
    const isTemporaryChat = chatId.startsWith('temp-chat-')
    
    if (!isTemporaryChat) {
      // Insert into database only for real chats
      const { error: dbError } = await supabase.from("chat_attachments").insert(dbPreparation)

      if (dbError) {
        console.error("Database error:", dbError)
        return NextResponse.json({ error: `Database insertion failed: ${dbError.message}` }, { status: 500 })
      }
    } else {
      console.log(`Skipping database insertion for temporary chat: ${chatId}`)
    }

    return NextResponse.json({
      success: true,
      filePath,
      signedUrl,
      attachment: {
        name: file.name,
        contentType: file.type,
        url: signedUrl,
        filePath
      }
    })

  } catch (error) {
    console.error("File upload error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

async function validateFile(file: File): Promise<{ isValid: boolean; error?: string }> {
  const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10MB

  const ALLOWED_FILE_TYPES = [
    "image/jpeg",
    "image/png",
    "image/gif",
    "application/pdf",
    "text/plain",
    "text/markdown",
    "application/json",
    "text/csv",
    "application/vnd.ms-excel",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ]

  if (file.size > MAX_FILE_SIZE) {
    return {
      isValid: false,
      error: `File size exceeds ${MAX_FILE_SIZE / (1024 * 1024)}MB limit`,
    }
  }

  if (!ALLOWED_FILE_TYPES.includes(file.type)) {
    return {
      isValid: false,
      error: "File type not supported",
    }
  }

  return { isValid: true }
} 
import { createClient } from "@/lib/supabase/server"
import { NextRequest, NextResponse } from "next/server"

export async function POST(request: NextRequest) {
  try {
    const { filePath, expiresIn = 3600 } = await request.json()

    if (!filePath) {
      return NextResponse.json({ error: "File path is required" }, { status: 400 })
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

    // Generate signed URL
    const { data, error } = await supabase.storage
      .from("chat-attachments")
      .createSignedUrl(filePath, expiresIn)

    if (error) {
      console.error("Signed URL generation error:", error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      signedUrl: data.signedUrl
    })

  } catch (error) {
    console.error("Get signed URL error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
} 
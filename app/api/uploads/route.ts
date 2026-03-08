import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { UserUploadService } from "@/lib/uploads/server"

export async function GET() {
  const noStoreHeaders = {
    "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
    Pragma: "no-cache",
    Expires: "0",
  }
  try {
    const supabase = await createClient()
    if (!supabase) {
      return NextResponse.json({ error: "Supabase unavailable" }, { status: 500 })
    }
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const service = new UserUploadService(supabase)
    const uploads = await service.listUploads(user.id)
    return NextResponse.json({ uploads }, { headers: noStoreHeaders })
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to load uploads",
      },
      { status: 500, headers: noStoreHeaders }
    )
  }
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    if (!supabase) {
      return NextResponse.json({ error: "Supabase unavailable" }, { status: 500 })
    }
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const formData = await request.formData()
    const file = formData.get("file")
    const title = formData.get("title")

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "A file is required" }, { status: 400 })
    }

    const service = new UserUploadService(supabase)
    const upload = await service.createAndIngestUpload({
      userId: user.id,
      file,
      title: typeof title === "string" ? title : undefined,
    })

    return NextResponse.json({ upload })
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Upload failed",
      },
      { status: 500 }
    )
  }
}

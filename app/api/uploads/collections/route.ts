import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { UploadBatchService } from "@/lib/uploads/batch"

export async function GET() {
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

    const service = new UploadBatchService(supabase)
    const collections = await service.listCollections(user.id)
    return NextResponse.json(
      { collections },
      {
        headers: {
          "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
        },
      }
    )
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to list upload collections",
      },
      { status: 500 }
    )
  }
}

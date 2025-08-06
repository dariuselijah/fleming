import { createClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"

export async function POST(request: Request) {
  try {
    const supabase = await createClient()

    if (!supabase) {
      return new Response(
        JSON.stringify({ error: "Supabase not available in this deployment." }),
        { status: 200 }
      )
    }

    const { data: authData } = await supabase.auth.getUser()

    if (!authData?.user?.id) {
      return new Response(JSON.stringify({ error: "Missing userId" }), {
        status: 400,
      })
    }

    const userId = authData.user.id

    // Handle both JSON and FormData
    let title, discipline, material_type, content, file_url, tags, session_ids, file, folder_name

    if (request.headers.get("content-type")?.includes("multipart/form-data")) {
      const formData = await request.formData()
      title = formData.get("title") as string
      discipline = formData.get("discipline") as string
      material_type = formData.get("material_type") as string
      content = formData.get("content") as string
      tags = formData.get("tags") as string
      session_ids = formData.get("session_ids") as string
      folder_name = formData.get("folder_name") as string
      file = formData.get("file") as File
    } else {
      const body = await request.json()
      title = body.title
      discipline = body.discipline
      material_type = body.material_type
      content = body.content
      file_url = body.file_url
      tags = body.tags
      session_ids = body.session_ids
      folder_name = body.folder_name
    }

    if (!title?.trim()) {
      return NextResponse.json(
        { error: "Material title is required" },
        { status: 400 }
      )
    }

    if (!discipline) {
      return NextResponse.json(
        { error: "Material discipline is required" },
        { status: 400 }
      )
    }

    if (!material_type) {
      return NextResponse.json(
        { error: "Material type is required" },
        { status: 400 }
      )
    }

    // Handle file upload if present
    let finalFileUrl = file_url
    let fileName = null
    let fileType = null

    if (file) {
      // Upload file to Supabase storage
      const fileExt = file.name.split(".").pop()
      const storageFileName = `${Math.random().toString(36).substring(2)}.${fileExt}`
      const filePath = `study-materials/${storageFileName}`

      const { error: uploadError } = await supabase.storage
        .from("chat-attachments")
        .upload(filePath, file, {
          cacheControl: '3600',
          upsert: false
        })

      if (uploadError) {
        console.error("Upload error:", uploadError)
        return NextResponse.json({ error: `Upload failed: ${uploadError.message}` }, { status: 500 })
      }

      finalFileUrl = filePath
      fileName = file.name
      fileType = file.type
    }

    // Insert the material
    const { data: material, error } = await supabase
      .from("study_materials")
      .insert({ 
        title: title.trim(), 
        discipline,
        material_type,
        content: content?.trim() || null,
        file_url: finalFileUrl || null,
        file_name: fileName,
        file_type: fileType,
        folder_name: folder_name || null,
        tags: tags ? JSON.parse(tags) : [],
        user_id: userId 
      })
      .select()
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // If session_ids are provided, associate the material with those sessions
    let sessionIdsArray = []
    if (session_ids) {
      try {
        sessionIdsArray = typeof session_ids === 'string' ? JSON.parse(session_ids) : session_ids
      } catch (e) {
        console.error("Error parsing session_ids:", e)
      }
    }

    if (sessionIdsArray && Array.isArray(sessionIdsArray) && sessionIdsArray.length > 0) {
      const sessionMaterialRelations = sessionIdsArray.map((sessionId: string) => ({
        session_id: sessionId,
        material_id: material.id
      }))

      const { error: relationError } = await supabase
        .from("study_session_materials")
        .insert(sessionMaterialRelations)

      if (relationError) {
        console.error("Error creating session-material relations:", relationError)
        // Don't fail the entire request, just log the error
      }
    }

    return NextResponse.json(material)
  } catch (err: unknown) {
    console.error("Error in study materials endpoint:", err)

    return new Response(
      JSON.stringify({
        error: (err as Error).message || "Internal server error",
      }),
      { status: 500 }
    )
  }
}

export async function GET(request: Request) {
  const supabase = await createClient()

  if (!supabase) {
    return new Response(
      JSON.stringify({ error: "Supabase not available in this deployment." }),
      { status: 200 }
    )
  }

  const { data: authData } = await supabase.auth.getUser()

  const userId = authData?.user?.id
  if (!userId)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const sessionId = searchParams.get("session_id")

  let query = supabase
    .from("study_materials")
    .select("*")
    .eq("user_id", userId)

  // If session_id is provided, filter by materials associated with that session
  if (sessionId) {
    // Check if this is a project ID or study_session ID
    const { data: project } = await supabase
      .from("projects")
      .select("id, type, discipline")
      .eq("id", sessionId)
      .single()

    if (project && project.type === "study") {
      // This is a study project, find or create corresponding study_session
      let studySessionId = sessionId
      
      // Check if there's already a study_session with this ID
      const { data: existingSession } = await supabase
        .from("study_sessions")
        .select("id")
        .eq("id", sessionId)
        .single()

      if (!existingSession) {
        // Create a study_session for this project
        const { data: newSession, error: createError } = await supabase
          .from("study_sessions")
          .insert({
            id: sessionId,
            user_id: userId,
            title: project.name || "Study Session",
            discipline: project.discipline || "general"
          })
          .select()
          .single()

        if (createError) {
          console.error("Error creating study session:", createError)
          // Continue with the project ID as session ID
        }
      }

      // Now get the material IDs associated with this session
      const { data: sessionMaterials, error: sessionError } = await supabase
        .from("study_session_materials")
        .select("material_id")
        .eq("session_id", studySessionId)

      if (sessionError) {
        console.error("Error fetching session materials:", sessionError)
        return NextResponse.json({ error: sessionError.message }, { status: 500 })
      }

      if (sessionMaterials && sessionMaterials.length > 0) {
        const materialIds = sessionMaterials.map(sm => sm.material_id)
        query = query.in("id", materialIds)
      } else {
        // No materials associated with this session, return empty array
        return NextResponse.json([])
      }
    } else {
      // This might be a direct study_session ID
      const { data: sessionMaterials, error: sessionError } = await supabase
        .from("study_session_materials")
        .select("material_id")
        .eq("session_id", sessionId)

      if (sessionError) {
        console.error("Error fetching session materials:", sessionError)
        return NextResponse.json({ error: sessionError.message }, { status: 500 })
      }

      if (sessionMaterials && sessionMaterials.length > 0) {
        const materialIds = sessionMaterials.map(sm => sm.material_id)
        query = query.in("id", materialIds)
      } else {
        // No materials associated with this session, return empty array
        return NextResponse.json([])
      }
    }
  }

  const { data, error } = await query.order("created_at", { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
} 
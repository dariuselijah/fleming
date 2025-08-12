import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

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

    const { session_id, material_id } = await request.json()

    if (!session_id || !material_id) {
      return NextResponse.json(
        { error: "session_id and material_id are required" },
        { status: 400 }
      )
    }

    // Check if this is a project ID or study_session ID
    const { data: project } = await supabase
      .from("projects")
      .select("id, type, discipline, name")
      .eq("id", session_id)
      .single()

    let actualSessionId = session_id

    if (project && project.type === "study") {
      // This is a study project, find or create corresponding study_session
      
      // Check if there's already a study_session with this ID
      const { data: existingSession } = await supabase
        .from("study_sessions")
        .select("id")
        .eq("id", session_id)
        .single()

      if (!existingSession) {
        // Create a study_session for this project
        const { data: newSession, error: createError } = await supabase
          .from("study_sessions")
          .insert({
            id: session_id,
            user_id: authData.user.id,
            name: project.name || "Study Session",
            discipline: project.discipline || "general"
          })
          .select()
          .single()

        if (createError) {
          console.error("Error creating study session:", createError)
          return NextResponse.json(
            { error: "Failed to create study session" },
            { status: 500 }
          )
        }
      }
      
      actualSessionId = session_id // Use the project ID as the session ID
    }

    // Verify the material belongs to the user
    const { data: material, error: materialError } = await supabase
      .from("study_materials")
      .select("id")
      .eq("id", material_id)
      .eq("user_id", authData.user.id)
      .single()

    if (materialError || !material) {
      return NextResponse.json(
        { error: "Material not found or access denied" },
        { status: 404 }
      )
    }

    // Check if association exists
    const { data: existingAssociation, error: checkError } = await supabase
      .from("study_session_materials")
      .select("session_id, material_id")
      .eq("session_id", actualSessionId)
      .eq("material_id", material_id)
      .single()

    if (checkError && checkError.code === 'PGRST116') { // PGRST116 is "not found"
      return NextResponse.json(
        { message: "Material is not associated with this project" },
        { status: 200 }
      )
    }

    if (checkError) {
      return NextResponse.json(
        { error: "Error checking existing association" },
        { status: 500 }
      )
    }

    // Remove the association
    const { error: disassociateError } = await supabase
      .from("study_session_materials")
      .delete()
      .eq("session_id", actualSessionId)
      .eq("material_id", material_id)

    if (disassociateError) {
      console.error("Error disassociating material:", disassociateError)
      return NextResponse.json(
        { error: "Failed to remove material from project" },
        { status: 500 }
      )
    }

    return NextResponse.json({ message: "Material removed from project successfully" })
  } catch (error) {
    console.error("Disassociation error:", error)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
} 
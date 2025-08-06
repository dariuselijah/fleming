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

    const { fileName, fileType, materialType, discipline, content } = await request.json()

    // Simple title generation logic - can be enhanced with AI later
    let title = ""

    if (content) {
      // For text content, use first few words
      const words = content.trim().split(/\s+/).slice(0, 5).join(" ")
      title = words.length > 50 ? words.substring(0, 50) + "..." : words
    } else if (fileName) {
      // For files, use filename without extension
      title = fileName.replace(/\.[^/.]+$/, "")
      
      // Add material type context
      const materialTypeLabels: Record<string, string> = {
        "textbook": "Textbook",
        "notes": "Notes",
        "research_paper": "Research Paper",
        "guideline": "Clinical Guideline",
        "lecture": "Lecture",
        "case_study": "Case Study",
        "test": "Test"
      }
      
      const typeLabel = materialTypeLabels[materialType] || "Material"
      title = `${typeLabel}: ${title}`
    } else {
      // Fallback
      title = `${materialType || "Study"} Material`
    }

    // Add discipline context if available
    if (discipline && discipline !== "general") {
      const disciplineLabels: Record<string, string> = {
        "anatomy": "Anatomy",
        "biochemistry": "Biochemistry",
        "physiology": "Physiology",
        "pharmacology": "Pharmacology",
        "pathology": "Pathology",
        "microbiology": "Microbiology",
        "immunology": "Immunology",
        "histology": "Histology",
        "embryology": "Embryology",
        "neuroscience": "Neuroscience"
      }
      
      const disciplineLabel = disciplineLabels[discipline] || discipline
      title = `${disciplineLabel} - ${title}`
    }

    return NextResponse.json({ title })
  } catch (error) {
    console.error("Error generating material title:", error)
    return NextResponse.json(
      { error: "Failed to generate title" },
      { status: 500 }
    )
  }
}
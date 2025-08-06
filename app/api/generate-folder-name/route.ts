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

    const { fileNames, materialType, discipline } = await request.json()

    if (!fileNames || !Array.isArray(fileNames)) {
      return NextResponse.json(
        { error: "fileNames array is required" },
        { status: 400 }
      )
    }

    // Generate folder name based on file names and material type
    let folderName = ""

    // Extract common patterns from file names
    const cleanFileNames = fileNames.map((name: string) => 
      name.replace(/\.[^/.]+$/, "").replace(/[-_]/g, " ")
    )

    // Try to find a common prefix or theme
    const commonWords = findCommonWords(cleanFileNames)
    
    if (commonWords.length > 0) {
      folderName = commonWords.join(" ")
    } else {
      // Use material type and discipline
      const materialTypeLabels: Record<string, string> = {
        "textbook": "Textbook",
        "notes": "Notes",
        "research_paper": "Research Paper",
        "guideline": "Clinical Guideline",
        "lecture": "Lecture",
        "case_study": "Case Study",
        "test": "Test"
      }
      
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
      
      const typeLabel = materialTypeLabels[materialType] || materialType
      const disciplineLabel = disciplineLabels[discipline] || discipline
      
      folderName = `${disciplineLabel} ${typeLabel} Collection`
    }

    // Add file count for context
    folderName += ` (${fileNames.length} files)`

    return NextResponse.json({ folderName })
  } catch (error) {
    console.error("Error generating folder name:", error)
    return NextResponse.json(
      { error: "Failed to generate folder name" },
      { status: 500 }
    )
  }
}

function findCommonWords(fileNames: string[]): string[] {
  if (fileNames.length === 0) return []
  
  // Split all file names into words
  const allWords = fileNames.flatMap(name => 
    name.toLowerCase().split(/\s+/).filter(word => word.length > 2)
  )
  
  // Count word frequency
  const wordCount: Record<string, number> = {}
  allWords.forEach(word => {
    wordCount[word] = (wordCount[word] || 0) + 1
  })
  
  // Find words that appear in multiple files
  const commonWords = Object.entries(wordCount)
    .filter(([_, count]) => count > 1)
    .sort(([_, a], [__, b]) => b - a)
    .slice(0, 3)
    .map(([word, _]) => word.charAt(0).toUpperCase() + word.slice(1))
  
  return commonWords
} 
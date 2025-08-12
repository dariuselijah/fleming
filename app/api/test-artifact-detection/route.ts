import { NextRequest, NextResponse } from "next/server"

export async function POST(request: NextRequest) {
  try {
    const { userPrompt, aiResponse } = await request.json()

    if (!userPrompt || !aiResponse) {
      return NextResponse.json(
        { error: "Missing required fields: userPrompt, aiResponse" },
        { status: 400 }
      )
    }

    // Import the detection service
    const { ArtifactDetectionService } = await import('@/lib/artifact-detection')
    
    // Test the detection
    const detectionResult = ArtifactDetectionService.detectArtifactOpportunity(
      userPrompt,
      aiResponse
    )

    return NextResponse.json({
      success: true,
      detectionResult,
      input: {
        userPrompt,
        aiResponseLength: aiResponse.length
      }
    })

  } catch (error) {
    console.error("Error testing artifact detection:", error)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}

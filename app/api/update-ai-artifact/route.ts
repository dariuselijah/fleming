import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function PUT(request: NextRequest) {
  try {
    const requestBody = await request.json()
    console.log('Update artifact request received:', requestBody)
    
    const { artifactId, content, userId, isAuthenticated } = requestBody

    if (!artifactId || !content || !userId || !isAuthenticated) {
      console.error('Missing required fields:', { artifactId, content, userId, isAuthenticated })
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      )
    }

    // Create Supabase client
    const supabase = await createClient()
    if (!supabase) {
      return NextResponse.json(
        { error: 'Database connection failed' },
        { status: 500 }
      )
    }

    // Get the current user from the session
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    
    if (authError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized - User not authenticated' },
        { status: 401 }
      )
    }

    // Verify the user is updating their own artifact
    if (user.id !== userId) {
      return NextResponse.json(
        { error: 'Unauthorized - Cannot update other user\'s artifacts' },
        { status: 403 }
      )
    }

    // First, check if the artifact exists and belongs to the user
    const { data: existingArtifact, error: checkError } = await supabase
      .from('ai_artifacts')
      .select('id, user_id')
      .eq('id', artifactId)
      .eq('user_id', userId)
      .single()

    if (checkError) {
      console.error('Failed to find artifact:', checkError)
      return NextResponse.json(
        { error: 'Artifact not found or access denied' },
        { status: 404 }
      )
    }

    // Update the artifact content
    const { data: updatedArtifact, error: updateError } = await supabase
      .from('ai_artifacts')
      .update({ 
        content: content,
        updated_at: new Date().toISOString()
      })
      .eq('id', artifactId)
      .select()
      .single()

    if (updateError) {
      console.error('Failed to update artifact:', updateError)
      return NextResponse.json(
        { error: 'Failed to update artifact' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      artifact: updatedArtifact
    })

  } catch (error) {
    console.error('Error updating artifact:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

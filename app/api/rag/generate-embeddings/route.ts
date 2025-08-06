import { createClient } from '@/lib/supabase/server'
import { embeddingService } from '@/lib/rag/core/embeddings'
import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    if (!supabase) {
      return NextResponse.json({ error: 'Supabase not available' }, { status: 500 })
    }

    const { data: authData } = await supabase.auth.getUser()
    if (!authData?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get materials that need embedding updates
    const { data: materials, error } = await supabase.rpc('get_materials_needing_embedding', {
      user_id_filter: authData.user.id,
      limit_count: 50
    })

    if (error || !materials) {
      return NextResponse.json({ error: 'Failed to fetch materials' }, { status: 500 })
    }

    if (materials.length === 0) {
      return NextResponse.json({ 
        message: 'No materials need embedding updates',
        processed: 0
      })
    }

    // Generate embeddings in batch
    const embeddingResults = await embeddingService.generateEmbeddingsForMaterials(materials)

    // Prepare data for batch update
    const embeddingsData = embeddingResults.map(result => ({
      id: result.id,
      embedding: result.embedding,
      model: result.model
    }))

    // Update embeddings in database
    const { data: updateResult, error: updateError } = await supabase.rpc('update_material_embeddings', {
      material_ids: materials.map(m => m.id),
      embeddings_data: embeddingsData
    })

    if (updateError) {
      return NextResponse.json({ error: 'Failed to update embeddings' }, { status: 500 })
    }

    return NextResponse.json({ 
      message: `Updated ${updateResult} embeddings`,
      processed: materials.length,
      updated: updateResult
    })

  } catch (error) {
    console.error('Embedding generation error:', error)
    return NextResponse.json({ 
      error: error instanceof Error ? error.message : 'Internal server error' 
    }, { status: 500 })
  }
}

export async function GET(request: Request) {
  try {
    const supabase = await createClient()
    if (!supabase) {
      return NextResponse.json({ error: 'Supabase not available' }, { status: 500 })
    }

    const { data: authData } = await supabase.auth.getUser()
    if (!authData?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get embedding status for user's materials
    const { data: materials, error } = await supabase
      .from('study_materials')
      .select('id, title, processing_status, last_embedded_at, content_length')
      .eq('user_id', authData.user.id)
      .order('created_at', { ascending: false })

    if (error) {
      return NextResponse.json({ error: 'Failed to fetch materials' }, { status: 500 })
    }

    const stats = {
      total: materials.length,
      with_embeddings: materials.filter(m => m.processing_status === 'completed').length,
      pending: materials.filter(m => m.processing_status === 'pending').length,
      processing: materials.filter(m => m.processing_status === 'processing').length,
      failed: materials.filter(m => m.processing_status === 'failed').length
    }

    return NextResponse.json({ materials, stats })

  } catch (error) {
    console.error('Embedding status error:', error)
    return NextResponse.json({ 
      error: error instanceof Error ? error.message : 'Internal server error' 
    }, { status: 500 })
  }
} 
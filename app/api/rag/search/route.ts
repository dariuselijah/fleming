import { createClient } from '@/lib/supabase/server'
import { ragSearchService } from '@/lib/rag/core/search'
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

    const { query, options = {} } = await request.json()

    if (!query || typeof query !== 'string') {
      return NextResponse.json({ error: 'Query is required' }, { status: 400 })
    }

    // Get user preferences for RAG settings
    const { data: preferences, error: prefError } = await supabase
      .from('user_preferences')
      .select('rag_enabled, rag_threshold, rag_max_results, rag_file_types')
      .eq('user_id', authData.user.id)
      .single()

    if (prefError) {
      console.warn('Failed to fetch user preferences, using defaults')
    }

    // Use user preferences or defaults
    const searchOptions = {
      threshold: options.threshold || preferences?.rag_threshold || 0.7,
      limit: options.limit || preferences?.rag_max_results || 5,
      materialTypes: options.materialTypes || preferences?.rag_file_types || null,
      disciplines: options.disciplines || null,
      maxTokens: options.maxTokens || 4000,
      useHybrid: options.useHybrid !== false // Default to true
    }

    // Check if RAG is enabled for user
    if (preferences?.rag_enabled === false) {
      return NextResponse.json({ 
        error: 'RAG is disabled for this user',
        results: []
      })
    }

    let results
    if (searchOptions.useHybrid) {
      results = await ragSearchService.hybridSearch(query, authData.user.id, searchOptions)
    } else {
      results = await ragSearchService.searchStudyMaterials(query, authData.user.id, searchOptions)
    }

    return NextResponse.json({ 
      results,
      query,
      options: searchOptions
    })

  } catch (error) {
    console.error('RAG search error:', error)
    return NextResponse.json({ 
      error: error instanceof Error ? error.message : 'Internal server error',
      results: []
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

    const { searchParams } = new URL(request.url)
    const query = searchParams.get('q')
    const searchType = searchParams.get('type') || 'hybrid'
    const limit = parseInt(searchParams.get('limit') || '5')
    const threshold = parseFloat(searchParams.get('threshold') || '0.7')

    if (!query) {
      return NextResponse.json({ error: 'Query parameter is required' }, { status: 400 })
    }

    const searchOptions = {
      threshold,
      limit,
      useHybrid: searchType === 'hybrid'
    }

    let results
    switch (searchType) {
      case 'hybrid':
        results = await ragSearchService.hybridSearch(query, authData.user.id, searchOptions)
        break
      case 'vector':
        results = await ragSearchService.searchStudyMaterials(query, authData.user.id, searchOptions)
        break
      case 'chunks':
        results = await ragSearchService.searchDocumentChunks(query, authData.user.id, searchOptions)
        break
      default:
        return NextResponse.json({ error: 'Invalid search type' }, { status: 400 })
    }

    return NextResponse.json({ 
      results,
      query,
      searchType,
      options: searchOptions
    })

  } catch (error) {
    console.error('RAG search error:', error)
    return NextResponse.json({ 
      error: error instanceof Error ? error.message : 'Internal server error',
      results: []
    }, { status: 500 })
  }
} 
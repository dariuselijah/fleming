// Test script for RAG functionality
const { createClient } = require('@supabase/supabase-js')

// Initialize Supabase client
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE
)

async function testRagImplementation() {
  console.log('Testing RAG Implementation...')
  
  try {
    // 1. Check if pgvector extension is enabled
    console.log('\n1. Checking pgvector extension...')
    const { data: extensions, error: extError } = await supabase
      .from('pg_extension')
      .select('extname, extversion')
      .eq('extname', 'vector')
    
    if (extError) {
      console.log('Error checking extensions:', extError)
    } else {
      console.log('pgvector extension status:', extensions)
    }

    // 2. Check study materials that need embeddings
    console.log('\n2. Checking materials needing embeddings...')
    const { data: materials, error: matError } = await supabase.rpc('get_materials_needing_embedding', {
      user_id_filter: null,
      limit_count: 10
    })

    if (matError) {
      console.log('Error fetching materials:', matError)
    } else {
      console.log('Materials needing embeddings:', materials?.length || 0)
      if (materials && materials.length > 0) {
        console.log('Sample material:', materials[0])
      }
    }

    // 3. Check if search functions exist
    console.log('\n3. Checking search functions...')
    const { data: functions, error: funcError } = await supabase
      .from('information_schema.routines')
      .select('routine_name')
      .like('routine_name', '%search%')
      .like('routine_schema', 'public')

    if (funcError) {
      console.log('Error checking functions:', funcError)
    } else {
      console.log('Available search functions:', functions?.map(f => f.routine_name) || [])
    }

    // 4. Check vector indexes
    console.log('\n4. Checking vector indexes...')
    const { data: indexes, error: idxError } = await supabase
      .from('pg_indexes')
      .select('indexname, indexdef')
      .like('tablename', 'study_materials')
      .like('indexname', '%embedding%')

    if (idxError) {
      console.log('Error checking indexes:', idxError)
    } else {
      console.log('Vector indexes found:', indexes?.length || 0)
      indexes?.forEach(idx => console.log('-', idx.indexname))
    }

    // 5. Test search function (if we have embeddings)
    console.log('\n5. Testing search function...')
    const { data: searchTest, error: searchError } = await supabase.rpc('search_study_materials', {
      query_embedding: Array(1536).fill(0.1), // Test vector
      user_id_filter: '00000000-0000-0000-0000-000000000000', // Test user
      match_threshold: 0.1,
      match_count: 1
    })

    if (searchError) {
      console.log('Search function error:', searchError)
    } else {
      console.log('Search function working:', searchTest?.length || 0, 'results')
    }

    console.log('\n✅ RAG Implementation Test Complete!')
    
  } catch (error) {
    console.error('❌ Test failed:', error)
  }
}

// Run the test
testRagImplementation() 
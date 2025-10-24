import { NextRequest, NextResponse } from 'next/server'
import { createGuestServerClient } from '@/lib/supabase/server-guest'
import { validateAdminPassword } from '@/lib/admin/password'

export async function POST(request: NextRequest) {
  try {
    const { password } = await request.json()
    
    // Allow authenticated requests (for refresh)
    if (password === 'authenticated') {
      // Skip password validation for refresh requests
    } else if (!password) {
      return NextResponse.json({ error: 'Password required' }, { status: 400 })
    } else {
      const isValidPassword = await validateAdminPassword(password)
      if (!isValidPassword) {
        return NextResponse.json({ error: 'Invalid password' }, { status: 401 })
      }
    }

    const supabase = await createGuestServerClient()
    if (!supabase) {
      return NextResponse.json({ error: 'Database connection failed' }, { status: 500 })
    }

    // Fetch all metrics in parallel
    const [
      totalUsersResult,
      newSignups24hResult,
      newSignups7dResult,
      newSignups30dResult,
      activeUsers24hResult,
      activeUsers7dResult,
      totalMessagesResult,
      totalChatsResult,
      totalAttachmentsResult,
      premiumUsersResult,
      anonymousUsersResult,
      topModelsResult,
      dailyMessagesResult,
      userStatsResult
    ] = await Promise.all([
      // Total users
      supabase.from('users').select('id', { count: 'exact', head: true }),
      
      // New signups (24h)
      supabase.from('users')
        .select('id', { count: 'exact', head: true })
        .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()),
      
      // New signups (7d)
      supabase.from('users')
        .select('id', { count: 'exact', head: true })
        .gte('created_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()),
      
      // New signups (30d)
      supabase.from('users')
        .select('id', { count: 'exact', head: true })
        .gte('created_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()),
      
      // Active users (24h)
      supabase.from('users')
        .select('id', { count: 'exact', head: true })
        .gte('last_active_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()),
      
      // Active users (7d)
      supabase.from('users')
        .select('id', { count: 'exact', head: true })
        .gte('last_active_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()),
      
      // Total messages
      supabase.from('messages').select('id', { count: 'exact', head: true }),
      
      // Total chats
      supabase.from('chats').select('id', { count: 'exact', head: true }),
      
      // Total attachments
      supabase.from('chat_attachments').select('id', { count: 'exact', head: true }),
      
      // Premium users
      supabase.from('users')
        .select('id', { count: 'exact', head: true })
        .eq('premium', true),
      
      // Anonymous users
      supabase.from('users')
        .select('id', { count: 'exact', head: true })
        .eq('anonymous', true),
      
      // Top 5 models by usage
      supabase.from('messages')
        .select('model')
        .not('model', 'is', null)
        .limit(1000), // Get sample for analysis
      
      // Messages today
      supabase.from('messages')
        .select('id', { count: 'exact', head: true })
        .gte('created_at', new Date().toISOString().split('T')[0] + 'T00:00:00'),
      
      // User statistics for averages
      supabase.from('users')
        .select('message_count')
        .not('message_count', 'is', null)
    ])

    // Process top models data
    const messagesData = topModelsResult.data || []
    const modelCounts: Record<string, number> = {}
    messagesData.forEach(msg => {
      if (msg.model) {
        modelCounts[msg.model] = (modelCounts[msg.model] || 0) + 1
      }
    })
    
    const topModels = Object.entries(modelCounts)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 5)
      .map(([model, count]) => ({ model, count }))

    // Calculate averages
    const userStats = userStatsResult.data || []
    const totalMessageCount = userStats.reduce((sum, user) => sum + (user.message_count || 0), 0)
    const avgMessagesPerUser = userStats.length > 0 ? totalMessageCount / userStats.length : 0

    const metrics = {
      users: {
        total: totalUsersResult.count || 0,
        newSignups24h: newSignups24hResult.count || 0,
        newSignups7d: newSignups7dResult.count || 0,
        newSignups30d: newSignups30dResult.count || 0,
        active24h: activeUsers24hResult.count || 0,
        active7d: activeUsers7dResult.count || 0,
        premium: premiumUsersResult.count || 0,
        anonymous: anonymousUsersResult.count || 0,
        authenticated: (totalUsersResult.count || 0) - (anonymousUsersResult.count || 0)
      },
      usage: {
        totalMessages: totalMessagesResult.count || 0,
        messagesToday: dailyMessagesResult.count || 0,
        avgMessagesPerUser: Math.round(avgMessagesPerUser * 100) / 100,
        totalChats: totalChatsResult.count || 0,
        avgChatsPerUser: userStats.length > 0 ? Math.round((totalChatsResult.count || 0) / userStats.length * 100) / 100 : 0,
        totalAttachments: totalAttachmentsResult.count || 0
      },
      models: topModels,
      lastUpdated: new Date().toISOString()
    }

    return NextResponse.json(metrics)
  } catch (error) {
    console.error('Metrics API error:', error)
    return NextResponse.json({ error: 'Failed to fetch metrics' }, { status: 500 })
  }
}

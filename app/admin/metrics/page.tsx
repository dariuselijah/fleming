'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { RefreshCw, Users, MessageSquare, TrendingUp, Activity, Shield, FileText } from 'lucide-react'

interface Metrics {
  users: {
    total: number
    newSignups24h: number
    newSignups7d: number
    newSignups30d: number
    active24h: number
    active7d: number
    premium: number
    anonymous: number
    authenticated: number
  }
  usage: {
    totalMessages: number
    messagesToday: number
    avgMessagesPerUser: number
    totalChats: number
    avgChatsPerUser: number
    totalAttachments: number
  }
  models: Array<{ model: string; count: number }>
  lastUpdated: string
}

export default function AdminMetricsPage() {
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [password, setPassword] = useState('')
  const [metrics, setMetrics] = useState<Metrics | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    // Check if already authenticated
    const authStatus = sessionStorage.getItem('admin-authenticated')
    if (authStatus === 'true') {
      setIsAuthenticated(true)
      fetchMetrics()
    }
  }, [])

  const handleLogin = async () => {
    if (!password.trim()) {
      setError('Please enter a password')
      return
    }

    setLoading(true)
    setError('')

    try {
      const response = await fetch('/api/admin/metrics', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password })
      })

      if (response.ok) {
        const data = await response.json()
        setMetrics(data)
        setIsAuthenticated(true)
        sessionStorage.setItem('admin-authenticated', 'true')
        setPassword('')
      } else {
        const errorData = await response.json()
        setError(errorData.error || 'Authentication failed')
      }
    } catch (err) {
      setError('Failed to authenticate')
    } finally {
      setLoading(false)
    }
  }

  const fetchMetrics = async () => {
    setLoading(true)
    try {
      const response = await fetch('/api/admin/metrics', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: 'authenticated' }) // Use session-based auth
      })

      if (response.ok) {
        const data = await response.json()
        setMetrics(data)
      } else {
        // If auth fails, reset session
        sessionStorage.removeItem('admin-authenticated')
        setIsAuthenticated(false)
        setError('Session expired. Please log in again.')
      }
    } catch (err) {
      console.error('Failed to fetch metrics:', err)
      setError('Failed to fetch metrics. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const handleLogout = () => {
    sessionStorage.removeItem('admin-authenticated')
    setIsAuthenticated(false)
    setMetrics(null)
    setPassword('')
  }

  // Auto-refresh every 30 seconds
  useEffect(() => {
    if (isAuthenticated) {
      const interval = setInterval(fetchMetrics, 30000)
      return () => clearInterval(interval)
    }
  }, [isAuthenticated])

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5" />
              Admin Access
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Input
                type="password"
                placeholder="Enter admin password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
                disabled={loading}
              />
            </div>
            {error && (
              <p className="text-sm text-destructive">{error}</p>
            )}
            <Button 
              onClick={handleLogin} 
              disabled={loading}
              className="w-full"
            >
              {loading ? 'Authenticating...' : 'Access Dashboard'}
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background p-4">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold">Admin Metrics Dashboard</h1>
            <p className="text-muted-foreground">
              Last updated: {metrics ? new Date(metrics.lastUpdated).toLocaleString() : 'Never'}
            </p>
            {error && (
              <p className="text-sm text-destructive mt-2">{error}</p>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={fetchMetrics}
              disabled={loading}
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
            <Button variant="outline" size="sm" onClick={handleLogout}>
              Logout
            </Button>
          </div>
        </div>

        {/* Metrics Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {/* User Statistics */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5" />
                User Statistics
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {loading && !metrics ? (
                <Skeleton className="h-4 w-full" />
              ) : (
                <>
                  <div className="flex justify-between">
                    <span>Total Users</span>
                    <Badge variant="secondary">{metrics?.users.total || 0}</Badge>
                  </div>
                  <div className="flex justify-between">
                    <span>New (24h)</span>
                    <Badge variant="outline">{metrics?.users.newSignups24h || 0}</Badge>
                  </div>
                  <div className="flex justify-between">
                    <span>New (7d)</span>
                    <Badge variant="outline">{metrics?.users.newSignups7d || 0}</Badge>
                  </div>
                  <div className="flex justify-between">
                    <span>New (30d)</span>
                    <Badge variant="outline">{metrics?.users.newSignups30d || 0}</Badge>
                  </div>
                  <div className="flex justify-between">
                    <span>Active (24h)</span>
                    <Badge variant="default">{metrics?.users.active24h || 0}</Badge>
                  </div>
                  <div className="flex justify-between">
                    <span>Active (7d)</span>
                    <Badge variant="default">{metrics?.users.active7d || 0}</Badge>
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          {/* User Breakdown */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Activity className="h-5 w-5" />
                User Breakdown
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {loading && !metrics ? (
                <Skeleton className="h-4 w-full" />
              ) : (
                <>
                  <div className="flex justify-between">
                    <span>Authenticated</span>
                    <Badge variant="secondary">{metrics?.users.authenticated || 0}</Badge>
                  </div>
                  <div className="flex justify-between">
                    <span>Anonymous</span>
                    <Badge variant="outline">{metrics?.users.anonymous || 0}</Badge>
                  </div>
                  <div className="flex justify-between">
                    <span>Premium</span>
                    <Badge variant="default">{metrics?.users.premium || 0}</Badge>
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          {/* Usage Statistics */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <MessageSquare className="h-5 w-5" />
                Usage Statistics
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {loading && !metrics ? (
                <Skeleton className="h-4 w-full" />
              ) : (
                <>
                  <div className="flex justify-between">
                    <span>Total Messages</span>
                    <Badge variant="secondary">{metrics?.usage.totalMessages || 0}</Badge>
                  </div>
                  <div className="flex justify-between">
                    <span>Messages Today</span>
                    <Badge variant="outline">{metrics?.usage.messagesToday || 0}</Badge>
                  </div>
                  <div className="flex justify-between">
                    <span>Avg per User</span>
                    <Badge variant="outline">{metrics?.usage.avgMessagesPerUser || 0}</Badge>
                  </div>
                  <div className="flex justify-between">
                    <span>Total Chats</span>
                    <Badge variant="secondary">{metrics?.usage.totalChats || 0}</Badge>
                  </div>
                  <div className="flex justify-between">
                    <span>Avg Chats per User</span>
                    <Badge variant="outline">{metrics?.usage.avgChatsPerUser || 0}</Badge>
                  </div>
                  <div className="flex justify-between">
                    <span>File Uploads</span>
                    <Badge variant="outline">{metrics?.usage.totalAttachments || 0}</Badge>
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          {/* Top Models */}
          <Card className="md:col-span-2 lg:col-span-3">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="h-5 w-5" />
                Top 5 Models by Usage
              </CardTitle>
            </CardHeader>
            <CardContent>
              {loading && !metrics ? (
                <div className="space-y-2">
                  {[...Array(5)].map((_, i) => (
                    <Skeleton key={i} className="h-8 w-full" />
                  ))}
                </div>
              ) : (
                <div className="space-y-2">
                  {metrics?.models.length ? (
                    metrics.models.map((model, index) => (
                      <div key={model.model} className="flex items-center justify-between p-2 rounded-lg bg-muted/50">
                        <div className="flex items-center gap-2">
                          <Badge variant="outline">{index + 1}</Badge>
                          <span className="font-mono text-sm">{model.model}</span>
                        </div>
                        <Badge variant="secondary">{model.count} messages</Badge>
                      </div>
                    ))
                  ) : (
                    <p className="text-muted-foreground text-sm">No model usage data available</p>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}

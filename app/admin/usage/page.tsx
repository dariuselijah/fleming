'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, BarChart3, RefreshCw, Shield, Users, MessageSquare, Sigma } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'

interface UsageMetrics {
  users: {
    total: number
    dailyActive: number
  }
  requests: {
    today: number
    avgPerDailyUser: number
  }
  tokens: {
    estimatedInputToday: number
    estimatedOutputToday: number
    estimatedTotalToday: number
    avgPerRequest: number
  }
  lifetime: {
    requests: number
    estimatedTokens: number
    avgEstimatedTokensPerRequest: number
  }
  dailySeries: Array<{
    date: string
    requestCount: number
    estimatedTokens: number
    dailyUsers: number
  }>
  sampled: boolean
  lastUpdated: string
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat('en-US').format(value)
}

export default function AdminUsagePage() {
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [password, setPassword] = useState('')
  const [metrics, setMetrics] = useState<UsageMetrics | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    const authStatus = sessionStorage.getItem('admin-authenticated')
    if (authStatus === 'true') {
      setIsAuthenticated(true)
      fetchMetrics()
    }
  }, [])

  async function handleLogin() {
    if (!password.trim()) {
      setError('Please enter a password')
      return
    }

    setLoading(true)
    setError('')

    try {
      const response = await fetch('/api/admin/usage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      })

      if (!response.ok) {
        const errorData = await response.json()
        setError(errorData.error || 'Authentication failed')
        return
      }

      const data = await response.json()
      setMetrics(data)
      setIsAuthenticated(true)
      sessionStorage.setItem('admin-authenticated', 'true')
      setPassword('')
    } catch {
      setError('Failed to authenticate')
    } finally {
      setLoading(false)
    }
  }

  async function fetchMetrics() {
    setLoading(true)
    try {
      const response = await fetch('/api/admin/usage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: 'authenticated' }),
      })

      if (!response.ok) {
        sessionStorage.removeItem('admin-authenticated')
        setIsAuthenticated(false)
        setError('Session expired. Please log in again.')
        return
      }

      const data = await response.json()
      setMetrics(data)
      setError('')
    } catch (err) {
      console.error('Failed to fetch usage metrics:', err)
      setError('Failed to fetch metrics. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  function handleLogout() {
    sessionStorage.removeItem('admin-authenticated')
    setIsAuthenticated(false)
    setMetrics(null)
    setPassword('')
  }

  useEffect(() => {
    if (!isAuthenticated) return
    const interval = setInterval(fetchMetrics, 30000)
    return () => clearInterval(interval)
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
            <Input
              type="password"
              placeholder="Enter admin password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
              disabled={loading}
            />
            {error ? <p className="text-sm text-destructive">{error}</p> : null}
            <Button onClick={handleLogin} disabled={loading} className="w-full">
              {loading ? 'Authenticating...' : 'Access Usage Dashboard'}
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background p-4">
      <div className="max-w-7xl mx-auto">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-8">
          <div>
            <h1 className="text-3xl font-bold">Usage Monitoring</h1>
            <p className="text-muted-foreground">
              Last updated: {metrics ? new Date(metrics.lastUpdated).toLocaleString() : 'Never'}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Token values are estimated from stored message payload length.
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Lifetime token totals are estimated using sampled average token density.
            </p>
            {metrics?.sampled ? (
              <p className="text-xs text-amber-600 mt-1">
                Showing sampled data from the latest 50k messages in the 7-day window.
              </p>
            ) : null}
            {error ? <p className="text-sm text-destructive mt-2">{error}</p> : null}
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" asChild>
              <Link href="/admin/metrics">
                <ArrowLeft className="h-4 w-4" />
                Metrics
              </Link>
            </Button>
            <Button variant="outline" size="sm" onClick={fetchMetrics} disabled={loading}>
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
            <Button variant="outline" size="sm" onClick={handleLogout}>
              Logout
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-6">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Users className="h-4 w-4" />
                Daily Users
              </CardTitle>
            </CardHeader>
            <CardContent>
              {loading && !metrics ? (
                <Skeleton className="h-8 w-20" />
              ) : (
                <>
                  <p className="text-2xl font-semibold">{formatNumber(metrics?.users.dailyActive || 0)}</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    of {formatNumber(metrics?.users.total || 0)} total users
                  </p>
                </>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <MessageSquare className="h-4 w-4" />
                Requests Today
              </CardTitle>
            </CardHeader>
            <CardContent>
              {loading && !metrics ? (
                <Skeleton className="h-8 w-20" />
              ) : (
                <>
                  <p className="text-2xl font-semibold">{formatNumber(metrics?.requests.today || 0)}</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Avg/user: {metrics?.requests.avgPerDailyUser || 0}
                  </p>
                </>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Sigma className="h-4 w-4" />
                Estimated Tokens
              </CardTitle>
            </CardHeader>
            <CardContent>
              {loading && !metrics ? (
                <Skeleton className="h-8 w-20" />
              ) : (
                <>
                  <p className="text-2xl font-semibold">{formatNumber(metrics?.tokens.estimatedTotalToday || 0)}</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Avg/request: {metrics?.tokens.avgPerRequest || 0}
                  </p>
                </>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <BarChart3 className="h-4 w-4" />
                Token Split
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {loading && !metrics ? (
                <>
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-full" />
                </>
              ) : (
                <>
                  <div className="flex items-center justify-between text-sm">
                    <span>Input</span>
                    <Badge variant="secondary">{formatNumber(metrics?.tokens.estimatedInputToday || 0)}</Badge>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span>Output</span>
                    <Badge variant="outline">{formatNumber(metrics?.tokens.estimatedOutputToday || 0)}</Badge>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Lifetime Requests</CardTitle>
            </CardHeader>
            <CardContent>
              {loading && !metrics ? (
                <Skeleton className="h-8 w-24" />
              ) : (
                <p className="text-2xl font-semibold">{formatNumber(metrics?.lifetime.requests || 0)}</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Lifetime Estimated Tokens</CardTitle>
            </CardHeader>
            <CardContent>
              {loading && !metrics ? (
                <Skeleton className="h-8 w-24" />
              ) : (
                <>
                  <p className="text-2xl font-semibold">{formatNumber(metrics?.lifetime.estimatedTokens || 0)}</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Avg/request: {metrics?.lifetime.avgEstimatedTokensPerRequest || 0}
                  </p>
                </>
              )}
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Last 7 Days</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-2 pr-4">Date</th>
                    <th className="text-left py-2 pr-4">Daily Users</th>
                    <th className="text-left py-2 pr-4">Requests</th>
                    <th className="text-left py-2">Estimated Tokens</th>
                  </tr>
                </thead>
                <tbody>
                  {(metrics?.dailySeries || []).map((row) => (
                    <tr key={row.date} className="border-b last:border-0">
                      <td className="py-2 pr-4">{row.date}</td>
                      <td className="py-2 pr-4">{formatNumber(row.dailyUsers)}</td>
                      <td className="py-2 pr-4">{formatNumber(row.requestCount)}</td>
                      <td className="py-2">{formatNumber(row.estimatedTokens)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

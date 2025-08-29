"use client"

import { useEffect, useState, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { TimerIcon, LightningIcon, WarningIcon } from "@phosphor-icons/react"

type PerformanceMetrics = {
  messageDisplayTime: number
  streamingStartTime: number
  firstChunkTime: number
  totalResponseTime: number
  fileUploadTime: number
}

export function PerformanceMonitor() {
  const [isVisible, setIsVisible] = useState(false)
  const [metrics, setMetrics] = useState<PerformanceMetrics[]>([])
  const [currentSession, setCurrentSession] = useState<Partial<PerformanceMetrics>>({})
  const startTimeRef = useRef<number>(0)
  const messageSentTimeRef = useRef<number>(0)

  // Only show in development
  if (process.env.NODE_ENV !== "development") {
    return null
  }

  const startMessageTimer = () => {
    startTimeRef.current = performance.now()
    messageSentTimeRef.current = performance.now()
    setCurrentSession({ messageDisplayTime: 0 })
  }

  const recordMessageDisplay = () => {
    const displayTime = performance.now() - messageSentTimeRef.current
    setCurrentSession(prev => ({ ...prev, messageDisplayTime: displayTime }))
  }

  const recordStreamingStart = () => {
    const streamingTime = performance.now() - startTimeRef.current
    setCurrentSession(prev => ({ ...prev, streamingStartTime: streamingTime }))
  }

  const recordFirstChunk = () => {
    const chunkTime = performance.now() - startTimeRef.current
    setCurrentSession(prev => ({ ...prev, firstChunkTime: chunkTime }))
  }

  const recordFileUpload = (uploadTime: number) => {
    setCurrentSession(prev => ({ ...prev, fileUploadTime: uploadTime }))
  }

  const completeSession = () => {
    const totalTime = performance.now() - startTimeRef.current
    const completedSession = { ...currentSession, totalResponseTime: totalTime }
    
    setMetrics(prev => [...prev, completedSession as PerformanceMetrics])
    setCurrentSession({})
  }

  const getPerformanceGrade = (metrics: PerformanceMetrics): { grade: string; color: string } => {
    if (metrics.messageDisplayTime < 100 && metrics.streamingStartTime < 200) {
      return { grade: "A+", color: "bg-green-500" }
    } else if (metrics.messageDisplayTime < 200 && metrics.streamingStartTime < 500) {
      return { grade: "A", color: "bg-green-400" }
    } else if (metrics.messageDisplayTime < 500 && metrics.streamingStartTime < 1000) {
      return { grade: "B", color: "bg-yellow-400" }
    } else if (metrics.messageDisplayTime < 1000 && metrics.streamingStartTime < 2000) {
      return { grade: "C", color: "bg-orange-400" }
    } else {
      return { grade: "D", color: "bg-red-400" }
    }
  }

  const formatTime = (ms: number): string => {
    if (ms < 1000) return `${Math.round(ms)}ms`
    return `${(ms / 1000).toFixed(1)}s`
  }

  const averageMetrics = metrics.length > 0 ? {
    messageDisplayTime: metrics.reduce((sum, m) => sum + m.messageDisplayTime, 0) / metrics.length,
    streamingStartTime: metrics.reduce((sum, m) => sum + m.streamingStartTime, 0) / metrics.length,
    firstChunkTime: metrics.reduce((sum, m) => sum + (m.firstChunkTime || 0), 0) / metrics.length,
    totalResponseTime: metrics.reduce((sum, m) => sum + m.totalResponseTime, 0) / metrics.length,
    fileUploadTime: metrics.reduce((sum, m) => sum + (m.fileUploadTime || 0), 0) / metrics.length,
  } : null

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={() => setIsVisible(!isVisible)}
        className="fixed bottom-4 right-4 z-50"
      >
        <TimerIcon className="w-4 h-4 mr-2" />
        Performance
      </Button>

      {isVisible && (
        <Card className="fixed bottom-20 right-4 w-96 z-50 max-h-96 overflow-y-auto">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <LightningIcon className="w-4 h-4" />
              Performance Monitor
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Current Session */}
            {Object.keys(currentSession).length > 0 && (
              <div className="space-y-2">
                <h4 className="text-sm font-medium">Current Session</h4>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  {currentSession.messageDisplayTime !== undefined && (
                    <div className="flex justify-between">
                      <span>Message Display:</span>
                      <Badge variant="outline" className="text-xs">
                        {formatTime(currentSession.messageDisplayTime)}
                      </Badge>
                    </div>
                  )}
                  {currentSession.streamingStartTime !== undefined && (
                    <div className="flex justify-between">
                      <span>Streaming Start:</span>
                      <Badge variant="outline" className="text-xs">
                        {formatTime(currentSession.streamingStartTime)}
                      </Badge>
                    </div>
                  )}
                  {currentSession.firstChunkTime !== undefined && (
                    <div className="flex justify-between">
                      <span>First Chunk:</span>
                      <Badge variant="outline" className="text-xs">
                        {formatTime(currentSession.firstChunkTime)}
                      </Badge>
                    </div>
                  )}
                  {currentSession.fileUploadTime !== undefined && (
                    <div className="flex justify-between">
                      <span>File Upload:</span>
                      <Badge variant="outline" className="text-xs">
                        {formatTime(currentSession.fileUploadTime)}
                      </Badge>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Average Metrics */}
            {averageMetrics && (
              <div className="space-y-2">
                <h4 className="text-sm font-medium">Session Averages</h4>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="flex justify-between">
                    <span>Message Display:</span>
                    <Badge variant="outline" className="text-xs">
                      {formatTime(averageMetrics.messageDisplayTime)}
                    </Badge>
                  </div>
                  <div className="flex justify-between">
                    <span>Streaming Start:</span>
                    <Badge variant="outline" className="text-xs">
                      {formatTime(averageMetrics.streamingStartTime)}
                    </Badge>
                  </div>
                  <div className="flex justify-between">
                    <span>First Chunk:</span>
                    <Badge variant="outline" className="text-xs">
                      {formatTime(averageMetrics.firstChunkTime)}
                    </Badge>
                  </div>
                  <div className="flex justify-between">
                    <span>Total Response:</span>
                    <Badge variant="outline" className="text-xs">
                      {formatTime(averageMetrics.totalResponseTime)}
                    </Badge>
                  </div>
                  <div className="flex justify-between">
                    <span>File Upload:</span>
                    <Badge variant="outline" className="text-xs">
                      {formatTime(averageMetrics.fileUploadTime)}
                    </Badge>
                  </div>
                </div>
              </div>
            )}

            {/* Recent Sessions */}
            {metrics.length > 0 && (
              <div className="space-y-2">
                <h4 className="text-sm font-medium">Recent Sessions</h4>
                <div className="space-y-1 max-h-32 overflow-y-auto">
                  {metrics.slice(-5).reverse().map((session, index) => {
                    const grade = getPerformanceGrade(session)
                    return (
                      <div key={index} className="flex items-center justify-between text-xs p-1 bg-muted rounded">
                        <span>Session {metrics.length - index}</span>
                        <div className="flex items-center gap-1">
                          <Badge className={`${grade.color} text-white text-xs`}>
                            {grade.grade}
                          </Badge>
                          <span>{formatTime(session.totalResponseTime)}</span>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Actions */}
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setMetrics([])}
                className="text-xs"
              >
                Clear History
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  startMessageTimer()
                  recordMessageDisplay()
                }}
                className="text-xs"
              >
                Test Message
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </>
  )
}

// Export functions for use in other components
export const performanceMonitor = {
  startMessageTimer: () => {},
  recordMessageDisplay: () => {},
  recordStreamingStart: () => {},
  recordFirstChunk: () => {},
  recordFileUpload: () => {},
  completeSession: () => {},
} 
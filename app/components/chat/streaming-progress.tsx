import { cn } from "@/lib/utils"
import { Clock, Lightning, TrendUp } from "@phosphor-icons/react"
import { useEffect, useState } from "react"

interface StreamingProgressProps {
  isStreaming: boolean
  progress: number
  estimatedTimeRemaining: number
  chunksReceived: number
  className?: string
}

export function StreamingProgress({
  isStreaming,
  progress,
  estimatedTimeRemaining,
  chunksReceived,
  className,
}: StreamingProgressProps) {
  const [showProgress, setShowProgress] = useState(false)

  // Show progress after a short delay to avoid flickering
  useEffect(() => {
    if (isStreaming) {
      const timer = setTimeout(() => setShowProgress(true), 500)
      return () => clearTimeout(timer)
    } else {
      setShowProgress(false)
    }
  }, [isStreaming])

  if (!isStreaming || !showProgress) {
    return null
  }

  const formatTime = (ms: number) => {
    if (ms < 1000) return `${Math.round(ms)}ms`
    return `${Math.round(ms / 1000)}s`
  }

  const getProgressColor = (progress: number) => {
    if (progress < 30) return "bg-muted-foreground"
    if (progress < 70) return "bg-foreground"
    return "bg-muted-foreground"
  }

  const getProgressWidth = (progress: number) => {
    return Math.min(100, Math.max(0, progress))
  }

  return (
    <div
      className={cn(
        "flex items-center gap-3 p-3 bg-muted/50 rounded-lg border border-border/50",
        "animate-in slide-in-from-bottom-2 duration-300",
        className
      )}
    >
      {/* Progress bar */}
      <div className="flex-1">
        <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
          <span>AI Response</span>
          <span>{Math.round(progress)}%</span>
        </div>
        <div className="w-full bg-muted rounded-full h-2 overflow-hidden">
          <div
            className={cn(
              "h-full transition-all duration-300 ease-out",
              getProgressColor(progress)
            )}
            style={{ width: `${getProgressWidth(progress)}%` }}
          />
        </div>
      </div>

      {/* Metrics */}
      <div className="flex items-center gap-4 text-xs text-muted-foreground">
        {/* Chunks received */}
        <div className="flex items-center gap-1">
          <Lightning className="w-3 h-3" />
          <span>{chunksReceived}</span>
        </div>

        {/* Estimated time remaining */}
        {estimatedTimeRemaining > 0 && (
          <div className="flex items-center gap-1">
            <Clock className="w-3 h-3" />
            <span>{formatTime(estimatedTimeRemaining)}</span>
          </div>
        )}

        {/* Performance indicator */}
        <div className="flex items-center gap-1">
          <TrendUp className="w-3 h-3" />
          <span className="text-green-600 dark:text-green-400">
            {chunksReceived > 0 ? "Active" : "Starting"}
          </span>
        </div>
      </div>
    </div>
  )
}

// Enhanced streaming indicator for compact display
export function CompactStreamingIndicator({ 
  isStreaming, 
  className 
}: { 
  isStreaming: boolean
  className?: string 
}) {
  if (!isStreaming) return null

  return (
    <div
      className={cn(
        "flex items-center gap-2 text-xs text-muted-foreground",
        "animate-pulse",
        className
      )}
    >
      <div className="flex space-x-1">
        <div className="w-1.5 h-1.5 bg-muted-foreground rounded-full animate-bounce" 
             style={{ animationDelay: '0ms' }} />
        <div className="w-1.5 h-1.5 bg-muted-foreground rounded-full animate-bounce" 
             style={{ animationDelay: '150ms' }} />
        <div className="w-1.5 h-1.5 bg-muted-foreground rounded-full animate-bounce" 
             style={{ animationDelay: '300ms' }} />
      </div>
      <span>Streaming...</span>
    </div>
  )
}

// Performance metrics component
export function StreamingMetrics({ 
  metrics, 
  className 
}: { 
  metrics: {
    totalTime: number
    totalContentLength: number
    totalChunks: number
    averageChunkSize: number
    chunksPerSecond: number
  }
  className?: string 
}) {
  if (!metrics || metrics.totalChunks === 0) return null

  return (
    <div
      className={cn(
        "p-3 bg-muted/30 rounded-lg border border-border/30",
        "text-xs text-muted-foreground",
        className
      )}
    >
      <div className="font-medium mb-2">Streaming Performance</div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <span className="text-muted-foreground">Time:</span>
          <span className="ml-1 font-mono">{Math.round(metrics.totalTime)}ms</span>
        </div>
        <div>
          <span className="text-muted-foreground">Content:</span>
          <span className="ml-1 font-mono">{metrics.totalContentLength} chars</span>
        </div>
        <div>
          <span className="text-muted-foreground">Chunks:</span>
          <span className="ml-1 font-mono">{metrics.totalChunks}</span>
        </div>
        <div>
          <span className="text-muted-foreground">Avg Size:</span>
          <span className="ml-1 font-mono">{Math.round(metrics.averageChunkSize)}</span>
        </div>
        <div className="col-span-2">
          <span className="text-muted-foreground">Speed:</span>
          <span className="ml-1 font-mono">{metrics.chunksPerSecond.toFixed(1)} chunks/s</span>
        </div>
      </div>
    </div>
  )
} 
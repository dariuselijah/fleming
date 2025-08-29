import { useCallback, useRef } from "react"

type PerformanceMetrics = {
  messageDisplayTime: number
  streamingStartTime: number
  firstChunkTime: number
  totalResponseTime: number
  fileUploadTime: number
}

export function usePerformanceMonitor() {
  const startTimeRef = useRef<number>(0)
  const messageSentTimeRef = useRef<number>(0)
  const metricsRef = useRef<PerformanceMetrics[]>([])

  const startMessageTimer = useCallback(() => {
    startTimeRef.current = performance.now()
    messageSentTimeRef.current = performance.now()
    console.log("🚀 Performance monitor: Message timer started")
  }, [])

  const recordMessageDisplay = useCallback(() => {
    const displayTime = performance.now() - messageSentTimeRef.current
    console.log(`⚡ Performance: Message displayed in ${displayTime.toFixed(0)}ms`)
    return displayTime
  }, [])

  const recordStreamingStart = useCallback(() => {
    const streamingTime = performance.now() - startTimeRef.current
    console.log(`🚀 Performance: Streaming started in ${streamingTime.toFixed(0)}ms`)
    return streamingTime
  }, [])

  const recordFirstChunk = useCallback(() => {
    const chunkTime = performance.now() - startTimeRef.current
    console.log(`📦 Performance: First chunk received in ${chunkTime.toFixed(0)}ms`)
    return chunkTime
  }, [])

  const recordFileUpload = useCallback((uploadTime: number) => {
    console.log(`📁 Performance: File upload completed in ${uploadTime.toFixed(0)}ms`)
    return uploadTime
  }, [])

  const completeSession = useCallback(() => {
    const totalTime = performance.now() - startTimeRef.current
    console.log(`✅ Performance: Session completed in ${totalTime.toFixed(0)}ms`)
    return totalTime
  }, [])

  const getPerformanceSummary = useCallback(() => {
    const currentMetrics = {
      messageDisplayTime: messageSentTimeRef.current ? performance.now() - messageSentTimeRef.current : 0,
      streamingStartTime: startTimeRef.current ? performance.now() - startTimeRef.current : 0,
      firstChunkTime: 0, // Will be set when first chunk arrives
      totalResponseTime: 0, // Will be set when session completes
      fileUploadTime: 0, // Will be set when file upload completes
    }

    return {
      current: currentMetrics,
      history: metricsRef.current,
      isActive: startTimeRef.current > 0,
    }
  }, [])

  const resetTimer = useCallback(() => {
    startTimeRef.current = 0
    messageSentTimeRef.current = 0
    console.log("🔄 Performance monitor: Timer reset")
  }, [])

  return {
    startMessageTimer,
    recordMessageDisplay,
    recordStreamingStart,
    recordFirstChunk,
    recordFileUpload,
    completeSession,
    getPerformanceSummary,
    resetTimer,
  }
} 
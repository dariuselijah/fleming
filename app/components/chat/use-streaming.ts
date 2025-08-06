import { useCallback, useRef, useState } from "react"

export interface StreamingConfig {
  chunkSize: number
  minDelay: number
  maxDelay: number
  adaptiveChunking: boolean
  streamingOptimizations: boolean
}

export interface StreamingState {
  isStreaming: boolean
  progress: number
  estimatedTimeRemaining: number
  chunksReceived: number
  lastChunkTime: number
}

export function useStreaming() {
  const [streamingState, setStreamingState] = useState<StreamingState>({
    isStreaming: false,
    progress: 0,
    estimatedTimeRemaining: 0,
    chunksReceived: 0,
    lastChunkTime: 0,
  })

  const streamingRef = useRef<{
    startTime: number
    chunks: string[]
    config: StreamingConfig
  }>({
    startTime: 0,
    chunks: [],
    config: {
      chunkSize: 15,
      minDelay: 50,
      maxDelay: 200,
      adaptiveChunking: true,
      streamingOptimizations: true,
    },
  })

  // Enhanced streaming configuration based on query complexity
  const getStreamingConfig = useCallback((query: string): StreamingConfig => {
    const queryLower = query.toLowerCase()
    
    // Simple queries that can use larger chunks
    const simplePatterns = [
      "hello", "hi", "thanks", "thank you", "goodbye", "bye",
      "what is", "what are", "define", "explain", "describe",
      "how to", "steps", "procedure", "protocol",
      "yes", "no", "ok", "okay", "sure", "fine"
    ]
    
    // Complex queries that need smaller chunks
    const complexPatterns = [
      "differential diagnosis", "diagnosis", "diagnostic",
      "treatment plan", "treatment options", "therapeutic",
      "medication", "drug", "pharmacology", "interaction",
      "imaging", "x-ray", "mri", "ct", "ultrasound", "radiology",
      "laboratory", "lab values", "biomarker", "test results",
      "risk assessment", "prognosis", "complication",
      "guidelines", "evidence", "research", "study",
      "patient", "case", "scenario", "clinical",
      "emergency", "urgent", "critical", "acute"
    ]
    
    const hasComplexPatterns = complexPatterns.some(pattern => queryLower.includes(pattern))
    const hasSimplePatterns = simplePatterns.some(pattern => queryLower.includes(pattern))
    const isLongQuery = query.length > 100
    
    if (hasComplexPatterns || isLongQuery) {
      return {
        chunkSize: 10,
        minDelay: 75,
        maxDelay: 250,
        adaptiveChunking: true,
        streamingOptimizations: true,
      }
    }
    
    if (hasSimplePatterns && query.length < 50) {
      return {
        chunkSize: 20,
        minDelay: 30,
        maxDelay: 100,
        adaptiveChunking: true,
        streamingOptimizations: true,
      }
    }
    
    return {
      chunkSize: 15,
      minDelay: 50,
      maxDelay: 200,
      adaptiveChunking: true,
      streamingOptimizations: true,
    }
  }, [])

  // Start streaming with optimized configuration
  const startStreaming = useCallback((query: string) => {
    const config = getStreamingConfig(query)
    streamingRef.current = {
      startTime: Date.now(),
      chunks: [],
      config,
    }
    
    setStreamingState({
      isStreaming: true,
      progress: 0,
      estimatedTimeRemaining: 0,
      chunksReceived: 0,
      lastChunkTime: Date.now(),
    })
    
    console.log("=== STREAMING STARTED ===")
    console.log("Query:", query.substring(0, 100))
    console.log("Config:", config)
  }, [getStreamingConfig])

  // Process incoming chunk with adaptive chunking
  const processChunk = useCallback((chunk: string) => {
    const now = Date.now()
    const { config, chunks } = streamingRef.current
    
    chunks.push(chunk)
    
    // Calculate adaptive chunking based on response length
    let adaptiveChunkSize = config.chunkSize
    if (config.adaptiveChunking && chunks.length > 5) {
      const avgChunkSize = chunks.slice(-5).join('').length / 5
      if (avgChunkSize > 50) {
        adaptiveChunkSize = Math.max(5, config.chunkSize - 5)
      } else if (avgChunkSize < 10) {
        adaptiveChunkSize = Math.min(30, config.chunkSize + 5)
      }
    }
    
    // Calculate progress and estimated time
    const totalChunks = Math.ceil(chunks.join('').length / adaptiveChunkSize)
    const progress = Math.min(100, (chunks.length / totalChunks) * 100)
    
    const timeSinceStart = now - streamingRef.current.startTime
    const avgTimePerChunk = timeSinceStart / chunks.length
    const remainingChunks = totalChunks - chunks.length
    const estimatedTimeRemaining = Math.max(0, remainingChunks * avgTimePerChunk)
    
    setStreamingState({
      isStreaming: true,
      progress,
      estimatedTimeRemaining,
      chunksReceived: chunks.length,
      lastChunkTime: now,
    })
    
    // Log streaming performance metrics
    if (chunks.length % 10 === 0) {
      console.log("=== STREAMING METRICS ===")
      console.log("Chunks received:", chunks.length)
      console.log("Progress:", progress.toFixed(1) + "%")
      console.log("Estimated time remaining:", Math.round(estimatedTimeRemaining / 1000) + "s")
      console.log("Average chunk size:", avgChunkSize.toFixed(1))
    }
  }, [])

  // Stop streaming and calculate final metrics
  const stopStreaming = useCallback(() => {
    const { startTime, chunks } = streamingRef.current
    const totalTime = Date.now() - startTime
    const totalContent = chunks.join('')
    
    console.log("=== STREAMING FINISHED ===")
    console.log("Total time:", totalTime + "ms")
    console.log("Total content length:", totalContent.length)
    console.log("Total chunks:", chunks.length)
    console.log("Average chunk size:", (totalContent.length / chunks.length).toFixed(1))
    console.log("Chunks per second:", (chunks.length / (totalTime / 1000)).toFixed(1))
    
    setStreamingState({
      isStreaming: false,
      progress: 100,
      estimatedTimeRemaining: 0,
      chunksReceived: chunks.length,
      lastChunkTime: Date.now(),
    })
  }, [])

  // Get streaming performance metrics
  const getStreamingMetrics = useCallback(() => {
    const { startTime, chunks } = streamingRef.current
    const totalTime = Date.now() - startTime
    const totalContent = chunks.join('')
    
    return {
      totalTime,
      totalContentLength: totalContent.length,
      totalChunks: chunks.length,
      averageChunkSize: chunks.length > 0 ? totalContent.length / chunks.length : 0,
      chunksPerSecond: totalTime > 0 ? chunks.length / (totalTime / 1000) : 0,
      config: streamingRef.current.config,
    }
  }, [])

  // Optimize streaming based on network conditions
  const optimizeStreaming = useCallback((networkLatency: number) => {
    const { config } = streamingRef.current
    
    if (networkLatency > 200) {
      // High latency - use larger chunks
      config.chunkSize = Math.min(30, config.chunkSize + 5)
      config.minDelay = Math.max(100, config.minDelay + 25)
    } else if (networkLatency < 50) {
      // Low latency - use smaller chunks
      config.chunkSize = Math.max(5, config.chunkSize - 2)
      config.minDelay = Math.max(25, config.minDelay - 10)
    }
    
    console.log("=== STREAMING OPTIMIZED ===")
    console.log("Network latency:", networkLatency + "ms")
    console.log("New config:", config)
  }, [])

  return {
    streamingState,
    startStreaming,
    processChunk,
    stopStreaming,
    getStreamingMetrics,
    optimizeStreaming,
    getStreamingConfig,
  }
} 
/**
 * Retrieval Pipeline Metrics
 *
 * Tracks per-query timing breakdown (embedding, search, rerank, total),
 * cache hit/miss rates, and result quality indicators.
 * Outputs structured JSON logs for downstream analysis and LangSmith traces.
 */

export interface RetrievalTimings {
  embeddingMs: number
  searchMs: number
  rerankMs: number
  fetchMs: number
  totalMs: number
}

export interface RetrievalMetricsEvent {
  queryId: string
  query: string
  timestamp: number
  timings: RetrievalTimings
  resultCount: number
  cacheHit: boolean
  cacheLevel: "L1" | "L2" | "L3" | "semantic" | "miss"
  source: "evidence" | "pubmed" | "upload" | "guideline" | "web"
  filters?: Record<string, unknown>
  topScore?: number
  avgScore?: number
}

let metricsBuffer: RetrievalMetricsEvent[] = []
const MAX_BUFFER_SIZE = 500

let metricsIdCounter = 0

export function nextQueryId(): string {
  metricsIdCounter++
  return `q_${Date.now()}_${metricsIdCounter}`
}

/**
 * High-resolution timer helper.
 * Returns a stop function that yields elapsed milliseconds.
 */
export function startTimer(): () => number {
  const start = performance.now()
  return () => Math.round(performance.now() - start)
}

/**
 * Record a retrieval metrics event.
 * Logs structured JSON and buffers for batch export.
 */
export function recordRetrievalMetrics(event: RetrievalMetricsEvent): void {
  // Structured log (consumable by log aggregators)
  console.log(
    JSON.stringify({
      _type: "retrieval_metrics",
      ...event,
    }),
  )

  metricsBuffer.push(event)
  if (metricsBuffer.length > MAX_BUFFER_SIZE) {
    metricsBuffer = metricsBuffer.slice(-MAX_BUFFER_SIZE)
  }
}

/**
 * Get recent metrics for dashboards / health endpoints.
 */
export function getRecentMetrics(limit = 50): RetrievalMetricsEvent[] {
  return metricsBuffer.slice(-limit)
}

/**
 * Aggregate summary stats over the metrics buffer.
 */
export function getMetricsSummary(): {
  totalQueries: number
  cacheHitRate: number
  avgTotalMs: number
  avgEmbeddingMs: number
  avgSearchMs: number
  avgRerankMs: number
  p95TotalMs: number
  avgResultCount: number
} {
  const events = metricsBuffer
  if (events.length === 0) {
    return {
      totalQueries: 0,
      cacheHitRate: 0,
      avgTotalMs: 0,
      avgEmbeddingMs: 0,
      avgSearchMs: 0,
      avgRerankMs: 0,
      p95TotalMs: 0,
      avgResultCount: 0,
    }
  }

  const cacheHits = events.filter((e) => e.cacheHit).length
  const totals = events.map((e) => e.timings.totalMs).sort((a, b) => a - b)
  const p95Idx = Math.min(Math.floor(totals.length * 0.95), totals.length - 1)

  return {
    totalQueries: events.length,
    cacheHitRate: cacheHits / events.length,
    avgTotalMs: Math.round(avg(events.map((e) => e.timings.totalMs))),
    avgEmbeddingMs: Math.round(avg(events.map((e) => e.timings.embeddingMs))),
    avgSearchMs: Math.round(avg(events.map((e) => e.timings.searchMs))),
    avgRerankMs: Math.round(avg(events.map((e) => e.timings.rerankMs))),
    p95TotalMs: totals[p95Idx],
    avgResultCount: Math.round(avg(events.map((e) => e.resultCount)) * 10) / 10,
  }
}

function avg(values: number[]): number {
  if (values.length === 0) return 0
  return values.reduce((sum, v) => sum + v, 0) / values.length
}

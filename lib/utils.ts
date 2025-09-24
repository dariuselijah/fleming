import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Format a number with commas for thousands, etc
 */
export function formatNumber(n: number) {
  return new Intl.NumberFormat("en-US").format(n)
}

/**
 * Creates a debounced function that delays invoking the provided function until after
 * the specified wait time has elapsed since the last time it was invoked.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function debounce<T extends (...args: any[]) => any>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: NodeJS.Timeout | null = null

  return function (...args: Parameters<T>): void {
    if (timeout) {
      clearTimeout(timeout)
    }

    timeout = setTimeout(() => {
      func(...args)
    }, wait)
  }
}

export const isDev = process.env.NODE_ENV === "development"

// Streaming optimization utilities
export const streamingUtils = {
  // Debounce function for streaming updates to prevent excessive re-renders
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  debounce: <T extends (...args: any[]) => any>(
    func: T,
    wait: number
  ): ((...args: Parameters<T>) => void) => {
    let timeout: NodeJS.Timeout
    return (...args: Parameters<T>) => {
      clearTimeout(timeout)
      timeout = setTimeout(() => func(...args), wait)
    }
  },

  // Throttle function for streaming updates to maintain smooth performance
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  throttle: <T extends (...args: any[]) => any>(
    func: T,
    limit: number
  ): ((...args: Parameters<T>) => void) => {
    let inThrottle: boolean
    return (...args: Parameters<T>) => {
      if (!inThrottle) {
        func(...args)
        inThrottle = true
        setTimeout(() => (inThrottle = false), limit)
      }
    }
  },

  // Optimize streaming chunk size for better performance
  getOptimalChunkSize: (content: string): number => {
    // For short content, use smaller chunks for instant feel
    if (content.length < 100) return 10
    // For medium content, use medium chunks
    if (content.length < 500) return 25
    // For long content, use larger chunks for efficiency
    return 50
  },

  // Batch streaming updates for better performance
  batchUpdates: <T>(
    updates: T[],
    batchSize: number = 5
  ): T[][] => {
    const batches: T[][] = []
    for (let i = 0; i < updates.length; i += batchSize) {
      batches.push(updates.slice(i, i + batchSize))
    }
    return batches
  },

  // Optimize markdown rendering during streaming
  optimizeMarkdownForStreaming: (content: string): string => {
    // Remove excessive whitespace during streaming for cleaner appearance
    return content
      .replace(/\n{3,}/g, '\n\n') // Limit consecutive newlines
      .replace(/\s{2,}/g, ' ') // Limit consecutive spaces
  }
}

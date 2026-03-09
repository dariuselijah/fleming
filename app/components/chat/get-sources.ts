import type { Message as MessageAISDK } from "@ai-sdk/react"

export function getSources(parts: MessageAISDK["parts"]) {
  if (!parts || parts.length === 0) {
    return []
  }
  
  const sources = parts
    ?.filter(
      (part) => part.type === "source" || part.type === "tool-invocation"
    )
    .map((part) => {
      if (part.type === "source") {
        return part.source
      }

      if (
        part.type === "tool-invocation" &&
        part.toolInvocation.state === "result"
      ) {
        const result = part.toolInvocation.result
        

        if (
          part.toolInvocation.toolName === "summarizeSources" &&
          result?.result?.[0]?.citations
        ) {
          return result.result.flatMap((item: { citations?: unknown[] }) => item.citations || [])
        }

        // Check if result contains sources directly
        if (result && typeof result === "object") {
          // Try various possible source formats
          if (Array.isArray(result)) {
            return result.flat()
          }
          if (result.sources && Array.isArray(result.sources)) {
            return result.sources
          }
          if (result.citations && Array.isArray(result.citations)) {
            // xAI/tool results can return citations in mixed shapes. Normalize defensively.
            return result.citations
              .map((citation: unknown) => normalizeSourceUrl(citation))
              .filter((url: string | null): url is string => Boolean(url))
              .map((url: string) => ({
                url,
                title: extractTitleFromUrl(url),
              }))
          }
          // Return the result itself if it looks like a source
          if (result.url) {
            return result
          }
        }

        return Array.isArray(result) ? result.flat() : result
      }

      return null
    })
    .filter(Boolean)
    .flat()

  const validSources =
    sources?.filter(
      (source) => {
        // Handle both object sources and string URLs (from xAI citations)
        if (typeof source === "string") {
          return source.startsWith("http")
        }
        return (
          source &&
          typeof source === "object" &&
          typeof (source as { url?: unknown }).url === "string" &&
          (source as { url: string }).url !== ""
        )
      }
    )
    .map((source) => {
      // Convert string URLs to source objects
      if (typeof source === "string") {
        return {
          url: source,
          title: extractTitleFromUrl(source),
        }
      }
      return source
    }) || []

  return validSources
}

function normalizeSourceUrl(value: unknown): string | null {
  if (typeof value === "string") {
    return value
  }
  if (value && typeof value === "object") {
    const candidate = (value as { url?: unknown; href?: unknown }).url
    if (typeof candidate === "string") {
      return candidate
    }
    const href = (value as { href?: unknown }).href
    if (typeof href === "string") {
      return href
    }
  }
  return null
}

function extractTitleFromUrl(url: unknown): string {
  const safeUrl =
    typeof url === "string" ? url : normalizeSourceUrl(url) || String(url ?? "")
  if (!safeUrl) {
    return "Source"
  }

  try {
    const urlObj = new URL(safeUrl)
    const hostname = urlObj.hostname
    
    // Extract meaningful title from URL
    if (hostname.includes('pubmed')) {
      return 'PubMed Article'
    }
    if (hostname.includes('jama')) {
      return 'JAMA Article'
    }
    if (hostname.includes('nejm')) {
      return 'NEJM Article'
    }
    
    // Try to extract from path
    const pathParts = urlObj.pathname.split('/').filter(p => p)
    if (pathParts.length > 0) {
      return pathParts[pathParts.length - 1].replace(/-/g, ' ').substring(0, 50)
    }
    
    return hostname.replace(/^www\./, '')
  } catch {
    return safeUrl.substring(0, 50)
  }
}

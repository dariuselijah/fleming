"use client"

import { FilePdf, SpinnerGap } from "@phosphor-icons/react"
import { useEffect, useMemo, useRef, useState } from "react"

type PdfJsRuntime = any
type PdfDocument = any

function normalizeForSearch(value: string): string {
  let normalized = ""
  let previousWasSpace = false
  for (const char of value) {
    const isSpace = /\s/.test(char)
    if (isSpace) {
      if (!previousWasSpace) {
        normalized += " "
      }
      previousWasSpace = true
      continue
    }
    normalized += char.toLowerCase()
    previousWasSpace = false
  }
  return normalized.trim()
}

function normalizeWithMap(value: string): { normalized: string; map: number[] } {
  let normalized = ""
  const map: number[] = []
  let previousWasSpace = false

  for (let index = 0; index < value.length; index += 1) {
    const char = value[index]
    const isSpace = /\s/.test(char)
    if (isSpace) {
      if (!previousWasSpace) {
        normalized += " "
        map.push(index)
      }
      previousWasSpace = true
      continue
    }

    normalized += char.toLowerCase()
    map.push(index)
    previousWasSpace = false
  }

  return { normalized, map }
}

function buildJoinedTextAndRanges(textItems: Array<{ str?: string }>): {
  joinedText: string
  ranges: Array<{ start: number; end: number }>
} {
  const ranges: Array<{ start: number; end: number }> = []
  let joinedText = ""

  textItems.forEach((item, itemIndex) => {
    const text = typeof item.str === "string" ? item.str : ""
    const start = joinedText.length
    joinedText += text
    const end = joinedText.length
    ranges.push({ start, end })

    if (itemIndex < textItems.length - 1) {
      joinedText += " "
    }
  })

  return { joinedText, ranges }
}

function findTextRangeInJoinedContent(joinedText: string, highlightText: string): { start: number; end: number } | null {
  const candidate = highlightText.trim()
  if (!candidate) return null

  const directIndex = joinedText.toLowerCase().indexOf(candidate.toLowerCase())
  if (directIndex >= 0) {
    return {
      start: directIndex,
      end: directIndex + candidate.length,
    }
  }

  const stream = normalizeWithMap(joinedText)
  const normalizedCandidate = normalizeForSearch(candidate)
  if (!normalizedCandidate) return null

  const normalizedIndex = stream.normalized.indexOf(normalizedCandidate)
  if (normalizedIndex < 0) return null

  const start = stream.map[normalizedIndex]
  const endMapIndex = normalizedIndex + normalizedCandidate.length - 1
  const end = (stream.map[endMapIndex] ?? start) + 1
  if (typeof start !== "number" || typeof end !== "number") return null

  return { start, end }
}

function resolveHighlightedItemIndexes(
  textItems: Array<{ str?: string }>,
  highlightText: string
): Set<number> {
  if (!highlightText.trim()) return new Set<number>()
  const { joinedText, ranges } = buildJoinedTextAndRanges(textItems)
  const match = findTextRangeInJoinedContent(joinedText, highlightText)
  if (!match) return new Set<number>()

  const highlighted = new Set<number>()
  ranges.forEach((range, index) => {
    if (range.end > match.start && range.start < match.end) {
      highlighted.add(index)
    }
  })
  return highlighted
}

function applyTextHighlights(
  textLayerElement: HTMLDivElement,
  textDivElements: HTMLElement[],
  highlightedIndexes: Set<number>
) {
  const fallbackSpans = Array.from(textLayerElement.querySelectorAll("span")) as HTMLElement[]
  const targetElements = textDivElements.length > 0 ? textDivElements : fallbackSpans

  targetElements.forEach((element, index) => {
    if (highlightedIndexes.has(index)) {
      element.classList.add("pdf-highlight-token")
    } else {
      element.classList.remove("pdf-highlight-token")
    }
  })
}

export function PdfTextLayerViewer({
  fileUrl,
  pageNumber,
  highlightText,
}: {
  fileUrl: string | null
  pageNumber: number
  highlightText: string
}) {
  const [pdfJs, setPdfJs] = useState<PdfJsRuntime | null>(null)
  const [pdfDocument, setPdfDocument] = useState<PdfDocument | null>(null)
  const [pageCount, setPageCount] = useState<number>(0)
  const [isBootstrapping, setIsBootstrapping] = useState(true)
  const [isRenderingPage, setIsRenderingPage] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [viewerWidth, setViewerWidth] = useState(0)

  const canvasRef = useRef<HTMLCanvasElement>(null)
  const textLayerRef = useRef<HTMLDivElement>(null)
  const viewportRef = useRef<HTMLDivElement>(null)

  const normalizedPage = useMemo(() => {
    if (!Number.isFinite(pageNumber) || pageNumber < 1) return 1
    if (pageCount > 0) return Math.min(pageCount, Math.floor(pageNumber))
    return Math.floor(pageNumber)
  }, [pageCount, pageNumber])

  useEffect(() => {
    let cancelled = false
    setIsBootstrapping(true)
    ;(async () => {
      try {
        const runtime = await import("pdfjs-dist/legacy/build/pdf.mjs")
        try {
          runtime.GlobalWorkerOptions.workerSrc = new URL(
            "pdfjs-dist/build/pdf.worker.min.mjs",
            import.meta.url
          ).toString()
        } catch {
          runtime.GlobalWorkerOptions.workerSrc =
            "https://unpkg.com/pdfjs-dist@5.5.207/build/pdf.worker.min.mjs"
        }
        if (!cancelled) {
          setPdfJs(runtime)
          setError(null)
        }
      } catch (runtimeError) {
        if (!cancelled) {
          setError(runtimeError instanceof Error ? runtimeError.message : "Failed to initialize PDF renderer")
        }
      } finally {
        if (!cancelled) {
          setIsBootstrapping(false)
        }
      }
    })()

    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!pdfJs || !fileUrl) {
      setPdfDocument(null)
      setPageCount(0)
      return
    }

    let cancelled = false
    let activeDocument: PdfDocument | null = null
    const loadingTask = pdfJs.getDocument({
      url: fileUrl,
      withCredentials: false,
    } as any)

    setError(null)

    loadingTask.promise
      .then((loadedDocument: PdfDocument) => {
        activeDocument = loadedDocument
        if (cancelled) {
          loadedDocument.destroy?.()
          return
        }
        setPdfDocument(loadedDocument)
        setPageCount(Number(loadedDocument.numPages) || 0)
      })
      .catch((documentError: unknown) => {
        if (cancelled) return
        setPdfDocument(null)
        setPageCount(0)
        setError(documentError instanceof Error ? documentError.message : "Failed to load PDF file")
      })

    return () => {
      cancelled = true
      loadingTask.destroy?.()
      activeDocument?.destroy?.()
    }
  }, [fileUrl, pdfJs])

  useEffect(() => {
    const element = viewportRef.current
    if (!element) return

    const observer = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width ?? 0
      setViewerWidth(Math.max(0, width))
    })
    observer.observe(element)

    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    if (!pdfJs || !pdfDocument || !canvasRef.current || !textLayerRef.current) return
    if (viewerWidth <= 0) return

    let cancelled = false
    setIsRenderingPage(true)
    setError(null)

    ;(async () => {
      try {
        const page = await pdfDocument.getPage(normalizedPage)
        if (cancelled) return

        const baseViewport = page.getViewport({ scale: 1 })
        const maxWidth = Math.max(280, viewerWidth - 24)
        const scale = Math.max(0.35, maxWidth / baseViewport.width)
        const viewport = page.getViewport({ scale })

        const canvas = canvasRef.current
        const textLayerElement = textLayerRef.current
        if (!canvas || !textLayerElement) return

        const context = canvas.getContext("2d", { alpha: false })
        if (!context) {
          throw new Error("Unable to initialize canvas context")
        }

        const devicePixelRatio = window.devicePixelRatio || 1
        canvas.width = Math.floor(viewport.width * devicePixelRatio)
        canvas.height = Math.floor(viewport.height * devicePixelRatio)
        canvas.style.width = `${viewport.width}px`
        canvas.style.height = `${viewport.height}px`

        const renderTask = page.render({
          canvasContext: context,
          viewport,
          transform: devicePixelRatio === 1 ? undefined : [devicePixelRatio, 0, 0, devicePixelRatio, 0, 0],
        } as any)
        await renderTask.promise
        if (cancelled) return

        textLayerElement.innerHTML = ""
        textLayerElement.style.width = `${viewport.width}px`
        textLayerElement.style.height = `${viewport.height}px`

        const textContent = await page.getTextContent()
        if (cancelled) return

        const textItems = Array.isArray(textContent?.items) ? textContent.items : []
        const highlightedIndexes = resolveHighlightedItemIndexes(textItems as Array<{ str?: string }>, highlightText)

        const textDivElements: HTMLElement[] = []
        if (typeof pdfJs.renderTextLayer === "function") {
          const textLayerTask = pdfJs.renderTextLayer({
            textContentSource: textContent,
            container: textLayerElement,
            viewport,
            textDivs: textDivElements,
          } as any)
          if (textLayerTask?.promise) {
            await textLayerTask.promise
          } else if (textLayerTask && typeof textLayerTask.then === "function") {
            await textLayerTask
          }
        } else if (typeof pdfJs.TextLayer === "function") {
          const textLayer = new pdfJs.TextLayer({
            textContentSource: textContent,
            container: textLayerElement,
            viewport,
          } as any)
          await textLayer.render()
        }

        if (cancelled) return
        applyTextHighlights(textLayerElement, textDivElements, highlightedIndexes)
      } catch (renderError) {
        if (!cancelled) {
          setError(renderError instanceof Error ? renderError.message : "Failed to render PDF page")
        }
      } finally {
        if (!cancelled) {
          setIsRenderingPage(false)
        }
      }
    })()

    return () => {
      cancelled = true
    }
  }, [highlightText, normalizedPage, pdfDocument, pdfJs, viewerWidth])

  if (isBootstrapping) {
    return (
      <div className="text-muted-foreground flex h-full items-center justify-center text-sm">
        <SpinnerGap className="mr-2 size-4 animate-spin" />
        Initializing PDF viewer...
      </div>
    )
  }

  if (!fileUrl) {
    return (
      <div className="text-muted-foreground flex h-full items-center justify-center text-sm">
        <FilePdf className="mr-2 size-5" />
        Preview unavailable.
      </div>
    )
  }

  return (
    <div ref={viewportRef} className="relative h-full w-full overflow-auto bg-muted/10 p-3">
      <div className="mx-auto w-fit rounded-xl border border-border/60 bg-background p-1.5 shadow-sm">
        <div className="relative">
          <canvas ref={canvasRef} className="block max-w-full rounded-md" />
          <div ref={textLayerRef} className="pdf-text-layer pointer-events-none absolute left-0 top-0" />
        </div>
      </div>

      {isRenderingPage ? (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-background/35">
          <div className="inline-flex items-center rounded-full border border-border/70 bg-background/95 px-3 py-1.5 text-xs text-foreground shadow-sm">
            <SpinnerGap className="mr-2 size-3.5 animate-spin" />
            Rendering page {normalizedPage}
          </div>
        </div>
      ) : null}

      {error ? (
        <div className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-700 dark:text-red-300">
          {error}
        </div>
      ) : null}

      <style jsx global>{`
        .pdf-text-layer {
          opacity: 1;
          line-height: 1;
        }

        .pdf-text-layer span,
        .pdf-text-layer br {
          color: transparent;
          position: absolute;
          transform-origin: 0% 0%;
          white-space: pre;
          cursor: text;
        }

        .pdf-text-layer .pdf-highlight-token {
          background: rgba(245, 158, 11, 0.38);
          border-radius: 2px;
          box-shadow: 0 0 0 1px rgba(245, 158, 11, 0.24);
        }

        .dark .pdf-text-layer .pdf-highlight-token {
          background: rgba(251, 191, 36, 0.32);
          box-shadow: 0 0 0 1px rgba(251, 191, 36, 0.2);
        }
      `}</style>
    </div>
  )
}

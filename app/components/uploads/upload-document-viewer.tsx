"use client"

import { cn } from "@/lib/utils"
import { getUserUploadDetail } from "@/lib/uploads/api"
import type { UserUploadDetail } from "@/lib/uploads/types"
import { PdfTextLayerViewer } from "./pdf-text-layer-viewer"
import { ArrowClockwise, SpinnerGap, X } from "@phosphor-icons/react"
import { useRouter, useSearchParams } from "next/navigation"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"

function toInt(value: string | null): number | null {
  if (!value) return null
  const parsed = Number.parseInt(value, 10)
  return Number.isFinite(parsed) ? parsed : null
}

function renderHighlightedExcerpt(
  text: string,
  highlightRange: { start: number; end: number } | null,
  highlightRef: React.RefObject<HTMLSpanElement | null>
) {
  if (!text) {
    return <p className="text-muted-foreground text-sm">No extracted text available for this unit.</p>
  }
  if (!highlightRange) {
    return <p className="whitespace-pre-wrap text-sm leading-6">{text}</p>
  }

  const start = Math.max(0, Math.min(highlightRange.start, text.length))
  const end = Math.max(start, Math.min(highlightRange.end, text.length))

  return (
    <p className="whitespace-pre-wrap text-sm leading-6">
      {text.slice(0, start)}
      <span
        ref={highlightRef}
        className="rounded-md bg-amber-300/45 px-0.5 py-0.5 text-foreground dark:bg-amber-400/35"
      >
        {text.slice(start, end)}
      </span>
      {text.slice(end)}
    </p>
  )
}

export function UploadDocumentViewer({
  uploadId,
  isModal = false,
}: {
  uploadId: string
  isModal?: boolean
}) {
  const router = useRouter()
  const params = useSearchParams()
  const [upload, setUpload] = useState<UserUploadDetail | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedUnitId, setSelectedUnitId] = useState<string | null>(null)
  const highlightRef = useRef<HTMLSpanElement>(null)

  const unitTypeParam = params.get("unitType")
  const normalizedUnitTypeParam = unitTypeParam?.toLowerCase() ?? null
  const unitNumberParam = toInt(params.get("unitNumber"))
  const sourceUnitIdParam = params.get("sourceUnitId")
  const chunkIdParam = params.get("chunkId")
  const startParam = toInt(params.get("start"))
  const endParam = toInt(params.get("end"))
  const searchParam = params.get("search")?.trim() || ""
  const returnToParam = params.get("returnTo")

  const closeViewer = useCallback(() => {
    if (isModal) {
      router.back()
      return
    }
    const fallback = "/uploads"
    const safeReturnTo =
      typeof returnToParam === "string" && returnToParam.startsWith("/") ? returnToParam : fallback
    router.replace(safeReturnTo)
  }, [isModal, returnToParam, router])

  useEffect(() => {
    let cancelled = false
    setIsLoading(true)
    setError(null)
    getUserUploadDetail(uploadId)
      .then((detail) => {
        if (cancelled) return
        setUpload(detail)
      })
      .catch((err) => {
        if (cancelled) return
        setError(err instanceof Error ? err.message : "Failed to load document")
      })
      .finally(() => {
        if (cancelled) return
        setIsLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [uploadId])

  useEffect(() => {
    if (!upload) return
    const candidate =
      (sourceUnitIdParam
        ? upload.sourceUnits.find((unit) => unit.id === sourceUnitIdParam)
        : null) ||
      (chunkIdParam
        ? upload.sourceUnits.find((unit) => unit.chunks.some((chunk) => chunk.id === chunkIdParam))
        : null) ||
      (normalizedUnitTypeParam && unitNumberParam
        ? upload.sourceUnits.find(
            (unit) =>
              unit.unitType.toLowerCase() === normalizedUnitTypeParam &&
              unit.unitNumber === unitNumberParam
          )
        : null) ||
      upload.sourceUnits[0] ||
      null

    setSelectedUnitId(candidate?.id ?? null)
  }, [chunkIdParam, normalizedUnitTypeParam, sourceUnitIdParam, unitNumberParam, upload])

  const selectedUnit = useMemo(() => {
    if (!upload || !selectedUnitId) return null
    return upload.sourceUnits.find((unit) => unit.id === selectedUnitId) ?? null
  }, [selectedUnitId, upload])

  const selectedChunk = useMemo(() => {
    if (!selectedUnit || !chunkIdParam) return null
    return selectedUnit.chunks.find((chunk) => chunk.id === chunkIdParam) ?? null
  }, [chunkIdParam, selectedUnit])

  const highlightRange = useMemo(() => {
    if (!selectedUnit) return null
    const textLength = selectedUnit.extractedText.length

    if (
      typeof startParam === "number" &&
      typeof endParam === "number" &&
      startParam >= 0 &&
      endParam > startParam &&
      startParam < textLength &&
      endParam <= textLength
    ) {
      return {
        start: startParam,
        end: endParam,
      }
    }

    const fallbackSnippet = (selectedChunk?.chunkText || searchParam).trim()
    if (fallbackSnippet) {
      const index = selectedUnit.extractedText.indexOf(fallbackSnippet)
      if (index >= 0) {
        return {
          start: index,
          end: index + fallbackSnippet.length,
        }
      }
    }

    return null
  }, [endParam, searchParam, selectedChunk?.chunkText, selectedUnit, startParam])

  useEffect(() => {
    if (!highlightRange) return
    const timeout = setTimeout(() => {
      highlightRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "center",
      })
    }, 60)
    return () => clearTimeout(timeout)
  }, [highlightRange, selectedUnitId])

  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        closeViewer()
      }
    }
    window.addEventListener("keydown", handleEscape)
    return () => window.removeEventListener("keydown", handleEscape)
  }, [closeViewer])

  const pdfPage =
    selectedUnit?.unitType === "page"
      ? selectedUnit.unitNumber
      : unitNumberParam && unitNumberParam > 0
        ? unitNumberParam
        : 1

  const isPdfUpload = upload?.mimeType === "application/pdf" || upload?.uploadKind === "pdf"
  const pdfHighlightText = useMemo(() => {
    if (selectedUnit && highlightRange) {
      const snippet = selectedUnit.extractedText.slice(highlightRange.start, highlightRange.end).trim()
      if (snippet.length > 0) {
        return snippet
      }
    }
    return (selectedChunk?.chunkText || searchParam).replace(/\s+/g, " ").trim()
  }, [highlightRange, searchParam, selectedChunk?.chunkText, selectedUnit])

  return (
    <div className="fixed inset-0 z-50">
      <button
        type="button"
        onClick={closeViewer}
        className="absolute inset-0 h-full w-full cursor-default bg-black/50 backdrop-blur-[2px]"
        aria-label="Close viewer backdrop"
      />
      <div className="relative z-10 mx-auto mt-4 flex h-[calc(100dvh-2rem)] w-[calc(100vw-1.5rem)] max-w-[1700px] flex-col overflow-hidden rounded-[28px] border border-white/10 bg-background/95 shadow-2xl sm:mt-6 sm:h-[calc(100dvh-3rem)] sm:w-[calc(100vw-3rem)]">
        <div className="border-b border-border/60 bg-background px-5 py-4">
          <p className="text-muted-foreground text-[10px] uppercase tracking-[0.22em]">Uploads Viewer</p>
          <div className="mt-2 flex items-center justify-between gap-4">
            <div className="min-w-0">
              <h1 className="line-clamp-1 text-xl font-semibold tracking-tight sm:text-2xl">
                {upload?.title || "Loading document"}
              </h1>
              <p className="text-muted-foreground mt-1 line-clamp-1 text-sm">
                {upload ? `${upload.fileName} · ${upload.sourceUnitCount} units` : "Preparing viewer"}
              </p>
            </div>
            <div className="flex items-center gap-1">
              {upload ? (
                <button
                  type="button"
                  onClick={() => window.location.reload()}
                  className="text-muted-foreground hover:text-foreground inline-flex h-9 w-9 items-center justify-center rounded-full transition-colors hover:bg-accent/60"
                  aria-label="Reload viewer"
                >
                  <ArrowClockwise className="size-4" />
                </button>
              ) : null}
              <button
                type="button"
                onClick={closeViewer}
                className="text-muted-foreground hover:text-foreground inline-flex h-9 w-9 items-center justify-center rounded-full transition-colors hover:bg-accent/60"
                aria-label="Close viewer"
              >
                <X className="size-4" />
              </button>
            </div>
          </div>
        </div>

        {isLoading ? (
          <div className="flex min-h-[calc(100dvh-220px)] items-center justify-center">
            <div className="text-muted-foreground inline-flex items-center gap-2 text-sm">
              <SpinnerGap className="size-4 animate-spin" />
              Loading document viewer...
            </div>
          </div>
        ) : error || !upload ? (
          <div className="mx-auto my-10 w-full max-w-3xl px-4">
            <div className="rounded-2xl border border-red-500/20 bg-red-500/5 p-5">
              <p className="text-sm font-medium text-red-700 dark:text-red-300">Failed to load document</p>
              <p className="mt-1 text-sm text-red-700/80 dark:text-red-300/80">
                {error || "Unknown error"}
              </p>
            </div>
          </div>
        ) : !isPdfUpload ? (
          <div className="mx-auto my-10 w-full max-w-3xl px-4">
            <div className="rounded-2xl border border-border/70 bg-background p-6">
              <p className="text-base font-semibold">PDF viewer only</p>
              <p className="text-muted-foreground mt-2 text-sm">
                This viewer currently supports PDF uploads only. This file can still be referenced in chat, but
                in-app page rendering is available for PDFs.
              </p>
              {upload.originalFileUrl ? (
                <a
                  href={upload.originalFileUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-4 inline-flex text-sm font-medium text-primary hover:text-primary/80"
                >
                  Open original file
                </a>
              ) : null}
            </div>
          </div>
        ) : (
          <div className="grid min-h-0 flex-1 gap-4 p-4 lg:grid-cols-[1.25fr_0.9fr]">
            <section className="overflow-hidden rounded-3xl border border-border/60 bg-background shadow-xs">
              <div className="border-b border-border/60 px-4 py-3 text-sm font-medium">PDF page {pdfPage}</div>
              <div className="h-[calc(100%-49px)] min-h-[560px]">
                <PdfTextLayerViewer
                  fileUrl={upload?.originalFileUrl ?? null}
                  pageNumber={pdfPage}
                  highlightText={pdfHighlightText}
                />
              </div>
            </section>

            <section className="flex min-h-[560px] flex-col overflow-hidden rounded-3xl border border-border/60 bg-background shadow-xs">
              <div className="border-b border-border/60 px-4 py-3">
                <p className="text-sm font-medium">Referenced context</p>
                <p className="text-muted-foreground mt-0.5 text-xs">
                  Click units to navigate. Highlight follows cited offsets.
                </p>
              </div>

              <div className="grid flex-1 grid-rows-[220px_1fr]">
                <div className="overflow-y-auto border-b border-border/60 p-3">
                  <div className="grid gap-2 sm:grid-cols-2">
                    {upload.sourceUnits.map((unit) => (
                      <button
                        key={unit.id}
                        type="button"
                        onClick={() => setSelectedUnitId(unit.id)}
                        className={cn(
                          "group overflow-hidden rounded-xl border text-left transition",
                          selectedUnit?.id === unit.id
                            ? "border-primary/40 bg-primary/8"
                            : "border-border/60 hover:border-border"
                        )}
                      >
                        <div className="bg-muted/40 flex h-20 w-full items-center justify-center border-b border-border/40">
                          <span className="text-muted-foreground text-[11px] font-medium uppercase tracking-wide">
                            {unit.unitType} {unit.unitNumber}
                          </span>
                        </div>
                        <div className="p-2">
                          <p className="line-clamp-1 text-xs font-medium">
                            {unit.title || `${unit.unitType} ${unit.unitNumber}`}
                          </p>
                          <p className="text-muted-foreground mt-0.5 text-[11px]">
                            {unit.unitType} {unit.unitNumber}
                          </p>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="overflow-y-auto p-4">
                  {selectedUnit ? (
                    <div>
                      <p className="text-sm font-semibold">
                        {selectedUnit.title || `${selectedUnit.unitType} ${selectedUnit.unitNumber}`}
                      </p>
                      <p className="text-muted-foreground mt-1 text-xs">
                        {selectedUnit.unitType} {selectedUnit.unitNumber}
                        {selectedChunk ? ` · Chunk ${selectedChunk.chunkIndex + 1}` : ""}
                      </p>
                      <div className="mt-3 rounded-xl border border-border/60 bg-muted/20 p-3">
                        {selectedUnit.extractedText ? (
                          renderHighlightedExcerpt(selectedUnit.extractedText, highlightRange, highlightRef)
                        ) : (
                          <div className="space-y-1.5 text-sm">
                            <p className="text-foreground/90">No extracted text is available for this unit yet.</p>
                            <p className="text-muted-foreground text-xs">
                              {selectedUnit.ocrStatus === "pending"
                                ? "This page is likely image-based/scanned. Reprocess will continue using best-effort extraction."
                                : "If this is a scanned page, OCR is required for text-level citations."}
                            </p>
                          </div>
                        )}
                      </div>
                    </div>
                  ) : (
                    <p className="text-muted-foreground text-sm">No source unit available.</p>
                  )}
                </div>
              </div>
            </section>
          </div>
        )}
      </div>
    </div>
  )
}

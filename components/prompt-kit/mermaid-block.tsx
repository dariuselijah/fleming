"use client"

import { cn } from "@/lib/utils"
import mermaid from "mermaid"
import { useTheme } from "next-themes"
import { useEffect, useMemo, useState } from "react"

type MermaidBlockProps = {
  code: string
  className?: string
}

let initializedTheme: "default" | "dark" | null = null
let mermaidRenderQueue: Promise<void> = Promise.resolve()

function ensureMermaidInitialized(theme: "default" | "dark") {
  if (initializedTheme === theme) return
  mermaid.initialize({
    startOnLoad: false,
    securityLevel: "loose",
    suppressErrorRendering: true,
    theme,
  })
  initializedTheme = theme
}

function queueMermaidRender<T>(task: () => Promise<T>): Promise<T> {
  const run = mermaidRenderQueue.then(task, task)
  mermaidRenderQueue = run.then(
    () => undefined,
    () => undefined
  )
  return run
}

function normalizeMermaidSource(input: string): string {
  if (!input) return ""
  let source = input
    .replace(/\r\n?/g, "\n")
    .replace(/^\uFEFF/, "")
    .trim()

  // Tolerate accidental markdown fences inside fenced blocks.
  source = source
    .replace(/^```(?:mermaid)?\s*\n?/i, "")
    .replace(/\n?```\s*$/i, "")
    .trim()

  return source
}

function extractLikelyDiagramSegment(input: string): string {
  if (!input) return input
  const starters = [
    "flowchart",
    "graph",
    "sequenceDiagram",
    "classDiagram",
    "stateDiagram",
    "erDiagram",
    "journey",
    "gantt",
    "pie",
    "mindmap",
    "timeline",
    "quadrantChart",
    "xychart-beta",
    "requirementDiagram",
    "gitGraph",
    "packet",
  ]
  const pattern = new RegExp(`\\b(${starters.join("|")})\\b`, "i")
  const match = pattern.exec(input)
  if (!match) return input
  return input.slice(match.index).trim()
}

export function MermaidBlock({ code, className }: MermaidBlockProps) {
  const { resolvedTheme } = useTheme()
  const [svgMarkup, setSvgMarkup] = useState<string | null>(null)
  const [renderError, setRenderError] = useState<string | null>(null)
  const normalizedCode = useMemo(() => code.trim(), [code])
  const mermaidTheme: "default" | "dark" =
    resolvedTheme === "dark" ? "dark" : "default"

  useEffect(() => {
    let isActive = true

    async function renderDiagram() {
      if (!normalizedCode) {
        if (isActive) {
          setSvgMarkup(null)
          setRenderError("Diagram source is empty.")
        }
        return
      }

      try {
        ensureMermaidInitialized(mermaidTheme)

        const candidates = Array.from(
          new Set([
            normalizeMermaidSource(normalizedCode),
            extractLikelyDiagramSegment(normalizeMermaidSource(normalizedCode)),
          ])
        ).filter(Boolean)

        let lastError: unknown = null
        let svg: string | null = null

        for (const candidate of candidates) {
          try {
            const result = await queueMermaidRender(async () => {
              const renderId = `mermaid-${Date.now()}-${Math.random()
                .toString(36)
                .slice(2, 8)}`
              return mermaid.render(renderId, candidate)
            })
            svg = result.svg
            break
          } catch (error) {
            lastError = error
          }
        }

        if (!svg) {
          throw lastError || new Error("Unable to render Mermaid diagram.")
        }

        if (isActive) {
          setSvgMarkup(svg)
          setRenderError(null)
        }
      } catch (error) {
        if (isActive) {
          const message =
            error instanceof Error
              ? error.message
              : "Unable to render Mermaid diagram."
          setSvgMarkup(null)
          setRenderError(message)
        }
      }
    }

    void renderDiagram()

    return () => {
      isActive = false
    }
  }, [mermaidTheme, normalizedCode])

  if (svgMarkup) {
    return (
      <div
        className={cn(
          "my-2 rounded-2xl border border-border/70 bg-gradient-to-b from-background to-muted/20 p-3 shadow-sm",
          className
        )}
      >
        <div
          className="overflow-x-auto [&_svg]:mx-auto [&_svg]:h-auto [&_svg]:max-w-full"
          dangerouslySetInnerHTML={{ __html: svgMarkup }}
        />
      </div>
    )
  }

  return (
    <div
      className={cn(
        "my-2 rounded-2xl border border-border/70 bg-muted/20",
        className
      )}
    >
      <pre className="overflow-x-auto px-3 pt-3 text-xs leading-5">
        <code>{code}</code>
      </pre>
      <p className="text-muted-foreground px-3 pb-2 text-[11px]">
        {renderError
          ? "Unable to render Mermaid diagram. Showing diagram source."
          : "Rendering Mermaid diagram..."}
      </p>
    </div>
  )
}

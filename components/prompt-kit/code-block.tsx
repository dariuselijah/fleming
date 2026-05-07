"use client"

import { cn } from "@/lib/utils"
import { useTheme } from "next-themes"
import React, { useEffect, useState } from "react"
import { codeToHtml } from "shiki"

export type CodeBlockProps = {
  children?: React.ReactNode
  className?: string
} & React.HTMLProps<HTMLDivElement>

function CodeBlock({ children, className, ...props }: CodeBlockProps) {
  return (
    <div
      className={cn(
        "not-prose flex w-full flex-col overflow-clip border",
        "border-border bg-card text-card-foreground rounded-xl",
        className
      )}
      {...props}
    >
      {children}
    </div>
  )
}

export type CodeBlockCodeProps = {
  code: string
  language?: string
  theme?: string
  className?: string
} & React.HTMLProps<HTMLDivElement>

const SHIKI_LANGUAGE_ALIASES: Record<string, string> = {
  chart: "json",
  "chart-spec": "json",
  chartjson: "json",
  healthchart: "json",
}

function normalizeShikiLanguage(language: string): string {
  const normalized = language.trim().toLowerCase()
  return SHIKI_LANGUAGE_ALIASES[normalized] || normalized || "plaintext"
}

function CodeBlockCode({
  code,
  language = "tsx",
  theme = "github-light",
  className,
  ...props
}: CodeBlockCodeProps) {
  const { resolvedTheme: appTheme } = useTheme()
  const [highlightedHtml, setHighlightedHtml] = useState<string | null>(null)

  useEffect(() => {
    let isActive = true

    async function highlight() {
      const preferredTheme = appTheme === "dark" ? "github-dark" : theme
      const normalizedLanguage = normalizeShikiLanguage(language)
      try {
        const html = await codeToHtml(code, {
          lang: normalizedLanguage,
          theme: preferredTheme,
        })
        if (isActive) {
          setHighlightedHtml(html)
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        if (/Language\s+`[^`]+`\s+is not included in this bundle/i.test(message)) {
          try {
            const fallbackHtml = await codeToHtml(code, {
              lang: "plaintext",
              theme: preferredTheme,
            })
            if (isActive) {
              setHighlightedHtml(fallbackHtml)
            }
            return
          } catch {
            // Fall through to plain-code rendering.
          }
        }
        if (isActive) {
          setHighlightedHtml(null)
        }
      }
    }
    void highlight()

    return () => {
      isActive = false
    }
  }, [code, language, appTheme, theme])

  const classNames = cn(
    "w-full overflow-x-auto text-[13px] [&>pre]:px-4 [&>pre]:py-4 [&>pre]:!bg-background",
    className
  )

  // SSR fallback: render plain code if not hydrated yet
  return highlightedHtml ? (
    <div
      className={classNames}
      dangerouslySetInnerHTML={{ __html: highlightedHtml }}
      {...props}
    />
  ) : (
    <div className={classNames} {...props}>
      <pre>
        <code>{code}</code>
      </pre>
    </div>
  )
}

export type CodeBlockGroupProps = React.HTMLAttributes<HTMLDivElement>

function CodeBlockGroup({
  children,
  className,
  ...props
}: CodeBlockGroupProps) {
  return (
    <div
      className={cn("flex items-center justify-between", className)}
      {...props}
    >
      {children}
    </div>
  )
}

export { CodeBlockGroup, CodeBlockCode, CodeBlock }

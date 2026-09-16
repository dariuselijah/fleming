"use client"

import { cn } from "@/lib/utils"
import { useMemo } from "react"
import ReactMarkdown, { type Components } from "react-markdown"
import remarkGfm from "remark-gfm"
import remarkBreaks from "remark-breaks"

type Variant = "user" | "assistant"

function buildComponents(variant: Variant): Components {
  const muted = variant === "user" ? "text-foreground/72" : "text-muted-foreground"
  const body = variant === "user" ? "text-foreground/92" : "text-foreground/85"

  return {
    h1: ({ children }) => (
      <h3 className="mb-2 mt-4 border-b border-border pb-1.5 text-[12px] font-semibold uppercase tracking-[0.12em] text-muted-foreground first:mt-0">
        {children}
      </h3>
    ),
    h2: ({ children }) => (
      <h4 className="mb-2 mt-3.5 text-[13px] font-semibold tracking-tight text-foreground first:mt-0">{children}</h4>
    ),
    h3: ({ children }) => (
      <h5 className="mb-1.5 mt-3 text-[12px] font-semibold text-foreground/90 first:mt-0">{children}</h5>
    ),
    h4: ({ children }) => (
      <h6 className="mb-1 mt-2 text-[11px] font-semibold text-foreground/85 first:mt-0">{children}</h6>
    ),
    p: ({ children }) => (
      <p className={cn("mb-3 text-[13px] leading-[1.55] last:mb-0", body)}>{children}</p>
    ),
    ul: ({ children }) => (
      <ul className="mb-3 ml-0 list-none space-y-2 text-[13px] leading-[1.5] last:mb-0 [&>li]:relative [&>li]:pl-4 [&>li]:before:absolute [&>li]:before:left-0 [&>li]:before:top-[0.55em] [&>li]:before:size-1.5 [&>li]:before:rounded-full [&>li]:before:bg-status-info/70 [&>li]:before:content-['']">
        {children}
      </ul>
    ),
    ol: ({ children }) => (
      <ol className="mb-3 ml-4 list-decimal space-y-2 text-[13px] leading-[1.5] marker:font-medium marker:text-status-info-foreground dark:marker:text-status-info last:mb-0">
        {children}
      </ol>
    ),
    li: ({ children }) => (
      <li className={cn("leading-relaxed [&>p]:mb-2 [&>p:last-child]:mb-0", muted)}>{children}</li>
    ),
    strong: ({ children }) => <strong className="font-semibold text-foreground">{children}</strong>,
    em: ({ children }) => <em className="italic text-foreground/85">{children}</em>,
    a: ({ href, children }) => (
      <a
        href={href}
        target="_blank"
        rel="noreferrer noopener"
        className="font-medium text-status-info-foreground underline decoration-status-info/35 underline-offset-[3px] transition-colors hover:text-status-info-foreground/80 hover:decoration-status-info/55 dark:text-status-info"
      >
        {children}
      </a>
    ),
    blockquote: ({ children }) => (
      <blockquote className="mb-3 rounded-r-lg border-l-2 border-status-info/45 bg-muted/50 py-2 pl-3 pr-2 text-[12px] leading-relaxed text-muted-foreground last:mb-0">
        {children}
      </blockquote>
    ),
    hr: () => <hr className="my-4 border-0 border-t border-border" />,
    code: ({ className, children }) => {
      const inline = !className
      if (inline) {
        return (
          <code className="rounded-md bg-muted px-1.5 py-px font-mono text-[11.5px] text-status-info-foreground dark:text-status-info">
            {children}
          </code>
        )
      }
      return (
        <code className={cn("font-mono text-[11.5px] text-foreground/85", className)}>
          {children}
        </code>
      )
    },
    pre: ({ children }) => (
      <pre className="mb-3 overflow-x-auto rounded-xl border border-border bg-muted/60 p-3 text-[11.5px] leading-relaxed last:mb-0">
        {children}
      </pre>
    ),
    table: ({ children }) => (
      <div className="mb-3 overflow-x-auto rounded-xl border border-border last:mb-0">
        <table className="w-full min-w-[200px] border-collapse text-left text-[12px] tabular-nums">{children}</table>
      </div>
    ),
    thead: ({ children }) => <thead className="border-b border-border bg-muted/50">{children}</thead>,
    tbody: ({ children }) => <tbody className="divide-y divide-border">{children}</tbody>,
    tr: ({ children }) => <tr className="transition-colors hover:bg-muted/40">{children}</tr>,
    th: ({ children }) => (
      <th className="px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{children}</th>
    ),
    td: ({ children }) => <td className={cn("px-3 py-2", muted)}>{children}</td>,
  }
}

export function AssistantMessageMarkdown({
  children,
  variant,
  className,
}: {
  children: string
  variant: Variant
  className?: string
}) {
  const components = useMemo(() => buildComponents(variant), [variant])

  if (!children.trim()) return null

  return (
    <div
      className={cn(
        "assistant-message-md min-w-0 [&_a]:break-words [&_code]:break-words",
        variant === "assistant" && "text-foreground/85",
        className
      )}
    >
      <ReactMarkdown remarkPlugins={[remarkGfm, remarkBreaks]} components={components}>
        {children}
      </ReactMarkdown>
    </div>
  )
}

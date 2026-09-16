"use client"

import { cn } from "@/lib/utils"
import type { Components } from "react-markdown"
import ReactMarkdown from "react-markdown"
import remarkBreaks from "remark-breaks"
import remarkGfm from "remark-gfm"

function CitationBadge({ type }: { type: "T" | "E" | "H" }) {
  const styles = {
    T: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
    E: "bg-purple-500/10 text-purple-600 dark:text-purple-400",
    H: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  } as const

  return (
    <sup
      className={cn(
        "ml-0.5 inline-flex size-3 items-center justify-center rounded text-[7px] font-bold leading-none",
        styles[type]
      )}
    >
      {type}
    </sup>
  )
}

function EvidenceRefBadge({ index }: { index: string }) {
  return (
    <sup className="cursor-pointer font-semibold text-indigo-500">[{index}]</sup>
  )
}

function renderCitationText(text: string) {
  const parts = text.split(/(\[T\]|\[E\]|\[H\]|\[\d+\])/g)
  return parts.map((part, i) => {
    if (part === "[T]") return <CitationBadge key={i} type="T" />
    if (part === "[E]") return <CitationBadge key={i} type="E" />
    if (part === "[H]") return <CitationBadge key={i} type="H" />
    const refMatch = part.match(/^\[(\d+)\]$/)
    if (refMatch) return <EvidenceRefBadge key={i} index={refMatch[1]} />
    return part
  })
}

export const clinicalMarkdownComponents: Partial<Components> = {
  text: ({ children }) => {
    const text = String(children)
    if (!/(\[T\]|\[E\]|\[H\]|\[\d+\])/.test(text)) return <>{children}</>
    return <>{renderCitationText(text)}</>
  },
  h2: ({ children }) => (
    <h2 className="mb-2 mt-5 border-b border-border/30 pb-1 text-[13px] font-semibold uppercase tracking-wide text-foreground first:mt-0">
      {children}
    </h2>
  ),
  h3: ({ children }) => (
    <h3 className="mb-1.5 mt-4 text-[13px] font-semibold text-foreground">{children}</h3>
  ),
  p: ({ children }) => (
    <p className="my-1.5 text-[13px] leading-relaxed text-foreground/90">{children}</p>
  ),
  strong: ({ children }) => (
    <strong className="font-semibold text-foreground">{children}</strong>
  ),
  em: ({ children }) => <em className="italic text-foreground/85">{children}</em>,
  ul: ({ children }) => (
    <ul className="my-2 list-disc space-y-1 pl-5 text-[13px]">{children}</ul>
  ),
  ol: ({ children }) => (
    <ol className="my-2 list-decimal space-y-1 pl-5 text-[13px]">{children}</ol>
  ),
  li: ({ children }) => (
    <li className="leading-relaxed text-foreground/90">{children}</li>
  ),
}

export function ClinicalDocumentMarkdown({
  content,
  className,
}: {
  content: string
  className?: string
}) {
  return (
    <div className={cn("max-w-none text-[13px] leading-relaxed", className)}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkBreaks]}
        components={clinicalMarkdownComponents}
      >
        {content}
      </ReactMarkdown>
    </div>
  )
}

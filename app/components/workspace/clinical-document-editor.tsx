"use client"

import { cn } from "@/lib/utils"
import { marked } from "marked"
import {
  ListBullets,
  TextB,
  TextHTwo,
  TextItalic,
} from "@phosphor-icons/react"
import { useCallback, useEffect, useImperativeHandle, useRef, useState, type ReactNode, forwardRef } from "react"

marked.setOptions({ breaks: true, gfm: true })

function stripFlemingBlocks(md: string): string {
  return md
    .replace(/=== FLEMING FULL RESPONSE ===\n?/g, "")
    .replace(/=== END ===\n?/g, "")
    .replace(/=== PRESCRIPTION_ITEMS[\s\S]*?=== END_PRESCRIPTION_ITEMS\s*===/gi, "")
    .replace(/=== ICD_ITEMS[\s\S]*?=== END_ICD_ITEMS\s*===/gi, "")
    .replace(/=== CLAIM_ITEMS[\s\S]*?=== END_CLAIM_ITEMS\s*===/gi, "")
    .replace(/=== EVIDENCE SOURCES[\s\S]*$/g, "")
    .trim()
}

function markdownToEditorHtml(markdown: string): string {
  const clean = stripFlemingBlocks(markdown)
  if (!clean) return "<p><br></p>"
  return marked.parse(clean, { async: false }) as string
}

function inlineToMarkdown(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) return node.textContent ?? ""
  if (node.nodeType !== Node.ELEMENT_NODE) return ""

  const el = node as HTMLElement
  const tag = el.tagName.toLowerCase()
  const inner = () => Array.from(el.childNodes).map(inlineToMarkdown).join("")

  switch (tag) {
    case "strong":
    case "b":
      return `**${inner()}**`
    case "em":
    case "i":
      return `*${inner()}*`
    case "br":
      return "\n"
    case "sup":
      return el.textContent ?? ""
    default:
      return inner()
  }
}

function blockToMarkdown(el: Element): string {
  const tag = el.tagName.toLowerCase()
  const text = () => Array.from(el.childNodes).map(inlineToMarkdown).join("").trim()

  switch (tag) {
    case "h2":
      return `## ${text()}`
    case "h3":
      return `### ${text()}`
    case "ul":
      return Array.from(el.querySelectorAll(":scope > li"))
        .map((li) => `- ${Array.from(li.childNodes).map(inlineToMarkdown).join("").trim()}`)
        .join("\n")
    case "ol":
      return Array.from(el.querySelectorAll(":scope > li"))
        .map((li, i) => `${i + 1}. ${Array.from(li.childNodes).map(inlineToMarkdown).join("").trim()}`)
        .join("\n")
    case "p":
      return text()
    case "div":
      if (el.children.length > 0) {
        return Array.from(el.children)
          .map((child) => blockToMarkdown(child))
          .filter(Boolean)
          .join("\n\n")
      }
      return text()
    default:
      return text()
  }
}

export function htmlToClinicalMarkdown(html: string): string {
  const doc = new DOMParser().parseFromString(html, "text/html")
  const blocks = Array.from(doc.body.children)
    .map((child) => blockToMarkdown(child))
    .filter((line) => line.trim())

  return blocks.join("\n\n").replace(/\n{3,}/g, "\n\n").trim()
}

function ToolbarButton({
  active,
  onClick,
  title,
  children,
}: {
  active?: boolean
  onClick: () => void
  title: string
  children: ReactNode
}) {
  return (
    <button
      type="button"
      title={title}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className={cn(
        "inline-flex size-7 items-center justify-center rounded-md transition-colors",
        active
          ? "bg-foreground/10 text-foreground"
          : "text-muted-foreground hover:bg-muted/80 hover:text-foreground"
      )}
    >
      {children}
    </button>
  )
}

export type ClinicalRichDocumentEditorHandle = {
  getMarkdown: () => string
}

export const ClinicalRichDocumentEditor = forwardRef<
  ClinicalRichDocumentEditorHandle,
  {
    initialValue: string
    onChange: (markdown: string) => void
    className?: string
  }
>(function ClinicalRichDocumentEditor({ initialValue, onChange, className }, ref) {
  const editorRef = useRef<HTMLDivElement>(null)
  const [activeFormats, setActiveFormats] = useState({
    bold: false,
    italic: false,
    heading: false,
    list: false,
  })

  useEffect(() => {
    const el = editorRef.current
    if (!el) return
    el.innerHTML = markdownToEditorHtml(initialValue)
    // Only seed HTML on mount; parent key remounts when edit session starts.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const syncMarkdown = useCallback(() => {
    const el = editorRef.current
    if (!el) return ""
    const md = htmlToClinicalMarkdown(el.innerHTML)
    onChange(md)
    return md
  }, [onChange])

  useImperativeHandle(ref, () => ({
    getMarkdown: () => {
      const el = editorRef.current
      if (!el) return ""
      return htmlToClinicalMarkdown(el.innerHTML)
    },
  }))

  const refreshActiveFormats = useCallback(() => {
    setActiveFormats({
      bold: document.queryCommandState("bold"),
      italic: document.queryCommandState("italic"),
      heading: document.queryCommandValue("formatBlock").toLowerCase() === "h2",
      list: document.queryCommandState("insertUnorderedList"),
    })
  }, [])

  const exec = useCallback(
    (command: string, value?: string) => {
      editorRef.current?.focus()
      document.execCommand(command, false, value)
      syncMarkdown()
      refreshActiveFormats()
    },
    [refreshActiveFormats, syncMarkdown]
  )

  return (
    <div className={cn("flex min-h-0 flex-1 flex-col overflow-hidden", className)}>
      <div className="flex shrink-0 items-center gap-0.5 border-b border-border/25 bg-background/90 px-4 py-1.5 backdrop-blur-sm">
        <ToolbarButton
          active={activeFormats.bold}
          onClick={() => exec("bold")}
          title="Bold (⌘B)"
        >
          <TextB className="size-3.5" weight="bold" />
        </ToolbarButton>
        <ToolbarButton
          active={activeFormats.italic}
          onClick={() => exec("italic")}
          title="Italic (⌘I)"
        >
          <TextItalic className="size-3.5" />
        </ToolbarButton>
        <div className="mx-1.5 h-4 w-px bg-border/40" />
        <ToolbarButton
          active={activeFormats.heading}
          onClick={() => exec("formatBlock", "h2")}
          title="Section heading"
        >
          <TextHTwo className="size-3.5" />
        </ToolbarButton>
        <ToolbarButton
          active={activeFormats.list}
          onClick={() => exec("insertUnorderedList")}
          title="Bullet list"
        >
          <ListBullets className="size-3.5" />
        </ToolbarButton>
      </div>

      <div
        ref={editorRef}
        contentEditable
        suppressContentEditableWarning
        onInput={syncMarkdown}
        onKeyUp={refreshActiveFormats}
        onMouseUp={refreshActiveFormats}
        className={cn(
          "clinical-rich-editor min-h-0 flex-1 overflow-y-auto bg-background px-6 py-5",
          "text-[13px] leading-relaxed text-foreground/90 outline-none",
          "[&_h2]:mb-2 [&_h2]:mt-5 [&_h2]:border-b [&_h2]:border-border/30 [&_h2]:pb-1",
          "[&_h2]:text-[13px] [&_h2]:font-semibold [&_h2]:uppercase [&_h2]:tracking-wide [&_h2]:text-foreground",
          "[&_h2:first-child]:mt-0",
          "[&_h3]:mb-1.5 [&_h3]:mt-4 [&_h3]:text-[13px] [&_h3]:font-semibold [&_h3]:text-foreground",
          "[&_p]:my-1.5",
          "[&_strong]:font-semibold [&_strong]:text-foreground",
          "[&_em]:italic [&_em]:text-foreground/85",
          "[&_ul]:my-2 [&_ul]:list-disc [&_ul]:space-y-1 [&_ul]:pl-5",
          "[&_ol]:my-2 [&_ol]:list-decimal [&_ol]:space-y-1 [&_ol]:pl-5",
          "[&_li]:leading-relaxed"
        )}
        style={{ scrollbarWidth: "thin" }}
      />
    </div>
  )
})

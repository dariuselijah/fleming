"use client"

import { MessageContent } from "@/components/prompt-kit/message"
import { cn } from "@/lib/utils"
import type { Message as MessageAISDK } from "@ai-sdk/react"
import type { ToolInvocationUIPart } from "@ai-sdk/ui-utils"
import type { CitationData } from "./citation-popup"
import { CitationMarkdown } from "./citation-markdown"
import { Reasoning } from "./reasoning"
import { ToolInvocation } from "./tool-invocation"
import { WEB_ROLE_MARKDOWN_CLASSNAME } from "./markdown-styles"

type TextSegment = {
  type: "text"
  key: string
  text: string
}

type ToolSegment = {
  type: "tool"
  key: string
  part: ToolInvocationUIPart
}

type ReasoningSegment = {
  type: "reasoning"
  key: string
  text: string
}

type TimelineSegment = TextSegment | ToolSegment | ReasoningSegment

type AssistantInlinePartsProps = {
  parts?: MessageAISDK["parts"]
  fallbackText: string
  status?: "streaming" | "ready" | "submitted" | "error"
  shouldShowCitations: boolean
  citations: Map<number, CitationData>
  evidenceCitations?: unknown[]
  streamIntroPreview?: string | null
}

function sanitizeInlineAssistantText(text: string): string {
  if (!text) return ""
  return text
    .replace(/\[?\s*CITE_PLACEHOLDER_\d+\s*\]?/gi, "")
    .replace(/\[tool\s+slide\s+([^\]]+)\]/gi, " (slide $1)")
    .replace(/\[tool\s+([^\]]+)\]/gi, " ($1)")
    .replace(/\[source\s+([^\]]+)\]/gi, " ($1)")
    .replace(/\[doc\s+([^\]]+)\]/gi, " ($1)")
    .replace(/[ \t]{2,}/g, " ")
}

function looksLikeVerboseDocumentDump(text: string): boolean {
  if (!text || text.length < 500) return false
  return /(##\s+executive summary|##\s+key points|##\s+references|###\s+source\s+\d+)/i.test(
    text
  )
}

function looksLikeVerboseQuizDump(text: string): boolean {
  if (!text || text.length < 350) return false
  return /(^|\n)\s*(#{2,3}\s*)?question\s*\d+|<details>|answer\s*&\s*explanation|correct:\s*[a-d]/i.test(
    text
  )
}

function shouldReplaceArtifactNarrative(
  text: string,
  hasDocumentArtifactResult: boolean,
  hasQuizArtifactResult: boolean,
  hasArtifactMetadata: boolean
): boolean {
  if (!text) return false
  const headingCount = (text.match(/^##\s+/gm) || []).length
  const hasArtifactDumpMarkers =
    looksLikeVerboseDocumentDump(text) ||
    looksLikeVerboseQuizDump(text) ||
    /(^|\n)\s*(great request|how did you do\?|quick review questions|references\s*\(from slides\))/i.test(
      text
    )

  const likelyLongArtifactNarrative =
    text.length > 900 &&
    (headingCount >= 2 || /\n-\s+/.test(text) || /\[\d+\]/.test(text))

  return (
    (hasDocumentArtifactResult || hasQuizArtifactResult || hasArtifactMetadata) &&
    (hasArtifactDumpMarkers || likelyLongArtifactNarrative)
  )
}

function parseArtifactTypeFromToolPart(part: any): "document" | "quiz" | null {
  if (!part || part.type !== "tool-invocation") return null
  if (part?.toolInvocation?.state !== "result") return null
  const result = part?.toolInvocation?.result
  if (result && typeof result === "object") {
    if ((result as any).artifactType === "document") return "document"
    if ((result as any).artifactType === "quiz") return "quiz"
    if (Array.isArray((result as any).content)) {
      const textContent = (result as any).content.find(
        (item: any) => item?.type === "text" && typeof item?.text === "string"
      )
      if (typeof textContent?.text === "string") {
        try {
          const parsed = JSON.parse(textContent.text)
          if (parsed?.artifactType === "document") return "document"
          if (parsed?.artifactType === "quiz") return "quiz"
          return null
        } catch {
          return null
        }
      }
    }
  }
  return null
}

function isArtifactMetadataPart(part: any): boolean {
  if (!part || part.type !== "metadata") return false
  const documentArtifacts = part?.metadata?.documentArtifacts
  const quizArtifacts = part?.metadata?.quizArtifacts
  return (
    (Array.isArray(documentArtifacts) && documentArtifacts.length > 0) ||
    (Array.isArray(quizArtifacts) && quizArtifacts.length > 0)
  )
}

function buildTimelineSegments(
  parts: MessageAISDK["parts"],
  fallbackText: string
): TimelineSegment[] {
  if (!Array.isArray(parts) || parts.length === 0) {
    const sanitizedFallback = sanitizeInlineAssistantText(fallbackText)
    return sanitizedFallback
      ? [{ type: "text", key: "fallback-text", text: sanitizedFallback }]
      : []
  }

  const segments: TimelineSegment[] = []
  let textBuffer = ""
  let textSeq = 0
  const hasDocumentArtifactResult = parts.some(
    (part) => parseArtifactTypeFromToolPart(part) === "document"
  )
  const hasQuizArtifactResult = parts.some(
    (part) => parseArtifactTypeFromToolPart(part) === "quiz"
  )
  const hasArtifactMetadata = parts.some((part) => isArtifactMetadataPart(part))
  const hasArtifactResult = hasDocumentArtifactResult || hasQuizArtifactResult || hasArtifactMetadata

  const flushText = () => {
    if (!textBuffer) return
    segments.push({
      type: "text",
      key: `text-${textSeq++}`,
      text: textBuffer,
    })
    textBuffer = ""
  }

  for (let idx = 0; idx < parts.length; idx += 1) {
    const part = parts[idx] as any
    if (!part || typeof part !== "object") continue

    if (part.type === "text" && typeof part.text === "string") {
      const sanitizedText = sanitizeInlineAssistantText(part.text)
      if (
        shouldReplaceArtifactNarrative(
          sanitizedText,
          hasDocumentArtifactResult,
          hasQuizArtifactResult,
          hasArtifactMetadata
        )
      ) {
        textBuffer += hasQuizArtifactResult
          ? "Here is your generated quiz."
          : hasDocumentArtifactResult
            ? "Here is your generated document."
            : "Your generated artifact is ready below."
      } else {
        textBuffer += sanitizedText
      }
      continue
    }

    if (part.type === "reasoning" && typeof part.reasoning === "string") {
      flushText()
      segments.push({
        type: "reasoning",
        key: `reasoning-${idx}`,
        text: part.reasoning,
      })
      continue
    }

    if (part.type === "tool-invocation" && part.toolInvocation) {
      const artifactType = parseArtifactTypeFromToolPart(part)
      if (artifactType) {
        // Avoid rendering duplicate artifact tool cards; dedicated artifact cards are rendered below.
        continue
      }
      flushText()
      segments.push({
        type: "tool",
        key: `tool-${part.toolInvocation.toolCallId || idx}`,
        part: part as ToolInvocationUIPart,
      })
    }
  }

  flushText()

  const sanitizedFallback = sanitizeInlineAssistantText(fallbackText)
  const shouldSuppressFallbackDump =
    shouldReplaceArtifactNarrative(
      sanitizedFallback,
      hasDocumentArtifactResult,
      hasQuizArtifactResult,
      hasArtifactMetadata
    )
  const finalFallback = shouldSuppressFallbackDump
    ? hasQuizArtifactResult
      ? "Here is your generated quiz."
      : hasDocumentArtifactResult
        ? "Here is your generated document."
        : "Your generated artifact is ready below."
    : sanitizedFallback
  if (!segments.some((segment) => segment.type === "text") && finalFallback) {
    segments.unshift({
      type: "text",
      key: "fallback-text",
      text: finalFallback,
    })
  }

  return segments
}

export function AssistantInlineParts({
  parts,
  fallbackText,
  status,
  shouldShowCitations,
  citations,
  evidenceCitations,
  streamIntroPreview,
}: AssistantInlinePartsProps) {
  const segments = buildTimelineSegments(parts, fallbackText)
  const isStreamingWithoutSegments =
    status === "streaming" && segments.length === 0 && Boolean(streamIntroPreview)

  if (isStreamingWithoutSegments && streamIntroPreview) {
    return (
      <MessageContent className={cn(WEB_ROLE_MARKDOWN_CLASSNAME)} markdown>
        {streamIntroPreview}
      </MessageContent>
    )
  }

  return (
    <>
      {segments.map((segment) => {
        if (segment.type === "reasoning") {
          return (
            <Reasoning
              key={segment.key}
              reasoning={segment.text}
              isStreaming={status === "streaming"}
            />
          )
        }

        if (segment.type === "tool") {
          return (
            <ToolInvocation
              key={segment.key}
              toolInvocations={[segment.part]}
              inline
            />
          )
        }

        const text = segment.text
        if (!text.trim()) return null

        if (shouldShowCitations) {
          return (
            <CitationMarkdown
              key={segment.key}
              className={cn(WEB_ROLE_MARKDOWN_CLASSNAME)}
              citations={citations}
              evidenceCitations={evidenceCitations as any}
            >
              {text}
            </CitationMarkdown>
          )
        }

        return (
          <MessageContent
            key={segment.key}
            className={cn(WEB_ROLE_MARKDOWN_CLASSNAME)}
            markdown
          >
            {text}
          </MessageContent>
        )
      })}
    </>
  )
}

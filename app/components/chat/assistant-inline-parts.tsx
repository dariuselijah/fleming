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
  onSuggestion?: (suggestion: string) => void
  onWorkflowSuggestion?: (suggestion: string) => void
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

function extractReasoningText(part: any): string | null {
  if (!part || typeof part !== "object") return null
  if (typeof part.reasoning === "string" && part.reasoning.trim().length > 0) {
    return part.reasoning
  }
  if (typeof part.text === "string" && part.text.trim().length > 0) {
    return part.text
  }
  return null
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

function isRefinementToolName(toolName: unknown): boolean {
  if (typeof toolName !== "string") return false
  return /refine.*requirements/i.test(toolName)
}

function isQuizWorkflowToolName(toolName: unknown): boolean {
  return typeof toolName === "string" && /generatequizfromupload|refinequizrequirements/i.test(toolName)
}

function looksLikeTransientQuizText(text: string): boolean {
  const normalized = text.trim()
  if (!normalized) return false
  const hasQuizHeading = /\bquiz\b[:\s]/i.test(normalized)
  const numberedQuestionMatches = normalized.match(/(?:^|\n)\s*\d+\.\s+/gm) || []
  const choiceMatches = normalized.match(/(?:^|\n)\s*[a-e][\).\:]\s+/gim) || []
  const hasAnswerSection =
    /\banswers?(?:\s*&\s*|\s+and\s+)?(?:rationale|explanation|key)?\b/i.test(normalized) ||
    /\bhow'?d you do\??/i.test(normalized)
  return (
    (hasQuizHeading &&
      numberedQuestionMatches.length >= 2 &&
      choiceMatches.length >= 4) ||
    (numberedQuestionMatches.length >= 3 && choiceMatches.length >= 4) ||
    (hasAnswerSection && numberedQuestionMatches.length >= 1)
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
  const hasQuizWorkflowToolInvocation = parts.some((part: any) =>
    isQuizWorkflowToolName(part?.toolInvocation?.toolName)
  )
  const hasArtifactResult =
    hasDocumentArtifactResult || hasQuizArtifactResult || hasArtifactMetadata

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
        hasQuizWorkflowToolInvocation &&
        looksLikeTransientQuizText(sanitizedText) &&
        (hasQuizArtifactResult || sanitizedText.length > 160)
      ) {
        continue
      }
      textBuffer += sanitizedText
      continue
    }

    if (part.type === "reasoning") {
      const reasoningText = extractReasoningText(part)
      if (!reasoningText) {
        continue
      }
      flushText()
      segments.push({
        type: "reasoning",
        key: `reasoning-${idx}`,
        text: reasoningText,
      })
      continue
    }

    if (part.type === "tool-invocation" && part.toolInvocation) {
      if (isRefinementToolName(part.toolInvocation.toolName)) {
        flushText()
        segments.push({
          type: "tool",
          key: `tool-${part.toolInvocation.toolCallId || idx}`,
          part: part as ToolInvocationUIPart,
        })
        continue
      }
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
  const defaultArtifactLeadIn = hasQuizArtifactResult
    ? "Here is your generated quiz."
    : hasDocumentArtifactResult
      ? "Here is your generated document."
      : hasArtifactResult
        ? "Your generated artifact is ready below."
        : ""
  const finalFallback = sanitizedFallback || defaultArtifactLeadIn
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
  onSuggestion,
  onWorkflowSuggestion,
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
              onSuggestion={onSuggestion}
              onWorkflowSuggestion={onWorkflowSuggestion}
              defaultOpen={
                segment.part.toolInvocation.toolName ===
                  "refineArtifactRequirements" ||
                segment.part.toolInvocation.toolName ===
                  "refineDocumentRequirements" ||
                segment.part.toolInvocation.toolName ===
                  "refineQuizRequirements"
              }
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

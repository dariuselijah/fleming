"use client"

import {
  MorphingDialog,
  MorphingDialogClose,
  MorphingDialogContainer,
  MorphingDialogContent,
  MorphingDialogImage,
  MorphingDialogTrigger,
} from "@/components/motion-primitives/morphing-dialog"
import {
  MessageAction,
  MessageActions,
  Message as MessageContainer,
  MessageContent,
} from "@/components/prompt-kit/message"
import { Button } from "@/components/ui/button"
import { stripUploadReferenceTokens } from "@/lib/uploads/reference-tokens"
import { cn } from "@/lib/utils"
import { Message as MessageType } from "@ai-sdk/react"
import { Check, Copy, Trash } from "@phosphor-icons/react"
import Image from "next/image"
import { useEffect, useMemo, useRef, useState } from "react"
import { UserUploadSendActivity } from "./user-upload-send-activity"

const getTextFromDataUrl = (dataUrl: string) => {
  const base64 = dataUrl.split(",")[1]
  return base64
}

export type MessageUserProps = {
  hasScrollAnchor?: boolean
  attachments?: MessageType["experimental_attachments"]
  children: string
  copied: boolean
  copyToClipboard: () => void
  onEdit: (id: string, newText: string) => void
  onReload: () => void
  onDelete: (id: string) => void
  id: string
  className?: string
}

function parseCommandPrefix(text: string): { commandTag: string | null; rest: string; hasContext: boolean } {
  const match = text.match(/^\[\/(\w+)\]\s*/)
  if (!match) return { commandTag: null, rest: text, hasContext: false }

  const afterTag = text.slice(match[0].length)
  const contextStart = afterTag.indexOf("\n\n=== ")
  if (contextStart >= 0) {
    return {
      commandTag: match[1],
      rest: afterTag.slice(0, contextStart).trim(),
      hasContext: true,
    }
  }
  return { commandTag: match[1], rest: afterTag, hasContext: false }
}

const COMMAND_CHIP_COLORS: Record<string, string> = {
  summary: "bg-indigo-500/10 text-indigo-600 border-indigo-500/20",
  interactions: "bg-orange-500/10 text-orange-600 border-orange-500/20",
  evidence: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20",
  drug: "bg-sky-500/10 text-sky-600 border-sky-500/20",
  icd: "bg-amber-500/10 text-amber-600 border-amber-500/20",
  prescribe: "bg-sky-500/10 text-sky-600 border-sky-500/20",
  refer: "bg-teal-500/10 text-teal-600 border-teal-500/20",
  soap: "bg-indigo-500/10 text-indigo-600 border-indigo-500/20",
  vitals: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20",
  verify: "bg-amber-500/10 text-amber-600 border-amber-500/20",
  claim: "bg-amber-500/10 text-amber-600 border-amber-500/20",
}

const COMMAND_LABELS: Record<string, string> = {
  soap: "Generate SOAP Note",
  summary: "Generate Clinical Summary",
  refer: "Generate Referral Letter",
  prescribe: "Generate Prescription",
  icd: "Suggest ICD-10 Codes",
  interactions: "Check Drug Interactions",
  evidence: "Search Evidence",
  drug: "Drug Information",
  vitals: "Record Vitals",
  verify: "Verify Eligibility",
  claim: "Prepare Billing Claim",
}

export function MessageUser({
  hasScrollAnchor,
  attachments,
  children,
  copied,
  copyToClipboard,
  onEdit,
  onReload,
  onDelete,
  id,
  className,
}: MessageUserProps) {
  const displayChildren = stripUploadReferenceTokens(children)
  const { commandTag, rest: messageWithoutCommand, hasContext } = useMemo(
    () => parseCommandPrefix(displayChildren),
    [displayChildren]
  )
  const [editInput, setEditInput] = useState(displayChildren)
  const [isEditing, setIsEditing] = useState(false)
  const contentRef = useRef<HTMLDivElement>(null)
  const activityAttachments = useMemo(
    () =>
      (attachments || []).filter((attachment) => {
        return !attachment.contentType?.startsWith("image")
      }),
    [attachments]
  )
  const imageAttachments = useMemo(
    () => (attachments || []).filter((attachment) => attachment.contentType?.startsWith("image")),
    [attachments]
  )

  useEffect(() => {
    if (!isEditing) {
      setEditInput(displayChildren)
    }
  }, [displayChildren, isEditing])

  const handleEditCancel = () => {
    setIsEditing(false)
    setEditInput(displayChildren)
  }

  const handleSave = () => {
    if (onEdit) {
      onEdit(id, editInput)
    }
    onReload()
    setIsEditing(false)
  }

  const handleDelete = () => {
    onDelete(id)
  }

  return (
    <MessageContainer
      className={cn(
        "group flex w-full max-w-3xl flex-col items-end gap-0.5 px-6 pb-2",
        hasScrollAnchor && "min-h-scroll-anchor",
        className
      )}
    >
      {activityAttachments.length > 0 ? (
        <UserUploadSendActivity
          attachments={activityAttachments as Array<{
            name?: string | null
            contentType?: string | null
            uploadState?: string | null
            uploadMessage?: string | null
          }>}
          className="mb-2"
        />
      ) : null}
      {imageAttachments.map((attachment, index) => (
        <div
          className="flex flex-row gap-2"
          key={`${attachment.name}-${index}`}
        >
          {attachment.contentType?.startsWith("image") ? (
            <MorphingDialog
              transition={{
                type: "spring",
                stiffness: 280,
                damping: 18,
                mass: 0.3,
              }}
            >
              <MorphingDialogTrigger className="z-10">
                {/* Render image if we have a valid URL (blob, data, or http) */}
                {attachment.url && (
                  attachment.url.startsWith('blob:') || 
                  attachment.url.startsWith('data:') || 
                  attachment.url.startsWith('http')
                ) ? (
                  <Image
                    className="mb-1 w-40 rounded-md"
                    key={attachment.name}
                    src={attachment.url}
                    alt={attachment.name || "Attachment"}
                    width={160}
                    height={120}
                    unoptimized={true}
                  />
                ) : (
                  /* Show placeholder while processing */
                  <div className="mb-1 w-40 h-30 rounded-md bg-muted flex items-center justify-center text-xs text-muted-foreground">
                    Processing image...
                  </div>
                )}
              </MorphingDialogTrigger>
              <MorphingDialogContainer>
                <MorphingDialogContent className="relative rounded-lg">
                  {/* Show full-size image if we have a valid URL */}
                  {attachment.url && (
                    attachment.url.startsWith('blob:') || 
                    attachment.url.startsWith('data:') || 
                    attachment.url.startsWith('http')
                  ) ? (
                    <MorphingDialogImage
                      src={attachment.url}
                      alt={attachment.name || ""}
                      className="max-h-[90vh] max-w-[90vw] object-contain"
                    />
                  ) : (
                    <div className="max-h-[90vh] max-w-[90vw] flex items-center justify-center text-muted-foreground">
                      Image still processing...
                    </div>
                  )}
                </MorphingDialogContent>
                <MorphingDialogClose className="text-primary" />
              </MorphingDialogContainer>
            </MorphingDialog>
          ) : attachment.contentType?.startsWith("text") ? (
            <div className="text-primary mb-3 h-24 w-40 overflow-hidden rounded-md border p-2 text-xs">
              {getTextFromDataUrl(attachment.url)}
            </div>
          ) : (
            <div className="bg-muted/60 mb-2 flex h-16 w-48 items-center gap-3 rounded-xl border border-border px-3">
              <div className="bg-background flex h-9 w-9 items-center justify-center rounded-lg border border-border text-[10px] font-semibold uppercase text-muted-foreground">
                {(attachment.name?.split(".").pop() || "file").slice(0, 4)}
              </div>
              <div className="min-w-0">
                <p className="line-clamp-1 text-sm font-medium">{attachment.name || "File"}</p>
                <p className="text-muted-foreground line-clamp-1 text-[11px]">
                  {attachment.contentType || "Document"}
                </p>
              </div>
            </div>
          )}
        </div>
      ))}
      {isEditing ? (
        <div
          className="bg-accent relative flex min-w-[180px] flex-col gap-2 rounded-3xl px-5 py-2.5"
          style={{
            width: contentRef.current?.offsetWidth,
          }}
        >
          <textarea
            className="w-full resize-none bg-transparent outline-none"
            value={editInput}
            onChange={(e) => setEditInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault()
                handleSave()
              }
              if (e.key === "Escape") {
                handleEditCancel()
              }
            }}
            autoFocus
          />
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="ghost" onClick={handleEditCancel}>
              Cancel
            </Button>
            <Button size="sm" onClick={handleSave}>
              Save
            </Button>
          </div>
        </div>
      ) : (
        <div
          className={cn(
            "relative max-w-[70%] rounded-3xl",
            commandTag && hasContext ? "bg-transparent px-0 py-0" : "bg-accent px-5 py-2.5"
          )}
          ref={contentRef}
        >
          {commandTag && hasContext ? (
            <div className="flex items-center gap-2 rounded-xl border border-border/40 bg-background px-3.5 py-2.5 shadow-sm">
              <span className={cn(
                "inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11px] font-semibold",
                COMMAND_CHIP_COLORS[commandTag] ?? "bg-muted text-muted-foreground border-border/50"
              )}>
                /{commandTag}
              </span>
              <span className="text-sm font-medium text-foreground">
                {COMMAND_LABELS[commandTag] ?? commandTag}
              </span>
              <span className="ml-auto flex items-center gap-1 text-[10px] text-muted-foreground">
                <span className="size-1.5 rounded-full bg-emerald-500" />
                Context
              </span>
            </div>
          ) : (
            <>
              {commandTag && (
                <span className={cn(
                  "mb-1.5 inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11px] font-semibold",
                  COMMAND_CHIP_COLORS[commandTag] ?? "bg-muted text-muted-foreground border-border/50"
                )}>
                  /{commandTag}
                </span>
              )}
              <MessageContent
                markdown={true}
                components={{
                  code: ({ children }) => <>{children}</>,
                  pre: ({ children }) => <>{children}</>,
                  h1: ({ children }) => <p>{children}</p>,
                  h2: ({ children }) => <p>{children}</p>,
                  h3: ({ children }) => <p>{children}</p>,
                  h4: ({ children }) => <p>{children}</p>,
                  h5: ({ children }) => <p>{children}</p>,
                  h6: ({ children }) => <p>{children}</p>,
                  p: ({ children }) => <p>{children}</p>,
                  li: ({ children }) => <p>- {children}</p>,
                  ul: ({ children }) => <>{children}</>,
                  ol: ({ children }) => <>{children}</>,
                }}
              >
                {commandTag ? messageWithoutCommand : displayChildren}
              </MessageContent>
              {hasContext && (
                <span className="mt-1 inline-flex items-center gap-1 rounded-md bg-muted/50 px-1.5 py-0.5 text-[10px] text-muted-foreground">
                  <span className="size-1 rounded-full bg-emerald-500" />
                  Clinical context attached
                </span>
              )}
            </>
          )}
        </div>
      )}
      <MessageActions className="flex gap-0 opacity-0 transition-opacity duration-0 group-hover:opacity-100">
        <MessageAction tooltip={copied ? "Copied!" : "Copy text"} side="bottom">
          <button
            className="hover:bg-accent/60 text-muted-foreground hover:text-foreground flex size-7.5 items-center justify-center rounded-full bg-transparent transition"
            aria-label="Copy text"
            onClick={copyToClipboard}
            type="button"
          >
            {copied ? (
              <Check className="size-4" />
            ) : (
              <Copy className="size-4" />
            )}
          </button>
        </MessageAction>
        {/* @todo: add when ready */}
        {/* <MessageAction
          tooltip={isEditing ? "Save" : "Edit"}
          side="bottom"
          delayDuration={0}
        >
          <button
            className="flex h-8 w-8 items-center justify-center rounded-full bg-transparent transition"
            aria-label="Edit"
            onClick={() => setIsEditing(!isEditing)}
            type="button"
          >
            <PencilSimple className="size-4" />
          </button>
        </MessageAction> */}
        <MessageAction tooltip="Delete" side="bottom">
          <button
            className="hover:bg-accent/60 text-muted-foreground hover:text-foreground flex size-7.5 items-center justify-center rounded-full bg-transparent transition"
            aria-label="Delete"
            onClick={handleDelete}
            type="button"
          >
            <Trash className="size-4" />
          </button>
        </MessageAction>
      </MessageActions>
    </MessageContainer>
  )
}

"use client"

import { listUserUploads } from "@/lib/uploads/api"
import { extractUploadReferenceIds } from "@/lib/uploads/reference-tokens"
import type { UserUploadListItem } from "@/lib/uploads/types"
import type { Message } from "@ai-sdk/react"
import { useEffect, useMemo, useRef, useState } from "react"

type UseReferencedUploadStatusInput = {
  messages: Message[]
  enabled: boolean
}

type UseReferencedUploadStatusOutput = {
  trackedUploadIds: string[]
  uploadsById: Record<string, UserUploadListItem>
}

export function extractReferencedUploadIdsFromMessage(message: Message): string[] {
  const ids = new Set<string>()

  if (typeof message.content === "string") {
    extractUploadReferenceIds(message.content).forEach((id) => ids.add(id))
  }

  if (Array.isArray((message as any).annotations)) {
    ;((message as any).annotations as Array<Record<string, unknown>>).forEach(
      (annotation) => {
        if (annotation?.type !== "upload-status-tracking") return
        if (!Array.isArray(annotation.uploadIds)) return
        annotation.uploadIds.forEach((value) => {
          if (typeof value === "string" && value.trim().length > 0) {
            ids.add(value)
          }
        })
      }
    )
  }

  const attachments = (message as any).experimental_attachments
  if (Array.isArray(attachments)) {
    attachments.forEach((attachment) => {
      if (
        attachment &&
        typeof attachment === "object" &&
        typeof attachment.uploadId === "string" &&
        attachment.uploadId.trim().length > 0
      ) {
        ids.add(attachment.uploadId)
      }
    })
  }

  return Array.from(ids)
}

function extractTrackedUploadIds(messages: Message[]): string[] {
  const ids = new Set<string>()

  messages.forEach((message) => {
    extractReferencedUploadIdsFromMessage(message).forEach((id) => ids.add(id))
  })

  return Array.from(ids)
}

export function useReferencedUploadStatus({
  messages,
  enabled,
}: UseReferencedUploadStatusInput): UseReferencedUploadStatusOutput {
  const trackedUploadIds = useMemo(
    () => extractTrackedUploadIds(messages),
    [messages]
  )
  const [uploadsById, setUploadsById] = useState<Record<string, UserUploadListItem>>(
    {}
  )
  const refreshTokenRef = useRef(0)

  useEffect(() => {
    if (!enabled || trackedUploadIds.length === 0) {
      setUploadsById({})
      return
    }

    let cancelled = false
    let timeoutId: ReturnType<typeof setTimeout> | null = null

    const poll = async () => {
      if (cancelled) return
      const refreshToken = ++refreshTokenRef.current
      try {
        const uploads = await listUserUploads({
          forceRefresh: refreshToken > 1,
          allowStale: true,
          maxAgeMs: 30_000,
          revalidateInBackground: refreshToken === 1,
        })

        if (cancelled) return
        const nextById: Record<string, UserUploadListItem> = {}
        trackedUploadIds.forEach((id) => {
          const upload = uploads.find((candidate) => candidate.id === id)
          if (upload) {
            nextById[id] = upload
          }
        })
        setUploadsById(nextById)

        const hasPendingWork = Object.values(nextById).some(
          (upload) => upload.status === "pending" || upload.status === "processing"
        )
        timeoutId = setTimeout(poll, hasPendingWork ? 2500 : 12000)
      } catch {
        if (!cancelled) {
          timeoutId = setTimeout(poll, 5000)
        }
      }
    }

    timeoutId = setTimeout(poll, 120)

    return () => {
      cancelled = true
      if (timeoutId) {
        clearTimeout(timeoutId)
      }
    }
  }, [enabled, trackedUploadIds])

  return {
    trackedUploadIds,
    uploadsById,
  }
}


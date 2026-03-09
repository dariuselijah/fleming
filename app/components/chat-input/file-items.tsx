"use client"

import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import type { FileUploadStatus } from "@/app/components/chat/use-file-upload"
import { CheckCircle, SpinnerGap, WarningCircle, X } from "@phosphor-icons/react"
import Image from "next/image"
import { useState, useEffect } from "react"

type FileItemProps = {
  file: File
  status?: FileUploadStatus
  onRemove: (file: File) => void
}

function formatFileSize(size: number): string {
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`
  return `${(size / (1024 * 1024)).toFixed(1)} MB`
}

export function FileItem({ file, status, onRemove }: FileItemProps) {
  const [isRemoving, setIsRemoving] = useState(false)
  const [isOpen, setIsOpen] = useState(false)
  const [imageUrl, setImageUrl] = useState<string | null>(null)

  // Convert file to data URL for stable preview (data URLs don't need cleanup)
  useEffect(() => {
    if (!file.type.includes("image")) {
      setImageUrl(null)
      return
    }

    // Use FileReader to convert File to data URL
    const reader = new FileReader()
    reader.onload = (e) => {
      const result = e.target?.result
      if (typeof result === "string") {
        setImageUrl(result)
      }
    }
    reader.onerror = () => {
      console.error("Failed to read file for preview")
      setImageUrl(null)
    }
    reader.readAsDataURL(file)

    // No cleanup needed for data URLs
  }, [file])

  const handleRemove = () => {
    setIsRemoving(true)
    onRemove(file)
  }

  const statusChip =
    status?.state === "validating" ? (
      <span className="inline-flex items-center gap-1 rounded-full border border-border bg-muted/60 px-1.5 py-0.5 text-[10px] text-muted-foreground">
        <SpinnerGap className="size-2.5 animate-spin" />
        Validating
      </span>
    ) : status?.state === "uploading" ? (
      <span className="inline-flex items-center gap-1 rounded-full border border-blue-500/20 bg-blue-500/10 px-1.5 py-0.5 text-[10px] text-blue-700 dark:text-blue-300">
        <SpinnerGap className="size-2.5 animate-spin" />
        Uploading
      </span>
    ) : status?.state === "ready" ? (
      <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/25 bg-emerald-500/10 px-1.5 py-0.5 text-[10px] text-emerald-700 dark:text-emerald-300">
        <CheckCircle className="size-2.5" weight="fill" />
        Ready
      </span>
    ) : status?.state === "failed" ? (
      <span className="inline-flex items-center gap-1 rounded-full border border-red-500/20 bg-red-500/10 px-1.5 py-0.5 text-[10px] text-red-700 dark:text-red-300">
        <WarningCircle className="size-2.5" weight="fill" />
        Failed
      </span>
    ) : null

  const statusContainerClasses =
    status?.state === "failed"
      ? "border-red-500/35 bg-red-500/5"
      : status?.state === "uploading" || status?.state === "validating"
        ? "border-blue-500/30 bg-blue-500/5"
        : status?.state === "ready"
          ? "border-emerald-500/30 bg-emerald-500/5"
          : "border-input"

  return (
    <div className="relative mr-2 mb-0 flex items-center">
      <HoverCard
        open={file.type.includes("image") ? isOpen : false}
        onOpenChange={setIsOpen}
      >
        <HoverCardTrigger className="w-full">
          <div
            className={`bg-background hover:bg-accent flex w-full items-center gap-3 rounded-2xl border p-2 pr-3 transition-colors ${statusContainerClasses}`}
          >
            <div className="bg-accent-foreground flex h-10 w-10 flex-shrink-0 items-center justify-center overflow-hidden rounded-md">
              {imageUrl ? (
                <Image
                  src={imageUrl}
                  alt={file.name}
                  width={40}
                  height={40}
                  className="h-full w-full object-cover"
                  unoptimized={true}
                />
              ) : (
                <div className="text-center text-xs text-gray-400">
                  {file.name.split(".").pop()?.toUpperCase()}
                </div>
              )}
            </div>
            <div className="flex flex-col overflow-hidden">
              <span className="truncate text-xs font-medium">{file.name}</span>
              <div className="mt-0.5 flex items-center gap-1.5">
                <span className="text-xs text-gray-500">{formatFileSize(file.size)}</span>
                {statusChip}
              </div>
              {status?.state === "failed" && status.message ? (
                <span className="mt-1 line-clamp-1 text-[10px] text-red-600 dark:text-red-300">
                  {status.message}
                </span>
              ) : null}
            </div>
          </div>
        </HoverCardTrigger>
        <HoverCardContent side="top">
          {imageUrl && (
            <Image
              src={imageUrl}
              alt={file.name}
              width={200}
              height={200}
              className="h-full w-full object-cover"
              unoptimized={true}
            />
          )}
        </HoverCardContent>
      </HoverCard>
      {!isRemoving ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={handleRemove}
              className="border-background absolute top-1 right-1 z-10 inline-flex size-6 translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-[3px] bg-black text-white shadow-none transition-colors"
              aria-label="Remove file"
            >
              <X className="size-3" />
            </button>
          </TooltipTrigger>
          <TooltipContent>Remove file</TooltipContent>
        </Tooltip>
      ) : null}
    </div>
  )
}

import {
  FileUpload,
  FileUploadContent,
  FileUploadTrigger,
} from "@/components/prompt-kit/file-upload"
import { Button } from "@/components/ui/button"
import {
  Popover,
  PopoverTrigger,
} from "@/components/ui/popover"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { isSupabaseEnabled } from "@/lib/supabase/config"
import { cn } from "@/lib/utils"
import { getChatAttachmentSizeLimitLabel } from "@/lib/chat-attachments/constants"
import { CHAT_ALLOWED_IMAGE_MIME_TYPES } from "@/lib/chat-attachments/policy"
import { FileArrowUp, Paperclip } from "@phosphor-icons/react"
import React from "react"
import { PopoverContentAuth } from "./popover-content-auth"

type ButtonFileUploadProps = {
  onFileUpload: (files: File[]) => void
  isUserAuthenticated: boolean
  model: string
}

export function ButtonFileUpload({
  onFileUpload,
  isUserAuthenticated,
  model: _model,
}: ButtonFileUploadProps) {
  const supportedImageAccept = CHAT_ALLOWED_IMAGE_MIME_TYPES.join(",")

  if (!isSupabaseEnabled) {
    return null
  }

  if (!isUserAuthenticated) {
    return (
      <Popover>
        <Tooltip>
          <TooltipTrigger asChild>
            <PopoverTrigger asChild>
              <Button
                size="sm"
                variant="secondary"
                className="border-border dark:bg-secondary size-9 rounded-full border bg-transparent"
                type="button"
                aria-label="Add files"
              >
                <Paperclip className="size-4" />
              </Button>
            </PopoverTrigger>
          </TooltipTrigger>
          <TooltipContent>Add files</TooltipContent>
        </Tooltip>
        <PopoverContentAuth />
      </Popover>
    )
  }

  return (
    <FileUpload
      onFilesAdded={onFileUpload}
      multiple
      disabled={!isUserAuthenticated}
      accept={`.txt,.md,.pdf,.pptx,.docx,.mp4,.mov,.m4v,.webm,.mkv,video/mp4,video/quicktime,video/webm,${supportedImageAccept}`}
    >
      <Tooltip>
        <TooltipTrigger asChild>
          <FileUploadTrigger asChild>
            <Button
              size="sm"
              variant="secondary"
              className={cn(
                "border-border dark:bg-secondary size-9 rounded-full border bg-transparent",
                !isUserAuthenticated && "opacity-50"
              )}
              type="button"
              disabled={!isUserAuthenticated}
              aria-label="Add files"
            >
              <Paperclip className="size-4" />
            </Button>
          </FileUploadTrigger>
        </TooltipTrigger>
        <TooltipContent>Add files</TooltipContent>
      </Tooltip>
      <FileUploadContent>
        <div className="border-input bg-background flex flex-col items-center rounded-lg border border-dashed p-8">
          <FileArrowUp className="text-muted-foreground size-8" />
          <span className="mt-4 mb-1 text-lg font-medium">Drop files here</span>
          <span className="text-muted-foreground text-sm">
            Drop images, documents, or lecture videos here (up to{" "}
            {getChatAttachmentSizeLimitLabel("image/png")} for images; supported image types: JPEG,
            PNG, WEBP, GIF; {getChatAttachmentSizeLimitLabel("application/pdf")} for documents and
            videos)
          </span>
        </div>
      </FileUploadContent>
    </FileUpload>
  )
}

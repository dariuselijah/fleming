import { toast } from "@/components/ui/toast"
import {
  Attachment,
  checkFileUploadLimit,
  processFiles,
} from "@/lib/file-handling"
import { useCallback, useState } from "react"

export const useFileUpload = () => {
  const [files, setFiles] = useState<File[]>([])

  const handleFileUploads = async (
    uid: string,
    chatId: string,
    isAuthenticated: boolean = false
  ): Promise<Attachment[] | null> => {
    if (files.length === 0) return []

    try {
      await checkFileUploadLimit(uid)
    } catch (err: unknown) {
      const error = err as { code?: string; message?: string }
      if (error.code === "DAILY_FILE_LIMIT_REACHED") {
        toast({ title: error.message || "Daily file limit reached", status: "error" })
        return null
      }
    }

    try {
      const processed = await processFiles(files, chatId, uid, isAuthenticated)
      setFiles([])
      // Return the processed attachments even if it's an empty array
      // This allows the caller to distinguish between failure (null) and no files ([])
      return processed
    } catch (error) {
      console.error("File processing failed:", error)
      toast({ title: "Failed to process files", status: "error" })
      return null
    }
  }

  const createOptimisticAttachments = (files: File[]) => {
    return files.map((file) => ({
      name: file.name,
      contentType: file.type,
      url: file.type.startsWith("image/") ? URL.createObjectURL(file) : "",
    }))
  }

  const cleanupOptimisticAttachments = (attachments?: Array<{ url?: string }>) => {
    if (!attachments) return
    attachments.forEach((attachment) => {
      if (attachment.url?.startsWith("blob:")) {
        URL.revokeObjectURL(attachment.url)
      }
    })
  }

  const handleFileUpload = useCallback((newFiles: File[]) => {
    setFiles((prev) => [...prev, ...newFiles])
  }, [])

  const handleFileRemove = useCallback((file: File) => {
    setFiles((prev) => prev.filter((f) => f !== file))
  }, [])

  return {
    files,
    setFiles,
    handleFileUploads,
    createOptimisticAttachments,
    cleanupOptimisticAttachments,
    handleFileUpload,
    handleFileRemove,
  }
}

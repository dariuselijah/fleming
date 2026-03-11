import { toast } from "@/components/ui/toast"
import {
  getChatAttachmentMaxFileSizeBytes,
  getChatAttachmentFileId,
  getChatAttachmentSizeLimitLabel,
  isImageAttachment,
} from "@/lib/chat-attachments/constants"
import {
  Attachment,
  checkFileUploadLimit,
  processFiles,
} from "@/lib/file-handling"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"

export type FileUploadStatusState = "validating" | "uploading" | "ready" | "failed"

export type FileUploadStatus = {
  state: FileUploadStatusState
  message?: string
}

export type FileUploadSummary = {
  validatingCount: number
  uploadingCount: number
  readyCount: number
  failedCount: number
  processingCount: number
  hasProcessing: boolean
}

export const useFileUpload = () => {
  const [files, setFiles] = useState<File[]>([])
  const [fileStatuses, setFileStatuses] = useState<Record<string, FileUploadStatus>>({})
  const uploadPromisesRef = useRef<Map<string, Promise<Attachment | null>>>(new Map())
  const filesRef = useRef<File[]>([])

  useEffect(() => {
    filesRef.current = files
  }, [files])

  useEffect(() => {
    const activeFileIds = new Set(files.map((file) => getChatAttachmentFileId(file)))
    setFileStatuses((prev) => {
      let changed = false
      const next: Record<string, FileUploadStatus> = { ...prev }

      for (const [fileId, status] of Object.entries(prev)) {
        const isProcessing = status.state === "validating" || status.state === "uploading"
        if (!activeFileIds.has(fileId) && !isProcessing) {
          delete next[fileId]
          changed = true
        }
      }

      return changed ? next : prev
    })
  }, [files])

  const setStatusForFile = useCallback((file: File, status: FileUploadStatus) => {
    const fileId = getChatAttachmentFileId(file)
    setFileStatuses((prev) => ({
      ...prev,
      [fileId]: status,
    }))
  }, [])

  const clearStatusForFileId = useCallback((fileId: string) => {
    setFileStatuses((prev) => {
      if (!(fileId in prev)) return prev
      const next = { ...prev }
      delete next[fileId]
      return next
    })
  }, [])

  const cleanupDetachedStatus = useCallback(
    (file: File, delayMs: number) => {
      const fileId = getChatAttachmentFileId(file)
      const stillSelected = filesRef.current.some(
        (selectedFile) => getChatAttachmentFileId(selectedFile) === fileId
      )
      if (stillSelected) return

      setTimeout(() => {
        clearStatusForFileId(fileId)
      }, delayMs)
    },
    [clearStatusForFileId]
  )

  const handleFileUploads = async (
    uid: string,
    chatId: string,
    isAuthenticated: boolean = false,
    filesToUpload?: File[]
  ): Promise<Attachment[] | null> => {
    const targetFiles = filesToUpload || files
    if (targetFiles.length === 0) return []

    targetFiles.forEach((file) => {
      setStatusForFile(file, { state: "uploading", message: "Uploading file..." })
    })

    try {
      // Check limits in background (non-blocking).
      // Non-image files route through uploads ingestion and should not consume chat attachment quota.
      const shouldCheckLimit = targetFiles.some((file) => isImageAttachment(file.type))
      const limitCheck = shouldCheckLimit
        ? checkFileUploadLimit(uid).catch(err => {
            const error = err as { code?: string; message?: string }
            if (error.code === "DAILY_FILE_LIMIT_REACHED") {
              toast({ title: error.message || "Daily file limit reached", status: "error" })
              return false
            }
            return true
          })
        : Promise.resolve(true)

      // Process files in parallel immediately
      const processed = await processFiles(targetFiles, chatId, uid, isAuthenticated)
      
      // Wait for limit check to complete
      const allowed = await limitCheck
      if (!allowed) {
        targetFiles.forEach((file) => {
          setStatusForFile(file, {
            state: "failed",
            message: "Daily upload limit reached. Try again tomorrow.",
          })
          cleanupDetachedStatus(file, 9000)
        })
        return null
      }

      const failedFileIds = new Set(processed.failedFileIds)
      targetFiles.forEach((file) => {
        const fileId = getChatAttachmentFileId(file)
        if (failedFileIds.has(fileId)) {
          setStatusForFile(file, {
            state: "failed",
            message: "Upload failed. Remove this file and try again.",
          })
          cleanupDetachedStatus(file, 9000)
          return
        }

        setStatusForFile(file, { state: "ready", message: "Ready to use" })
        cleanupDetachedStatus(file, 3500)
      })

      const targetFileIds = new Set(targetFiles.map((file) => getChatAttachmentFileId(file)))
      setFiles((prev) =>
        prev.filter((file) => !targetFileIds.has(getChatAttachmentFileId(file)))
      )
      return processed.attachments
    } catch (error) {
      console.error("File processing failed:", error)
      toast({ title: "Failed to process files", status: "error" })
      targetFiles.forEach((file) => {
        setStatusForFile(file, {
          state: "failed",
          message: "Unexpected upload error. Please try again.",
        })
        cleanupDetachedStatus(file, 9000)
      })
      return null
    }
  }

  const createOptimisticAttachments = (files: File[]): Attachment[] => {
    // Use blob URLs immediately (non-blocking) for instant UI feedback.
    // These are converted to data URLs right before submit.
    return files.map((file) => ({
      name: file.name,
      contentType: file.type || "application/octet-stream",
      url: URL.createObjectURL(file),
    }))
  }

  // Helper function to convert File to data URL
  // Now deferred using requestIdleCallback when possible
  const fileToDataUrl = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const performRead = () => {
        const reader = new FileReader()
        reader.onload = () => resolve(reader.result as string)
        reader.onerror = reject
        reader.readAsDataURL(file)
      }

      // Use requestIdleCallback to defer heavy FileReader operations
      if (typeof requestIdleCallback !== 'undefined') {
        requestIdleCallback(() => performRead(), { timeout: 1000 })
      } else {
        // Fallback for browsers without requestIdleCallback
        setTimeout(performRead, 0)
      }
    })
  }

  // Convert blob URLs to data URLs for AI SDK (called at submit time)
  const convertBlobUrlsToDataUrls = async (
    attachments: Attachment[],
    files: File[]
  ): Promise<Attachment[]> => {
    return await Promise.all(
      attachments.map(async (attachment, index) => {
        // Convert all blob URLs so the server/model can access file contents.
        if (attachment.url?.startsWith("blob:")) {
          try {
            const file = files[index]
            if (file) {
              const dataUrl = await fileToDataUrl(file)
              return {
                ...attachment,
                url: dataUrl,
                contentType: attachment.contentType || file.type || "application/octet-stream",
              }
            }
          } catch (error) {
            console.error("Failed to convert blob URL to data URL:", error)
          }
        }
        return attachment
      })
    )
  }

  const cleanupOptimisticAttachments = (attachments?: Array<{ url?: string }>) => {
    if (!attachments) return
    attachments.forEach((attachment) => {
      if (attachment.url?.startsWith("blob:")) {
        URL.revokeObjectURL(attachment.url)
      }
    })
  }

  // OPTIMISTIC FILE UPLOAD with immediate feedback
  const handleFileUpload = useCallback((newFiles: File[]) => {
    // Add files immediately for instant UI feedback
    setFiles((prev) => [...prev, ...newFiles])
    
    // Start background validation for each file
    newFiles.forEach(file => {
      const fileId = getChatAttachmentFileId(file)
      setStatusForFile(file, { state: "validating", message: "Validating file..." })
      
      // Validate file in background
      const validationPromise = validateFileInBackground(file)
      uploadPromisesRef.current.set(fileId, validationPromise)
      
      validationPromise
        .then((attachment) => {
          if (attachment) {
            setStatusForFile(file, { state: "ready", message: "Ready to use" })
            return
          }
          setStatusForFile(file, {
            state: "failed",
            message: `File exceeds ${getChatAttachmentSizeLimitLabel(file.type)} limit`,
          })
        })
        .catch(() => {
          setStatusForFile(file, {
            state: "failed",
            message: "Could not validate file. Try again.",
          })
        })
        .finally(() => {
          uploadPromisesRef.current.delete(fileId)
        })
    })
  }, [setStatusForFile])

  // Background file validation
  const validateFileInBackground = async (file: File): Promise<Attachment | null> => {
    try {
      // Basic validation
      if (file.size > getChatAttachmentMaxFileSizeBytes(file.type)) {
        toast({
          title: "File too large",
          description: `${file.name} exceeds ${getChatAttachmentSizeLimitLabel(file.type)} limit`,
          status: "error"
        })
        return null
      }

      // Allow all file types - no type restrictions
      // Only file size validation is performed

      // File is valid
      return {
        name: file.name,
        contentType: file.type,
        url: "",
      }
    } catch (error) {
      console.error("Background validation failed for:", file.name, error)
      return null
    }
  }

  const handleFileRemove = useCallback((file: File) => {
    setFiles((prev) => prev.filter((f) => f !== file))
    
    // Clean up any pending uploads for this file
    const fileId = getChatAttachmentFileId(file)
    const uploadPromise = uploadPromisesRef.current.get(fileId)
    if (uploadPromise) {
      // Note: Regular Promises can't be cancelled, we just remove the reference
      uploadPromisesRef.current.delete(fileId)
    }
    
    clearStatusForFileId(fileId)
  }, [clearStatusForFileId])

  const getFileStatus = useCallback((file: File): FileUploadStatus | undefined => {
    const fileId = getChatAttachmentFileId(file)
    return fileStatuses[fileId]
  }, [fileStatuses])

  const fileUploadSummary = useMemo<FileUploadSummary>(() => {
    let validatingCount = 0
    let uploadingCount = 0
    let readyCount = 0
    let failedCount = 0

    Object.values(fileStatuses).forEach((status) => {
      if (status.state === "validating") validatingCount += 1
      if (status.state === "uploading") uploadingCount += 1
      if (status.state === "ready") readyCount += 1
      if (status.state === "failed") failedCount += 1
    })

    const processingCount = validatingCount + uploadingCount
    return {
      validatingCount,
      uploadingCount,
      readyCount,
      failedCount,
      processingCount,
      hasProcessing: processingCount > 0,
    }
  }, [fileStatuses])

  return {
    files,
    setFiles,
    fileStatuses,
    fileUploadSummary,
    handleFileUploads,
    createOptimisticAttachments,
    convertBlobUrlsToDataUrls,
    cleanupOptimisticAttachments,
    handleFileUpload,
    handleFileRemove,
    getFileStatus,
    isUploading: fileUploadSummary.hasProcessing,
  }
}

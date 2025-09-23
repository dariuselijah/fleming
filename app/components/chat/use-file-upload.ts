import { toast } from "@/components/ui/toast"
import {
  Attachment,
  checkFileUploadLimit,
  processFiles,
} from "@/lib/file-handling"
import { useCallback, useState, useRef } from "react"

export const useFileUpload = () => {
  const [files, setFiles] = useState<File[]>([])
  const [uploadingFiles, setUploadingFiles] = useState<Set<string>>(new Set())
  const uploadPromisesRef = useRef<Map<string, Promise<Attachment | null>>>(new Map())

  const handleFileUploads = async (
    uid: string,
    chatId: string,
    isAuthenticated: boolean = false
  ): Promise<Attachment[] | null> => {
    if (files.length === 0) return []

    try {
      // Check limits in background (non-blocking)
      const limitCheck = checkFileUploadLimit(uid).catch(err => {
        const error = err as { code?: string; message?: string }
        if (error.code === "DAILY_FILE_LIMIT_REACHED") {
          toast({ title: error.message || "Daily file limit reached", status: "error" })
          return false
        }
        return true
      })

      // Process files in parallel immediately
      const processed = await processFiles(files, chatId, uid, isAuthenticated)
      
      // Wait for limit check to complete
      const allowed = await limitCheck
      if (!allowed) {
        return null
      }

      setFiles([])
      return processed
    } catch (error) {
      console.error("File processing failed:", error)
      toast({ title: "Failed to process files", status: "error" })
      return null
    }
  }

  const createOptimisticAttachments = async (files: File[]) => {
    const attachments = []
    
    for (const file of files) {
      if (file.type.startsWith("image/")) {
        try {
          // Convert file to data URL for AI SDK compatibility
          const dataUrl = await fileToDataUrl(file)
          attachments.push({
            name: file.name,
            contentType: file.type,
            url: dataUrl,
          })
        } catch (error) {
          console.error("Failed to convert file to data URL:", error)
          // Fallback to blob URL for display only
          attachments.push({
            name: file.name,
            contentType: file.type,
            url: URL.createObjectURL(file),
          })
        }
      } else {
        attachments.push({
          name: file.name,
          contentType: file.type,
          url: "",
        })
      }
    }
    
    return attachments
  }

  // Helper function to convert File to data URL
  const fileToDataUrl = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result as string)
      reader.onerror = reject
      reader.readAsDataURL(file)
    })
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
      const fileId = `${file.name}-${file.size}-${file.lastModified}`
      setUploadingFiles(prev => new Set(prev).add(fileId))
      
      // Validate file in background
      const validationPromise = validateFileInBackground(file)
      uploadPromisesRef.current.set(fileId, validationPromise)
      
      // Clean up when validation completes
      validationPromise.finally(() => {
        setUploadingFiles(prev => {
          const newSet = new Set(prev)
          newSet.delete(fileId)
          return newSet
        })
        uploadPromisesRef.current.delete(fileId)
      })
    })
  }, [])

  // Background file validation
  const validateFileInBackground = async (file: File): Promise<Attachment | null> => {
    try {
      // Basic validation
      if (file.size > 10 * 1024 * 1024) { // 10MB limit
        toast({
          title: "File too large",
          description: `${file.name} exceeds 10MB limit`,
          status: "error"
        })
        return null
      }

      // Check file type
      const allowedTypes = [
        "image/jpeg", "image/png", "image/gif", "application/pdf",
        "text/plain", "text/markdown", "application/json", "text/csv",
        "application/vnd.ms-excel",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      ]
      
      if (!allowedTypes.includes(file.type)) {
        toast({
          title: "File type not supported",
          description: `${file.name} is not a supported file type`,
          status: "error"
        })
        return null
      }

      // File is valid
      return {
        name: file.name,
        contentType: file.type,
        url: file.type.startsWith("image/") ? URL.createObjectURL(file) : "",
      }
    } catch (error) {
      console.error("Background validation failed for:", file.name, error)
      return null
    }
  }

  const handleFileRemove = useCallback((file: File) => {
    setFiles((prev) => prev.filter((f) => f !== file))
    
    // Clean up any pending uploads for this file
    const fileId = `${file.name}-${file.size}-${file.lastModified}`
    const uploadPromise = uploadPromisesRef.current.get(fileId)
    if (uploadPromise) {
      // Note: Regular Promises can't be cancelled, we just remove the reference
      uploadPromisesRef.current.delete(fileId)
    }
    
    // Remove from uploading state
    setUploadingFiles(prev => {
      const newSet = new Set(prev)
      newSet.delete(fileId)
      return newSet
    })
  }, [])

  // Get upload status for UI feedback
  const getUploadStatus = useCallback((file: File) => {
    const fileId = `${file.name}-${file.size}-${file.lastModified}`
    return uploadingFiles.has(fileId)
  }, [uploadingFiles])

  return {
    files,
    setFiles,
    handleFileUploads,
    createOptimisticAttachments,
    cleanupOptimisticAttachments,
    handleFileUpload,
    handleFileRemove,
    getUploadStatus,
    isUploading: uploadingFiles.size > 0,
  }
}

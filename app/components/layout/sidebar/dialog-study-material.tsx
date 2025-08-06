"use client"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { UploadIcon, X } from "@phosphor-icons/react"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { useState } from "react"
import { toast } from "@/components/ui/toast"

type MaterialType = "textbook" | "notes" | "research_paper" | "guideline" | "lecture" | "case_study"

const materialTypeLabels: Record<MaterialType, string> = {
  "textbook": "Textbook",
  "notes": "Notes",
  "research_paper": "Research Paper",
  "guideline": "Clinical Guideline",
  "lecture": "Lecture",
  "case_study": "Case Study"
}

type DialogStudyMaterialProps = {
  isOpen: boolean
  setIsOpen: (open: boolean) => void
  projectId: string
}

export function DialogStudyMaterial({ 
  isOpen, 
  setIsOpen, 
  projectId 
}: DialogStudyMaterialProps) {
  const [title, setTitle] = useState("")
  const [materialType, setMaterialType] = useState<MaterialType>("notes")
  const [content, setContent] = useState("")
  const [file, setFile] = useState<File | null>(null)
  const [isUploading, setIsUploading] = useState(false)

  const queryClient = useQueryClient()

  const uploadMaterialMutation = useMutation({
    mutationFn: async (formData: FormData) => {
      const response = await fetch("/api/study-materials", {
        method: "POST",
        body: formData,
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || "Failed to upload material")
      }

      return response.json()
    },
    onSuccess: () => {
      toast({
        title: "Material uploaded successfully",
        status: "success",
      })
      resetForm()
      setIsOpen(false)
      // Invalidate relevant queries
      queryClient.invalidateQueries({ queryKey: ["study-materials"] })
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to upload material",
        description: error.message,
        status: "error",
      })
    },
  })

  const resetForm = () => {
    setTitle("")
    setMaterialType("notes")
    setContent("")
    setFile(null)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!title.trim()) {
      toast({
        title: "Title is required",
        status: "error",
      })
      return
    }

    if (!content.trim() && !file) {
      toast({
        title: "Please provide content or upload a file",
        status: "error",
      })
      return
    }

    setIsUploading(true)

    try {
      const formData = new FormData()
      formData.append("title", title.trim())
      formData.append("material_type", materialType)
      
      if (content.trim()) {
        formData.append("content", content.trim())
      }
      
      if (file) {
        formData.append("file", file)
      }
      
      // Link to the project as a study session
      formData.append("session_ids", JSON.stringify([projectId]))

      await uploadMaterialMutation.mutateAsync(formData)
    } catch (error) {
      console.error("Upload error:", error)
    } finally {
      setIsUploading(false)
    }
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0]
    if (selectedFile) {
      setFile(selectedFile)
      // Auto-fill title if empty
      if (!title.trim()) {
        setTitle(selectedFile.name.replace(/\.[^/.]+$/, ""))
      }
    }
  }

  const handleClose = () => {
    if (!isUploading) {
      resetForm()
      setIsOpen(false)
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Upload Study Material</DialogTitle>
          <DialogDescription>
            Add study material to your study session. You can provide text content or upload a file.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="title">Title *</Label>
            <Input
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Enter material title"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="material-type">Material Type *</Label>
            <Select value={materialType} onValueChange={(value) => setMaterialType(value as MaterialType)}>
              <SelectTrigger>
                <SelectValue placeholder="Select type" />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(materialTypeLabels).map(([key, label]) => (
                  <SelectItem key={key} value={key}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="content">Content</Label>
            <Textarea
              id="content"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Enter material content or notes..."
              rows={4}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="file">Upload File (Optional)</Label>
            <div className="flex items-center gap-2">
              <Input
                id="file"
                type="file"
                onChange={handleFileChange}
                accept=".pdf,.doc,.docx,.txt,.md"
                className="flex-1"
              />
              {file && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setFile(null)}
                >
                  <X className="size-4" />
                </Button>
              )}
            </div>
            {file && (
              <p className="text-sm text-muted-foreground">
                Selected: {file.name}
              </p>
            )}
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={handleClose}
              disabled={isUploading}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isUploading}>
              {isUploading ? (
                <>
                  <UploadIcon className="mr-2 size-4 animate-spin" />
                  Uploading...
                </>
              ) : (
                <>
                  <UploadIcon className="mr-2 size-4" />
                  Upload Material
                </>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
} 
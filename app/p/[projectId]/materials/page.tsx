"use client"

import React, { useState, useEffect, useMemo } from "react"
import { useParams, useRouter } from "next/navigation"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Skeleton } from "@/components/ui/skeleton"
import { 
  UploadIcon, 
  X, 
  FileText, 
  BookOpen, 
  FilePdf, 
  FileDoc, 
  FileTxt,
  MagnifyingGlass,
  Plus,
  Trash,
  PencilSimple,
  Eye,
  Download,
  QuestionIcon,
  Check
} from "@phosphor-icons/react"
import { toast } from "@/components/ui/toast"

type MaterialType = "textbook" | "notes" | "research_paper" | "guideline" | "lecture" | "case_study" | "test"

const materialTypeLabels: Record<MaterialType, string> = {
  "textbook": "Textbook",
  "notes": "Notes", 
  "research_paper": "Research Paper",
  "guideline": "Clinical Guideline",
  "lecture": "Lecture",
  "case_study": "Case Study",
  "test": "Test"
}

const materialTypeIcons: Record<MaterialType, any> = {
  "textbook": BookOpen,
  "notes": FileText,
  "research_paper": FileDoc,
  "guideline": FileText,
  "lecture": FileText,
  "case_study": FileText,
  "test": QuestionIcon
}

type StudyMaterial = {
  id: string
  title: string
  material_type: MaterialType
  content?: string
  file_url?: string
  file_name?: string
  file_type?: string
  folder_name?: string
  created_at: string
  tags?: string[]
}

type Project = {
  id: string
  name: string
  type?: string
  discipline?: string
}

export default function MaterialsPage() {
  const params = useParams<{ projectId: string }>()
  const router = useRouter()
  const queryClient = useQueryClient()
  const projectId = params.projectId as string

  // Form state
  const [title, setTitle] = useState("")
  const [materialType, setMaterialType] = useState<MaterialType>("notes")
  const [content, setContent] = useState("")
  const [files, setFiles] = useState<File[]>([])
  const [isUploading, setIsUploading] = useState(false)
  const [isGeneratingTitle, setIsGeneratingTitle] = useState(false)
  const [searchQuery, setSearchQuery] = useState("")
  const [selectedTab, setSelectedTab] = useState("upload")
  const [deleteModalOpen, setDeleteModalOpen] = useState(false)
  const [materialToDelete, setMaterialToDelete] = useState<StudyMaterial | null>(null)

  // Fetch project details
  const { data: project, isLoading: projectLoading } = useQuery<Project>({
    queryKey: ["project", projectId],
    queryFn: async () => {
      const response = await fetch(`/api/projects/${projectId}`)
      if (!response.ok) throw new Error("Failed to fetch project")
      return response.json()
    },
  })

  // Fetch study materials for the current project
  const { data: projectMaterials = [], isLoading: projectMaterialsLoading } = useQuery<StudyMaterial[]>({
    queryKey: ["study-materials", projectId],
    queryFn: async () => {
      const response = await fetch(`/api/study-materials?session_id=${projectId}`)
      if (!response.ok) throw new Error("Failed to fetch materials")
      return response.json()
    },
  })

  // Fetch all study materials for the library
  const { data: allMaterials = [], isLoading: allMaterialsLoading } = useQuery<StudyMaterial[]>({
    queryKey: ["all-study-materials"],
    queryFn: async () => {
      const response = await fetch(`/api/study-materials`)
      if (!response.ok) throw new Error("Failed to fetch materials")
      return response.json()
    },
  })

  // Upload mutation
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
      queryClient.invalidateQueries({ queryKey: ["study-materials"] })
      queryClient.invalidateQueries({ queryKey: ["all-study-materials"] })
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to upload material",
        description: error.message,
        status: "error",
      })
    },
  })

  // Delete mutation
  const deleteMaterialMutation = useMutation({
    mutationFn: async (materialId: string) => {
      const response = await fetch(`/api/study-materials/${materialId}`, {
        method: "DELETE",
      })
      if (!response.ok) throw new Error("Failed to delete material")
    },
    onSuccess: () => {
      toast({
        title: "Material deleted successfully",
        status: "success",
      })
      queryClient.invalidateQueries({ queryKey: ["study-materials"] })
      queryClient.invalidateQueries({ queryKey: ["all-study-materials"] })
    },
    onError: () => {
      toast({
        title: "Failed to delete material",
        status: "error",
      })
    },
  })

  const resetForm = () => {
    setTitle("")
    setMaterialType("notes")
    setContent("")
    setFiles([])
    setIsGeneratingTitle(false)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!content.trim() && files.length === 0) {
      toast({
        title: "Please provide content or upload files",
        status: "error",
      })
      return
    }

    setIsUploading(true)

    try {
      // If multiple files, create a folder structure
      if (files.length > 1) {
        // Generate folder name using AI
        const folderName = await generateFolderName(files, materialType)
        
        // Upload each file as a separate material with folder grouping
        for (const file of files) {
          const materialTitle = await generateMaterialTitle(file, materialType)
          
          const formData = new FormData()
          formData.append("title", materialTitle)
          formData.append("material_type", materialType)
          formData.append("discipline", project?.discipline || "general")
          formData.append("file", file)
          formData.append("folder_name", folderName)
          formData.append("session_ids", JSON.stringify([projectId]))

          await uploadMaterialMutation.mutateAsync(formData)
        }
      } else if (files.length === 1) {
        // Single file upload
        const materialTitle = title.trim() || await generateMaterialTitle(files[0], materialType)
        
        const formData = new FormData()
        formData.append("title", materialTitle)
        formData.append("material_type", materialType)
        formData.append("discipline", project?.discipline || "general")
        
        if (content.trim()) {
          formData.append("content", content.trim())
        }
        
        formData.append("file", files[0])
        formData.append("session_ids", JSON.stringify([projectId]))

        await uploadMaterialMutation.mutateAsync(formData)
      } else if (content.trim()) {
        // Text-only content
        const materialTitle = title.trim() || await generateContentTitle(content, materialType)
        
        const formData = new FormData()
        formData.append("title", materialTitle)
        formData.append("material_type", materialType)
        formData.append("discipline", project?.discipline || "general")
        formData.append("content", content.trim())
        formData.append("session_ids", JSON.stringify([projectId]))

        await uploadMaterialMutation.mutateAsync(formData)
      }
    } catch (error) {
      console.error("Upload error:", error)
    } finally {
      setIsUploading(false)
    }
  }

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = Array.from(e.target.files || [])
    if (selectedFiles.length > 0) {
      setFiles(selectedFiles)
      
      // Generate AI title immediately for single file
      if (selectedFiles.length === 1) {
        setIsGeneratingTitle(true)
        try {
          const aiTitle = await generateMaterialTitle(selectedFiles[0], materialType)
          setTitle(aiTitle)
        } catch (error) {
          console.error("Failed to generate AI title:", error)
          // Fallback to file name
          setTitle(selectedFiles[0].name.replace(/\.[^/.]+$/, ""))
        } finally {
          setIsGeneratingTitle(false)
        }
      } else {
        // For multiple files, clear title as they'll be organized in folders
        setTitle("")
      }
    }
  }

  // AI title generation functions
  const generateMaterialTitle = async (file: File, materialType: MaterialType): Promise<string> => {
    try {
      const response = await fetch("/api/generate-material-title", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          fileName: file.name,
          fileType: file.type,
          materialType,
          discipline: project?.discipline || "general"
        }),
      })

      if (!response.ok) {
        throw new Error("Failed to generate title")
      }

      const { title } = await response.json()
      return title
    } catch (error) {
      console.error("Title generation error:", error)
      // Fallback to file name without extension
      return file.name.replace(/\.[^/.]+$/, "")
    }
  }

  const generateContentTitle = async (content: string, materialType: MaterialType): Promise<string> => {
    try {
      const response = await fetch("/api/generate-material-title", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          content: content.substring(0, 500), // Limit content for API
          materialType,
          discipline: project?.discipline || "general"
        }),
      })

      if (!response.ok) {
        throw new Error("Failed to generate title")
      }

      const { title } = await response.json()
      return title
    } catch (error) {
      console.error("Title generation error:", error)
      // Fallback to content preview
      return content.substring(0, 50) + (content.length > 50 ? "..." : "")
    }
  }

  const generateFolderName = async (files: File[], materialType: MaterialType): Promise<string> => {
    try {
      const fileNames = files.map(f => f.name).join(", ")
      const response = await fetch("/api/generate-folder-name", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          fileNames,
          materialType,
          discipline: project?.discipline || "general"
        }),
      })

      if (!response.ok) {
        throw new Error("Failed to generate folder name")
      }

      const { folderName } = await response.json()
      return folderName
    } catch (error) {
      console.error("Folder name generation error:", error)
      // Fallback to material type + date
      return `${materialTypeLabels[materialType]} - ${new Date().toLocaleDateString()}`
    }
  }

  const getFileIcon = (fileType?: string) => {
    if (!fileType) return FileText
    if (fileType.includes("pdf")) return FilePdf
    if (fileType.includes("doc")) return FileDoc
    if (fileType.includes("txt")) return FileTxt
    return FileText
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString()
  }

  // Group materials by folder
  const groupedMaterials = useMemo(() => {
    const groups: { [key: string]: StudyMaterial[] } = {}
    
    allMaterials.forEach(material => {
      const folderName = material.folder_name || "Individual Files"
      if (!groups[folderName]) {
        groups[folderName] = []
      }
      groups[folderName].push(material)
    })
    
    return groups
  }, [allMaterials])

  const filteredMaterials = allMaterials.filter(material =>
    material.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    materialTypeLabels[material.material_type].toLowerCase().includes(searchQuery.toLowerCase())
  )

  const filteredGroups = useMemo(() => {
    const groups: { [key: string]: StudyMaterial[] } = {}
    
    Object.entries(groupedMaterials).forEach(([folderName, materials]) => {
      const filteredMaterialsInFolder = materials.filter(material =>
        material.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        materialTypeLabels[material.material_type].toLowerCase().includes(searchQuery.toLowerCase())
      )
      
      if (filteredMaterialsInFolder.length > 0) {
        groups[folderName] = filteredMaterialsInFolder
      }
    })
    
    return groups
  }, [groupedMaterials, searchQuery])

  if (projectLoading) {
    return (
      <div className="container mx-auto p-4 md:p-6 max-w-6xl">
        {/* Header Skeleton */}
        <div className="mb-8">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
            <div className="space-y-2">
              <Skeleton className="h-8 w-48" />
              <Skeleton className="h-4 w-64" />
            </div>
            <Skeleton className="h-10 w-32" />
          </div>
          <Skeleton className="h-px w-full" />
        </div>

        {/* Tabs Skeleton */}
        <div className="space-y-6">
          <div className="grid w-full grid-cols-3 h-auto bg-muted/30 p-0.5 rounded-md">
            <Skeleton className="h-10 w-full rounded-sm" />
            <Skeleton className="h-10 w-full rounded-sm" />
            <Skeleton className="h-10 w-full rounded-sm" />
          </div>
          
          {/* Content Skeleton */}
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <Skeleton className="h-6 w-48" />
                <Skeleton className="h-4 w-96" />
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Skeleton className="h-4 w-16" />
                    <Skeleton className="h-10 w-full" />
                  </div>
                  <div className="space-y-2">
                    <Skeleton className="h-4 w-24" />
                    <Skeleton className="h-10 w-full" />
                  </div>
                </div>
                <div className="space-y-2">
                  <Skeleton className="h-4 w-16" />
                  <Skeleton className="h-24 w-full" />
                </div>
                <div className="space-y-2">
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-10 w-full" />
                </div>
                <div className="flex justify-end gap-3">
                  <Skeleton className="h-10 w-20" />
                  <Skeleton className="h-10 w-32" />
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    )
  }

  if (!project) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading project...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="container mx-auto p-4 md:p-6 max-w-6xl">
      {/* Header */}
      <div className="mb-8">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold">Study Materials</h1>
            <p className="text-muted-foreground text-sm md:text-base">
              Manage materials for {project.name}
            </p>
          </div>
          <Button
            variant="outline"
            onClick={() => router.back()}
            className="w-full sm:w-auto"
          >
            Back to Project
          </Button>
        </div>
        <Separator />
      </div>

      <Tabs value={selectedTab} onValueChange={setSelectedTab} className="space-y-6">
        <TabsList className="grid w-full grid-cols-3 h-auto bg-muted/30 p-0.5 rounded-md">
          <TabsTrigger 
            value="upload" 
            className="text-xs md:text-sm py-2.5 px-3 data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm rounded-sm transition-colors duration-150 hover:bg-muted/60"
          >
            Upload Material
          </TabsTrigger>
          <TabsTrigger 
            value="library" 
            className="text-xs md:text-sm py-2.5 px-3 data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm rounded-sm transition-colors duration-150 hover:bg-muted/60"
          >
            My Library
          </TabsTrigger>
          <TabsTrigger 
            value="textbooks" 
            className="text-xs md:text-sm py-2.5 px-3 data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm rounded-sm transition-colors duration-150 hover:bg-muted/60"
          >
            Textbook Library
          </TabsTrigger>
        </TabsList>

        {/* Upload Tab */}
        <TabsContent value="upload" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Upload New Material</CardTitle>
              <CardDescription>
                Add study material to your project. Upload a file to enable title editing, or provide text content.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-6">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6">
                  <div className="space-y-2">
                    <Label htmlFor="title">Title</Label>
                    <div className="relative">
                      <Input
                        id="title"
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                        placeholder={
                          isGeneratingTitle 
                            ? "Generating AI title..." 
                            : files.length > 0 
                              ? "Edit AI-generated title..." 
                              : "Title will be auto-generated from files"
                        }
                        disabled={files.length === 0 || isGeneratingTitle}
                        className={`${files.length === 0 ? "opacity-50" : ""} ${isGeneratingTitle ? "animate-pulse" : ""}`}
                      />
                      {isGeneratingTitle && (
                        <div className="absolute right-3 top-1/2 transform -translate-y-1/2">
                          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary"></div>
                        </div>
                      )}
                    </div>
                    {files.length === 0 && (
                      <p className="text-xs text-muted-foreground">
                        Upload files to generate AI title
                      </p>
                    )}
                    {files.length === 1 && !isGeneratingTitle && (
                      <p className="text-xs text-muted-foreground">
                        AI-generated title based on file content
                      </p>
                    )}
                    {files.length > 1 && (
                      <p className="text-xs text-muted-foreground">
                        Multiple files will be organized in a folder with AI-generated titles
                      </p>
                    )}
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
                </div>

                <div className="space-y-2">
                  <Label htmlFor="content">Content</Label>
                  <Textarea
                    id="content"
                    value={content}
                    onChange={(e) => setContent(e.target.value)}
                    placeholder="Enter material content or notes..."
                    rows={6}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="file">Upload Files (Optional)</Label>
                  <div className="flex items-center gap-2">
                    <Input
                      id="file"
                      type="file"
                      multiple
                      onChange={handleFileChange}
                      accept=".pdf,.doc,.docx,.txt,.md"
                      className="flex-1"
                    />
                    {files.length > 0 && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => setFiles([])}
                      >
                        <X className="size-4" />
                      </Button>
                    )}
                  </div>
                  {files.length > 0 && (
                    <div className="space-y-2">
                      {files.map((file, index) => (
                        <div key={index} className="flex items-center gap-2 p-3 bg-muted rounded-md">
                          {getFileIcon(file.type) && React.createElement(getFileIcon(file.type), { size: 20 })}
                          <span className="text-sm flex-1">{file.name}</span>
                          <span className="text-xs text-muted-foreground">
                            ({(file.size / 1024 / 1024).toFixed(2)} MB)
                          </span>
                        </div>
                      ))}
                      <p className="text-xs text-muted-foreground">
                        {files.length} file{files.length !== 1 ? 's' : ''} selected
                      </p>
                    </div>
                  )}
                </div>

                <div className="flex justify-end gap-3">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={resetForm}
                    disabled={isUploading}
                  >
                    Reset
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
                </div>
              </form>
            </CardContent>
          </Card>

          {/* Project Materials */}
          <Card>
            <CardHeader>
              <CardTitle>Materials in this Project</CardTitle>
              <CardDescription>
                Materials currently associated with this study session.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {projectMaterialsLoading ? (
                <div className="space-y-3">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="flex items-center gap-3 p-3 bg-muted rounded-md">
                      <Skeleton className="h-4 w-4 rounded" />
                      <div className="flex-1 space-y-2">
                        <Skeleton className="h-4 w-3/4" />
                        <Skeleton className="h-3 w-1/2" />
                      </div>
                      <Skeleton className="h-5 w-16" />
                    </div>
                  ))}
                </div>
              ) : projectMaterials.length === 0 ? (
                        <div className="text-center py-8">
                          <FileText className="size-8 text-muted-foreground mx-auto mb-2" />
                          <p className="text-muted-foreground">No materials added to this project yet.</p>
                          <p className="text-sm text-muted-foreground mt-2">
                            Upload materials using the form above, or check your library for existing materials.
                          </p>
                        </div>
              ) : (
                <div className="space-y-2">
                  {projectMaterials.map((material) => {
                    const IconComponent = materialTypeIcons[material.material_type]
                    return (
                      <div key={material.id} className="flex items-center gap-3 p-3 bg-muted rounded-md">
                        {IconComponent && <IconComponent className="size-4 text-primary" />}
                        <div className="flex-1">
                          <p className="font-medium text-sm">{material.title}</p>
                          <p className="text-xs text-muted-foreground">
                            {materialTypeLabels[material.material_type]} • Added {formatDate(material.created_at)}
                          </p>
                        </div>
                        <Badge variant="outline" className="text-xs">
                          {materialTypeLabels[material.material_type]}
                        </Badge>
                      </div>
                    )
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Library Tab */}
        <TabsContent value="library" className="space-y-6">
          <div className="mb-4">
            <h3 className="text-lg font-semibold mb-2">My Library</h3>
            <p className="text-muted-foreground text-sm">
              All your uploaded study materials across all projects and sessions.
            </p>
          </div>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="relative flex-1">
              <MagnifyingGlass className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground size-4" />
              <Input
                placeholder="Search materials..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 w-full"
              />
            </div>
            <Badge variant="secondary" className="w-fit">
              {Object.keys(filteredGroups).length} folders, {filteredMaterials.length} files
            </Badge>
          </div>

          {allMaterialsLoading ? (
            <div className="space-y-4">
              {[1, 2, 3].map((folderIndex) => (
                <Card key={folderIndex} className="group hover:shadow-md transition-shadow">
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2 flex-1 min-w-0">
                        <Skeleton className="h-5 w-5 rounded" />
                        <Skeleton className="h-5 w-16" />
                      </div>
                      <div className="flex items-center gap-1">
                        <Skeleton className="h-8 w-8 rounded" />
                        <Skeleton className="h-8 w-8 rounded" />
                      </div>
                    </div>
                    <Skeleton className="h-5 w-48" />
                    <Skeleton className="h-3 w-32" />
                  </CardHeader>
                  <CardContent className="pt-0">
                    <div className="space-y-2">
                      {[1, 2].map((materialIndex) => (
                        <div key={materialIndex} className="flex items-center gap-2 md:gap-3 p-3 md:p-2 bg-muted rounded-md">
                          <Skeleton className="h-4 w-4 rounded" />
                          <div className="flex-1 min-w-0">
                            <Skeleton className="h-4 w-3/4" />
                            <Skeleton className="h-3 w-1/3 mt-1" />
                          </div>
                          <div className="flex items-center gap-1">
                            <Skeleton className="h-8 w-8 rounded" />
                            <Skeleton className="h-8 w-8 rounded" />
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : filteredMaterials.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center h-64">
                <FileText className="size-12 text-muted-foreground mb-4" />
                <h3 className="text-lg font-semibold mb-2">No materials found</h3>
                <p className="text-muted-foreground text-center mb-4">
                  {searchQuery ? "No materials match your search." : "Upload your first study material to get started."}
                </p>
                <Button onClick={() => setSelectedTab("upload")}>
                  <Plus className="mr-2 size-4" />
                  Upload Material
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              {Object.entries(filteredGroups).map(([folderName, materials]) => (
                                          <Card key={folderName} className="group hover:shadow-md transition-shadow">
                            <CardHeader className="pb-3">
                              <div className="flex items-start justify-between gap-2">
                                <div className="flex items-center gap-2 flex-1 min-w-0">
                                  <BookOpen className="size-5 text-primary" />
                                  <Badge variant="outline" className="text-xs">
                                    {materials.length} file{materials.length !== 1 ? 's' : ''}
                                  </Badge>
                                </div>
                                <div className="flex items-center gap-1">
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-10 w-10 p-0 md:h-8 md:w-8 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity"
                                    onClick={() => {
                                      // TODO: Implement edit functionality
                                      toast({
                                        title: "Edit functionality coming soon",
                                        status: "info",
                                      })
                                    }}
                                  >
                                    <PencilSimple className="size-4 md:size-3" />
                                  </Button>
                                </div>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-10 w-10 p-0 md:h-8 md:w-8 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity"
                                  onClick={() => {
                                    const folderMaterials = materials.filter(m => m.folder_name === folderName)
                                    const isAllAssociated = folderMaterials.every(m => 
                                      projectMaterials.some(pm => pm.id === m.id)
                                    )
                                    
                                    if (isAllAssociated) {
                                      // Remove all folder materials from project
                                      Promise.all(
                                        folderMaterials.map(material =>
                                          fetch("/api/study-materials/disassociate", {
                                            method: "POST",
                                            body: JSON.stringify({
                                              session_id: projectId,
                                              material_id: material.id
                                            }),
                                            headers: {
                                              "Content-Type": "application/json"
                                            }
                                          })
                                        )
                                                                              ).then(async (responses) => {
                                          const failedResponses = responses.filter(response => !response.ok)
                                          if (failedResponses.length > 0) {
                                            throw new Error(`Failed to remove ${failedResponses.length} materials`)
                                          }
                                          queryClient.invalidateQueries({ queryKey: ["study-materials", projectId] })
                                          toast({
                                            title: "Folder removed from project",
                                            status: "success",
                                          })
                                        }).catch((error) => {
                                          console.error("Error removing folder:", error)
                                          toast({
                                            title: error.message || "Failed to remove folder",
                                            status: "error",
                                          })
                                        })
                                    } else {
                                      // Add all folder materials to project
                                      Promise.all(
                                        folderMaterials.map(material => {
                                          const formData = new FormData()
                                          formData.append("session_id", projectId)
                                          formData.append("material_id", material.id)
                                          return fetch("/api/study-materials/associate", {
                                            method: "POST",
                                            body: formData
                                          })
                                        })
                                                                              ).then(async (responses) => {
                                          const failedResponses = responses.filter(response => !response.ok)
                                          if (failedResponses.length > 0) {
                                            throw new Error(`Failed to add ${failedResponses.length} materials`)
                                          }
                                          queryClient.invalidateQueries({ queryKey: ["study-materials", projectId] })
                                          toast({
                                            title: "Folder added to project",
                                            status: "success",
                                          })
                                        }).catch((error) => {
                                          console.error("Error adding folder:", error)
                                          toast({
                                            title: error.message || "Failed to add folder",
                                            status: "error",
                                          })
                                        })
                                    }
                                  }}
                                >
                                  {materials.every(m => projectMaterials.some(pm => pm.id === m.id)) ? (
                                    <Check className="size-3" />
                                  ) : (
                                    <Plus className="size-3" />
                                  )}
                                </Button>
                              </div>
                              <CardTitle className="text-base">{folderName}</CardTitle>
                              <CardDescription className="text-xs">
                                Created {formatDate(materials[0]?.created_at || new Date().toISOString())}
                              </CardDescription>
                            </CardHeader>
                  <CardContent className="pt-0">
                    <div className="space-y-2">
                      {materials.map((material) => {
                        const IconComponent = materialTypeIcons[material.material_type]
                        const FileIcon = material.file_type ? getFileIcon(material.file_type) : null
                        
                        return (
                          <div key={material.id} className="flex items-center gap-2 md:gap-3 p-3 md:p-2 bg-muted rounded-md group/item">
                            {IconComponent && <IconComponent className="size-4 text-primary" />}
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium truncate">{material.title}</p>
                              <p className="text-xs text-muted-foreground">
                                {materialTypeLabels[material.material_type]}
                              </p>
                            </div>
                                                                <div className="flex items-center gap-1 opacity-100 md:opacity-0 md:group-hover/item:opacity-100 transition-opacity">
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        className="h-10 w-10 p-0 md:h-8 md:w-8"
                                        onClick={() => {
                                          const isAssociated = projectMaterials.some(pm => pm.id === material.id)
                                          
                                          if (isAssociated) {
                                            // Remove from project
                                            fetch("/api/study-materials/disassociate", {
                                              method: "POST",
                                              body: JSON.stringify({
                                                session_id: projectId,
                                                material_id: material.id
                                              }),
                                              headers: {
                                                "Content-Type": "application/json"
                                              }
                                            }).then(async (response) => {
                                              if (!response.ok) {
                                                const errorData = await response.json()
                                                throw new Error(errorData.error || "Failed to remove material")
                                              }
                                              queryClient.invalidateQueries({ queryKey: ["study-materials", projectId] })
                                              toast({
                                                title: "Material removed from project",
                                                status: "success",
                                              })
                                            }).catch((error) => {
                                              console.error("Error removing material:", error)
                                              toast({
                                                title: error.message || "Failed to remove material",
                                                status: "error",
                                              })
                                            })
                                          } else {
                                            // Add to project
                                            const formData = new FormData()
                                            formData.append("session_id", projectId)
                                            formData.append("material_id", material.id)
                                            
                                            fetch("/api/study-materials/associate", {
                                              method: "POST",
                                              body: formData
                                                                                      }).then(async (response) => {
                                            if (!response.ok) {
                                              const errorData = await response.json()
                                              throw new Error(errorData.error || "Failed to add material")
                                            }
                                            queryClient.invalidateQueries({ queryKey: ["study-materials", projectId] })
                                            toast({
                                              title: "Material added to project",
                                              status: "success",
                                            })
                                          }).catch((error) => {
                                            console.error("Error adding material:", error)
                                            toast({
                                              title: error.message || "Failed to add material",
                                              status: "error",
                                            })
                                          })
                                          }
                                        }}
                                      >
                                        {projectMaterials.some(pm => pm.id === material.id) ? (
                                          <Check className="size-3" />
                                        ) : (
                                          <Plus className="size-3" />
                                        )}
                                      </Button>
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        className="h-10 w-10 p-0 md:h-8 md:w-8"
                                        onClick={() => {
                                          setMaterialToDelete(material)
                                          setDeleteModalOpen(true)
                                        }}
                                      >
                                        <Trash className="size-4 md:size-3" />
                                      </Button>
                                    </div>
                          </div>
                        )
                      })}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* Textbook Library Tab */}
        <TabsContent value="textbooks" className="space-y-6">
          <Card>
            <CardContent className="flex flex-col items-center justify-center h-64">
              <BookOpen className="size-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold mb-2">Textbook Library</h3>
              <p className="text-muted-foreground text-center mb-4">
                Access to curated medical textbooks and resources coming soon.
              </p>
              <Badge variant="outline">Coming Soon</Badge>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Delete Confirmation Modal */}
      <Dialog open={deleteModalOpen} onOpenChange={setDeleteModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Material</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete "{materialToDelete?.title}"? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeleteModalOpen(false)}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (materialToDelete) {
                  deleteMaterialMutation.mutate(materialToDelete.id)
                  setDeleteModalOpen(false)
                  setMaterialToDelete(null)
                }
              }}
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
} 
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
import { fetchClient } from "@/lib/fetch"
import { useUserPreferences } from "@/lib/user-preference-store/provider"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { useRouter } from "next/navigation"
import { useState } from "react"

type DialogCreateProjectProps = {
  isOpen: boolean
  setIsOpen: (isOpen: boolean) => void
}

type CreateProjectData = {
  id: string
  name: string
  user_id: string
  created_at: string
}

const disciplineOptions = [
  { value: "anatomy", label: "Anatomy" },
  { value: "biochemistry", label: "Biochemistry" },
  { value: "physiology", label: "Physiology" },
  { value: "pharmacology", label: "Pharmacology" },
  { value: "pathology", label: "Pathology" },
  { value: "microbiology", label: "Microbiology" },
  { value: "immunology", label: "Immunology" },
  { value: "histology", label: "Histology" },
  { value: "embryology", label: "Embryology" },
  { value: "neuroscience", label: "Neuroscience" },
  { value: "general", label: "General" },
]

export function DialogCreateProject({
  isOpen,
  setIsOpen,
}: DialogCreateProjectProps) {
  const [projectName, setProjectName] = useState("")
  const [projectType, setProjectType] = useState<"project" | "study">("project")
  const [discipline, setDiscipline] = useState("general")
  const { preferences } = useUserPreferences()
  const queryClient = useQueryClient()
  const router = useRouter()
  
  const createProjectMutation = useMutation({
    mutationFn: async (data: { name: string; type: "project" | "study"; discipline?: string }): Promise<CreateProjectData> => {
      const response = await fetchClient("/api/projects", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(data),
      })

      if (!response.ok) {
        throw new Error("Failed to create project")
      }

      return response.json()
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["projects"] })
      router.push(`/p/${data.id}`)
      setProjectName("")
      setProjectType("project")
      setDiscipline("general")
      setIsOpen(false)
    },
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (projectName.trim()) {
      createProjectMutation.mutate({
        name: projectName.trim(),
        type: projectType,
        discipline: projectType === "study" ? discipline : undefined,
      })
    }
  }

  const isMedicalStudent = preferences.userRole === "medical-student"

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogContent>
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Create New {projectType === "study" ? "Study Session" : "Project"}</DialogTitle>
            <DialogDescription>
              Enter a name for your new {projectType === "study" ? "study session" : "project"}.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {isMedicalStudent && (
              <div className="space-y-2">
                <Label htmlFor="project-type">Type</Label>
                <Select value={projectType} onValueChange={(value) => setProjectType(value as "project" | "study")}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="project">Project</SelectItem>
                    <SelectItem value="study">Study Session</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
            
            <div className="space-y-2">
              <Label htmlFor="project-name">Name</Label>
              <Input
                id="project-name"
                placeholder={projectType === "study" ? "Study session name" : "Project name"}
                value={projectName}
                onChange={(e) => setProjectName(e.target.value)}
                autoFocus
              />
            </div>

            {projectType === "study" && isMedicalStudent && (
              <div className="space-y-2">
                <Label htmlFor="discipline">Discipline</Label>
                <Select value={discipline} onValueChange={setDiscipline}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select discipline" />
                  </SelectTrigger>
                  <SelectContent>
                    {disciplineOptions.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={!projectName.trim() || createProjectMutation.isPending}
            >
              {createProjectMutation.isPending
                ? "Creating..."
                : `Create ${projectType === "study" ? "Study Session" : "Project"}`}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

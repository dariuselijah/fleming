"use client"

import { DialogDeleteProject } from "@/app/components/layout/sidebar/dialog-delete-project"
import { useBreakpoint } from "@/app/hooks/use-breakpoint"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { DotsThree, PencilSimple, Trash, BookOpenIcon } from "@phosphor-icons/react"
import { useState } from "react"
import { useUserPreferences } from "@/lib/user-preference-store/provider"
import { useRouter } from "next/navigation"

type Project = {
  id: string
  name: string
  user_id: string
  created_at: string
  type?: string
  discipline?: string
}

type SidebarProjectMenuProps = {
  project: Project
  onStartEditing: () => void
  onMenuOpenChange?: (open: boolean) => void
}

export function SidebarProjectMenu({
  project,
  onStartEditing,
  onMenuOpenChange,
}: SidebarProjectMenuProps) {
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false)
  const isMobile = useBreakpoint(768)
  const { preferences } = useUserPreferences()
  const router = useRouter()

  const isStudySession = project.type === "study"
  const isMedicalStudent = preferences.userRole === "medical-student"

  return (
    <>
      <DropdownMenu
        // shadcn/ui / radix pointer-events-none issue
        modal={isMobile ? true : false}
        onOpenChange={onMenuOpenChange}
      >
        <DropdownMenuTrigger asChild>
          <button
            className="hover:bg-secondary flex size-7 items-center justify-center rounded-md p-1 transition-colors duration-150"
            onClick={(e) => e.stopPropagation()}
          >
            <DotsThree size={18} className="text-primary" weight="bold" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          {isStudySession && isMedicalStudent && (
            <>
              <DropdownMenuItem
                className="cursor-pointer"
                onClick={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  router.push(`/p/${project.id}/materials`)
                }}
              >
                <BookOpenIcon size={16} className="mr-2" />
                Study Materials
              </DropdownMenuItem>
              <DropdownMenuSeparator />
            </>
          )}
          <DropdownMenuItem
            className="cursor-pointer"
            onClick={(e) => {
              e.preventDefault()
              e.stopPropagation()
              onStartEditing()
            }}
          >
            <PencilSimple size={16} className="mr-2" />
            Rename
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            className="text-destructive"
            variant="destructive"
            onClick={(e) => {
              e.preventDefault()
              e.stopPropagation()
              setIsDeleteDialogOpen(true)
            }}
          >
            <Trash size={16} className="mr-2" />
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <DialogDeleteProject
        isOpen={isDeleteDialogOpen}
        setIsOpen={setIsDeleteDialogOpen}
        project={project}
      />
    </>
  )
}

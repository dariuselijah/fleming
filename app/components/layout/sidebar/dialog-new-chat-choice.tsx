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
import { BookOpenIcon, ChatCircleIcon, FolderIcon } from "@phosphor-icons/react"
import { useRouter } from "next/navigation"

type ContextType = "study" | "project"

type DialogNewChatChoiceProps = {
  isOpen: boolean
  setIsOpen: (open: boolean) => void
  contextType?: ContextType
  context?: {
    id: string
    title: string
    discipline?: string
  }
}

export function DialogNewChatChoice({ 
  isOpen, 
  setIsOpen, 
  contextType,
  context 
}: DialogNewChatChoiceProps) {
  const router = useRouter()

  console.log("DialogNewChatChoice rendered:", { isOpen, contextType, context })

  const handleCreateInContext = () => {
    if (context) {
      if (contextType === "study") {
        router.push(`/s/${context.id}`)
      } else if (contextType === "project") {
        router.push(`/p/${context.id}`)
      }
    }
    setIsOpen(false)
  }

  const handleCreateRegular = () => {
    router.push("/")
    setIsOpen(false)
  }

  const getContextIcon = () => {
    if (contextType === "study") return <BookOpenIcon className="size-5" />
    if (contextType === "project") return <FolderIcon className="size-5" />
    return <ChatCircleIcon className="size-5" />
  }

  const getContextTitle = () => {
    if (contextType === "study") return "In Study Session"
    if (contextType === "project") return "In Project"
    return "In Context"
  }

  const getContextDescription = () => {
    if (contextType === "study") {
      return `${context?.title} (${context?.discipline})`
    }
    return context?.title || ""
  }

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Create New Chat</DialogTitle>
          <DialogDescription>
            You're currently in a {contextType === "study" ? "study session" : contextType === "project" ? "project" : "context"}. Where would you like to create your new chat?
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-4 py-4">
          <Button
            variant="outline"
            className="w-full justify-start h-auto p-4"
            onClick={handleCreateInContext}
          >
            <div className="flex items-center gap-3">
              {getContextIcon()}
              <div className="text-left">
                <div className="font-medium">{getContextTitle()}</div>
                <div className="text-sm text-muted-foreground">
                  {getContextDescription()}
                </div>
              </div>
            </div>
          </Button>
          
          <Button
            variant="outline"
            className="w-full justify-start h-auto p-4"
            onClick={handleCreateRegular}
          >
            <div className="flex items-center gap-3">
              <ChatCircleIcon className="size-5" />
              <div className="text-left">
                <div className="font-medium">Regular Chat</div>
                <div className="text-sm text-muted-foreground">
                  General conversation outside current context
                </div>
              </div>
            </div>
          </Button>
        </div>
        
        <DialogFooter>
          <Button variant="ghost" onClick={() => setIsOpen(false)}>
            Cancel
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
} 
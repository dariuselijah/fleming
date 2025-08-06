"use client"

import { groupChatsByDate } from "@/app/components/history/utils"
import { useBreakpoint } from "@/app/hooks/use-breakpoint"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  useSidebar,
} from "@/components/ui/sidebar"
import { useChats } from "@/lib/chat-store/chats/provider"
import { useMessages } from "@/lib/chat-store/messages/provider"
import { useUserPreferences } from "@/lib/user-preference-store/provider"
import {
  ChatTeardropText,
  MagnifyingGlass,
  NotePencilIcon,
  X,
  CardsIcon,
  QuestionIcon,
  CalendarIcon,
  BookOpenIcon,
} from "@phosphor-icons/react"
import { useParams, useRouter, usePathname } from "next/navigation"
import { useMemo, useState } from "react"
import { FeedbackTrigger } from "../feedback/feedback-trigger"
import { HistoryTrigger } from "../../history/history-trigger"
import { SidebarList } from "./sidebar-list"
import { SidebarProject } from "./sidebar-project"
import { DialogNewChatChoice } from "./dialog-new-chat-choice"
import { useQuery } from "@tanstack/react-query"
import { Button } from "@/components/ui/button"

export function AppSidebar() {
  const isMobile = useBreakpoint(768)
  const { setOpenMobile } = useSidebar()
  const { chats, isLoading } = useChats()
  const { resetMessages } = useMessages()
  const { preferences } = useUserPreferences()
  const params = useParams<{ chatId: string }>()
  const pathname = usePathname()
  const currentChatId = params.chatId
  const [isNewChatChoiceOpen, setIsNewChatChoiceOpen] = useState(false)

  // Check if we're in a project
  const isInProject = pathname.startsWith('/p/')
  const projectId = isInProject ? pathname.split('/')[2] : null

  // Fetch project data if we're in a project
  const { data: project } = useQuery({
    queryKey: ["project", projectId],
    queryFn: async () => {
      if (!projectId) return null
      const response = await fetch(`/api/projects/${projectId}`)
      if (!response.ok) return null
      return response.json()
    },
    enabled: !!projectId,
  })

  // Debug logging
  console.log("Sidebar Debug:", {
    isInProject,
    projectId,
    project: !!project,
    userRole: preferences.userRole,
    pathname,
  })

  const groupedChats = useMemo(() => {
    const result = groupChatsByDate(chats, "")
    return result
  }, [chats])
  const hasChats = chats.length > 0
  const router = useRouter()

  // Helper function to format dates
  const formatDate = (dateString: string) => {
    const date = new Date(dateString)
    const now = new Date()
    const diffTime = Math.abs(now.getTime() - date.getTime())
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))
    
    if (diffDays === 1) return "Today"
    if (diffDays === 2) return "Yesterday"
    if (diffDays <= 7) return `${diffDays - 1} days ago`
    return date.toLocaleDateString()
  }

  return (
    <Sidebar collapsible="offcanvas" variant="sidebar" className="border-none">
      <SidebarHeader className="h-14 pl-3">
        <div className="flex justify-between">
          {isMobile ? (
            <button
              type="button"
              onClick={() => setOpenMobile(false)}
              className="text-muted-foreground hover:text-foreground hover:bg-muted inline-flex size-9 items-center justify-center rounded-md bg-transparent transition-colors focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
            >
              <X size={24} />
            </button>
          ) : (
            <div className="h-full" />
          )}
        </div>
      </SidebarHeader>
      <SidebarContent className="mask-t-from-98% mask-t-to-100% mask-b-from-98% mask-b-to-100% px-3">
        <ScrollArea className="flex h-full [&>div>div]:!block">
          <div className="mt-3 mb-5 flex w-full flex-col items-start gap-0">
            <button
              className="hover:bg-accent/80 hover:text-foreground text-primary group/new-chat relative inline-flex w-full items-center rounded-md bg-transparent px-2 py-2 text-sm transition-colors"
              type="button"
              onClick={() => {
                console.log("New Chat clicked:", { isInProject, pathname })
                if (isInProject) {
                  console.log("Opening dialog...")
                  setIsNewChatChoiceOpen(true)
                } else {
                  console.log("Clearing chat state and navigating to home...")
                  resetMessages()
                  router.push("/")
                }
              }}
            >
              <div className="flex items-center gap-2">
                <NotePencilIcon size={20} />
                New Chat
              </div>
              <div className="text-muted-foreground ml-auto text-xs opacity-0 duration-150 group-hover/new-chat:opacity-100">
                ⌘⇧U
              </div>
            </button>
            
            <HistoryTrigger
              hasSidebar={false}
              classNameTrigger="bg-transparent hover:bg-accent/80 hover:text-foreground text-primary relative inline-flex w-full items-center rounded-md px-2 py-2 text-sm transition-colors group/search"
              icon={<MagnifyingGlass size={24} className="mr-2" />}
              label={
                <div className="flex w-full items-center gap-2">
                  <span>Search</span>
                  <div className="text-muted-foreground ml-auto text-xs opacity-0 duration-150 group-hover/search:opacity-100">
                    ⌘+K
                  </div>
                </div>
              }
              hasPopover={false}
            />
          </div>
          <SidebarProject />
          
          {/* Study Tools for Medical Students */}
          {preferences.userRole === "medical-student" && (
            <div className="mb-5">
              <div className="px-2 py-2">
                <h3 className="text-sm font-semibold text-muted-foreground mb-3">
                  Study Tools
                </h3>
                <div className="space-y-2">
                  <Button
                    variant="ghost"
                    size="default"
                    className="w-full justify-start text-sm h-10"
                    onClick={() => {
                      router.push("/?action=flashcards")
                    }}
                  >
                    <CardsIcon className="mr-2 size-4" />
                    Generate Flashcards
                  </Button>
                  <Button
                    variant="ghost"
                    size="default"
                    className="w-full justify-start text-sm h-10"
                    onClick={() => {
                      router.push("/?action=quiz")
                    }}
                  >
                    <QuestionIcon className="mr-2 size-4" />
                    Create Quiz
                  </Button>
                  <Button
                    variant="ghost"
                    size="default"
                    className="w-full justify-start text-sm h-10"
                    onClick={() => {
                      router.push("/?action=plan")
                    }}
                  >
                    <CalendarIcon className="mr-2 size-4" />
                    Study Plan
                  </Button>
                </div>
              </div>
            </div>
          )}
          
          {isLoading ? (
            <div className="h-full" />
          ) : hasChats ? (
            <div className="space-y-5">
              {groupedChats?.map((group) => (
                <SidebarList
                  key={group.name}
                  title={group.name}
                  items={group.chats}
                  currentChatId={currentChatId}
                />
              ))}
            </div>
          ) : (
            <div className="flex h-[calc(100vh-160px)] flex-col items-center justify-center">
              <ChatTeardropText
                size={24}
                className="text-muted-foreground mb-1 opacity-40"
              />
              <div className="text-muted-foreground text-center">
                <p className="mb-1 text-base font-medium">No chats yet</p>
                <p className="text-sm opacity-70">Start a new conversation</p>
              </div>
            </div>
          )}
        </ScrollArea>
      </SidebarContent>
      <SidebarFooter className="mb-2 p-3">
        <FeedbackTrigger>
        <div
          className="hover:bg-muted flex items-center gap-2 rounded-md p-2"
          aria-label="Tell us how to improve Fleming"
        >
          <div className="rounded-full border p-1">
            <ChatTeardropText className="size-4" />
          </div>
          <div className="flex flex-col">
            <div className="text-sidebar-foreground text-sm font-medium">
              Help us improve
            </div>
            <div className="text-sidebar-foreground/70 text-xs">
              Tell us how to improve Fleming
            </div>
          </div>
        </div>
        </FeedbackTrigger>
      </SidebarFooter>
      
      <DialogNewChatChoice
        isOpen={isNewChatChoiceOpen}
        setIsOpen={setIsNewChatChoiceOpen}
        contextType="project"
        context={isInProject && project ? {
          id: project.id,
          title: project.name,
          discipline: project.discipline
        } : undefined}
      />
    </Sidebar>
  )
}

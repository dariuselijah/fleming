"use client"

import { useKeyShortcut } from "@/app/hooks/use-key-shortcut"
import { startNewChatClientSide } from "@/lib/chat-store/new-chat"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { NotePencilIcon } from "@phosphor-icons/react/dist/ssr"
import { usePathname } from "next/navigation"

export function ButtonNewChat() {
  const pathname = usePathname()

  useKeyShortcut(
    (e) => (e.key === "u" || e.key === "U") && e.metaKey && e.shiftKey,
    () => {
      startNewChatClientSide(pathname)
    }
  )

  const handleNewChat = () => {
    startNewChatClientSide(pathname)
  }

  if (pathname === "/") return null
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          onClick={handleNewChat}
          className="text-muted-foreground hover:text-foreground hover:bg-muted bg-background rounded-full p-1.5 transition-colors"
          aria-label="New Chat"
        >
          <NotePencilIcon size={24} />
        </button>
      </TooltipTrigger>
      <TooltipContent>New Chat ⌘⇧U</TooltipContent>
    </Tooltip>
  )
}

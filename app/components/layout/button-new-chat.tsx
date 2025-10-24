"use client"

import { useKeyShortcut } from "@/app/hooks/use-key-shortcut"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { NotePencilIcon } from "@phosphor-icons/react/dist/ssr"
import { usePathname, useRouter } from "next/navigation"

export function ButtonNewChat() {
  const pathname = usePathname()
  const router = useRouter()

  useKeyShortcut(
    (e) => (e.key === "u" || e.key === "U") && e.metaKey && e.shiftKey,
    () => {
      // Clear any local state before navigating
      if (typeof window !== 'undefined') {
        // Clear any cached messages or drafts
        localStorage.removeItem('chatDraft')
        // Dispatch event to reset chat state
        window.dispatchEvent(new CustomEvent('resetChatState'))
      }
      router.push("/")
    }
  )

  const handleNewChat = () => {
    // Clear any local state before navigating
    if (typeof window !== 'undefined') {
      // Clear any cached messages or drafts
      localStorage.removeItem('chatDraft')
      // Dispatch event to reset chat state
      window.dispatchEvent(new CustomEvent('resetChatState'))
    }
    router.push("/")
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

import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { Sparkles, BookOpen } from "lucide-react"
import { cn } from "@/lib/utils"

interface RagToggleProps {
  isSelected: boolean
  onToggle: (enabled: boolean) => void
  isAuthenticated: boolean
  hasMaterials: boolean
  className?: string
}

export function RagToggle({ 
  isSelected, 
  onToggle, 
  isAuthenticated, 
  hasMaterials,
  className 
}: RagToggleProps) {
  const handleClick = () => {
    if (!isAuthenticated) return
    onToggle(!isSelected)
  }

  const getTooltipText = () => {
    if (!isAuthenticated) return "Sign in to use RAG features"
    if (!hasMaterials) return "Upload materials to enable RAG"
    return isSelected ? "Disable RAG context" : "Enable RAG context"
  }

  const isDisabled = !isAuthenticated || !hasMaterials

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          onClick={handleClick}
          disabled={isDisabled}
          className={cn(
            "flex items-center gap-2 px-3 py-2 rounded-full border transition-all",
            isSelected 
              ? "border-purple-500/20 bg-purple-500/10 text-purple-600" 
              : "border-border bg-background hover:bg-muted",
            isDisabled && "opacity-50 cursor-not-allowed",
            !isDisabled && "cursor-pointer",
            className
          )}
        >
          <Sparkles className="size-4" />
          <span className="hidden md:block">RAG</span>
          {isSelected && <div className="size-2 rounded-full bg-purple-500" />}
        </button>
      </TooltipTrigger>
      <TooltipContent>
        <p>{getTooltipText()}</p>
      </TooltipContent>
    </Tooltip>
  )
} 
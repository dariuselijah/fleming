"use client"

import { COMMAND_CATEGORIES, type SlashCommand, type CommandCategory } from "@/lib/command-bar/command-registry"
import { cn } from "@/lib/utils"
import {
  Clipboard,
  Pill,
  Heartbeat,
  Hash,
  ArrowRight,
  Warning,
  FileText,
  BookOpen,
  ShieldCheck,
  Receipt,
  Package,
  FolderOpen,
  Folder,
  Calendar,
  TrendUp,
  CheckCircle,
  PaperPlaneTilt,
} from "@phosphor-icons/react"
import { motion } from "motion/react"
import { useMemo } from "react"

const ICON_MAP: Record<string, React.ComponentType<any>> = {
  Clipboard,
  Pill,
  Heartbeat,
  Hash,
  ArrowRight,
  Warning,
  FileText,
  BookOpen,
  ShieldCheck,
  Receipt,
  Package,
  FolderOpen,
  Folder,
  Calendar,
  TrendUp,
  CheckCircle,
  PaperPlaneTilt,
}

const CATEGORY_COLORS: Record<CommandCategory, string> = {
  clinical: "text-indigo-500",
  search: "text-emerald-500",
  admin: "text-amber-500",
  files: "text-blue-500",
  navigation: "text-purple-500",
}

interface CommandPopoverProps {
  commands: SlashCommand[]
  selectedIndex: number
  onSelect: (command: SlashCommand) => void
}

export function CommandPopover({ commands, selectedIndex, onSelect }: CommandPopoverProps) {
  const grouped = useMemo(() => {
    const groups = new Map<CommandCategory, SlashCommand[]>()
    commands.forEach((cmd) => {
      const list = groups.get(cmd.category) || []
      list.push(cmd)
      groups.set(cmd.category, list)
    })
    return groups
  }, [commands])

  let flatIndex = 0

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 8 }}
      transition={{ duration: 0.15 }}
      className="absolute right-0 bottom-full left-0 z-40 mb-2 max-h-80 overflow-y-auto rounded-2xl border border-border/70 bg-background/95 shadow-xl backdrop-blur-xl"
      style={{ scrollbarWidth: "none" }}
    >
      <div className="p-1.5">
        {COMMAND_CATEGORIES.map(({ id: catId, label: catLabel }) => {
          const catCommands = grouped.get(catId)
          if (!catCommands || catCommands.length === 0) return null

          return (
            <div key={catId} className="mb-1">
              <div className="px-3 py-1.5">
                <span className={cn("text-[10px] font-semibold uppercase tracking-wider", CATEGORY_COLORS[catId])}>
                  {catLabel}
                </span>
              </div>
              {catCommands.map((cmd) => {
                const Icon = ICON_MAP[cmd.icon] ?? FileText
                const isCurrent = flatIndex === selectedIndex
                const currentIndex = flatIndex
                flatIndex++

                return (
                  <button
                    key={cmd.id}
                    type="button"
                    onClick={() => onSelect(cmd)}
                    className={cn(
                      "flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left transition-colors",
                      isCurrent
                        ? "bg-accent text-foreground"
                        : "text-foreground hover:bg-muted/50"
                    )}
                  >
                    <div className={cn("flex size-7 shrink-0 items-center justify-center rounded-lg bg-muted/60")}>
                      <Icon className={cn("size-4", CATEGORY_COLORS[cmd.category])} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-medium">{cmd.label}</span>
                        <code className="rounded bg-muted px-1 py-0.5 text-[9px] text-muted-foreground">
                          {cmd.trigger}
                        </code>
                      </div>
                      <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                        {cmd.description}
                      </p>
                    </div>
                  </button>
                )
              })}
            </div>
          )
        })}

        {commands.length === 0 && (
          <div className="px-3 py-4 text-center">
            <p className="text-xs text-muted-foreground">No commands match this search</p>
          </div>
        )}
      </div>
    </motion.div>
  )
}

"use client"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { useUserPreferences } from "@/lib/user-preference-store/provider"
import { useUser } from "@/lib/user-store/provider"
import { cn } from "@/lib/utils"
import {
  Brain,
  CaretDown,
  Check,
  ClipboardText,
  GearSix,
  Heart,
  LinkSimpleHorizontal,
  Pulse,
} from "@phosphor-icons/react"
import Link from "next/link"
import { useEffect, useMemo, useState } from "react"
import {
  buildProfileTasks,
  defaultHealthWorkspaceState,
  readHealthWorkspaceState,
} from "./workspace-state"

export function HealthHeaderControls() {
  const { user } = useUser()
  const { preferences } = useUserPreferences()
  const [workspaceState, setWorkspaceState] = useState(defaultHealthWorkspaceState)

  useEffect(() => {
    const sync = () => setWorkspaceState(readHealthWorkspaceState(user?.id))
    sync()
    const handler = () => sync()
    window.addEventListener("fleming-health-workspace-updated", handler)
    return () =>
      window.removeEventListener("fleming-health-workspace-updated", handler)
  }, [user?.id])
  const tasks = useMemo(
    () => buildProfileTasks(preferences, workspaceState),
    [preferences, workspaceState]
  )
  const completedCount = tasks.filter((item) => item.completed).length

  return (
    <div className="flex items-center gap-1.5">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            className="h-8 rounded-full border-border/70 px-3 text-xs"
          >
            <Pulse className="size-4" />
            Complete Profile ({completedCount}/{tasks.length})
            <CaretDown className="size-3.5 opacity-70" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-[320px] rounded-xl p-1.5">
          <DropdownMenuLabel className="text-xs text-muted-foreground">
            Getting started
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          {tasks.map((task) => (
            <DropdownMenuItem
              key={task.id}
              className="cursor-default items-start justify-between rounded-lg py-2"
            >
              <div className="min-w-0">
                <p className="text-sm font-medium">{task.label}</p>
                <p className="text-muted-foreground mt-0.5 line-clamp-2 text-xs">
                  {task.description}
                </p>
              </div>
              <Badge
                variant={task.completed ? "secondary" : "outline"}
                className={cn(
                  "ml-3 rounded-full",
                  task.completed && "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
                )}
              >
                {task.completed ? <Check className="size-3" /> : " "}
              </Badge>
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="icon" className="size-8 rounded-full border-border/70">
            <GearSix className="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-[220px] rounded-xl">
          <DropdownMenuItem asChild>
            <Link href="/health/profile" className="flex items-center gap-2">
              <Heart className="size-4" />
              Update health profile
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <Link href="/health/memories" className="flex items-center gap-2">
              <Brain className="size-4" />
              Health memories
            </Link>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem asChild>
            <Link href="/uploads" className="flex items-center gap-2">
              <ClipboardText className="size-4" />
              Health files
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <Link href="/health" className="flex items-center gap-2">
              <LinkSimpleHorizontal className="size-4" />
              Connectors
            </Link>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}

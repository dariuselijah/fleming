"use client"

import { Input } from "@/components/ui/input"
import { useUserPreferences } from "@/lib/user-preference-store/provider"
import { useUser } from "@/lib/user-store/provider"
import { House, MagnifyingGlass } from "@phosphor-icons/react"
import { useMemo, useState } from "react"
import { buildHealthMemories, readHealthWorkspaceState } from "./workspace-state"

export function HealthMemoriesView() {
  const { user } = useUser()
  const { preferences } = useUserPreferences()
  const [query, setQuery] = useState("")
  const workspaceState = useMemo(
    () => readHealthWorkspaceState(user?.id),
    [user?.id]
  )
  const memories = useMemo(
    () => buildHealthMemories(preferences, workspaceState),
    [preferences, workspaceState]
  )

  const filtered = useMemo(() => {
    if (!query.trim()) return memories
    return memories.filter((entry) =>
      `${entry.category} ${entry.label} ${entry.value}`
        .toLowerCase()
        .includes(query.toLowerCase())
    )
  }, [memories, query])

  return (
    <div className="mx-auto w-full max-w-4xl px-4 pt-22 pb-8">
      <div className="mb-5 flex items-center gap-2 text-sm text-muted-foreground">
        <House className="size-4" />
        <span>Health</span>
      </div>
      <section className="rounded-2xl border border-border/70 bg-background p-4 shadow-sm">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h1 className="text-2xl font-semibold">Memories</h1>
          <div className="relative w-64">
            <MagnifyingGlass className="text-muted-foreground absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              className="pl-8"
              placeholder="Search memories"
            />
          </div>
        </div>
        <div className="space-y-3">
          {filtered.map((entry) => (
            <div key={entry.id} className="rounded-xl border border-border/60 bg-muted/10 p-3">
              <p className="text-muted-foreground text-xs">
                {entry.dateLabel} {entry.category}: {entry.label}
              </p>
              <p className="mt-1 text-sm">{entry.value}</p>
            </div>
          ))}
          {filtered.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              No memories match your current search.
            </p>
          ) : null}
        </div>
      </section>
    </div>
  )
}

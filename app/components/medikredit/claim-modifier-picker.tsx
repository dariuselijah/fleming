"use client"

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { cn } from "@/lib/utils"
import type { ModifierDef } from "@/lib/medikredit/modifier-catalog"
import { Plus, X } from "@phosphor-icons/react"
import { useMemo, useState } from "react"

export const MAX_MODIFIERS_PER_LINE = 5

const MOD_TYPE_COLORS: Record<string, string> = {
  informational: "bg-sky-500/15 text-sky-600 dark:text-sky-400",
  reduction: "bg-red-500/15 text-red-600 dark:text-red-400",
  add: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
  compound: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
}

export function ClaimModifierPicker({
  lineId,
  codes,
  available,
  onAdd,
  onRemove,
  className,
}: {
  lineId: string
  codes: string[]
  available: ModifierDef[]
  onAdd: (code: string) => void
  onRemove: (code: string) => void
  className?: string
}) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState("")

  const filtered = useMemo(() => {
    if (!search.trim()) return available.slice(0, 30)
    const q = search.toLowerCase()
    return available
      .filter((m) => m.code.includes(q) || m.description.toLowerCase().includes(q))
      .slice(0, 30)
  }, [available, search])

  return (
    <div className={cn("min-w-[100px]", className)}>
      <Popover
        open={open}
        onOpenChange={(next) => {
          setOpen(next)
          if (!next) setSearch("")
        }}
        modal={false}
      >
        <div className="flex flex-wrap items-center gap-0.5">
          {codes.map((c) => {
            const def = available.find((m) => m.code === c)
            const color = def ? MOD_TYPE_COLORS[def.modifierType] ?? "" : "bg-muted"
            return (
              <span
                key={c}
                className={cn("inline-flex items-center gap-0.5 rounded px-1 py-0.5 text-[9px] font-semibold", color)}
                title={def?.description}
              >
                {c}
                <button type="button" onClick={() => onRemove(c)} className="hover:opacity-70">
                  <X className="size-2.5" />
                </button>
              </span>
            )
          })}
          {codes.length < MAX_MODIFIERS_PER_LINE && (
            <PopoverTrigger asChild>
              <button
                type="button"
                className="inline-flex size-5 items-center justify-center rounded border border-dashed border-border/60 text-muted-foreground hover:bg-muted hover:text-foreground"
                title="Add modifier"
              >
                <Plus className="size-3" weight="bold" />
              </button>
            </PopoverTrigger>
          )}
        </div>

        <PopoverContent
          align="start"
          side="bottom"
          sideOffset={6}
          collisionPadding={12}
          className={cn(
            "z-[150] flex max-h-[min(22rem,calc(100vh-6rem))] w-[min(18rem,calc(100vw-2rem))] flex-col overflow-hidden p-0 shadow-lg",
            "data-[state=open]:animate-in data-[state=closed]:animate-out"
          )}
          onCloseAutoFocus={(e) => e.preventDefault()}
        >
          <div className="shrink-0 border-b border-border/60 p-1.5">
            <input
              type="text"
              placeholder="Search modifiers..."
              className="w-full rounded border border-border/60 bg-background px-2 py-1 text-[11px] placeholder:text-muted-foreground/50 focus:outline-none"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              autoFocus
            />
          </div>
          <div
            className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-1 [scrollbar-width:thin]"
            style={{ maxHeight: "min(14rem, 40vh)" }}
          >
            {filtered.length === 0 && (
              <p className="p-2 text-center text-[10px] text-muted-foreground">No modifiers found</p>
            )}
            {filtered.map((m) => {
              const alreadyAdded = codes.includes(m.code)
              return (
                <button
                  key={`${lineId}:${m.discipline}:${m.code}`}
                  type="button"
                  disabled={alreadyAdded}
                  className={cn(
                    "flex w-full items-start gap-2 rounded px-2 py-1.5 text-left text-[10px] transition-colors hover:bg-muted",
                    alreadyAdded && "opacity-40"
                  )}
                  onClick={() => {
                    onAdd(m.code)
                    setOpen(false)
                    setSearch("")
                  }}
                >
                  <span className="shrink-0 font-mono font-bold">{m.code}</span>
                  <span className="min-w-0 flex-1 text-muted-foreground">{m.description}</span>
                  <span
                    className={cn(
                      "shrink-0 rounded px-1 py-0.5 text-[8px] font-semibold uppercase",
                      MOD_TYPE_COLORS[m.modifierType] ?? "bg-muted"
                    )}
                  >
                    {m.modifierType.slice(0, 3)}
                  </span>
                </button>
              )
            })}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  )
}

"use client"

import { fetchClient } from "@/lib/fetch"
import { MagnifyingGlass, WarningCircle } from "@phosphor-icons/react"
import { useEffect, useMemo, useState } from "react"
import { formatZarCents } from "./ui/format"

export type MedpraxPickedCode = {
  code: string
  description: string
  kind: "tariff" | "nappi" | "icd"
  amount?: number
  source: "medprax"
}

export function MedpraxCodeSearch({
  onPick,
  discipline,
}: {
  onPick: (line: MedpraxPickedCode) => void
  discipline?: string
}) {
  const [type, setType] = useState<MedpraxPickedCode["kind"]>("tariff")
  const [query, setQuery] = useState("")
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [offline, setOffline] = useState<string | null>(null)
  const [results, setResults] = useState<MedpraxPickedCode[]>([])
  const debounced = useDebouncedValue(query, 250)

  useEffect(() => {
    let cancelled = false
    const q = debounced.trim()
    if (q.length < 2) {
      setResults([])
      setOffline(null)
      return
    }
    setLoading(true)
    setOffline(null)
    void fetchClient(`/api/clinical/medprax/codes?q=${encodeURIComponent(q)}&type=${type}&discipline=${encodeURIComponent(discipline ?? "")}`)
      .then((r) => r.json())
      .then((json: { results?: MedpraxPickedCode[]; unavailable?: boolean; message?: string }) => {
        if (cancelled) return
        setResults(json.results ?? [])
        setOffline(json.unavailable ? json.message ?? "Medprax API offline - manual entry available" : null)
      })
      .catch((e) => {
        if (!cancelled) setOffline(e instanceof Error ? e.message : "Medprax API offline - manual entry available")
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [debounced, type, discipline])

  const typeLabel = useMemo(() => ({ tariff: "Tariff", nappi: "NAPPI", icd: "ICD" })[type], [type])

  return (
    <div className="relative">
      <div className="flex items-center rounded-xl border border-border bg-background dark:border-white/[0.08] dark:bg-black/20">
        <select
          value={type}
          onChange={(e) => setType(e.target.value as typeof type)}
          className="w-20 rounded-l-xl bg-transparent px-2 py-2 text-[10px] font-semibold outline-none"
        >
          <option value="tariff">Tariff</option>
          <option value="nappi">NAPPI</option>
          <option value="icd">ICD</option>
        </select>
        <MagnifyingGlass className="size-3.5 text-muted-foreground" />
        <input
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
            setOpen(true)
          }}
          onFocus={() => setOpen(true)}
          placeholder={`${typeLabel} code`}
          className="min-w-0 flex-1 bg-transparent px-2 py-2 text-[11px] outline-none"
        />
      </div>
      {open && (query.trim().length >= 2 || offline) ? (
        <div className="absolute left-0 right-0 top-full z-40 mt-1 max-h-72 overflow-y-auto rounded-xl border border-border bg-popover p-1 shadow-2xl dark:border-white/[0.08] dark:bg-[#101010]">
          {offline ? (
            <div className="mb-1 flex items-start gap-2 rounded-lg border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-[10px] text-amber-300">
              <WarningCircle className="mt-0.5 size-3 shrink-0" />
              API offline - continue with manual entry.
            </div>
          ) : null}
          {loading ? (
            <p className="px-3 py-4 text-center text-[11px] text-muted-foreground">Medprax connecting...</p>
          ) : results.length === 0 ? (
            <p className="px-3 py-4 text-center text-[11px] text-muted-foreground">No verified codes yet. Enter line manually.</p>
          ) : (
            results.map((result) => (
              <button
                key={`${result.kind}-${result.code}-${result.description}`}
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  onPick(result)
                  setQuery(result.code)
                  setOpen(false)
                }}
                className="flex w-full items-start justify-between gap-3 rounded-lg px-3 py-2 text-left hover:bg-muted dark:hover:bg-white/[0.06]"
              >
                <span>
                  <span className="font-mono text-[10px] font-semibold text-emerald-400">{result.code}</span>
                  <span className="ml-2 text-[11px]">{result.description}</span>
                </span>
                {result.amount ? <span className="shrink-0 text-[10px] text-muted-foreground">{formatZarCents(result.amount)}</span> : null}
              </button>
            ))
          )}
        </div>
      ) : null}
    </div>
  )
}

function useDebouncedValue<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delay)
    return () => window.clearTimeout(timer)
  }, [value, delay])
  return debounced
}

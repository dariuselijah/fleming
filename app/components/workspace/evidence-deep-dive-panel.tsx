"use client"

import { fetchClient } from "@/lib/fetch"
import type { EvidenceDeepDiveState } from "@/lib/clinical-workspace/types"
import { useWorkspace } from "@/lib/clinical-workspace"
import { cn } from "@/lib/utils"
import {
  BookOpen,
  CheckCircle,
  CircleNotch,
  ListBullets,
  MagnifyingGlass,
} from "@phosphor-icons/react"
import { useCallback, useMemo, useState } from "react"
import ReactMarkdown, { type Components } from "react-markdown"
import remarkGfm from "remark-gfm"

export function EvidenceDeepDivePanel() {
  const { activePatient, setPatientEvidenceDeepDive } = useWorkspace()
  const [query, setQuery] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const dive = activePatient?.evidenceDeepDive ?? null

  const runSearch = useCallback(async () => {
    const q = query.trim()
    if (q.length < 3 || !activePatient) return
    setLoading(true)
    setError(null)
    try {
      const res = await fetchClient("/api/clinical/evidence-deep-dive", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: q }),
      })
      const data = (await res.json()) as EvidenceDeepDiveState & { error?: string }
      if (!res.ok) {
        setError(data.error ?? "Request failed")
        return
      }
      setPatientEvidenceDeepDive(activePatient.patientId, {
        query: data.query,
        synthesis: data.synthesis,
        results: data.results,
        updatedAt: data.updatedAt,
        stages: data.stages,
      })
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed")
    } finally {
      setLoading(false)
    }
  }, [activePatient, query, setPatientEvidenceDeepDive])

  const mdComponents = useMemo<Components>(
    () => ({
      h1: ({ children }) => (
        <h3 className="mb-2 mt-4 border-b border-border/40 pb-1 text-[13px] font-semibold tracking-tight text-foreground first:mt-0">
          {children}
        </h3>
      ),
      h2: ({ children }) => (
        <h4 className="mb-1.5 mt-3 text-[12px] font-semibold tracking-tight text-foreground first:mt-0">
          {children}
        </h4>
      ),
      h3: ({ children }) => (
        <h5 className="mb-1 mt-2 text-[11px] font-semibold text-foreground/95 first:mt-0">{children}</h5>
      ),
      p: ({ children }) => (
        <p className="mb-2.5 text-[11px] leading-relaxed text-foreground/90 last:mb-0">{children}</p>
      ),
      ul: ({ children }) => (
        <ul className="mb-2.5 ml-3 list-disc space-y-1 text-[11px] text-foreground/88 marker:text-emerald-600/80 dark:marker:text-emerald-400/80">
          {children}
        </ul>
      ),
      ol: ({ children }) => (
        <ol className="mb-2.5 ml-3 list-decimal space-y-1 text-[11px] text-foreground/88">{children}</ol>
      ),
      li: ({ children }) => <li className="leading-relaxed">{children}</li>,
      strong: ({ children }) => <strong className="font-semibold text-foreground">{children}</strong>,
      a: ({ href, children }) => (
        <a
          href={href}
          target="_blank"
          rel="noreferrer"
          className="font-medium text-emerald-700 underline decoration-emerald-500/30 underline-offset-2 hover:text-emerald-600 dark:text-emerald-300"
        >
          {children}
        </a>
      ),
      code: ({ className, children }) => {
        const inline = !className
        return inline ? (
          <code className="rounded bg-muted/80 px-1 py-px text-[10px] font-mono text-foreground/90">
            {children}
          </code>
        ) : (
          <code className={className}>{children}</code>
        )
      },
    }),
    []
  )

  if (!activePatient) {
    return (
      <p className="px-3 py-6 text-center text-[11px] text-muted-foreground">
        Open a patient to run evidence search.
      </p>
    )
  }

  return (
    <div className="flex max-h-[min(72vh,560px)] flex-col gap-0 overflow-hidden p-3">
      <div className="shrink-0 rounded-xl border border-border/40 bg-gradient-to-b from-card/90 to-card/60 p-3 shadow-sm">
        <h4 className="flex items-center gap-1.5 text-xs font-semibold tracking-tight">
          <BookOpen className="size-3.5 text-emerald-500" />
          Evidence deep dive
        </h4>
        <p className="mt-1 text-[10px] leading-relaxed text-muted-foreground">
          Literature search + synthesis with numbered citations. May take 30–90s. Same pipeline as{" "}
          <code className="rounded bg-muted/90 px-1 text-[9px]">/evidence</code> in chat.
        </p>
        <div className="mt-2 flex gap-2">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void runSearch()
            }}
            placeholder="Clinical question…"
            className="min-w-0 flex-1 rounded-lg border border-border/50 bg-background/90 px-2.5 py-2 text-[11px] outline-none ring-0 transition-colors focus:border-emerald-500/35"
          />
          <button
            type="button"
            disabled={loading || query.trim().length < 3}
            onClick={() => void runSearch()}
            className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-emerald-600/90 px-3 py-2 text-[11px] font-semibold text-white shadow-sm hover:bg-emerald-600 disabled:opacity-40 dark:bg-emerald-500/85"
          >
            {loading ? (
              <CircleNotch className="size-3.5 animate-spin" />
            ) : (
              <MagnifyingGlass className="size-3.5" weight="bold" />
            )}
            Run
          </button>
        </div>
        {error && <p className="mt-2 text-[10px] text-red-500">{error}</p>}
      </div>

      <div
        className="mt-2 min-h-0 flex-1 space-y-3 overflow-y-auto pr-0.5"
        style={{ scrollbarWidth: "thin" }}
      >
        {loading && (
          <div className="flex items-center gap-2 rounded-lg border border-dashed border-border/45 bg-muted/10 px-3 py-2.5 text-[10px] text-muted-foreground">
            <CircleNotch className="size-3.5 animate-spin shrink-0 text-emerald-600 dark:text-emerald-400" />
            Searching indexed literature and trials…
          </div>
        )}

        {dive?.stages && dive.stages.length > 0 && !loading && (
          <details
            className="group rounded-lg border border-border/35 bg-muted/10 open:bg-muted/15"
            open={!dive?.synthesis}
          >
            <summary className="flex cursor-pointer list-none items-center gap-2 px-2.5 py-2 text-[10px] font-medium text-muted-foreground [&::-webkit-details-marker]:hidden">
              <ListBullets className="size-3.5 shrink-0 text-muted-foreground/70" />
              <span>Pipeline steps</span>
              <span className="ml-auto text-[9px] opacity-60 group-open:hidden">Show</span>
              <span className="ml-auto hidden text-[9px] opacity-60 group-open:inline">Hide</span>
            </summary>
            <ul className="space-y-1 border-t border-border/30 px-2.5 py-2">
              {dive.stages.map((s) => (
                <li key={s.label} className="flex items-center gap-2 text-[10px]">
                  {s.done ? (
                    <CheckCircle className="size-3.5 shrink-0 text-emerald-500" weight="fill" />
                  ) : (
                    <span className="size-3.5 shrink-0 rounded-full border border-border/60" />
                  )}
                  <span className={s.done ? "text-foreground/90" : "text-muted-foreground"}>{s.label}</span>
                </li>
              ))}
            </ul>
          </details>
        )}

        {dive?.synthesis && (
          <article className="rounded-xl border border-border/40 bg-card/95 shadow-sm ring-1 ring-border/20">
            <div className="border-b border-border/35 bg-muted/20 px-3 py-2">
              <p className="text-[9px] font-semibold uppercase tracking-[0.2em] text-emerald-700/90 dark:text-emerald-400/90">
                Evidence brief
              </p>
              {dive.query && (
                <p className="mt-0.5 text-[10px] leading-snug text-muted-foreground line-clamp-2">
                  {dive.query}
                </p>
              )}
            </div>
            <div className="px-3 py-3">
              <ReactMarkdown remarkPlugins={[remarkGfm]} components={mdComponents}>
                {dive.synthesis}
              </ReactMarkdown>
            </div>
          </article>
        )}

        {dive?.results && dive.results.length > 0 && (
          <div className="space-y-2 pb-1">
            <p className="px-0.5 text-[9px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              Sources · {dive.results.length}
            </p>
            <div className="space-y-1.5">
              {dive.results.map((r, idx) => (
                <a
                  key={r.id}
                  href={r.url ?? "#"}
                  target="_blank"
                  rel="noreferrer"
                  className={cn(
                    "flex gap-2.5 rounded-lg border border-border/40 bg-muted/5 px-2.5 py-2 transition-colors",
                    r.url && "hover:border-emerald-500/25 hover:bg-emerald-500/[0.03]"
                  )}
                  onClick={(e) => {
                    if (!r.url) e.preventDefault()
                  }}
                >
                  <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-md bg-emerald-500/12 text-[10px] font-semibold tabular-nums text-emerald-800 dark:text-emerald-200">
                    {idx + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <span className="text-[11px] font-semibold leading-snug text-foreground">{r.title}</span>
                      {typeof r.evidenceLevel === "number" && (
                        <span className="shrink-0 rounded bg-muted/80 px-1.5 py-px text-[9px] font-medium tabular-nums text-muted-foreground">
                          L{r.evidenceLevel}
                        </span>
                      )}
                    </div>
                    <p className="mt-0.5 text-[9px] text-muted-foreground">
                      {[r.journal, r.year].filter(Boolean).join(" · ")}
                    </p>
                    {r.keyFindings && (
                      <p className="mt-1 line-clamp-2 text-[10px] leading-relaxed text-muted-foreground/90">
                        {r.keyFindings}
                      </p>
                    )}
                  </div>
                </a>
              ))}
            </div>
          </div>
        )}

        {!dive && !loading && (
          <p className="py-4 text-center text-[10px] text-muted-foreground/80">
            Run a search — results stay with this encounter.
          </p>
        )}
      </div>
    </div>
  )
}

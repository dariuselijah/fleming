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
import { useCallback, useState } from "react"

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

  if (!activePatient) {
    return (
      <p className="px-3 py-6 text-center text-[11px] text-muted-foreground">
        Open a patient to run evidence search.
      </p>
    )
  }

  return (
    <div className="flex max-h-[min(72vh,560px)] flex-col gap-3 overflow-hidden p-3">
      <div className="rounded-xl border border-border/50 bg-card/80 p-3">
        <h4 className="flex items-center gap-1.5 text-xs font-semibold">
          <BookOpen className="size-3.5 text-emerald-500" />
          Evidence deep dive
        </h4>
        <p className="mt-1 text-[10px] leading-relaxed text-muted-foreground">
          Hybrid search over indexed literature + synthesis with citations. May take 30–90s for
          high yield. Use <code className="rounded bg-muted px-1">/evidence</code> in chat for the
          same pipeline.
        </p>
        <div className="mt-2 flex gap-2">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void runSearch()
            }}
            placeholder="Clinical question (e.g. first-line ACE inhibitor post-MI)"
            className="min-w-0 flex-1 rounded-lg border border-border/60 bg-background px-2.5 py-2 text-[11px] outline-none ring-0 focus:border-emerald-500/40"
          />
          <button
            type="button"
            disabled={loading || query.trim().length < 3}
            onClick={() => void runSearch()}
            className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-emerald-500/15 px-3 py-2 text-[11px] font-semibold text-emerald-700 dark:text-emerald-300 disabled:opacity-40"
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

      {loading && (
        <div className="flex items-center gap-2 rounded-lg border border-dashed border-border/50 px-3 py-2 text-[10px] text-muted-foreground">
          <CircleNotch className="size-3.5 animate-spin" />
          Searching PubMed-indexed evidence, guidelines, and trials…
        </div>
      )}

      {dive?.stages && dive.stages.length > 0 && !loading && (
        <div className="rounded-lg border border-border/40 bg-muted/20 px-2 py-2">
          <p className="mb-1.5 flex items-center gap-1 text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">
            <ListBullets className="size-3" />
            Agent task board
          </p>
          <ul className="space-y-1">
            {dive.stages.map((s) => (
              <li key={s.label} className="flex items-center gap-2 text-[10px]">
                {s.done ? (
                  <CheckCircle className="size-3.5 shrink-0 text-emerald-500" weight="fill" />
                ) : (
                  <span className="size-3.5 shrink-0 rounded-full border border-border" />
                )}
                <span className={s.done ? "text-foreground" : "text-muted-foreground"}>{s.label}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {dive?.synthesis && (
        <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/[0.04] p-3">
          <p className="text-[9px] font-semibold uppercase tracking-wide text-emerald-600 dark:text-emerald-400">
            Synthesis
          </p>
          <div className="prose prose-sm dark:prose-invert mt-1.5 max-w-none text-[11px] leading-relaxed text-foreground/90">
            {dive.synthesis.split("\n\n").map((para, i) => (
              <p key={i} className="mb-2 last:mb-0">
                {para}
              </p>
            ))}
          </div>
        </div>
      )}

      {dive?.results && dive.results.length > 0 && (
        <div className="min-h-0 flex-1 space-y-2 overflow-y-auto" style={{ scrollbarWidth: "thin" }}>
          <p className="text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">
            Sources ({dive.results.length})
          </p>
          {dive.results.map((r) => (
            <a
              key={r.id}
              href={r.url ?? "#"}
              target="_blank"
              rel="noreferrer"
              className={cn(
                "block rounded-lg border border-border/50 bg-card/90 p-2.5 transition-colors",
                r.url && "hover:border-emerald-500/30 hover:bg-card"
              )}
              onClick={(e) => {
                if (!r.url) e.preventDefault()
              }}
            >
              <div className="flex items-start justify-between gap-2">
                <span className="text-[11px] font-semibold leading-snug text-foreground">{r.title}</span>
                {typeof r.evidenceLevel === "number" && (
                  <span className="shrink-0 rounded bg-muted px-1.5 py-px text-[9px] font-medium tabular-nums text-muted-foreground">
                    L{r.evidenceLevel}
                  </span>
                )}
              </div>
              <p className="mt-0.5 text-[9px] text-muted-foreground">
                {[r.journal, r.year].filter(Boolean).join(" · ")}
              </p>
              {r.keyFindings && (
                <p className="mt-1 line-clamp-3 text-[10px] leading-relaxed text-muted-foreground">
                  {r.keyFindings}
                </p>
              )}
              {r.url && (
                <span className="mt-1 inline-block text-[9px] font-medium text-emerald-600 dark:text-emerald-400">
                  Open source →
                </span>
              )}
            </a>
          ))}
        </div>
      )}

      {!dive && !loading && (
        <p className="text-center text-[10px] text-muted-foreground/80">
          Enter a question and run — results stay with this encounter.
        </p>
      )}
    </div>
  )
}

"use client"

import { fetchClient } from "@/lib/fetch"
import { ArrowsDownUp, CheckCircle, CloudArrowUp, FileCsv, Spinner, WarningCircle } from "@phosphor-icons/react"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { BentoTile } from "../bento-tile"
import { EmptyRevenueState, RevenueBadge, RevenueTable } from "./ui/primitives"
import { formatZarCents } from "./ui/format"

type SettlementLine = {
  id: string
  importId?: string
  source: string
  externalRef: string
  amountCents: number
  feesCents: number
  status: string
  matchedPaymentId?: string
}
type SettlementImport = {
  id: string
  source: string
  period: string
  totals?: { imported?: number; matched?: number }
  status: string
  created_at?: string
}

const SOURCE_LABELS: Record<string, string> = {
  bank: "Bank statement",
  polar: "Polar payout",
  stitch: "Stitch settlement",
}

const FILTER_LABELS: { key: string; label: string }[] = [
  { key: "all", label: "All" },
  { key: "unmatched", label: "Unmatched" },
  { key: "matched", label: "Matched" },
  { key: "disputed", label: "Disputed" },
]

export function ReconciliationTab() {
  const [source, setSource] = useState("bank")
  const [csv, setCsv] = useState("")
  const [fileName, setFileName] = useState<string | null>(null)
  const [dragging, setDragging] = useState(false)
  const [lines, setLines] = useState<SettlementLine[]>([])
  const [imports, setImports] = useState<SettlementImport[]>([])
  const [selectedImportId, setSelectedImportId] = useState<string | null>(null)
  const [filter, setFilter] = useState("all")
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const loadImports = useCallback(async (selectId?: string) => {
    const res = await fetchClient("/api/billing/reconciliation/imports")
    const j = (await res.json().catch(() => ({}))) as { imports?: SettlementImport[]; lines?: SettlementLine[] }
    if (res.ok) {
      setImports(j.imports ?? [])
      if (selectId || !selectedImportId) {
        setLines(j.lines ?? [])
        setSelectedImportId((j.imports ?? [])[0]?.id ?? null)
      }
    }
  }, [selectedImportId])

  useEffect(() => {
    void loadImports()
  }, [])

  const loadLinesForImport = async (importId: string) => {
    setSelectedImportId(importId)
    const res = await fetchClient("/api/billing/reconciliation/imports")
    const j = (await res.json().catch(() => ({}))) as { lines?: SettlementLine[] }
    if (res.ok) setLines((j.lines ?? []).filter((l) => l.importId === importId))
  }

  const readFile = (file: File) => {
    setFileName(file.name)
    const reader = new FileReader()
    reader.onload = (e) => setCsv(String(e.target?.result ?? ""))
    reader.readAsText(file)
  }

  const handleFileDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragging(false)
    const file = e.dataTransfer.files[0]
    if (file?.name.endsWith(".csv") || file?.type.includes("csv") || file?.type.includes("text")) {
      readFile(file)
    }
  }, [])

  const kpis = useMemo(() => {
    const matched = lines.filter((l) => l.status === "matched").length
    const fees = lines.reduce((sum, l) => sum + (l.feesCents ?? 0), 0)
    const unresolved = lines.filter((l) => l.status !== "matched" && l.status !== "disputed").length
    return {
      matchedPct: lines.length ? Math.round((matched / lines.length) * 100) : 0,
      fees,
      unresolved,
      total: lines.length,
    }
  }, [lines])

  const filteredLines = useMemo(() => {
    if (filter === "all") return lines
    if (filter === "unmatched") return lines.filter((l) => l.status === "unmatched" || l.status === "needs_review")
    return lines.filter((l) => l.status === filter)
  }, [lines, filter])

  const importCsv = async () => {
    if (!csv.trim()) {
      setMessage({ text: "Upload or paste a CSV first.", ok: false })
      return
    }
    setBusy(true)
    setMessage(null)
    try {
      const res = await fetchClient("/api/billing/reconciliation/import", {
        method: "POST",
        body: JSON.stringify({ source, csv }),
      })
      const j = (await res.json().catch(() => ({}))) as { error?: string; lines?: SettlementLine[]; import?: SettlementImport }
      if (!res.ok) throw new Error(j.error ?? "Import failed")
      setLines(j.lines ?? [])
      if (j.import) setImports((rows) => [j.import as SettlementImport, ...rows])
      setMessage({ text: `${j.lines?.length ?? 0} lines imported.`, ok: true })
      setCsv("")
      setFileName(null)
    } catch (e) {
      setMessage({ text: e instanceof Error ? e.message : "Import failed", ok: false })
    } finally {
      setBusy(false)
    }
  }

  const autoMatch = async () => {
    setBusy(true)
    setMessage(null)
    try {
      const res = await fetchClient("/api/billing/reconciliation/match", {
        method: "POST",
        body: JSON.stringify({ lines }),
      })
      const j = (await res.json().catch(() => ({}))) as { error?: string; lines?: SettlementLine[] }
      if (!res.ok) throw new Error(j.error ?? "Match failed")
      setLines(j.lines ?? [])
      void loadImports()
      setMessage({ text: "Auto-match complete.", ok: true })
    } catch (e) {
      setMessage({ text: e instanceof Error ? e.message : "Match failed", ok: false })
    } finally {
      setBusy(false)
    }
  }

  const patchLine = async (lineId: string, status: string) => {
    const res = await fetchClient(`/api/billing/reconciliation/lines/${lineId}`, {
      method: "PATCH",
      body: JSON.stringify({ status }),
    })
    if (res.ok) {
      setLines((rows) => rows.map((r) => (r.id === lineId ? { ...r, status } : r)))
    }
  }

  return (
    <div className="grid gap-4 xl:grid-cols-[360px_minmax(0,1fr)]">
      {/* Left: import panel */}
      <div className="flex flex-col gap-4">
        <BentoTile title="Import settlement" subtitle="Upload a CSV from your bank or payment provider">
          <div className="space-y-4">
            {/* Provider selector */}
            <div className="flex gap-1.5">
              {Object.entries(SOURCE_LABELS).map(([k, label]) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setSource(k)}
                  className={`flex-1 rounded-xl border px-2 py-2 text-[10px] font-semibold transition-all ${
                    source === k
                      ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-400"
                      : "border-border bg-background/50 text-muted-foreground hover:border-white/[0.12] hover:text-foreground dark:border-white/[0.08]"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            {/* Drop zone */}
            <div
              onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
              onDragLeave={() => setDragging(false)}
              onDrop={handleFileDrop}
              onClick={() => fileRef.current?.click()}
              className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed p-8 transition-all ${
                dragging
                  ? "border-emerald-400/60 bg-emerald-500/[0.08]"
                  : "border-border/60 bg-muted/20 hover:border-border hover:bg-muted/40 dark:border-white/[0.08]"
              }`}
            >
              <input
                ref={fileRef}
                type="file"
                accept=".csv,text/csv,text/plain"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0]
                  if (f) readFile(f)
                }}
              />
              {fileName ? (
                <>
                  <FileCsv className="size-8 text-emerald-400" weight="duotone" />
                  <p className="text-[11px] font-medium text-foreground">{fileName}</p>
                  <p className="text-[10px] text-muted-foreground">{csv.split("\n").filter(Boolean).length} lines detected</p>
                </>
              ) : (
                <>
                  <CloudArrowUp className={`size-8 transition-colors ${dragging ? "text-emerald-400" : "text-muted-foreground/40"}`} weight="duotone" />
                  <p className="text-[11px] font-medium text-foreground">Drop CSV file here</p>
                  <p className="text-[10px] text-muted-foreground">or click to browse · {SOURCE_LABELS[source]} format</p>
                </>
              )}
            </div>

            {/* Paste fallback */}
            <details className="group">
              <summary className="cursor-pointer text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60 transition-colors hover:text-muted-foreground">
                Or paste CSV manually
              </summary>
              <textarea
                value={csv}
                onChange={(e) => { setCsv(e.target.value); setFileName(null) }}
                placeholder="external_ref,amount_cents,fees_cents"
                className="mt-2 min-h-28 w-full rounded-xl border border-border bg-background px-3 py-2 text-xs font-mono dark:border-white/[0.08] dark:bg-black/20"
              />
            </details>

            {/* Format hint */}
            <p className="rounded-xl bg-muted/40 px-3 py-2 text-[10px] text-muted-foreground dark:bg-white/[0.03]">
              <span className="font-semibold text-foreground/60">Expected columns:</span> external_ref, amount_cents, fees_cents
            </p>

            {/* Actions */}
            <div className="flex gap-2">
              <button
                type="button"
                disabled={busy || !csv.trim()}
                onClick={() => void importCsv()}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-blue-500/15 px-4 py-2.5 text-[11px] font-semibold text-blue-400 transition-colors hover:bg-blue-500/25 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {busy ? <Spinner className="size-3.5 animate-spin" /> : <CloudArrowUp className="size-3.5" />}
                Import
              </button>
              <button
                type="button"
                disabled={busy || lines.length === 0}
                onClick={() => void autoMatch()}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-emerald-500/15 px-4 py-2.5 text-[11px] font-semibold text-emerald-400 transition-colors hover:bg-emerald-500/25 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <ArrowsDownUp className="size-3.5" />
                Auto-match
              </button>
            </div>

            {message && (
              <p className={`flex items-center gap-1.5 rounded-xl px-3 py-2 text-[11px] font-medium ${message.ok ? "bg-emerald-500/10 text-emerald-400" : "bg-red-500/10 text-red-400"}`}>
                {message.ok ? <CheckCircle className="size-3.5 shrink-0" /> : <WarningCircle className="size-3.5 shrink-0" />}
                {message.text}
              </p>
            )}
          </div>
        </BentoTile>

        {/* Import history */}
        <BentoTile title="Import history" subtitle={`${imports.length} past imports`}>
          {imports.length === 0 ? (
            <p className="py-4 text-center text-[11px] text-muted-foreground">No imports yet</p>
          ) : (
            <div className="space-y-1.5">
              {imports.map((imp) => {
                const active = imp.id === selectedImportId
                const pct = imp.totals?.imported ? Math.round(((imp.totals.matched ?? 0) / imp.totals.imported) * 100) : 0
                return (
                  <button
                    key={imp.id}
                    type="button"
                    onClick={() => void loadLinesForImport(imp.id)}
                    className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-all ${
                      active ? "bg-white/[0.07] ring-1 ring-white/[0.08]" : "hover:bg-muted/50 dark:hover:bg-white/[0.04]"
                    }`}
                  >
                    <FileCsv className="size-5 shrink-0 text-blue-400" weight="duotone" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[11px] font-medium">{SOURCE_LABELS[imp.source] ?? imp.source}</p>
                      <p className="text-[10px] text-muted-foreground">{imp.period}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-[11px] font-semibold text-emerald-400">{pct}%</p>
                      <p className="text-[10px] text-muted-foreground">{imp.totals?.matched ?? 0}/{imp.totals?.imported ?? 0}</p>
                    </div>
                  </button>
                )
              })}
            </div>
          )}
        </BentoTile>
      </div>

      {/* Right: worklist */}
      <BentoTile
        title="Reconciliation worklist"
        subtitle={`${kpis.unresolved} unresolved · ${kpis.matchedPct}% matched`}
        action={
          <div className="flex gap-1">
            {FILTER_LABELS.map(({ key, label }) => (
              <button
                key={key}
                type="button"
                onClick={() => setFilter(key)}
                className={`rounded-lg px-2.5 py-1 text-[10px] font-semibold transition-all ${
                  filter === key ? "bg-foreground text-background dark:bg-white dark:text-black" : "bg-muted/60 text-muted-foreground hover:bg-muted"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        }
      >
        {/* KPI strip */}
        <div className="mb-4 grid grid-cols-3 gap-3">
          <KpiTile label="Matched" value={`${kpis.matchedPct}%`} accent="text-emerald-400" />
          <KpiTile label="Fees collected" value={formatZarCents(kpis.fees)} />
          <KpiTile label="Open items" value={String(kpis.unresolved)} accent={kpis.unresolved > 0 ? "text-amber-400" : undefined} />
        </div>

        {lines.length === 0 ? (
          <EmptyRevenueState
            title="No settlement lines loaded"
            body="Upload a CSV export from your bank, Polar or Stitch to start reconciling."
          />
        ) : filteredLines.length === 0 ? (
          <EmptyRevenueState title={`No ${filter} lines`} body="Adjust the filter above to see all lines." />
        ) : (
          <RevenueTable>
            <thead className="bg-muted/60 text-muted-foreground dark:bg-white/[0.04]">
              <tr>
                <th className="px-3 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider">Reference</th>
                <th className="px-3 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider">Amount</th>
                <th className="px-3 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider">Fees</th>
                <th className="px-3 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider">Status</th>
                <th className="px-3 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {filteredLines.map((line) => (
                <tr key={line.id} className="border-t border-border/50 transition-colors hover:bg-muted/25 dark:border-white/[0.05] dark:hover:bg-white/[0.02]">
                  <td className="px-3 py-2.5 font-mono text-[11px]">{line.externalRef || "—"}</td>
                  <td className="px-3 py-2.5 text-[11px]">{formatZarCents(line.amountCents)}</td>
                  <td className="px-3 py-2.5 text-[11px] text-muted-foreground">{formatZarCents(line.feesCents)}</td>
                  <td className="px-3 py-2.5">
                    <RevenueBadge
                      tone={line.status === "matched" ? "green" : line.status === "disputed" ? "red" : "amber"}
                    >
                      {line.status.replace("_", " ")}
                    </RevenueBadge>
                  </td>
                  <td className="px-3 py-2.5 text-right">
                    {line.status !== "matched" && line.status !== "disputed" && (
                      <button
                        type="button"
                        onClick={() => void patchLine(line.id, "disputed")}
                        className="inline-flex items-center gap-1 rounded-lg bg-amber-500/10 px-2 py-1 text-[10px] font-semibold text-amber-400 transition-colors hover:bg-amber-500/20"
                      >
                        <WarningCircle className="size-3" weight="fill" />
                        Dispute
                      </button>
                    )}
                    {line.status === "disputed" && (
                      <button
                        type="button"
                        onClick={() => void patchLine(line.id, "unmatched")}
                        className="rounded-lg bg-muted px-2 py-1 text-[10px] font-semibold text-muted-foreground transition-colors hover:bg-muted/80"
                      >
                        Undo
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </RevenueTable>
        )}
      </BentoTile>
    </div>
  )
}

function KpiTile({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div className="rounded-xl border border-border/60 bg-background/70 px-3 py-2.5 dark:border-white/[0.06] dark:bg-black/20">
      <p className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className={`mt-1 text-sm font-semibold ${accent ?? "text-foreground"}`}>{value}</p>
    </div>
  )
}

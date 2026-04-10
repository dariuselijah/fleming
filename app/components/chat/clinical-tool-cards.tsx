"use client"

import { cn } from "@/lib/utils"
import { CaretDown, CaretUp } from "@phosphor-icons/react"
import { useState } from "react"

export function PatientSummaryCard({ data }: { data: Record<string, unknown> }) {
  const [open, setOpen] = useState(true)
  if (data.error) {
    return (
      <div className="rounded-lg border border-amber-500/30 bg-amber-500/[0.06] px-3 py-2 text-[12px] text-amber-800 dark:text-amber-200">
        {String(data.error)}
      </div>
    )
  }
  const demo = data.demographics as Record<string, unknown> | undefined
  const allergies = data.allergies
  const chronic = data.chronicConditions
  const meds = data.currentMedications

  return (
    <div className="overflow-hidden rounded-lg border border-l-4 border-l-sky-500/50 border-border/60 bg-background/80">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left"
      >
        <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          Patient chart
        </span>
        {open ? <CaretUp className="size-3.5" /> : <CaretDown className="size-3.5" />}
      </button>
      {open ? (
        <div className="space-y-2 border-t border-border/40 px-3 py-2 text-[12px]">
          {demo && (
            <div>
              <span className="text-[10px] font-medium text-muted-foreground">Demographics</span>
              <p className="mt-0.5 leading-snug">
                {[demo.name, demo.age, demo.sex].filter(Boolean).join(" · ")}
              </p>
            </div>
          )}
          {Array.isArray(allergies) && allergies.length > 0 && (
            <div className="border-l-2 border-amber-500/60 pl-2">
              <span className="text-[10px] font-medium text-amber-700 dark:text-amber-300">
                Allergies
              </span>
              <div className="mt-0.5 flex flex-wrap gap-1">
                {allergies.map((a) => (
                  <span
                    key={String(a)}
                    className="rounded-full bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-medium"
                  >
                    {String(a)}
                  </span>
                ))}
              </div>
            </div>
          )}
          {Array.isArray(chronic) && chronic.length > 0 && (
            <div>
              <span className="text-[10px] font-medium text-muted-foreground">Chronic</span>
              <p className="mt-0.5">{chronic.map(String).join(", ")}</p>
            </div>
          )}
          {Array.isArray(meds) && meds.length > 0 && (
            <div className="border-l-2 border-emerald-500/50 pl-2">
              <span className="text-[10px] font-medium text-emerald-700 dark:text-emerald-300">
                Medications
              </span>
              <ul className="mt-0.5 list-inside list-disc text-[11px]">
                {meds.slice(0, 12).map((m, i) => (
                  <li key={i}>
                    {typeof m === "object" && m !== null && "name" in m
                      ? String((m as { name?: string }).name)
                      : String(m)}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      ) : null}
    </div>
  )
}

export function EncounterStateCard({ data }: { data: Record<string, unknown> }) {
  const [open, setOpen] = useState(true)
  if (data.error) {
    return (
      <div className="rounded-lg border border-amber-500/30 bg-amber-500/[0.06] px-3 py-2 text-[12px]">
        {String(data.error)}
      </div>
    )
  }
  const soap = data.soapNote as Record<string, string> | undefined
  const vitals = data.vitals

  return (
    <div className="overflow-hidden rounded-lg border border-l-4 border-l-indigo-500/45 border-border/60 bg-background/80">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left"
      >
        <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          Encounter
        </span>
        {open ? <CaretUp className="size-3.5" /> : <CaretDown className="size-3.5" />}
      </button>
      {open ? (
        <div className="space-y-2 border-t border-border/40 px-3 py-2 text-[11px]">
          {soap && (
            <div className="grid gap-1.5">
              {(["subjective", "objective", "assessment", "plan"] as const).map((k) =>
                soap[k] ? (
                  <div key={k}>
                    <span className="text-[9px] font-semibold uppercase text-muted-foreground">
                      {k}
                    </span>
                    <p className="mt-0.5 whitespace-pre-wrap leading-snug">{soap[k]}</p>
                  </div>
                ) : null
              )}
            </div>
          )}
          {vitals != null && (
            <div className="rounded-md bg-muted/40 px-2 py-1.5 font-mono text-[10px]">
              {typeof vitals === "string" ? vitals : JSON.stringify(vitals).slice(0, 400)}
            </div>
          )}
        </div>
      ) : null}
    </div>
  )
}

export function ClinicalSearchCard({ data }: { data: Record<string, unknown> }) {
  const [open, setOpen] = useState(true)
  const chunks = data.chunks as Record<string, unknown>[] | undefined
  if (data.error) {
    return (
      <div className="rounded-lg border border-red-500/25 px-3 py-2 text-[12px] text-red-700 dark:text-red-300">
        {String(data.error)}
      </div>
    )
  }
  if (!chunks?.length) {
    return <p className="text-[11px] text-muted-foreground">No matching chart snippets.</p>
  }

  return (
    <div className="overflow-hidden rounded-lg border border-l-4 border-l-violet-500/45 border-border/60 bg-background/80">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left"
      >
        <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          Chart search ({chunks.length})
        </span>
        {open ? <CaretUp className="size-3.5" /> : <CaretDown className="size-3.5" />}
      </button>
      {open ? (
        <ul className="max-h-64 space-y-2 overflow-y-auto border-t border-border/40 px-3 py-2 text-[11px]">
          {chunks.slice(0, 10).map((c, i) => (
            <li
              key={i}
              className={cn(
                "rounded-md border border-border/50 bg-muted/30 px-2 py-1.5",
                "leading-snug"
              )}
            >
              <div className="mb-0.5 flex flex-wrap gap-1 text-[9px] text-muted-foreground">
                <span>{String(c.source_type ?? "")}</span>
                {c.rrf_score != null && (
                  <span>· score {Number(c.rrf_score).toFixed(3)}</span>
                )}
              </div>
              <p className="whitespace-pre-wrap text-[11px]">
                {String(c.chunk_body ?? "").slice(0, 900)}
                {String(c.chunk_body ?? "").length > 900 ? "…" : ""}
              </p>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}

export function PrescribeMedicationToolCard({ data }: { data: Record<string, unknown> }) {
  const items = data.items as { drug?: string; reasoning?: string; strength?: string }[] | undefined
  const warnings = data.warnings as string[] | undefined
  const contraindications = data.contraindications as string[] | undefined
  if (data.error) {
    return (
      <div className="rounded-lg border border-amber-500/30 px-3 py-2 text-[12px]">{String(data.error)}</div>
    )
  }
  return (
    <div className="space-y-2 rounded-lg border border-sky-500/25 bg-sky-500/[0.04] px-3 py-2 text-[12px]">
      <p className="text-[10px] font-semibold uppercase text-muted-foreground">Prescribing draft</p>
      <ul className="space-y-2">
        {items?.map((it, i) => (
          <li key={i} className="rounded-md border border-border/50 bg-background/80 px-2 py-1.5">
            <span className="font-semibold">{it.drug}</span>
            {it.strength ? <span className="text-muted-foreground"> · {it.strength}</span> : null}
            {it.reasoning ? (
              <p className="mt-1 text-[10px] leading-snug text-muted-foreground">{it.reasoning}</p>
            ) : null}
          </li>
        ))}
      </ul>
      {contraindications && contraindications.length > 0 && (
        <div className="rounded-md border border-red-500/25 bg-red-500/[0.06] px-2 py-1 text-[10px] text-red-800 dark:text-red-200">
          {contraindications.map((c, i) => (
            <p key={i}>{c}</p>
          ))}
        </div>
      )}
      {warnings && warnings.length > 0 && (
        <div className="text-[10px] text-amber-800 dark:text-amber-200">
          {warnings.map((w, i) => (
            <p key={i}>{w}</p>
          ))}
        </div>
      )}
      {data.safetyNote ? (
        <p className="text-[10px] text-muted-foreground">{String(data.safetyNote)}</p>
      ) : null}
    </div>
  )
}

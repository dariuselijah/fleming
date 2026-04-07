"use client"

import type { MedicalBlock } from "@/lib/clinical-workspace"
import { cn } from "@/lib/utils"
import { Pill, Warning, ArrowsClockwise, CurrencyDollar } from "@phosphor-icons/react"
import { useState } from "react"

interface PrescriptionMeta {
  drugName: string
  genericName?: string
  dosage: string
  frequency: string
  duration?: string
  route: string
  nappiCode?: string
  sepPrice?: number
  alternatives?: { name: string; sepPrice?: number }[]
  interactions?: { drug: string; severity: "mild" | "moderate" | "severe"; description: string }[]
}

function parsePrescription(block: MedicalBlock): PrescriptionMeta | null {
  const meta = block.metadata as any
  if (!meta?.drugName) return null
  return meta as PrescriptionMeta
}

const SEVERITY_COLORS = {
  mild: "text-amber-600 bg-amber-500/10 border-amber-500/20",
  moderate: "text-orange-600 bg-orange-500/10 border-orange-500/20",
  severe: "text-red-600 bg-red-500/10 border-red-500/20",
}

export function PrescriptionBlock({ block }: { block: MedicalBlock }) {
  const rx = parsePrescription(block)
  const [showAlternatives, setShowAlternatives] = useState(false)

  if (!rx) return null

  const hasInteractions = (rx.interactions?.length ?? 0) > 0
  const hasAlternatives = (rx.alternatives?.length ?? 0) > 0

  return (
    <div
      className={cn(
        "rounded-2xl border shadow-sm",
        hasInteractions ? "border-amber-500/30" : "border-border/50"
      )}
    >
      <div className="flex items-center justify-between px-4 py-3">
        <div className="flex items-center gap-2">
          <Pill className="size-4 text-sky-500" weight="fill" />
          <div>
            <span className="text-sm font-semibold">{rx.drugName}</span>
            {rx.genericName && rx.genericName !== rx.drugName && (
              <span className="ml-1.5 text-[11px] text-muted-foreground">
                ({rx.genericName})
              </span>
            )}
          </div>
        </div>
        {rx.sepPrice != null && (
          <div className="flex items-center gap-1 text-muted-foreground">
            <CurrencyDollar className="size-3" />
            <span className="text-xs font-medium tabular-nums">R{rx.sepPrice.toFixed(2)}</span>
          </div>
        )}
      </div>

      <div className="border-t border-border/20 px-4 py-3">
        <div className="flex flex-wrap gap-3 text-xs">
          <div>
            <span className="text-[10px] text-muted-foreground">Dosage</span>
            <p className="font-medium">{rx.dosage}</p>
          </div>
          <div>
            <span className="text-[10px] text-muted-foreground">Frequency</span>
            <p className="font-medium">{rx.frequency}</p>
          </div>
          <div>
            <span className="text-[10px] text-muted-foreground">Route</span>
            <p className="font-medium">{rx.route}</p>
          </div>
          {rx.duration && (
            <div>
              <span className="text-[10px] text-muted-foreground">Duration</span>
              <p className="font-medium">{rx.duration}</p>
            </div>
          )}
          {rx.nappiCode && (
            <div>
              <span className="text-[10px] text-muted-foreground">NAPPI</span>
              <p className="font-medium tabular-nums">{rx.nappiCode}</p>
            </div>
          )}
        </div>
      </div>

      {/* Drug interactions */}
      {hasInteractions && (
        <div className="border-t border-amber-500/20 px-4 py-2.5">
          {rx.interactions!.map((interaction, i) => (
            <div
              key={i}
              className={cn(
                "mb-1.5 flex items-start gap-2 rounded-lg border p-2",
                SEVERITY_COLORS[interaction.severity]
              )}
            >
              <Warning className="mt-0.5 size-3.5 shrink-0" weight="fill" />
              <div>
                <span className="text-[11px] font-semibold">
                  Interaction with {interaction.drug}
                </span>
                <span className="ml-1 text-[10px] uppercase">[{interaction.severity}]</span>
                <p className="mt-0.5 text-[11px] opacity-80">{interaction.description}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Generic alternatives */}
      {hasAlternatives && (
        <div className="border-t border-border/20">
          <button
            type="button"
            onClick={() => setShowAlternatives(!showAlternatives)}
            className="flex w-full items-center gap-2 px-4 py-2.5 text-xs font-medium text-indigo-600 transition-colors hover:bg-muted/30 dark:text-indigo-400"
          >
            <ArrowsClockwise className="size-3.5" />
            {showAlternatives ? "Hide" : "Show"} {rx.alternatives!.length} Generic Alternative{rx.alternatives!.length > 1 ? "s" : ""}
          </button>
          {showAlternatives && (
            <div className="px-4 pb-3">
              {rx.alternatives!.map((alt, i) => (
                <div key={i} className="flex items-center justify-between rounded-lg p-2 hover:bg-muted/30">
                  <span className="text-xs">{alt.name}</span>
                  {alt.sepPrice != null && (
                    <span className="text-xs font-medium tabular-nums text-emerald-600 dark:text-emerald-400">
                      R{alt.sepPrice.toFixed(2)}
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

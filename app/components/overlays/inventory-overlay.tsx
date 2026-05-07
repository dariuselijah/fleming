"use client"

import { X, Package, Warning, ArrowDown, ArrowUp } from "@phosphor-icons/react"
import { motion } from "motion/react"
import { cn } from "@/lib/utils"

interface InventoryItem {
  id: string
  name: string
  category: string
  currentStock: number
  minStock: number
  unit: string
  lastRestocked: string
}

const MOCK_INVENTORY: InventoryItem[] = [
  { id: "inv1", name: "Amoxicillin 500mg", category: "Antibiotics", currentStock: 45, minStock: 20, unit: "caps", lastRestocked: "2026-03-20" },
  { id: "inv2", name: "Metformin 850mg", category: "Antidiabetics", currentStock: 8, minStock: 15, unit: "tabs", lastRestocked: "2026-03-01" },
  { id: "inv3", name: "Amlodipine 5mg", category: "Antihypertensives", currentStock: 120, minStock: 30, unit: "tabs", lastRestocked: "2026-03-25" },
  { id: "inv4", name: "Disposable Gloves (M)", category: "Consumables", currentStock: 3, minStock: 10, unit: "boxes", lastRestocked: "2026-02-15" },
  { id: "inv5", name: "Flu Vaccine 2026", category: "Vaccines", currentStock: 22, minStock: 10, unit: "doses", lastRestocked: "2026-03-28" },
  { id: "inv6", name: "Suture Kit 3-0", category: "Surgical", currentStock: 5, minStock: 8, unit: "kits", lastRestocked: "2026-03-10" },
  { id: "inv7", name: "Omeprazole 20mg", category: "GI", currentStock: 0, minStock: 20, unit: "caps", lastRestocked: "2026-02-01" },
]

export function InventoryOverlay({ onClose }: { onClose: () => void }) {
  const lowStock = MOCK_INVENTORY.filter((i) => i.currentStock <= i.minStock)
  const okStock = MOCK_INVENTORY.filter((i) => i.currentStock > i.minStock)

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 20 }}
      transition={{ type: "spring", stiffness: 400, damping: 30 }}
      className="absolute right-4 bottom-4 z-50 w-[420px] rounded-2xl border border-border/50 bg-background/95 shadow-2xl backdrop-blur-xl"
    >
      <div className="flex items-center justify-between border-b border-border/30 px-4 py-3">
        <div className="flex items-center gap-2">
          <Package className="size-4 text-indigo-500" weight="fill" />
          <h3 className="text-sm font-semibold">Inventory</h3>
          {lowStock.length > 0 && (
            <span className="rounded-full bg-red-500/15 px-2 py-0.5 text-[10px] font-medium text-red-600 dark:text-red-400">
              {lowStock.length} low
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={onClose}
          className="inline-flex size-7 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <X className="size-3.5" />
        </button>
      </div>

      <div className="max-h-96 overflow-y-auto p-3" style={{ scrollbarWidth: "none" }}>
        {lowStock.length > 0 && (
          <div className="mb-3">
            <h4 className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-red-600 dark:text-red-400">
              <Warning className="size-3" weight="fill" />
              Low Stock / Out of Stock
            </h4>
            <div className="space-y-1.5">
              {lowStock.map((item) => (
                <div
                  key={item.id}
                  className={cn(
                    "flex items-center justify-between rounded-xl border p-3",
                    item.currentStock === 0
                      ? "border-red-500/30 bg-red-500/5"
                      : "border-amber-500/30 bg-amber-500/5"
                  )}
                >
                  <div>
                    <span className="text-xs font-medium">{item.name}</span>
                    <p className="text-[10px] text-muted-foreground">{item.category}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="text-right">
                      <span className={cn(
                        "text-sm font-bold tabular-nums",
                        item.currentStock === 0 ? "text-red-600" : "text-amber-600"
                      )}>
                        {item.currentStock}
                      </span>
                      <span className="text-[10px] text-muted-foreground">/{item.minStock} {item.unit}</span>
                    </div>
                    <ArrowDown className="size-3.5 text-red-500" weight="bold" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div>
          <h4 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            In Stock
          </h4>
          <div className="space-y-1">
            {okStock.map((item) => (
              <div
                key={item.id}
                className="flex items-center justify-between rounded-xl border border-border/30 bg-card p-3"
              >
                <div>
                  <span className="text-xs font-medium">{item.name}</span>
                  <p className="text-[10px] text-muted-foreground">{item.category}</p>
                </div>
                <div className="flex items-center gap-2">
                  <div className="text-right">
                    <span className="text-sm font-bold tabular-nums text-emerald-600 dark:text-emerald-400">
                      {item.currentStock}
                    </span>
                    <span className="text-[10px] text-muted-foreground"> {item.unit}</span>
                  </div>
                  <ArrowUp className="size-3.5 text-emerald-500" weight="bold" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </motion.div>
  )
}

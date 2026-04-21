"use client"

import { useWorkspace, useWorkspaceStore, type InventoryItem } from "@/lib/clinical-workspace"
import { cn } from "@/lib/utils"
import {
  Upload,
  Warning,
  ArrowsDownUp,
  Check,
  X,
  Plus,
  Package,
  Trash,
  CaretRight,
  FileXls,
} from "@phosphor-icons/react"
import { AnimatePresence, motion } from "motion/react"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"

type SortKey = "name" | "category" | "stock" | "cost" | "price" | "margin" | "expiry"
type SortDir = "asc" | "desc"
type Category = "All" | "Medications" | "Consumables" | "Equipment"

const CATEGORIES: Category[] = ["All", "Medications", "Consumables", "Equipment"]

const EMPTY_FORM: Omit<InventoryItem, "id" | "lastRestocked"> = {
  name: "",
  nappiCode: "",
  category: "Medications",
  currentStock: 0,
  minStock: 10,
  unit: "unit",
  unitPrice: 0,
  costPrice: 0,
  supplier: "",
  expiresAt: "",
}

function computeMargin(item: InventoryItem) {
  if (item.costPrice && item.unitPrice > 0) {
    return ((item.unitPrice - item.costPrice) / item.unitPrice) * 100
  }
  return null
}

export function BentoInventory() {
  const { inventory, bulkImportInventory, upsertInventoryItem, deleteInventoryItem } =
    useWorkspace()

  const inventoryImportPanelRequest = useWorkspaceStore((s) => s.inventoryImportPanelRequest)
  const prevImportReq = useRef(inventoryImportPanelRequest)

  const [sortKey, setSortKey] = useState<SortKey>("name")
  const [sortDir, setSortDir] = useState<SortDir>("asc")
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editStock, setEditStock] = useState("")
  const [category, setCategory] = useState<Category>("All")
  const [selectedItem, setSelectedItem] = useState<InventoryItem | null>(null)
  const [showAddModal, setShowAddModal] = useState(false)
  const [showImportModal, setShowImportModal] = useState(false)

  useEffect(() => {
    if (inventoryImportPanelRequest > prevImportReq.current) {
      setShowImportModal(true)
    }
    prevImportReq.current = inventoryImportPanelRequest
  }, [inventoryImportPanelRequest])

  const filtered = useMemo(() => {
    if (category === "All") return inventory
    return inventory.filter((i) => i.category === category)
  }, [inventory, category])

  const sorted = useMemo(() => {
    const copy = [...filtered]
    copy.sort((a, b) => {
      let cmp = 0
      if (sortKey === "name") cmp = a.name.localeCompare(b.name)
      else if (sortKey === "category") cmp = a.category.localeCompare(b.category)
      else if (sortKey === "stock") cmp = a.currentStock - b.currentStock
      else if (sortKey === "cost") cmp = (a.costPrice ?? 0) - (b.costPrice ?? 0)
      else if (sortKey === "price") cmp = a.unitPrice - b.unitPrice
      else if (sortKey === "margin") cmp = (computeMargin(a) ?? -1) - (computeMargin(b) ?? -1)
      else if (sortKey === "expiry") {
        const da = a.expiresAt ? new Date(a.expiresAt).getTime() : Infinity
        const db = b.expiresAt ? new Date(b.expiresAt).getTime() : Infinity
        cmp = da - db
      }
      return sortDir === "asc" ? cmp : -cmp
    })
    return copy
  }, [filtered, sortKey, sortDir])

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"))
    else {
      setSortKey(key)
      setSortDir("asc")
    }
  }

  const lowStock = useMemo(
    () => inventory.filter((i) => i.currentStock <= i.minStock).length,
    [inventory],
  )

  const startEdit = (item: InventoryItem) => {
    setEditingId(item.id)
    setEditStock(String(item.currentStock))
  }

  const commitEdit = (item: InventoryItem) => {
    const newVal = parseInt(editStock, 10)
    if (!isNaN(newVal) && newVal !== item.currentStock) {
      upsertInventoryItem({ ...item, currentStock: newVal })
    }
    setEditingId(null)
  }

  return (
    <div className="relative flex h-full flex-col gap-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-foreground">Inventory &amp; Consumables</h2>
          <p className="text-[10px] text-white/30">
            {inventory.length} items ·{" "}
            <span className={cn(lowStock > 0 ? "text-[#FFC107]" : "text-[#00E676]")}>
              {lowStock} low stock
            </span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-1.5 rounded-lg bg-white/[0.08] px-3 py-1.5 text-[11px] font-semibold text-foreground transition-colors hover:bg-white/[0.14]"
          >
            <Plus className="size-3.5" />
            Add Item
          </button>
          <button
            type="button"
            onClick={() => setShowImportModal(true)}
            className="flex items-center gap-1.5 rounded-lg bg-white/[0.08] px-3 py-1.5 text-[11px] font-semibold text-foreground transition-colors hover:bg-white/[0.14]"
          >
            <FileXls className="size-3.5" />
            Smart Import
          </button>
        </div>
      </div>

      {/* Category Filter */}
      <div className="flex items-center gap-1.5">
        {CATEGORIES.map((cat) => (
          <button
            key={cat}
            type="button"
            onClick={() => setCategory(cat)}
            className={cn(
              "rounded-full px-3 py-1 text-[10px] font-medium transition-colors",
              category === cat
                ? "bg-white/[0.12] text-foreground"
                : "bg-white/[0.03] text-white/30 hover:bg-white/[0.06] hover:text-white/50",
            )}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="flex-1 overflow-hidden rounded-2xl border border-white/[0.05] bg-white/[0.015]">
        <div className="h-full overflow-x-auto overflow-y-auto" style={{ scrollbarWidth: "none" }}>
          <table className="w-full min-w-[800px] border-collapse text-left">
            <thead>
              <tr className="border-b border-white/[0.06]">
                <ColHeader label="Item (NAPPI)" sortKey="name" current={sortKey} dir={sortDir} onSort={toggleSort} className="min-w-[200px]" />
                <ColHeader label="Category" sortKey="category" current={sortKey} dir={sortDir} onSort={toggleSort} />
                <ColHeader label="Stock" sortKey="stock" current={sortKey} dir={sortDir} onSort={toggleSort} />
                <ColHeader label="Unit Cost" sortKey="cost" current={sortKey} dir={sortDir} onSort={toggleSort} />
                <ColHeader label="Sell Price" sortKey="price" current={sortKey} dir={sortDir} onSort={toggleSort} />
                <ColHeader label="Margin" sortKey="margin" current={sortKey} dir={sortDir} onSort={toggleSort} />
                <ColHeader label="Expiry" sortKey="expiry" current={sortKey} dir={sortDir} onSort={toggleSort} />
                <th className="w-8" />
              </tr>
            </thead>
            <tbody>
              {sorted.map((item) => {
                const isLow = item.currentStock <= item.minStock
                const margin = computeMargin(item)
                const isEditing = editingId === item.id

                return (
                  <tr
                    key={item.id}
                    className={cn(
                      "border-b border-white/[0.03] transition-colors hover:bg-white/[0.03] cursor-pointer",
                      selectedItem?.id === item.id && "bg-white/[0.04]",
                    )}
                    onClick={() => setSelectedItem(item)}
                  >
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-2">
                        {isLow && <Warning className="size-3 shrink-0 text-[#FFC107]" weight="fill" />}
                        <div>
                          <p className="text-[11px] font-medium text-foreground">{item.name}</p>
                          {item.nappiCode && (
                            <p className="text-[9px] tabular-nums text-white/25">
                              NAPPI: {item.nappiCode}
                            </p>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-2.5 text-[11px] text-white/40">{item.category}</td>
                    <td className="px-3 py-2.5" onClick={(e) => e.stopPropagation()}>
                      {isEditing ? (
                        <div className="flex items-center gap-1">
                          <input
                            value={editStock}
                            onChange={(e) => setEditStock(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") commitEdit(item)
                              if (e.key === "Escape") setEditingId(null)
                            }}
                            autoFocus
                            className="w-14 rounded border border-white/[0.1] bg-white/[0.04] px-1.5 py-0.5 text-[11px] tabular-nums outline-none"
                          />
                          <button type="button" onClick={() => commitEdit(item)} className="text-[#00E676] hover:text-[#00E676]/80">
                            <Check className="size-3" />
                          </button>
                          <button type="button" onClick={() => setEditingId(null)} className="text-white/20 hover:text-white/40">
                            <X className="size-3" />
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => startEdit(item)}
                          className={cn(
                            "text-[11px] tabular-nums font-medium hover:underline",
                            isLow ? "text-[#FFC107]" : "text-foreground",
                          )}
                        >
                          {item.currentStock}{" "}
                          <span className="text-[9px] text-white/20">{item.unit}s</span>
                        </button>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-[11px] tabular-nums text-white/40">
                      {item.costPrice ? `R${item.costPrice.toFixed(2)}` : "—"}
                    </td>
                    <td className="px-3 py-2.5 text-[11px] tabular-nums font-medium text-foreground">
                      R{item.unitPrice.toFixed(2)}
                    </td>
                    <td className="px-3 py-2.5">
                      {margin !== null ? (
                        <span
                          className={cn(
                            "text-[10px] tabular-nums font-medium",
                            margin < 10 ? "text-[#FFC107]" : "text-[#00E676]",
                          )}
                        >
                          {margin.toFixed(1)}%
                        </span>
                      ) : (
                        <span className="text-[10px] text-white/15">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-[11px] tabular-nums text-white/30">
                      {item.expiresAt
                        ? new Date(item.expiresAt).toLocaleDateString([], {
                            year: "numeric",
                            month: "short",
                            day: "numeric",
                          })
                        : "—"}
                    </td>
                    <td className="px-3 py-2.5 text-white/15">
                      <CaretRight className="size-3" />
                    </td>
                  </tr>
                )
              })}
              {sorted.length === 0 && (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-[11px] text-white/20">
                    <Package className="mx-auto mb-2 size-6 text-white/10" />
                    No items in this category
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Detail Slide-out */}
      <AnimatePresence>
        {selectedItem && (
          <ItemDetailPanel
            key={selectedItem.id}
            item={selectedItem}
            onClose={() => setSelectedItem(null)}
            onSave={(updated) => {
              upsertInventoryItem(updated)
              setSelectedItem(null)
            }}
            onDelete={(id) => {
              deleteInventoryItem(id)
              setSelectedItem(null)
            }}
          />
        )}
      </AnimatePresence>

      {/* Add Item Modal */}
      <AnimatePresence>
        {showAddModal && (
          <AddItemModal
            onClose={() => setShowAddModal(false)}
            onSave={(item) => {
              upsertInventoryItem(item)
              setShowAddModal(false)
            }}
          />
        )}
      </AnimatePresence>

      {/* Smart Import Modal */}
      <AnimatePresence>
        {showImportModal && (
          <SmartImportModal
            onClose={() => setShowImportModal(false)}
            onImport={(items) => {
              bulkImportInventory(items)
              setShowImportModal(false)
            }}
          />
        )}
      </AnimatePresence>
    </div>
  )
}

/* ───────────────── Column Header ───────────────── */

function ColHeader({
  label,
  sortKey,
  current,
  dir,
  onSort,
  className,
}: {
  label: string
  sortKey: SortKey
  current: SortKey
  dir: SortDir
  onSort: (k: SortKey) => void
  className?: string
}) {
  const active = current === sortKey
  return (
    <th className={cn("px-3 py-2.5", className)}>
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className={cn(
          "flex items-center gap-1 text-[10px] font-medium uppercase tracking-wider transition-colors",
          active ? "text-white/60" : "text-white/25 hover:text-white/40",
        )}
      >
        {label}
        <ArrowsDownUp className="size-3" weight={active ? "fill" : "regular"} />
      </button>
    </th>
  )
}

/* ───────────────── Item Detail Panel ───────────────── */

function ItemDetailPanel({
  item,
  onClose,
  onSave,
  onDelete,
}: {
  item: InventoryItem
  onClose: () => void
  onSave: (item: InventoryItem) => void
  onDelete: (id: string) => void
}) {
  const [form, setForm] = useState<InventoryItem>({ ...item })
  const [adjustQty, setAdjustQty] = useState(0)
  const [adjustReason, setAdjustReason] = useState("")

  const patch = (updates: Partial<InventoryItem>) => setForm((f) => ({ ...f, ...updates }))

  const handleSave = () => {
    const finalStock = form.currentStock + adjustQty
    onSave({ ...form, currentStock: Math.max(0, finalStock) })
  }

  return (
    <motion.div
      initial={{ x: 350, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      exit={{ x: 350, opacity: 0 }}
      transition={{ type: "spring", damping: 30, stiffness: 300 }}
      className="absolute right-0 top-0 z-20 flex h-full w-[350px] flex-col border-l border-white/[0.06] bg-[#0c0c0e]/95 backdrop-blur-xl"
    >
      {/* Panel header */}
      <div className="flex items-center justify-between border-b border-white/[0.06] px-4 py-3">
        <h3 className="text-[12px] font-semibold text-foreground">Item Details</h3>
        <button type="button" onClick={onClose} className="text-white/30 hover:text-white/60">
          <X className="size-4" />
        </button>
      </div>

      {/* Scrollable body */}
      <div className="flex-1 overflow-y-auto p-4" style={{ scrollbarWidth: "none" }}>
        <div className="flex flex-col gap-3">
          <Field label="Name" value={form.name} onChange={(v) => patch({ name: v })} />
          <Field label="NAPPI Code" value={form.nappiCode ?? ""} onChange={(v) => patch({ nappiCode: v || undefined })} />

          <div>
            <label className="mb-1 block text-[9px] font-medium uppercase tracking-wider text-white/25">
              Category
            </label>
            <select
              value={form.category}
              onChange={(e) => patch({ category: e.target.value })}
              className="w-full rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-1.5 text-[11px] text-foreground outline-none"
            >
              {["Medications", "Consumables", "Equipment"].map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Unit Price" value={String(form.unitPrice)} onChange={(v) => patch({ unitPrice: parseFloat(v) || 0 })} type="number" />
            <Field label="Cost Price" value={String(form.costPrice ?? "")} onChange={(v) => patch({ costPrice: parseFloat(v) || undefined })} type="number" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Min Stock" value={String(form.minStock)} onChange={(v) => patch({ minStock: parseInt(v, 10) || 0 })} type="number" />
            <Field label="Unit" value={form.unit} onChange={(v) => patch({ unit: v })} />
          </div>

          <Field label="Supplier" value={form.supplier ?? ""} onChange={(v) => patch({ supplier: v || undefined })} />
          <Field label="Expiry Date" value={form.expiresAt ?? ""} onChange={(v) => patch({ expiresAt: v || undefined })} type="date" />

          {/* Margin display */}
          {form.costPrice != null && form.unitPrice > 0 && (
            <div className="rounded-lg bg-white/[0.03] px-3 py-2">
              <span className="text-[9px] font-medium uppercase tracking-wider text-white/25">Margin</span>
              <p className="text-sm font-semibold text-[#00E676]">
                {(((form.unitPrice - (form.costPrice ?? 0)) / form.unitPrice) * 100).toFixed(1)}%
              </p>
            </div>
          )}

          {/* Stock adjustment */}
          <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-3">
            <p className="mb-2 text-[9px] font-medium uppercase tracking-wider text-white/25">
              Stock Adjustment
            </p>
            <p className="mb-2 text-[11px] text-white/40">
              Current: <span className="font-medium text-foreground">{form.currentStock}</span>{" "}
              {adjustQty !== 0 && (
                <span className={adjustQty > 0 ? "text-[#00E676]" : "text-[#FFC107]"}>
                  → {Math.max(0, form.currentStock + adjustQty)}
                </span>
              )}
            </p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setAdjustQty((q) => q - 1)}
                className="flex size-7 items-center justify-center rounded-lg bg-white/[0.06] text-foreground hover:bg-white/[0.12]"
              >
                –
              </button>
              <input
                type="number"
                value={adjustQty}
                onChange={(e) => setAdjustQty(parseInt(e.target.value, 10) || 0)}
                className="w-16 rounded-lg border border-white/[0.06] bg-white/[0.02] px-2 py-1 text-center text-[11px] tabular-nums text-foreground outline-none"
              />
              <button
                type="button"
                onClick={() => setAdjustQty((q) => q + 1)}
                className="flex size-7 items-center justify-center rounded-lg bg-white/[0.06] text-foreground hover:bg-white/[0.12]"
              >
                +
              </button>
            </div>
            <input
              placeholder="Reason (optional)"
              value={adjustReason}
              onChange={(e) => setAdjustReason(e.target.value)}
              className="mt-2 w-full rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-1.5 text-[11px] text-foreground outline-none placeholder:text-white/15"
            />
          </div>
        </div>
      </div>

      {/* Panel footer */}
      <div className="flex items-center justify-between border-t border-white/[0.06] px-4 py-3">
        <button
          type="button"
          onClick={() => onDelete(item.id)}
          className="flex items-center gap-1 text-[11px] text-red-400/60 hover:text-red-400"
        >
          <Trash className="size-3.5" />
          Delete
        </button>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-3 py-1.5 text-[11px] text-white/40 hover:text-white/60"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            className="flex items-center gap-1.5 rounded-lg bg-white/[0.1] px-4 py-1.5 text-[11px] font-semibold text-foreground hover:bg-white/[0.16]"
          >
            <Check className="size-3.5" />
            Save
          </button>
        </div>
      </div>
    </motion.div>
  )
}

/* ───────────────── Add Item Modal ───────────────── */

function AddItemModal({
  onClose,
  onSave,
}: {
  onClose: () => void
  onSave: (item: InventoryItem) => void
}) {
  const [form, setForm] = useState(EMPTY_FORM)
  const patch = (updates: Partial<typeof form>) => setForm((f) => ({ ...f, ...updates }))

  const handleSave = () => {
    if (!form.name.trim()) return
    onSave({
      ...form,
      id: `inv-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      lastRestocked: new Date().toISOString().slice(0, 10),
      costPrice: form.costPrice || undefined,
      supplier: form.supplier || undefined,
      nappiCode: form.nappiCode || undefined,
      expiresAt: form.expiresAt || undefined,
    })
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="absolute inset-0 z-30 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.95, opacity: 0 }}
        transition={{ type: "spring", damping: 30, stiffness: 400 }}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-2xl border border-white/[0.06] bg-[#0c0c0e] p-5"
      >
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-foreground">Add Inventory Item</h3>
          <button type="button" onClick={onClose} className="text-white/30 hover:text-white/60">
            <X className="size-4" />
          </button>
        </div>

        <div className="flex flex-col gap-3">
          <Field label="Name" value={form.name} onChange={(v) => patch({ name: v })} />
          <div className="grid grid-cols-2 gap-3">
            <Field label="NAPPI Code" value={form.nappiCode ?? ""} onChange={(v) => patch({ nappiCode: v })} />
            <div>
              <label className="mb-1 block text-[9px] font-medium uppercase tracking-wider text-white/25">
                Category
              </label>
              <select
                value={form.category}
                onChange={(e) => patch({ category: e.target.value })}
                className="w-full rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-1.5 text-[11px] text-foreground outline-none"
              >
                {["Medications", "Consumables", "Equipment"].map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <Field label="Stock" value={String(form.currentStock)} onChange={(v) => patch({ currentStock: parseInt(v, 10) || 0 })} type="number" />
            <Field label="Min Stock" value={String(form.minStock)} onChange={(v) => patch({ minStock: parseInt(v, 10) || 0 })} type="number" />
            <Field label="Unit" value={form.unit} onChange={(v) => patch({ unit: v })} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Unit Price (R)" value={String(form.unitPrice)} onChange={(v) => patch({ unitPrice: parseFloat(v) || 0 })} type="number" />
            <Field label="Cost Price (R)" value={String(form.costPrice ?? "")} onChange={(v) => patch({ costPrice: parseFloat(v) || 0 })} type="number" />
          </div>
          <Field label="Supplier" value={form.supplier ?? ""} onChange={(v) => patch({ supplier: v })} />
          <Field label="Expiry Date" value={form.expiresAt ?? ""} onChange={(v) => patch({ expiresAt: v })} type="date" />
        </div>

        <div className="mt-5 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-4 py-1.5 text-[11px] text-white/40 hover:text-white/60"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={!form.name.trim()}
            className="flex items-center gap-1.5 rounded-lg bg-white/[0.1] px-4 py-1.5 text-[11px] font-semibold text-foreground hover:bg-white/[0.16] disabled:opacity-30"
          >
            <Plus className="size-3.5" />
            Add Item
          </button>
        </div>
      </motion.div>
    </motion.div>
  )
}

/* ───────────────── Smart Import Modal ───────────────── */

type ImportStep = "upload" | "mapping" | "done"

interface ParsedFile {
  headers: string[]
  rows: string[][]
}

const REQUIRED_FIELDS = ["Name", "NAPPI", "Category", "Stock", "Price", "Expiry"] as const
type RequiredField = (typeof REQUIRED_FIELDS)[number]

function guessMapping(headers: string[]): Record<RequiredField, number> {
  const map: Record<RequiredField, number> = {
    Name: -1,
    NAPPI: -1,
    Category: -1,
    Stock: -1,
    Price: -1,
    Expiry: -1,
  }
  const lower = headers.map((h) => h.toLowerCase().trim())

  for (let i = 0; i < lower.length; i++) {
    const h = lower[i]
    if (h.includes("name") || h.includes("description") || h.includes("item")) map.Name = i
    else if (h.includes("nappi") || h.includes("code")) map.NAPPI = i
    else if (h.includes("categ") || h.includes("type") || h.includes("class")) map.Category = i
    else if (h.includes("stock") || h.includes("qty") || h.includes("quantity") || h.includes("count")) map.Stock = i
    else if (h.includes("price") || h.includes("cost") || h.includes("amount") || h.includes("unit")) map.Price = i
    else if (h.includes("expir") || h.includes("date") || h.includes("exp")) map.Expiry = i
  }

  return map
}

function SmartImportModal({
  onClose,
  onImport,
}: {
  onClose: () => void
  onImport: (items: InventoryItem[]) => void
}) {
  const [step, setStep] = useState<ImportStep>("upload")
  const [parsed, setParsed] = useState<ParsedFile | null>(null)
  const [mapping, setMapping] = useState<Record<RequiredField, number>>({
    Name: -1,
    NAPPI: -1,
    Category: -1,
    Stock: -1,
    Price: -1,
    Expiry: -1,
  })
  const [importResult, setImportResult] = useState({ added: 0, updated: 0, skipped: 0 })
  const [dragging, setDragging] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const parseCSV = useCallback((text: string) => {
    const lines = text.split("\n").filter((l) => l.trim())
    if (lines.length < 2) return null
    const headers = lines[0].split(",").map((h) => h.trim().replace(/^["']|["']$/g, ""))
    const rows = lines.slice(1).map((l) =>
      l.split(",").map((c) => c.trim().replace(/^["']|["']$/g, "")),
    )
    return { headers, rows }
  }, [])

  const handleFile = useCallback(
    async (file: File) => {
      const text = await file.text()
      const result = parseCSV(text)
      if (!result) return
      setParsed(result)
      setMapping(guessMapping(result.headers))
      setStep("mapping")
    },
    [parseCSV],
  )

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      setDragging(false)
      const file = e.dataTransfer.files[0]
      if (file) handleFile(file)
    },
    [handleFile],
  )

  const executeImport = () => {
    if (!parsed) return
    let added = 0
    let skipped = 0
    const items: InventoryItem[] = []

    for (let i = 0; i < parsed.rows.length; i++) {
      const row = parsed.rows[i]
      const name = mapping.Name >= 0 ? row[mapping.Name] : ""
      if (!name?.trim()) {
        skipped++
        continue
      }

      items.push({
        id: `imp-${Date.now()}-${i}`,
        name: name.trim(),
        nappiCode: mapping.NAPPI >= 0 ? row[mapping.NAPPI]?.trim() || undefined : undefined,
        category: mapping.Category >= 0 ? row[mapping.Category]?.trim() || "Imported" : "Imported",
        currentStock: mapping.Stock >= 0 ? parseInt(row[mapping.Stock], 10) || 0 : 0,
        minStock: 10,
        unit: "unit",
        unitPrice: mapping.Price >= 0 ? parseFloat(row[mapping.Price]) || 0 : 0,
        expiresAt: mapping.Expiry >= 0 ? row[mapping.Expiry]?.trim() || undefined : undefined,
        lastRestocked: new Date().toISOString().slice(0, 10),
      })
      added++
    }

    setImportResult({ added, updated: 0, skipped })
    if (items.length > 0) onImport(items)
    setStep("done")
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="absolute inset-0 z-30 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.95, opacity: 0 }}
        transition={{ type: "spring", damping: 30, stiffness: 400 }}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg rounded-2xl border border-white/[0.06] bg-[#0c0c0e] p-5"
      >
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-foreground">Smart Import</h3>
          <button type="button" onClick={onClose} className="text-white/30 hover:text-white/60">
            <X className="size-4" />
          </button>
        </div>

        {/* Step indicator */}
        <div className="mb-5 flex items-center gap-2">
          {(["upload", "mapping", "done"] as const).map((s, idx) => (
            <div key={s} className="flex items-center gap-2">
              <div
                className={cn(
                  "flex size-5 items-center justify-center rounded-full text-[9px] font-bold",
                  step === s
                    ? "bg-white/[0.15] text-foreground"
                    : idx < ["upload", "mapping", "done"].indexOf(step)
                      ? "bg-[#00E676]/20 text-[#00E676]"
                      : "bg-white/[0.04] text-white/20",
                )}
              >
                {idx < ["upload", "mapping", "done"].indexOf(step) ? (
                  <Check className="size-3" />
                ) : (
                  idx + 1
                )}
              </div>
              {idx < 2 && <div className="h-px w-8 bg-white/[0.06]" />}
            </div>
          ))}
        </div>

        {/* Step: Upload */}
        {step === "upload" && (
          <div
            onDragOver={(e) => {
              e.preventDefault()
              setDragging(true)
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={handleDrop}
            onClick={() => inputRef.current?.click()}
            className={cn(
              "flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed py-12 transition-colors",
              dragging
                ? "border-[#00E676]/40 bg-[#00E676]/5"
                : "border-white/[0.08] bg-white/[0.02] hover:border-white/[0.14]",
            )}
          >
            <Upload className="mb-3 size-8 text-white/20" />
            <p className="text-[12px] font-medium text-foreground">
              Drop file here or click to browse
            </p>
            <p className="mt-1 text-[10px] text-white/25">Supports .csv and .xlsx</p>
            <input
              ref={inputRef}
              type="file"
              accept=".csv,.xlsx,.xls"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) handleFile(f)
              }}
            />
          </div>
        )}

        {/* Step: Mapping */}
        {step === "mapping" && parsed && (
          <div>
            {/* Preview */}
            <div className="mb-4 overflow-hidden rounded-lg border border-white/[0.06]">
              <div className="overflow-x-auto" style={{ scrollbarWidth: "none" }}>
                <table className="w-full border-collapse text-left">
                  <thead>
                    <tr className="border-b border-white/[0.06] bg-white/[0.02]">
                      {parsed.headers.map((h, i) => (
                        <th key={i} className="px-2 py-1.5 text-[9px] font-medium uppercase tracking-wider text-white/30">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {parsed.rows.slice(0, 5).map((row, i) => (
                      <tr key={i} className="border-b border-white/[0.03]">
                        {row.map((cell, j) => (
                          <td key={j} className="max-w-[120px] truncate px-2 py-1 text-[10px] text-white/40">
                            {cell}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="bg-white/[0.01] px-2 py-1 text-[9px] text-white/20">
                Showing {Math.min(5, parsed.rows.length)} of {parsed.rows.length} rows
              </p>
            </div>

            {/* Column mapping */}
            <p className="mb-2 text-[10px] font-medium uppercase tracking-wider text-white/30">
              Column Mapping
            </p>
            <div className="grid grid-cols-2 gap-2">
              {REQUIRED_FIELDS.map((field) => (
                <div key={field}>
                  <label className="mb-0.5 block text-[9px] font-medium text-white/25">
                    {field}
                  </label>
                  <select
                    value={mapping[field]}
                    onChange={(e) =>
                      setMapping((m) => ({ ...m, [field]: parseInt(e.target.value, 10) }))
                    }
                    className="w-full rounded-lg border border-white/[0.06] bg-white/[0.02] px-2 py-1.5 text-[11px] text-foreground outline-none"
                  >
                    <option value={-1}>— skip —</option>
                    {parsed.headers.map((h, i) => (
                      <option key={i} value={i}>
                        {h}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            </div>

            <div className="mt-5 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setStep("upload")}
                className="rounded-lg px-3 py-1.5 text-[11px] text-white/40 hover:text-white/60"
              >
                Back
              </button>
              <button
                type="button"
                onClick={executeImport}
                disabled={mapping.Name < 0}
                className="flex items-center gap-1.5 rounded-lg bg-white/[0.1] px-4 py-1.5 text-[11px] font-semibold text-foreground hover:bg-white/[0.16] disabled:opacity-30"
              >
                <Upload className="size-3.5" />
                Import
              </button>
            </div>
          </div>
        )}

        {/* Step: Done */}
        {step === "done" && (
          <div className="flex flex-col items-center py-8">
            <div className="mb-3 flex size-10 items-center justify-center rounded-full bg-[#00E676]/10">
              <Check className="size-5 text-[#00E676]" />
            </div>
            <p className="mb-1 text-sm font-semibold text-foreground">Import Complete</p>
            <p className="text-[11px] text-white/40">
              Added {importResult.added}
              {importResult.updated > 0 && `, Updated ${importResult.updated}`}
              {importResult.skipped > 0 && `, Skipped ${importResult.skipped}`}
            </p>
            <button
              type="button"
              onClick={onClose}
              className="mt-5 rounded-lg bg-white/[0.1] px-5 py-1.5 text-[11px] font-semibold text-foreground hover:bg-white/[0.16]"
            >
              Done
            </button>
          </div>
        )}
      </motion.div>
    </motion.div>
  )
}

/* ───────────────── Shared Field Component ───────────────── */

function Field({
  label,
  value,
  onChange,
  type = "text",
}: {
  label: string
  value: string
  onChange: (v: string) => void
  type?: string
}) {
  return (
    <div>
      <label className="mb-1 block text-[9px] font-medium uppercase tracking-wider text-white/25">
        {label}
      </label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-1.5 text-[11px] text-foreground outline-none placeholder:text-white/15"
      />
    </div>
  )
}

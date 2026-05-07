"use client"

import { Button } from "@/components/ui/button"
import { createClient } from "@/lib/supabase/client"
import { usePracticeCrypto } from "@/lib/clinical-workspace/practice-crypto-context"
import { Question, Plus, Trash, FloppyDisk, Spinner } from "@phosphor-icons/react"
import { useCallback, useEffect, useState } from "react"

type FaqRow = {
  id: string
  category: string
  question: string
  answer: string
  sortOrder: number
}

export function PracticeFaqsEditor() {
  const { practiceId, unlocked } = usePracticeCrypto()
  const [rows, setRows] = useState<FaqRow[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    if (!practiceId) return
    const sb = createClient()
    if (!sb) return
    setLoading(true)
    try {
      const { data } = await sb
        .from("practice_faqs")
        .select("*")
        .eq("practice_id", practiceId)
        .order("sort_order", { ascending: true })
      setRows(
        (data ?? []).map((r, i) => ({
          id: String((r as { id: string }).id),
          category: String((r as { category?: string }).category ?? "general"),
          question: String((r as { question?: string }).question ?? ""),
          answer: String((r as { answer?: string }).answer ?? ""),
          sortOrder: Number((r as { sort_order?: number }).sort_order ?? i),
        }))
      )
    } finally {
      setLoading(false)
    }
  }, [practiceId])

  useEffect(() => {
    void load()
  }, [load])

  const save = useCallback(async () => {
    if (!practiceId || !unlocked) return
    const sb = createClient()
    if (!sb) return
    setSaving(true)
    try {
      for (let i = 0; i < rows.length; i++) {
        const r = rows[i]!
        const payload = {
          practice_id: practiceId,
          category: (r.category || "general").toLowerCase(),
          question: r.question,
          answer: r.answer,
          sort_order: i,
          active: true,
          updated_at: new Date().toISOString(),
        }
        if (r.id.startsWith("new-")) {
          const { error } = await sb.from("practice_faqs").insert(payload)
          if (error) throw error
        } else {
          const { error } = await sb.from("practice_faqs").update(payload).eq("id", r.id)
          if (error) throw error
        }
      }
      await load()
    } catch (e) {
      console.warn("[PracticeFaqsEditor]", e)
    } finally {
      setSaving(false)
    }
  }, [practiceId, rows, unlocked, load])

  const addRow = () => {
    setRows((prev) => [
      ...prev,
      {
        id: `new-${crypto.randomUUID()}`,
        category: "general",
        question: "",
        answer: "",
        sortOrder: prev.length,
      },
    ])
  }

  const removeRow = (id: string) => {
    setRows((prev) => prev.filter((r) => r.id !== id))
    if (!id.startsWith("new-") && practiceId) {
      const sb = createClient()
      void sb?.from("practice_faqs").delete().eq("id", id)
    }
  }

  if (!practiceId) return null

  return (
    <section className="border-border/60 from-card/40 rounded-2xl border bg-gradient-to-br to-transparent p-5 shadow-sm">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="bg-primary/10 flex size-9 items-center justify-center rounded-xl">
            <Question className="text-primary size-5" />
          </div>
          <div>
            <h4 className="text-foreground text-sm font-semibold tracking-tight">FAQs</h4>
            <p className="text-muted-foreground mt-0.5 text-xs leading-relaxed">
              Answers your assistant and channels can use when patients ask common questions.
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button type="button" size="sm" variant="outline" disabled={!unlocked} onClick={addRow}>
            <Plus className="mr-1 size-4" />
            Add
          </Button>
          <Button type="button" size="sm" variant="secondary" disabled={!unlocked || saving || loading} onClick={() => void save()}>
            {saving ? <Spinner className="mr-1.5 size-4 animate-spin" /> : <FloppyDisk className="mr-1.5 size-4" />}
            Save FAQs
          </Button>
        </div>
      </div>

      {loading ? (
        <p className="text-muted-foreground text-sm">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="text-muted-foreground rounded-xl border border-dashed border-border/60 px-4 py-8 text-center text-sm">
          No FAQs yet. Add common questions about parking, billing, or preparation for procedures.
        </p>
      ) : (
        <div className="space-y-3">
          {rows.map((r) => (
            <div key={r.id} className="border-border/50 space-y-2 rounded-xl border bg-background/50 p-3">
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={() => removeRow(r.id)}
                  className="text-muted-foreground hover:text-destructive rounded-md p-1 transition-colors"
                  aria-label="Remove FAQ"
                >
                  <Trash className="size-4" />
                </button>
              </div>
              <input
                value={r.question}
                onChange={(e) =>
                  setRows((prev) => prev.map((x) => (x.id === r.id ? { ...x, question: e.target.value } : x)))
                }
                placeholder="Question"
                disabled={!unlocked}
                className="border-input bg-background w-full rounded-lg border px-3 py-2 text-sm"
              />
              <textarea
                value={r.answer}
                onChange={(e) =>
                  setRows((prev) => prev.map((x) => (x.id === r.id ? { ...x, answer: e.target.value } : x)))
                }
                placeholder="Answer"
                disabled={!unlocked}
                rows={3}
                className="border-input bg-background w-full resize-none rounded-lg border px-3 py-2 text-sm"
              />
            </div>
          ))}
        </div>
      )}
    </section>
  )
}

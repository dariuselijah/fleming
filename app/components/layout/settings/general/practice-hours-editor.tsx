"use client"

import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { createClient } from "@/lib/supabase/client"
import { usePracticeCrypto } from "@/lib/clinical-workspace/practice-crypto-context"
import { useWorkspaceStore } from "@/lib/clinical-workspace"
import type { PracticeBusinessHour } from "@/lib/clinical-workspace/types"
import { Clock, FloppyDisk, Spinner } from "@phosphor-icons/react"
import { useCallback, useEffect, useState } from "react"

const DAY_ROWS: { dow: number; label: string }[] = [
  { dow: 1, label: "Monday" },
  { dow: 2, label: "Tuesday" },
  { dow: 3, label: "Wednesday" },
  { dow: 4, label: "Thursday" },
  { dow: 5, label: "Friday" },
  { dow: 6, label: "Saturday" },
  { dow: 0, label: "Sunday" },
]

type Row = { dayOfWeek: number; open: string; close: string; closed: boolean }

function mapDbToRows(hours: PracticeBusinessHour[]): Map<number, Row> {
  const m = new Map<number, Row>()
  for (const h of hours) {
    m.set(h.dayOfWeek, {
      dayOfWeek: h.dayOfWeek,
      open: h.openTime.slice(0, 5),
      close: h.closeTime.slice(0, 5),
      closed: h.isClosed,
    })
  }
  return m
}

function defaultRow(dow: number): Row {
  const closed = dow === 0
  return {
    dayOfWeek: dow,
    open: "08:00",
    close: dow === 6 ? "12:00" : "17:00",
    closed,
  }
}

export function PracticeHoursEditor() {
  const { practiceId, unlocked } = usePracticeCrypto()
  const [rows, setRows] = useState<Row[]>(() => DAY_ROWS.map((d) => defaultRow(d.dow)))
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    if (!practiceId) return
    const sb = createClient()
    if (!sb) return
    setLoading(true)
    try {
      const { data } = await sb.from("practice_hours").select("*").eq("practice_id", practiceId)
      const fromStore = useWorkspaceStore.getState().practiceHours
      const raw =
        data && data.length > 0
          ? (data as { day_of_week: number; open_time: string; close_time: string; is_closed: boolean }[]).map(
              (r) =>
                ({
                  dayOfWeek: r.day_of_week,
                  openTime: String(r.open_time).slice(0, 5),
                  closeTime: String(r.close_time).slice(0, 5),
                  isClosed: r.is_closed,
                }) satisfies PracticeBusinessHour
            )
          : fromStore
      const mapped = mapDbToRows(raw)
      setRows(DAY_ROWS.map(({ dow }) => mapped.get(dow) ?? defaultRow(dow)))
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
      const payload = rows.map((r) => ({
        practice_id: practiceId,
        day_of_week: r.dayOfWeek,
        open_time: r.open.length === 5 ? r.open : `${r.open}:00`.slice(0, 8),
        close_time: r.close.length === 5 ? r.close : `${r.close}:00`.slice(0, 8),
        is_closed: r.closed,
      }))
      const { error } = await sb.from("practice_hours").upsert(payload, { onConflict: "practice_id,day_of_week" })
      if (error) throw error
      const next: PracticeBusinessHour[] = rows.map((r) => ({
        dayOfWeek: r.dayOfWeek,
        openTime: r.open,
        closeTime: r.close,
        isClosed: r.closed,
      }))
      useWorkspaceStore.setState({ practiceHours: next })
    } catch (e) {
      console.warn("[PracticeHoursEditor]", e)
    } finally {
      setSaving(false)
    }
  }, [practiceId, rows, unlocked])

  if (!practiceId) return null

  return (
    <section className="border-border/60 from-card/40 rounded-2xl border bg-gradient-to-br to-transparent p-5 shadow-sm">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="bg-primary/10 flex size-9 items-center justify-center rounded-xl">
            <Clock className="text-primary size-5" />
          </div>
          <div>
            <h4 className="text-foreground text-sm font-semibold tracking-tight">Operating hours</h4>
            <p className="text-muted-foreground mt-0.5 text-xs leading-relaxed">
              Used by the calendar, appointment picker, and patient-facing booking.
            </p>
          </div>
        </div>
        <Button type="button" size="sm" variant="secondary" disabled={!unlocked || saving || loading} onClick={() => void save()}>
          {saving ? <Spinner className="mr-1.5 size-4 animate-spin" /> : <FloppyDisk className="mr-1.5 size-4" />}
          Save hours
        </Button>
      </div>

      {loading ? (
        <p className="text-muted-foreground text-sm">Loading…</p>
      ) : (
        <div className="space-y-0 divide-y divide-border/50 rounded-xl border border-border/40 bg-background/40">
          {DAY_ROWS.map(({ dow, label }) => {
            const row = rows.find((r) => r.dayOfWeek === dow)!
            return (
              <div key={dow} className="flex flex-wrap items-center gap-3 px-3 py-2.5 sm:flex-nowrap">
                <span className="text-foreground w-28 shrink-0 text-[13px] font-medium">{label}</span>
                <div className="flex items-center gap-2">
                  <Switch
                    checked={!row.closed}
                    onCheckedChange={(on) => {
                      setRows((prev) =>
                        prev.map((r) => (r.dayOfWeek === dow ? { ...r, closed: !on } : r))
                      )
                    }}
                    disabled={!unlocked}
                  />
                  <span className="text-muted-foreground text-xs">{row.closed ? "Closed" : "Open"}</span>
                </div>
                {!row.closed && (
                  <div className="flex flex-1 flex-wrap items-end gap-3 sm:justify-end">
                    <div className="space-y-1">
                      <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">Opens</Label>
                      <input
                        type="time"
                        value={row.open}
                        onChange={(e) =>
                          setRows((prev) =>
                            prev.map((r) => (r.dayOfWeek === dow ? { ...r, open: e.target.value } : r))
                          )
                        }
                        disabled={!unlocked}
                        className="border-input bg-background h-9 rounded-lg border px-2 text-sm"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">Closes</Label>
                      <input
                        type="time"
                        value={row.close}
                        onChange={(e) =>
                          setRows((prev) =>
                            prev.map((r) => (r.dayOfWeek === dow ? { ...r, close: e.target.value } : r))
                          )
                        }
                        disabled={!unlocked}
                        className="border-input bg-background h-9 rounded-lg border px-2 text-sm"
                      />
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}

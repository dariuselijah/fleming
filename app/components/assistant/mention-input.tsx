"use client"

import { useWorkspace, type PracticeAppointment, type PracticePatient } from "@/lib/clinical-workspace"
import { cn } from "@/lib/utils"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"

export type MentionRef = { type: "patient" | "appointment"; id: string; label: string }

type MentionInputProps = {
  value: string
  onChange: (value: string) => void
  onMentionsChange?: (mentions: MentionRef[]) => void
  /** When set, picking a patient/appt adds a sleek chip in the parent instead of raw @[…|…] text. */
  onContextAdd?: (item: { id: string; name: string; kind: "patient" | "appointment" }) => void
  placeholder?: string
  rows?: number
  className?: string
  onKeyDown?: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void
  onFocus?: (e: React.FocusEvent<HTMLTextAreaElement>) => void
  onBlur?: (e: React.FocusEvent<HTMLTextAreaElement>) => void
  disabled?: boolean
}

const AVATAR_HUES = [210, 160, 280, 35, 200]

function initials(name: string) {
  const p = name.trim().split(/\s+/).filter(Boolean)
  if (p.length === 0) return "?"
  if (p.length === 1) return p[0]!.slice(0, 2).toUpperCase()
  return `${p[0]![0] ?? ""}${p[p.length - 1]![0] ?? ""}`.toUpperCase()
}

function formatIdHint(id?: string) {
  if (!id?.trim()) return null
  const d = id.replace(/\D/g, "")
  if (d.length >= 4) return `•••• ${d.slice(-4)}`
  return id
}

/** Typing @patient / @patients acts as “browse patients” (same as @ with no query). */
function isPatientBrowseKeyword(raw: string): boolean {
  const n = raw.trim().toLowerCase()
  return n === "patient" || n === "patients"
}

function scorePatient(p: PracticePatient, q: string): number {
  const needle = q.trim().toLowerCase()
  if (!needle) {
    const lv = p.lastVisit ? new Date(p.lastVisit).getTime() : 0
    return 1000 + lv / 1e10
  }

  const name = p.name.toLowerCase()
  const idLower = (p.idNumber ?? "").toLowerCase()
  let best = 0
  const bump = (s: number) => {
    if (s > best) best = s
  }

  if (name.startsWith(needle)) bump(1000 + (needle.length / Math.max(name.length, 1)) * 100)
  else if (name.includes(needle)) bump(400 + needle.length * 5)

  if (idLower.startsWith(needle)) bump(800 + needle.length * 10)
  else if (idLower.includes(needle)) bump(300)

  const passport = (p.passportNumber ?? "").toLowerCase()
  if (passport) {
    if (passport.startsWith(needle)) bump(780 + needle.length * 8)
    else if (passport.includes(needle)) bump(290)
  }

  const email = (p.email ?? "").toLowerCase()
  if (email.includes(needle)) bump(360)

  const phoneRaw = (p.phone ?? "").toLowerCase()
  const phoneDigits = (p.phone ?? "").replace(/\D/g, "")
  const needleDigits = needle.replace(/\D/g, "")
  if (needleDigits.length >= 4 && phoneDigits.includes(needleDigits)) bump(820)
  else if (phoneRaw.includes(needle)) bump(350)

  const schemeHay = [
    p.medicalAidScheme,
    p.medicalAidPlan,
    p.memberNumber,
    p.mainMemberName,
    p.medicalAidSchemeCode,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase()
  if (schemeHay.includes(needle)) bump(330)

  return best
}

export function MentionInput({
  value,
  onChange,
  onMentionsChange,
  onContextAdd,
  placeholder,
  rows = 2,
  className,
  onKeyDown,
  onFocus,
  onBlur,
  disabled,
}: MentionInputProps) {
  const { patients, appointments } = useWorkspace()
  const [show, setShow] = useState(false)
  const [q, setQ] = useState("")
  const [activeIdx, setActiveIdx] = useState(0)
  const containerRef = useRef<HTMLDivElement>(null)
  /** Index of the `@` that opened the current mention menu (avoids wrong replace with multiple `@`). */
  const mentionAtRef = useRef(-1)

  const patientSearchQ = useMemo(
    () => (isPatientBrowseKeyword(q) ? "" : q),
    [q]
  )

  const rankedPatients = useMemo(() => {
    if (!patientSearchQ.trim()) {
      return [...patients]
        .sort((a, b) => {
          const ta = a.lastVisit ? new Date(a.lastVisit).getTime() : 0
          const tb = b.lastVisit ? new Date(b.lastVisit).getTime() : 0
          return tb - ta
        })
        .slice(0, 6)
    }
    return patients
      .map((p) => ({ p, s: scorePatient(p, patientSearchQ) }))
      .filter((x) => x.s > 0)
      .sort((a, b) => b.s - a.s)
      .slice(0, 8)
      .map((x) => x.p)
  }, [patients, patientSearchQ])

  const filteredAppts = useMemo(() => {
    const needle = isPatientBrowseKeyword(q) ? "" : q.trim().toLowerCase()
    if (needle.length < 1) return [] as typeof appointments
    return appointments
      .filter((a) => {
        const hay = [
          a.patientName,
          a.service,
          a.reason,
          a.notes,
          a.medicalAid,
          a.memberNumber,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
        return hay.includes(needle)
      })
      .slice(0, 6)
  }, [appointments, q])

  const listLength = rankedPatients.length + filteredAppts.length

  useEffect(() => {
    setActiveIdx(0)
  }, [q, show])

  const insertMention = useCallback(
    (prefix: string, item: { id: string; label: string; type: MentionRef["type"] }) => {
      const caretAt = mentionAtRef.current >= 0 ? mentionAtRef.current : value.lastIndexOf("@")
      const stripped =
        caretAt >= 0
          ? `${value.slice(0, caretAt)}${value.slice(caretAt + 1 + prefix.length)}`.replace(/\s{2,}/g, " ").trimEnd()
          : value

      if (onContextAdd) {
        onChange(stripped)
        onContextAdd({
          id: item.id,
          name: item.label,
          kind: item.type === "appointment" ? "appointment" : "patient",
        })
      } else {
        const token = `@[${item.label}|${item.id}] `
        const next =
          caretAt >= 0 ? `${value.slice(0, caretAt)}${token}${value.slice(caretAt + 1 + prefix.length)}` : `${value}${token}`
        onChange(next)
      }
      onMentionsChange?.([{ type: item.type, id: item.id, label: item.label }])
      mentionAtRef.current = -1
      setShow(false)
    },
    [onChange, onMentionsChange, onContextAdd, value]
  )

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const v = e.target.value
    onChange(v)
    const pos = e.target.selectionStart ?? v.length
    const slice = v.slice(0, pos)
    const at = slice.lastIndexOf("@")
    if (at >= 0 && !slice.slice(at).includes(" ") && slice.slice(at).includes("@")) {
      mentionAtRef.current = at
      setShow(true)
      setQ(slice.slice(at + 1))
    } else {
      mentionAtRef.current = -1
      setShow(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (show && listLength > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault()
        setActiveIdx((i) => Math.min(i + 1, listLength - 1))
        return
      }
      if (e.key === "ArrowUp") {
        e.preventDefault()
        setActiveIdx((i) => Math.max(i - 1, 0))
        return
      }
      if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault()
        if (activeIdx < rankedPatients.length) {
          const p = rankedPatients[activeIdx]!
          insertMention(patientSearchQ || q, { id: p.id, label: p.name, type: "patient" })
        } else {
          const a = filteredAppts[activeIdx - rankedPatients.length]!
          insertMention(patientSearchQ || q, {
            id: a.id,
            label: `${a.patientName} ${a.startTime}`,
            type: "appointment",
          })
        }
        return
      }
      if (e.key === "Escape") {
        e.preventDefault()
        mentionAtRef.current = -1
        setShow(false)
        return
      }
    }
    onKeyDown?.(e)
  }

  return (
    <div className="relative z-[1] overflow-visible" ref={containerRef}>
      <textarea
        value={value}
        disabled={disabled}
        rows={rows}
        placeholder={placeholder}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        onFocus={onFocus}
        onBlur={onBlur}
        className={cn(
          "w-full resize-none rounded-xl border border-input bg-transparent px-3 py-2.5 text-[13px] leading-relaxed text-foreground outline-none placeholder:text-muted-foreground/50 focus:border-ring",
          className
        )}
      />
      {show && (rankedPatients.length > 0 || filteredAppts.length > 0) && (
        <div className="absolute bottom-full left-0 right-0 z-[300] mb-2 max-h-[min(280px,40vh)] overflow-y-auto rounded-2xl border border-panel-border bg-overlay py-1 shadow-overlay backdrop-blur-xl">
          {rankedPatients.map((p, i) => {
            const idDisp = formatIdHint(p.idNumber) ?? (p.dateOfBirth ? p.dateOfBirth : null)
            const hue = AVATAR_HUES[i % AVATAR_HUES.length]
            return (
              <button
                key={`p-${p.id}`}
                type="button"
                className={cn(
                  "flex h-9 w-full items-center gap-2.5 px-2.5 text-left text-[12px] transition-colors",
                  i === activeIdx ? "bg-accent text-accent-foreground" : "hover:bg-accent/70"
                )}
                onMouseDown={(e) => {
                  e.preventDefault()
                  insertMention(patientSearchQ || q, { id: p.id, label: p.name, type: "patient" })
                }}
                onMouseEnter={() => setActiveIdx(i)}
              >
                <span
                  className="flex size-7 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold text-white"
                  style={{ background: `hsla(${hue}, 28%, 32%, 0.95)` }}
                >
                  {initials(p.name)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium text-foreground/90">{p.name}</span>
                  <span className="block truncate font-mono text-[10px] text-muted-foreground">
                    {idDisp ?? "No ID on file"}
                  </span>
                </span>
                {p.medicalAidScheme ? (
                  <span className="max-w-[100px] shrink-0 truncate text-[10px] text-muted-foreground">{p.medicalAidScheme}</span>
                ) : null}
              </button>
            )
          })}
          {filteredAppts.map((a: PracticeAppointment, j) => {
            const idx = rankedPatients.length + j
            return (
              <button
                key={`a-${a.id}`}
                type="button"
                className={cn(
                  "flex h-9 w-full items-center gap-2 px-2.5 text-left text-[11px] text-foreground/80 transition-colors",
                  idx === activeIdx ? "bg-accent text-accent-foreground" : "hover:bg-accent/70"
                )}
                onMouseDown={(e) => {
                  e.preventDefault()
                  insertMention(patientSearchQ || q, {
                    id: a.id,
                    label: `${a.patientName} ${a.startTime}`,
                    type: "appointment",
                  })
                }}
                onMouseEnter={() => setActiveIdx(idx)}
              >
                <span className="text-muted-foreground">Appt</span>
                <span className="truncate">
                  {a.patientName} <span className="text-muted-foreground">{a.date}</span>
                </span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

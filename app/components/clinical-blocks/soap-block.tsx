"use client"

import { useSOAPNote, type SOAPNote } from "@/lib/clinical-workspace"
import { cn } from "@/lib/utils"
import { Clipboard, Check } from "@phosphor-icons/react"
import { motion } from "motion/react"
import { useCallback, useRef, useState } from "react"

const SECTIONS: { key: keyof SOAPNote; label: string; color: string; placeholder: string }[] = [
  {
    key: "subjective",
    label: "S",
    color: "border-l-blue-500",
    placeholder: "Chief complaint, history of present illness, review of systems...",
  },
  {
    key: "objective",
    label: "O",
    color: "border-l-emerald-500",
    placeholder: "Vital signs, physical exam findings, lab results...",
  },
  {
    key: "assessment",
    label: "A",
    color: "border-l-purple-500",
    placeholder: "Diagnosis, differential diagnosis, clinical impression...",
  },
  {
    key: "plan",
    label: "P",
    color: "border-l-amber-500",
    placeholder: "Treatment plan, medications, follow-up, referrals...",
  },
]

function SOAPSection({
  section,
  value,
  ghostText,
  onChange,
  onAcceptGhost,
}: {
  section: (typeof SECTIONS)[number]
  value: string
  ghostText?: string
  onChange: (value: string) => void
  onAcceptGhost: () => void
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const [isFocused, setIsFocused] = useState(false)

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Tab" && ghostText) {
        e.preventDefault()
        onAcceptGhost()
      }
    },
    [ghostText, onAcceptGhost]
  )

  return (
    <div
      className={cn(
        "rounded-xl border border-border/40 border-l-2 bg-card/50 transition-all",
        section.color,
        isFocused && "border-border/70 shadow-sm"
      )}
    >
      <div className="flex items-center gap-2 px-3 pt-2.5">
        <span className="flex size-5 items-center justify-center rounded-md bg-muted text-[10px] font-bold">
          {section.label}
        </span>
        <span className="text-[11px] font-medium text-muted-foreground">
          {section.key.charAt(0).toUpperCase() + section.key.slice(1)}
        </span>
        {ghostText && (
          <span className="ml-auto flex items-center gap-1 text-[10px] text-indigo-500">
            <kbd className="rounded bg-muted px-1 py-0.5 text-[9px] font-medium">Tab</kbd>
            to accept
          </span>
        )}
      </div>
      <div className="relative px-3 pb-2.5 pt-1">
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          onKeyDown={handleKeyDown}
          placeholder={section.placeholder}
          rows={2}
          className="w-full resize-none bg-transparent text-xs leading-relaxed outline-none placeholder:text-muted-foreground/50"
        />
        {ghostText && (
          <div
            className="pointer-events-none absolute left-3 top-1 whitespace-pre-wrap text-xs leading-relaxed text-indigo-400/50"
            aria-hidden
          >
            {value}
            <span className="text-indigo-400/40">{ghostText}</span>
          </div>
        )}
      </div>
    </div>
  )
}

export function SOAPBlock() {
  const { note, update, acceptGhost } = useSOAPNote()
  const [isMinimized, setIsMinimized] = useState(false)

  const hasContent = Object.values(note).some(
    (v) => typeof v === "string" && v.trim().length > 0
  )

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="mx-auto w-full max-w-3xl px-4"
    >
      <div className="rounded-2xl border border-border/50 bg-background/80 shadow-sm backdrop-blur-xl">
        {/* Header */}
        <button
          type="button"
          onClick={() => setIsMinimized(!isMinimized)}
          className="flex w-full items-center justify-between px-4 py-3"
        >
          <div className="flex items-center gap-2">
            <Clipboard className="size-4 text-indigo-500" weight="fill" />
            <span className="text-xs font-semibold">SOAP Note</span>
            {hasContent && (
              <Check className="size-3.5 text-emerald-500" weight="bold" />
            )}
          </div>
          <span className="text-[10px] text-muted-foreground">
            {isMinimized ? "Expand" : "Minimize"}
          </span>
        </button>

        {/* Sections */}
        {!isMinimized && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="space-y-2 px-3 pb-3"
          >
            {SECTIONS.map((section) => (
              <SOAPSection
                key={section.key}
                section={section}
                value={note[section.key] as string}
                ghostText={note.ghostText?.[section.key]}
                onChange={(v) => update(section.key, v)}
                onAcceptGhost={() => acceptGhost(section.key)}
              />
            ))}
          </motion.div>
        )}
      </div>
    </motion.div>
  )
}

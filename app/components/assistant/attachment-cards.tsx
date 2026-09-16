"use client"

import { motion } from "motion/react"
import { Paperclip, UploadSimple, WarningCircle, X } from "@phosphor-icons/react"
import { cn } from "@/lib/utils"
import { panelSurface } from "@/lib/theme/surfaces"
import { useCallback, useRef, useState } from "react"

const CATEGORY_OPTIONS = [
  { value: "", label: "Category (optional)" },
  { value: "lab", label: "Lab" },
  { value: "id", label: "ID" },
  { value: "referral", label: "Referral" },
  { value: "script", label: "Script" },
  { value: "other", label: "Other" },
] as const

export type AttachmentCategory = "" | "lab" | "id" | "referral" | "script" | "other"

export function AttachmentConfirmCard({
  fileName,
  sizeBytes,
  mimeType,
  patientName,
  category,
  onCategoryChange,
  busy,
  error,
  onCancel,
  onConfirm,
}: {
  fileName: string
  sizeBytes: number
  mimeType: string
  patientName: string
  category: AttachmentCategory
  onCategoryChange: (c: AttachmentCategory) => void
  busy: boolean
  error: string | null
  onCancel: () => void
  onConfirm: () => void
}) {
  const kb = sizeBytes >= 1024 * 1024 ? `${(sizeBytes / (1024 * 1024)).toFixed(1)} MB` : `${(sizeBytes / 1024).toFixed(0)} KB`

  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn("rounded-2xl px-3.5 py-2.5", panelSurface)}
    >
      <div className="flex items-start gap-2">
        <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-status-info/15 text-status-info-foreground dark:text-status-info">
          <Paperclip className="size-3.5" weight="bold" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-medium text-foreground/90">Attach file</p>
          <p className="mt-0.5 truncate text-[10px] text-muted-foreground">{fileName}</p>
          <p className="mt-0.5 text-[10px] text-muted-foreground">
            {kb}
            {mimeType ? ` · ${mimeType}` : ""}
          </p>
          <p className="mt-1 text-[10px] text-status-info-foreground dark:text-status-info">
            To <span className="font-medium text-foreground/80">{patientName}</span>
          </p>
          <select
            value={category}
            onChange={(e) => onCategoryChange(e.target.value as AttachmentCategory)}
            disabled={busy}
            className="mt-2 w-full rounded-lg border border-input bg-background px-2 py-1.5 text-[10px] text-foreground outline-none focus:border-status-info/30"
          >
            {CATEGORY_OPTIONS.map((o) => (
              <option key={o.value || "none"} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          {error ? (
            <p className="mt-2 flex items-center gap-1 text-[10px] text-status-danger-foreground dark:text-status-danger">
              <WarningCircle className="size-3 shrink-0" weight="fill" />
              {error}
            </p>
          ) : null}
          <div className="mt-2.5 flex gap-2">
            <button
              type="button"
              disabled={busy}
              onMouseDown={(e) => e.preventDefault()}
              onClick={onCancel}
              className="flex-1 rounded-full border border-border py-1.5 text-[10px] text-muted-foreground hover:bg-accent hover:text-accent-foreground disabled:opacity-40"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={busy}
              onMouseDown={(e) => e.preventDefault()}
              onClick={onConfirm}
              className="flex-1 rounded-full bg-primary py-1.5 text-[10px] font-semibold text-primary-foreground disabled:opacity-40"
            >
              {busy ? "Uploading…" : "Confirm upload"}
            </button>
          </div>
        </div>
      </div>
    </motion.div>
  )
}

export function UploadRequestCard({
  patientName,
  hint,
  onDismiss,
  onFile,
}: {
  patientName: string
  hint: string | null
  onDismiss: () => void
  onFile: (file: File) => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [drag, setDrag] = useState(false)

  const pick = useCallback(
    (list: FileList | null) => {
      const f = list?.[0]
      if (f) onFile(f)
    },
    [onFile]
  )

  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn("rounded-2xl px-3 py-2.5", panelSurface)}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 flex-1 items-start gap-2">
          <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-status-info/15 text-status-info-foreground dark:text-status-info">
            <UploadSimple className="size-3.5" weight="bold" />
          </span>
          <div className="min-w-0">
            <p className="text-[11px] font-medium text-foreground/90">File needed</p>
            <p className="mt-0.5 text-[10px] text-muted-foreground">For {patientName}</p>
            <p className="mt-1 text-[11px] leading-snug text-status-info-foreground dark:text-status-info">{hint ?? "Drop a file below or choose one."}</p>
          </div>
        </div>
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={onDismiss}
          className="shrink-0 rounded p-0.5 text-muted-foreground hover:text-foreground"
          aria-label="Dismiss"
        >
          <X className="size-3.5" />
        </button>
      </div>
      <input
        ref={inputRef}
        type="file"
        className="hidden"
        accept="application/pdf,image/*,.heic,text/plain"
        onChange={(e) => {
          pick(e.target.files)
          e.target.value = ""
        }}
      />
      <button
        type="button"
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault()
          setDrag(true)
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault()
          setDrag(false)
          pick(e.dataTransfer.files)
        }}
        className={cn(
          "mt-2 flex w-full flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-status-info/25 bg-panel-muted py-4 text-[10px] text-status-info-foreground transition-colors dark:text-status-info",
          drag && "border-status-info/45 bg-status-info/10"
        )}
      >
        <UploadSimple className="size-5" />
        <span>Drop file here or tap to browse</span>
      </button>
    </motion.div>
  )
}

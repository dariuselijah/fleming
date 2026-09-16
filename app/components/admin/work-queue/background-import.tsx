"use client"

import { useWorkQueueStore } from "@/lib/admin/work-queue-store"
import { useWorkspaceStore } from "@/lib/clinical-workspace"
import { findDuplicatePatient } from "@/lib/clinical/smart-import-patient"
import { overlayClassName } from "@/lib/theme/surfaces"
import { cn } from "@/lib/utils"
import { CloudArrowUp, CircleNotch, X } from "@phosphor-icons/react"
import { AnimatePresence, motion } from "motion/react"
import { useCallback, useRef, useState } from "react"

function fuzzyMatchPatients(
  patients: ReturnType<typeof useWorkspaceStore.getState>["patients"],
  fields: Record<string, string>
): { matched?: (typeof patients)[0]; candidates: (typeof patients)[0][] } {
  const idNumber = fields["ID Number"] ?? fields["SA ID"] ?? fields.idNumber
  const name = fields["Full name"] ?? fields.Name ?? fields.name
  const dup = findDuplicatePatient(patients, { idNumber, passportNumber: fields["Passport number"] })
  if (dup) return { matched: dup, candidates: [dup] }

  if (!name) return { candidates: [] }
  const needle = name.toLowerCase()
  const candidates = patients.filter((p) => p.name.toLowerCase().includes(needle) || needle.includes(p.name.toLowerCase()))
  if (candidates.length === 1) return { matched: candidates[0], candidates }
  return { candidates }
}

export function WorkQueueBackgroundImport() {
  const addImportItem = useWorkQueueStore((s) => s.addImportItem)
  const incrementAiResolved = useWorkQueueStore((s) => s.incrementAiResolved)
  const resolveItem = useWorkQueueStore((s) => s.resolveItem)
  const importModalOpen = useWorkQueueStore((s) => s.importModalOpen)
  const setImportModalOpen = useWorkQueueStore((s) => s.setImportModalOpen)
  const patients = useWorkspaceStore((s) => s.patients)
  const addNotification = useWorkspaceStore((s) => s.addNotification)

  const inputRef = useRef<HTMLInputElement>(null)
  const [dragOver, setDragOver] = useState(false)
  const [processing, setProcessing] = useState(false)
  const [status, setStatus] = useState<string | null>(null)

  const processFile = useCallback(
    async (file: File) => {
      setProcessing(true)
      setStatus(`Processing ${file.name}…`)
      const importId = `import-${Date.now()}`

      try {
        const form = new FormData()
        form.append("file", file)
        form.append("mode", "auto")
        form.append("stream", "true")

        const res = await fetch("/api/clinical/smart-import/extract", { method: "POST", body: form })
        if (!res.ok) throw new Error(`Extract failed (${res.status})`)

        let detected: string | undefined
        let fields: Record<string, string> = {}

        const reader = res.body?.getReader()
        if (reader) {
          const dec = new TextDecoder()
          let buffer = ""
          while (true) {
            const { done, value } = await reader.read()
            if (done) break
            buffer += dec.decode(value, { stream: true })
            const lines = buffer.split("\n")
            buffer = lines.pop() ?? ""
            for (const line of lines) {
              if (!line.trim()) continue
              try {
                const evt = JSON.parse(line) as { type?: string; detected?: string; fields?: Record<string, string>; message?: string }
                if (evt.type === "stage" && evt.message) setStatus(evt.message)
                if (evt.type === "done") {
                  detected = evt.detected
                  fields = evt.fields ?? {}
                }
              } catch {
                /* skip */
              }
            }
          }
        }

        const { matched, candidates } = fuzzyMatchPatients(patients, fields)
        const autoMatched = Boolean(matched) && candidates.length <= 1

        addImportItem({
          importId,
          fileName: file.name,
          detectedType: detected ?? "Document",
          matchedPatientId: matched?.id,
          matchedPatientName: matched?.name ?? fields["Full name"] ?? fields.Name,
          candidatePatientIds: candidates.map((c) => c.id),
          extractedFields: fields,
          autoMatched,
        })

        if (autoMatched) {
          resolveItem(`import-${importId}`)
          incrementAiResolved()
          addNotification({
            id: `notif-${Date.now()}`,
            type: "info",
            title: "Import auto-matched",
            detail: `${file.name} → ${matched?.name}`,
            timestamp: new Date().toISOString(),
            read: false,
          })
          setStatus(`${file.name} matched · no action needed`)
        } else {
          setStatus(`${file.name} needs review`)
        }
        setImportModalOpen(false)
      } catch (e) {
        setStatus(e instanceof Error ? e.message : "Import failed")
        addNotification({
          id: `notif-${Date.now()}`,
          type: "warning",
          title: "Smart import failed",
          detail: file.name,
          timestamp: new Date().toISOString(),
          read: false,
        })
      } finally {
        setProcessing(false)
        window.setTimeout(() => setStatus(null), 4000)
      }
    },
    [addImportItem, addNotification, incrementAiResolved, patients, resolveItem, setImportModalOpen]
  )

  const onFiles = useCallback(
    (files: FileList | null) => {
      const file = files?.[0]
      if (file) void processFile(file)
    },
    [processFile]
  )

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept="image/*,.pdf,.hl7"
        className="hidden"
        onChange={(e) => onFiles(e.target.files)}
      />

      <AnimatePresence>
        {importModalOpen && (
          <div className="fixed inset-0 z-[100] flex items-end justify-center p-4 sm:items-center">
            <motion.button
              type="button"
              aria-label="Close import"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/50 backdrop-blur-[2px]"
              onClick={() => setImportModalOpen(false)}
            />
            <motion.div
              initial={{ opacity: 0, y: 16, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 12, scale: 0.98 }}
              transition={{ duration: 0.18 }}
              className={cn(
                overlayClassName("relative z-10 w-full max-w-md rounded-2xl p-6"),
                dragOver && "ring-2 ring-emerald-400/30"
              )}
              onDragOver={(e) => {
                e.preventDefault()
                setDragOver(true)
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => {
                e.preventDefault()
                setDragOver(false)
                onFiles(e.dataTransfer.files)
              }}
            >
              <div className="mb-4 flex items-center justify-between">
                <p className="text-[13px] font-semibold text-foreground">Import file</p>
                <button
                  type="button"
                  onClick={() => setImportModalOpen(false)}
                  className="rounded-md p-1 text-muted-foreground hover:bg-panel-muted hover:text-foreground"
                >
                  <X className="size-4" />
                </button>
              </div>
              <button
                type="button"
                disabled={processing}
                onClick={() => inputRef.current?.click()}
                className="flex w-full flex-col items-center gap-2 rounded-xl border border-dashed border-panel-border bg-panel-muted/30 px-4 py-10 text-center"
              >
                {processing ? (
                  <CircleNotch className="size-8 animate-spin text-muted-foreground" />
                ) : (
                  <CloudArrowUp className="size-8 text-muted-foreground" />
                )}
                <span className="text-[11px] font-medium text-foreground/85">
                  {status ?? "Drop ID, medical aid card, or lab file here"}
                </span>
                <span className="text-[10px] text-muted-foreground">or click to browse</span>
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  )
}

"use client"

import { useMemo, useRef, useState } from "react"
import type { PracticePatient } from "@/lib/clinical-workspace"
import { usePatientAiSummary, usePatientOverview, useRegeneratePatientAiRollup } from "@/lib/patient/use-patient-overview"
import { cn } from "@/lib/utils"
import {
  Sparkle,
  CalendarBlank,
  FileArrowUp,
  ClipboardText,
  CaretDown,
  CaretRight,
  Stethoscope,
  Phone,
  ChatCircle,
  Upload,
  Trash,
  SpinnerGap,
  SealCheck,
} from "@phosphor-icons/react"

/**
 * Complete, self-contained chart summary rendering the same EHR overview
 * (AI context, visits, files, chart history, all visit summaries) that is
 * embedded in both the compact right-hand `PatientDetailPanel` and inside
 * the slide-over `PatientFilePanel` overview tab so clinicians see the
 * full chart in one place.
 */
export function PatientChartSummary({
  patient,
  onNewVisit,
  onScribe,
  showActions = true,
  compact = false,
  onOpenBilling,
  onOpenCalendar,
}: {
  patient: PracticePatient
  onNewVisit?: () => void
  onScribe?: () => void
  showActions?: boolean
  compact?: boolean
  /** Navigate to workspace billing when user clicks billing rows / “Open billing”. */
  onOpenBilling?: () => void
  /** Navigate to calendar (e.g. from appointments header). */
  onOpenCalendar?: () => void
}) {
  const overviewQuery = usePatientOverview(patient.id)
  const overview = overviewQuery.data ?? null
  const loading = overviewQuery.isLoading
  const overviewError = overviewQuery.error instanceof Error ? overviewQuery.error.message : null
  const summaryQuery = usePatientAiSummary(patient.id)
  const summary = summaryQuery.data ?? null
  const regenerateRollup = useRegeneratePatientAiRollup(patient.id, summary?.latestSummaryAt ?? null)
  const rollup = summary?.rollup ?? null
  const rollupBusy = regenerateRollup.isPending
  const [expandedAppts, setExpandedAppts] = useState<Record<string, boolean>>({})
  const [attachmentBusy, setAttachmentBusy] = useState(false)
  const [deletingAttachmentId, setDeletingAttachmentId] = useState<string | null>(null)
  const [attachmentError, setAttachmentError] = useState<string | null>(null)
  const attachmentInputRef = useRef<HTMLInputElement>(null)

  const generatedDocs = useMemo(() => {
    if (!overview) return []
    const summaries = overview.encounterSummaries.map((summary) => ({
      id: `summary-${summary.id}`,
      label: "Clinical Summary",
      status: "signed",
      updatedAt: summary.created_at,
      actionLabel: "Visit",
    }))
    const claims = overview.claims.map((claim) => ({
      id: `claim-${claim.id}`,
      label: "Billing Claim",
      status: claim.status,
      updatedAt: claim.created_at,
      actionLabel: "Billing",
    }))
    const invoices = overview.invoices.map((invoice) => ({
      id: `invoice-${invoice.id}`,
      label: "Invoice",
      status: invoice.status,
      updatedAt: invoice.created_at,
      actionLabel: "Billing",
    }))

    return [...summaries, ...claims, ...invoices]
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
      .slice(0, 8)
  }, [overview])

  const toggleAppt = (id: string) => setExpandedAppts((m) => ({ ...m, [id]: !m[id] }))

  const fmtApptWhen = (date: string, start: string) => {
    try {
      const d = new Date(`${date}T${start.length <= 5 ? `${start}:00` : start}`)
      return d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })
    } catch {
      return `${date} ${start}`
    }
  }

  const categoryLabel = (c: string | null) => {
    if (!c) return null
    return c.charAt(0).toUpperCase() + c.slice(1)
  }

  const fmtMoney = (amount: number) =>
    new Intl.NumberFormat("en-ZA", {
      style: "currency",
      currency: "ZAR",
      maximumFractionDigits: 0,
    }).format(amount)

  const csrfToken = () =>
    document.cookie
      .split("; ")
      .find((cookie) => cookie.startsWith("csrf_token="))
      ?.split("=")[1] ?? ""

  const uploadAttachment = async (file: File) => {
    setAttachmentBusy(true)
    setAttachmentError(null)
    try {
      const form = new FormData()
      form.append("file", file)
      form.append("description", file.name)
      form.append("category", "other")
      const res = await fetch(`/api/patients/${patient.id}/attachments`, {
        method: "POST",
        headers: { "x-csrf-token": csrfToken() },
        body: form,
      })
      const body = (await res.json().catch(() => ({}))) as { error?: string }
      if (!res.ok) throw new Error(body.error ?? "Upload failed")
      await overviewQuery.refetch()
    } catch (error) {
      setAttachmentError(error instanceof Error ? error.message : "Upload failed")
    } finally {
      setAttachmentBusy(false)
      if (attachmentInputRef.current) attachmentInputRef.current.value = ""
    }
  }

  const deleteAttachment = async (attachmentId: string) => {
    if (!window.confirm("Delete this attachment from the patient chart? This cannot be undone.")) return
    setDeletingAttachmentId(attachmentId)
    setAttachmentError(null)
    try {
      const res = await fetch(
        `/api/patients/${patient.id}/attachments?attachmentId=${encodeURIComponent(attachmentId)}`,
        {
          method: "DELETE",
          headers: { "x-csrf-token": csrfToken() },
        }
      )
      const body = (await res.json().catch(() => ({}))) as { error?: string }
      if (!res.ok) throw new Error(body.error ?? "Delete failed")
      await overviewQuery.refetch()
    } catch (error) {
      setAttachmentError(error instanceof Error ? error.message : "Delete failed")
    } finally {
      setDeletingAttachmentId(null)
    }
  }

  return (
    <div className={compact ? "space-y-3" : "space-y-4"}>
      {!loading && overviewError ? (
        <p className="rounded-lg border border-rose-500/20 bg-rose-500/10 px-3 py-2 text-[11px] text-rose-200/90">
          Could not refresh chart data: {overviewError}
        </p>
      ) : null}

      {/* —— Chart snapshot chips —— */}
      <section>
        <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Chart snapshot</p>
        <div className="flex flex-wrap gap-1.5">
          {patient.medicalAidScheme ? (
            <span className="rounded-full bg-secondary px-2 py-0.5 text-[10px] text-muted-foreground/75">{patient.medicalAidScheme}</span>
          ) : null}
          {(patient.chronicConditions ?? []).slice(0, 4).map((c) => (
            <span key={c} className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] text-emerald-300/90">
              {c}
            </span>
          ))}
          {(patient.allergies ?? []).slice(0, 3).map((a) => (
            <span key={a} className="rounded-full bg-rose-500/10 px-2 py-0.5 text-[10px] text-rose-300/90">
              {a}
            </span>
          ))}
        </div>
        {(patient.currentMedications ?? []).length > 0 ? (
          <ul className="mt-2 space-y-0.5 text-[11px] text-muted-foreground/75">
            {(patient.currentMedications ?? []).slice(0, 5).map((m) => (
              <li key={m.id} className="truncate">
                <span className="text-foreground/80">{m.name}</span>
                {m.dosage ? <span className="text-muted-foreground"> · {m.dosage}</span> : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-[11px] text-muted-foreground">No current medications on file.</p>
        )}
      </section>

      {showActions ? (
        <div className="flex flex-wrap gap-2">
          {onNewVisit ? (
            <button
              type="button"
              onClick={onNewVisit}
              className="inline-flex items-center gap-1.5 rounded-full bg-secondary px-3 py-1.5 text-[11px] text-foreground/80 hover:bg-secondary"
            >
              <Stethoscope className="size-3.5" />
              New visit
            </button>
          ) : null}
          {onScribe ? (
            <button
              type="button"
              onClick={onScribe}
              className="inline-flex items-center gap-1.5 rounded-full bg-secondary px-3 py-1.5 text-[11px] text-foreground/70 hover:bg-secondary"
            >
              <Sparkle className="size-3.5" />
              Scribe
            </button>
          ) : null}
          {patient.phone ? (
            <a
              href={`tel:${patient.phone}`}
              className="inline-flex items-center gap-1.5 rounded-full bg-secondary px-3 py-1.5 text-[11px] text-foreground/70 hover:bg-secondary"
            >
              <Phone className="size-3.5" />
              Call
            </a>
          ) : null}
          {patient.phone ? (
            <a
              href={`sms:${patient.phone}`}
              className="inline-flex items-center gap-1.5 rounded-full bg-secondary px-3 py-1.5 text-[11px] text-foreground/70 hover:bg-secondary"
            >
              <ChatCircle className="size-3.5" />
              SMS
            </a>
          ) : null}
          <span className="inline-flex items-center gap-1.5 rounded-full bg-panel-muted px-3 py-1.5 text-[10px] text-muted-foreground">
            <Upload className="size-3.5" />
            Attach via assistant (⌘J)
          </span>
        </div>
      ) : null}

      {/* —— AI context —— */}
      <section className="rounded-2xl border border-violet-400/12 bg-gradient-to-b from-violet-500/[0.07] to-panel-muted p-3">
        <div className="flex items-center justify-between gap-2">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-violet-200/85">AI context</p>
            <p className="mt-0.5 text-[9px] text-violet-200/55">AI-generated synthesis · verify against the signed record</p>
          </div>
          <button
            type="button"
            onClick={() => regenerateRollup.mutate()}
            disabled={rollupBusy || !overview?.summaryCount}
            className="text-[10px] text-violet-300/90 hover:text-violet-200 disabled:opacity-40"
          >
            {rollupBusy ? "Refreshing…" : "Regenerate rollup"}
          </button>
        </div>
        {loading ? (
          <p className="mt-2 text-[11px] text-muted-foreground">Loading…</p>
        ) : !overview?.summaryCount ? (
          <p className="mt-2 text-[11px] text-muted-foreground">No AI visit summaries available for this patient yet.</p>
        ) : (
          <>
            {rollupBusy && !rollup ? (
              <p className="mt-2 text-[11px] text-muted-foreground">Synthesizing across recent visits…</p>
            ) : rollup ? (
              <p className="mt-2 text-[12px] leading-relaxed text-foreground/88">{rollup}</p>
            ) : (
              <p className="mt-2 text-[11px] text-muted-foreground">
                Multi-visit synthesis unavailable. The latest visit excerpt and chief complaint are shown below — use Regenerate
                to try again.
              </p>
            )}
            {overview.aiContext.latestChiefComplaint ? (
              <p className="mt-2 text-[11px] text-muted-foreground/80">
                <span className="font-medium text-violet-200/90">Latest chief complaint: </span>
                {overview.aiContext.latestChiefComplaint}
              </p>
            ) : null}
            {overview.aiContext.recentKeyFindings.length > 0 ? (
              <div className="mt-2 flex flex-wrap gap-1">
                {overview.aiContext.recentKeyFindings.slice(0, 6).map((k, i) => (
                  <span key={`${i}-${k.slice(0, 12)}`} className="rounded-md bg-secondary px-1.5 py-0.5 text-[9px] text-muted-foreground/75">
                    {k.length > 48 ? `${k.slice(0, 48)}…` : k}
                  </span>
                ))}
              </div>
            ) : null}
            {overview.aiContext.latestFollowUp ? (
              <p className="mt-2 border-t border-panel-border pt-2 text-[11px] text-amber-200/85">
                Follow-up: {overview.aiContext.latestFollowUp}
              </p>
            ) : null}
            {overview.aiContext.latestSummaryText ? (
              <blockquote className="mt-2 border-l-2 border-panel-border pl-2.5 text-[11px] leading-relaxed text-muted-foreground/70">
                {overview.aiContext.latestSummaryText.length > 280
                  ? `${overview.aiContext.latestSummaryText.slice(0, 280)}…`
                  : overview.aiContext.latestSummaryText}
              </blockquote>
            ) : null}
            <div className="mt-3 border-t border-panel-border pt-2.5">
              <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-violet-200/80">
                Generated documents
              </p>
              {generatedDocs.length === 0 ? (
                <p className="text-[11px] text-muted-foreground/70">No generated documents yet.</p>
              ) : (
                <div className="space-y-1.5">
                  {generatedDocs.map((doc) => (
                    <div
                      key={doc.id}
                      className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-2 rounded-lg border border-panel-border bg-panel-muted/55 px-2 py-1.5"
                    >
                      <span className="truncate text-[11px] font-medium text-foreground/85">{doc.label}</span>
                      <span className="rounded-full bg-secondary px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-muted-foreground/85">
                        {doc.status.replace(/_/g, " ")}
                      </span>
                      <span className="text-[10px] text-muted-foreground">
                        {new Date(doc.updatedAt).toLocaleDateString("en-ZA", {
                          month: "short",
                          day: "numeric",
                        })}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </section>

      {/* —— Appointments & visits —— */}
      <section>
        <div className="mb-1.5 flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            <CalendarBlank className="size-3.5 text-muted-foreground" />
            Appointments & visits
          </div>
          {onOpenCalendar && overview?.appointments.length ? (
            <button
              type="button"
              onClick={onOpenCalendar}
              className="shrink-0 text-[10px] font-medium text-violet-300/90 hover:text-violet-200"
            >
              Open calendar
            </button>
          ) : null}
        </div>
        {loading ? (
          <p className="text-[11px] text-muted-foreground">Loading…</p>
        ) : !overview?.appointments.length ? (
          <p className="text-[11px] text-muted-foreground">No appointments on file for this patient.</p>
        ) : (
          <ul className="space-y-2">
            {overview.appointments.map((a) => {
              const open = Boolean(expandedAppts[a.id])
              const sum = a.encounter_summary
              return (
                <li key={a.id} className="rounded-xl border border-panel-border bg-panel-muted">
                  <button
                    type="button"
                    onClick={() => toggleAppt(a.id)}
                    className="flex w-full items-start gap-2 p-2.5 text-left"
                  >
                    {open ? (
                      <CaretDown className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
                    ) : (
                      <CaretRight className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="text-[11px] font-medium text-foreground/85">
                        {fmtApptWhen(a.appt_date, a.start_time)}
                      </p>
                      <p className="text-[10px] text-muted-foreground">
                        {a.status}
                        {a.reason ? ` · ${a.reason}` : ""}
                      </p>
                      {sum && !open ? (
                        <p className="mt-1 line-clamp-2 text-[10px] text-muted-foreground/65">
                          {sum.chief_complaint ? (
                            <span className="text-violet-200/80">{sum.chief_complaint} — </span>
                          ) : null}
                          {sum.summary_text.length > 120 ? `${sum.summary_text.slice(0, 120)}…` : sum.summary_text}
                        </p>
                      ) : null}
                      {!sum && a.linked_consult_id ? (
                        <p className="mt-1 text-[10px] text-amber-200/60">AI summary generating…</p>
                      ) : null}
                    </div>
                  </button>
                  {open && sum ? (
                    <div className="border-t border-panel-border px-3 pb-3 pt-0">
                      {sum.chief_complaint ? (
                        <div className="flex items-center justify-between gap-2 pt-2">
                          <p className="text-[11px] font-medium text-violet-200/90">{sum.chief_complaint}</p>
                          <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[9px] font-medium text-emerald-300/85">
                            <SealCheck className="size-3" weight="fill" />
                            Clinician signed
                          </span>
                        </div>
                      ) : null}
                      <p className="mt-1 text-[11px] leading-relaxed text-foreground/75">{sum.summary_text}</p>
                      {sum.key_findings.length > 0 ? (
                        <ul className="mt-2 list-inside list-disc text-[10px] text-muted-foreground/70">
                          {sum.key_findings.slice(0, 5).map((kf, i) => (
                            <li key={i}>{kf}</li>
                          ))}
                        </ul>
                      ) : null}
                      {sum.follow_up ? (
                        <p className="mt-2 text-[10px] text-amber-200/80">Follow-up: {sum.follow_up}</p>
                      ) : null}
                    </div>
                  ) : null}
                  {open && !sum ? (
                    <p className="border-t border-panel-border px-3 pb-3 pt-2 text-[10px] text-muted-foreground">
                      No signed summary linked to this visit yet.
                    </p>
                  ) : null}
                </li>
              )
            })}
          </ul>
        )}
      </section>

      {/* —— Billing —— */}
      <section>
        <div className="mb-1.5 flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            <ClipboardText className="size-3.5 text-muted-foreground" />
            Billing
          </div>
          {onOpenBilling && overview && (overview.claims.length > 0 || overview.invoices.length > 0) ? (
            <button
              type="button"
              onClick={onOpenBilling}
              className="shrink-0 text-[10px] font-medium text-violet-300/90 hover:text-violet-200"
            >
              Open billing
            </button>
          ) : null}
        </div>
        {loading ? (
          <p className="text-[11px] text-muted-foreground">Loading…</p>
        ) : !overview?.claims.length && !overview?.invoices.length ? (
          <p className="text-[11px] text-muted-foreground">No claims or invoices linked to this patient yet.</p>
        ) : (
          <div className="space-y-2">
            {overview.claims.slice(0, 4).map((claim) => (
              <button
                key={claim.id}
                type="button"
                onClick={onOpenBilling}
                disabled={!onOpenBilling}
                className={cn(
                  "w-full rounded-xl border border-panel-border bg-panel-muted p-2.5 text-left transition-colors",
                  onOpenBilling ? "hover:border-ring hover:bg-panel-muted" : "cursor-default"
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-[11px] font-medium text-foreground/85">
                      Claim {claim.id.slice(0, 8)}
                      {claim.tx_nbr ? <span className="ml-1 font-mono text-[9px] text-muted-foreground"> · TX {claim.tx_nbr}</span> : null}
                    </p>
                    <p className="text-[10px] text-muted-foreground">
                      {new Date(claim.created_at).toLocaleDateString()} · {fmtMoney(claim.total_amount)}
                      {typeof claim.adjudication_outcome === "string" && claim.adjudication_outcome.trim() ? (
                        <span className="text-cyan-200/75">
                          {" "}
                          · {claim.adjudication_outcome.replace(/_/g, " ")}
                        </span>
                      ) : null}
                      {typeof claim.patient_responsibility_zar === "number" && claim.patient_responsibility_zar > 0 ? (
                        <span className="text-amber-200/80">
                          {" "}
                          · patient {fmtMoney(claim.patient_responsibility_zar)}
                        </span>
                      ) : null}
                    </p>
                  </div>
                  <span className="rounded-full bg-secondary px-2 py-0.5 text-[9px] font-medium uppercase text-muted-foreground/80">
                    {claim.status}
                  </span>
                </div>
              </button>
            ))}
            {overview.invoices.slice(0, 4).map((invoice) => (
              <button
                key={invoice.id}
                type="button"
                onClick={onOpenBilling}
                disabled={!onOpenBilling}
                className={cn(
                  "w-full rounded-xl border border-panel-border bg-panel-muted p-2.5 text-left transition-colors",
                  onOpenBilling ? "hover:border-ring hover:bg-panel-muted" : "cursor-default"
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-[11px] font-medium text-foreground/85">{invoice.invoice_number}</p>
                    <p className="text-[10px] text-muted-foreground">
                      {new Date(invoice.created_at).toLocaleDateString()} · {fmtMoney(invoice.total_cents / 100)}
                      {invoice.amount_paid_cents > 0 ? (
                        <span className="text-emerald-300/75"> · paid {fmtMoney(invoice.amount_paid_cents / 100)}</span>
                      ) : null}
                    </p>
                  </div>
                  <span className="rounded-full bg-secondary px-2 py-0.5 text-[9px] font-medium uppercase text-muted-foreground/80">
                    {invoice.status}
                  </span>
                </div>
              </button>
            ))}
          </div>
        )}
      </section>

      {/* —— Files —— */}
      <section>
        <div className="mb-1.5 flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            <FileArrowUp className="size-3.5 text-muted-foreground" />
            Documents
          </div>
          <div>
            <input
              ref={attachmentInputRef}
              type="file"
              accept=".pdf,.jpg,.jpeg,.png,.webp,.heic,.txt"
              className="sr-only"
              onChange={(event) => {
                const file = event.target.files?.[0]
                if (file) void uploadAttachment(file)
              }}
            />
            <button
              type="button"
              disabled={attachmentBusy}
              onClick={() => attachmentInputRef.current?.click()}
              className="inline-flex items-center gap-1 rounded-lg border border-panel-border px-2 py-1 text-[10px] font-medium text-foreground/75 hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
            >
              {attachmentBusy ? <SpinnerGap className="size-3 animate-spin" /> : <Upload className="size-3" />}
              {attachmentBusy ? "Uploading…" : "Upload"}
            </button>
          </div>
        </div>
        {attachmentError ? (
          <p role="alert" className="mb-2 rounded-lg bg-rose-500/10 px-2 py-1.5 text-[10px] text-rose-300">
            {attachmentError}
          </p>
        ) : null}
        {loading ? (
          <p className="text-[11px] text-muted-foreground">Loading…</p>
        ) : !overview?.attachments.length ? (
          <p className="text-[11px] text-muted-foreground">No chart documents uploaded yet.</p>
        ) : (
          <ul className="space-y-1.5">
            {overview.attachments.slice(0, 12).map((f) => (
              <li
                key={f.id}
                className="flex items-center justify-between gap-2 rounded-lg border border-panel-border bg-panel-muted/50 px-2 py-1.5"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[11px] text-foreground/75">
                    {f.description || f.storage_path.split("/").pop() || "File"}
                  </p>
                  <p className="text-[9px] text-muted-foreground">
                    {categoryLabel(f.category) ?? f.mime}
                    {" · "}
                    {new Date(f.created_at).toLocaleDateString()}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  {f.signedUrl ? (
                    <a
                      href={f.signedUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="rounded px-1.5 py-1 text-[10px] text-violet-300/90 hover:bg-secondary hover:text-violet-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      Open
                    </a>
                  ) : null}
                  <button
                    type="button"
                    disabled={deletingAttachmentId === f.id}
                    onClick={() => void deleteAttachment(f.id)}
                    aria-label={`Delete ${f.description || "attachment"}`}
                    className="inline-flex size-7 items-center justify-center rounded text-muted-foreground hover:bg-rose-500/10 hover:text-rose-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
                  >
                    {deletingAttachmentId === f.id ? (
                      <SpinnerGap className="size-3 animate-spin" />
                    ) : (
                      <Trash className="size-3" />
                    )}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* —— Chart history —— */}
      <section>
        <div className="mb-1.5 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
          <ClipboardText className="size-3.5 text-muted-foreground" />
          Chart history
        </div>
        {loading ? (
          <p className="text-[11px] text-muted-foreground">Loading…</p>
        ) : (
          <div className="space-y-2">
            {(overview?.chartFacts ?? []).length === 0 && (overview?.notes ?? []).length === 0 ? (
              <p className="text-[11px] text-muted-foreground">No promoted findings or quick notes yet.</p>
            ) : null}
            {(overview?.chartFacts ?? []).slice(0, 8).map((f) => (
              <div key={f.id} className="rounded-lg border border-panel-border bg-panel-muted/50 px-2.5 py-1.5">
                <p className="text-[9px] uppercase tracking-wider text-muted-foreground">{f.domain.replace(/_/g, " ")}</p>
                <p className="text-[11px] text-foreground/70">{f.summary}</p>
                <p className="text-[9px] text-muted-foreground">{new Date(f.created_at).toLocaleString()}</p>
              </div>
            ))}
            {(overview?.notes ?? []).map((n) => (
              <div key={n.id} className="rounded-lg border border-amber-500/10 bg-amber-500/[0.04] px-2.5 py-1.5">
                <p className="text-[9px] uppercase tracking-wider text-amber-200/50">{n.source} note</p>
                <p className="text-[11px] text-foreground/75">{n.body}</p>
                <p className="text-[9px] text-muted-foreground">{new Date(n.created_at).toLocaleString()}</p>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* —— All visit summaries —— */}
      {overview && overview.encounterSummaries.length > 0 ? (
        <section>
          <p className="mb-2 text-[10px] font-medium uppercase tracking-[0.18em] text-muted-foreground">All visit summaries</p>
          <ul className="space-y-2">
            {overview.encounterSummaries.map((s) => (
              <li
                key={s.id}
                className="rounded-xl border border-panel-border bg-panel-muted p-2.5 text-[11px] leading-relaxed text-foreground/70"
              >
                <p className="mb-1 text-[9px] uppercase tracking-wider text-muted-foreground">
                  {new Date(s.created_at).toLocaleString()}
                </p>
                {s.chief_complaint ? (
                  <p className="mb-1 font-medium text-violet-200/85">{s.chief_complaint}</p>
                ) : null}
                <p className="text-foreground/80">{s.summary_text}</p>
                {s.follow_up ? (
                  <p className="mt-1.5 border-t border-panel-border pt-1.5 text-[10px] text-amber-200/80">
                    Follow-up: {s.follow_up}
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  )
}

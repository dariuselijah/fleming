"use client"

import { Camera, CheckCircle, IdentificationCard, SpinnerGap, X } from "@phosphor-icons/react"
import type { ReactNode } from "react"
import { useEffect, useMemo, useRef, useState } from "react"

type CaptureSlot = "idDocument" | "medicalAidCard"

type CaptureState = {
  file: File | null
  previewUrl: string | null
}

const INITIAL_CAPTURES: Record<CaptureSlot, CaptureState> = {
  idDocument: { file: null, previewUrl: null },
  medicalAidCard: { file: null, previewUrl: null },
}

export function PatientScanMobile({ token }: { token: string }) {
  const [captures, setCaptures] = useState(INITIAL_CAPTURES)
  const previewUrlsRef = useRef<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [sent, setSent] = useState(false)
  const [fatalError, setFatalError] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      setError(null)
      setFatalError(null)
      try {
        const res = await fetch(`/api/patient-scan/${encodeURIComponent(token)}`, { cache: "no-store" })
        const json = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(json.error || "This scan link is not available.")
        if (!cancelled) setSent(json.session?.status === "submitted")
      } catch (e) {
        if (!cancelled) setFatalError(e instanceof Error ? e.message : "Could not open scan link.")
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [token])

  useEffect(() => {
    const urls = previewUrlsRef.current
    return () => {
      for (const url of urls) URL.revokeObjectURL(url)
      urls.clear()
    }
  }, [])

  const ready = useMemo(() => Boolean(captures.idDocument.file || captures.medicalAidCard.file), [captures])

  const setFile = (slot: CaptureSlot, file: File | null) => {
    setCaptures((current) => {
      if (current[slot].previewUrl) {
        URL.revokeObjectURL(current[slot].previewUrl)
        previewUrlsRef.current.delete(current[slot].previewUrl)
      }
      const previewUrl = file ? URL.createObjectURL(file) : null
      if (previewUrl) previewUrlsRef.current.add(previewUrl)
      return {
        ...current,
        [slot]: {
          file,
          previewUrl,
        },
      }
    })
  }

  const submit = async () => {
    if (!ready) {
      setError("Capture at least one document first.")
      return
    }
    setSubmitting(true)
    setError(null)
    try {
      const body = new FormData()
      if (captures.idDocument.file) body.append("idDocument", captures.idDocument.file)
      if (captures.medicalAidCard.file) body.append("medicalAidCard", captures.medicalAidCard.file)
      const res = await fetch(`/api/patient-scan/${encodeURIComponent(token)}`, {
        method: "POST",
        body,
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json.error || "Could not send scans.")
      setSent(true)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not send scans.")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <main className="min-h-dvh bg-[#050606] px-5 py-6 text-white">
      <div className="mx-auto flex min-h-[calc(100dvh-3rem)] max-w-md flex-col">
        <header className="mb-6 rounded-[2rem] border border-white/10 bg-white/[0.04] p-5 shadow-2xl shadow-emerald-500/10">
          <p className="text-[11px] font-semibold uppercase tracking-[0.32em] text-emerald-300/80">Fleming Smart Scan</p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight">Capture patient cards</h1>
          <p className="mt-2 text-sm leading-6 text-white/50">
            This phone is only used to send document photos to reception. The patient record is confirmed on the
            practice computer.
          </p>
        </header>

        {loading ? (
          <StateCard icon={<SpinnerGap className="size-6 animate-spin" />} title="Opening secure scan" />
        ) : fatalError ? (
          <StateCard icon={<X className="size-6" />} title="Scan unavailable" detail={fatalError} tone="error" />
        ) : sent ? (
          <StateCard
            icon={<CheckCircle className="size-7" weight="fill" />}
            title="Sent to reception"
            detail="You can return this phone. The receptionist will confirm or edit the details on the web app."
            tone="success"
          />
        ) : (
          <>
            <section className="grid gap-3">
              <CaptureCard
                title="ID document"
                detail="Capture the front of the ID card, smart ID, passport, or driver's licence."
                value={captures.idDocument}
                onChange={(file) => setFile("idDocument", file)}
              />
              <CaptureCard
                title="Medical aid card"
                detail="Capture the side with scheme, member number, dependent code, and plan."
                value={captures.medicalAidCard}
                onChange={(file) => setFile("medicalAidCard", file)}
              />
            </section>

            {error ? <p className="mt-4 rounded-2xl bg-red-500/10 px-4 py-3 text-sm text-red-200">{error}</p> : null}

            <button
              type="button"
              disabled={!ready || submitting}
              onClick={() => void submit()}
              className="mt-5 flex w-full items-center justify-center gap-2 rounded-2xl bg-emerald-400 px-5 py-4 text-sm font-bold text-black shadow-lg shadow-emerald-400/20 transition disabled:cursor-not-allowed disabled:opacity-40"
            >
              {submitting ? <SpinnerGap className="size-4 animate-spin" /> : <CheckCircle className="size-4" weight="bold" />}
              {submitting ? "Processing scans..." : "Send to reception"}
            </button>

            <p className="mt-auto pt-6 text-center text-[11px] leading-5 text-white/30">
              Photos are processed for registration details and are not editable on this device.
            </p>
          </>
        )}
      </div>
    </main>
  )
}

function CaptureCard({
  title,
  detail,
  value,
  onChange,
}: {
  title: string
  detail: string
  value: CaptureState
  onChange: (file: File | null) => void
}) {
  return (
    <div className="rounded-[1.75rem] border border-white/10 bg-white/[0.035] p-4">
      <div className="flex gap-4">
        <div className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-emerald-400/10 text-emerald-300">
          <IdentificationCard className="size-6" />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-semibold">{title}</h2>
          <p className="mt-1 text-xs leading-5 text-white/45">{detail}</p>
        </div>
      </div>

      {value.previewUrl ? (
        <div className="mt-4 overflow-hidden rounded-2xl border border-white/10 bg-black">
          <img src={value.previewUrl} alt={`${title} preview`} className="max-h-64 w-full object-contain" />
        </div>
      ) : null}

      <div className="mt-4 flex gap-2">
        <label className="flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-2xl bg-white/[0.08] px-4 py-3 text-xs font-semibold text-white/80">
          <Camera className="size-4" weight="bold" />
          {value.file ? "Retake" : "Open camera"}
          <input
            type="file"
            accept="image/*"
            capture="environment"
            className="sr-only"
            onChange={(e) => onChange(e.target.files?.[0] ?? null)}
          />
        </label>
        {value.file ? (
          <button
            type="button"
            onClick={() => onChange(null)}
            className="rounded-2xl border border-white/10 px-4 py-3 text-xs font-semibold text-white/50"
          >
            Clear
          </button>
        ) : null}
      </div>
    </div>
  )
}

function StateCard({
  icon,
  title,
  detail,
  tone = "neutral",
}: {
  icon: ReactNode
  title: string
  detail?: string
  tone?: "neutral" | "success" | "error"
}) {
  return (
    <div className="flex flex-1 items-center justify-center">
      <div className="w-full rounded-[2rem] border border-white/10 bg-white/[0.04] p-8 text-center">
        <div
          className={[
            "mx-auto flex size-14 items-center justify-center rounded-2xl",
            tone === "success" ? "bg-emerald-400/15 text-emerald-300" : "",
            tone === "error" ? "bg-red-500/15 text-red-200" : "",
            tone === "neutral" ? "bg-white/[0.06] text-white/60" : "",
          ].join(" ")}
        >
          {icon}
        </div>
        <h2 className="mt-5 text-xl font-semibold">{title}</h2>
        {detail ? <p className="mt-2 text-sm leading-6 text-white/45">{detail}</p> : null}
      </div>
    </div>
  )
}

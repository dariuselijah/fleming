"use client"

import { useEffect, useState } from "react"

export default function VerifyRxPage({ params }: { params: Promise<{ token: string }> }) {
  const [token, setToken] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [result, setResult] = useState<{
    valid?: boolean
    expired?: boolean
    dispensed?: boolean
    revoked?: boolean
    practiceName?: string
    prescriberName?: string
    issuedAt?: string
    error?: string
  } | null>(null)

  useEffect(() => {
    void params.then((p) => setToken(p.token))
  }, [params])

  useEffect(() => {
    if (!token) return
    let cancelled = false
    void fetch(`/api/verify/rx/${encodeURIComponent(token)}`)
      .then((r) => r.json())
      .then((j) => {
        if (!cancelled) setResult(j)
      })
      .catch(() => {
        if (!cancelled) setResult({ valid: false, error: "Could not verify" })
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [token])

  const issued = result?.issuedAt
    ? new Date(result.issuedAt).toLocaleDateString("en-ZA", { year: "numeric", month: "long", day: "numeric" })
    : null

  return (
    <div className="flex min-h-dvh items-center justify-center bg-slate-50 px-4 py-12 dark:bg-slate-950">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-indigo-600">Prescription verification</p>
        {loading ? (
          <p className="mt-4 text-sm text-slate-500">Checking…</p>
        ) : result?.valid ? (
          <>
            <h1 className="mt-3 text-2xl font-semibold text-emerald-700">Valid prescription</h1>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">{result.practiceName}</p>
            {issued && <p className="mt-1 text-sm text-slate-500">Issued {issued}</p>}
            {result.prescriberName && (
              <p className="mt-1 text-sm text-slate-500">Prescriber: {result.prescriberName}</p>
            )}
          </>
        ) : (
          <>
            <h1 className="mt-3 text-2xl font-semibold text-red-600">Not verified</h1>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
              {result?.expired
                ? "This verification link has expired."
                : result?.revoked
                  ? "This prescription has been revoked."
                  : result?.dispensed
                    ? "This prescription was already marked dispensed."
                    : result?.error ?? "This code could not be verified."}
            </p>
            {result?.practiceName && (
              <p className="mt-2 text-sm text-slate-500">Practice: {result.practiceName}</p>
            )}
          </>
        )}
        <p className="mt-8 text-[11px] leading-relaxed text-slate-600 dark:text-slate-300">
          This page confirms the prescription was issued by the listed practice. It does not display patient details or
          medication information.
        </p>
      </div>
    </div>
  )
}

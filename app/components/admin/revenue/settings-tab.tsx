"use client"

import { GearSix } from "@phosphor-icons/react"
import { BentoTile } from "../bento-tile"
import { MedikreditProviderSettingsForm } from "@/app/components/medikredit/medikredit-provider-settings-form"
import { usePracticeCrypto } from "@/lib/clinical-workspace/practice-crypto-context"
import { fetchClient } from "@/lib/fetch"
import { useEffect, useState } from "react"

type BrandingForm = {
  vat_number: string
  hpcsa_number: string
  bhf_number: string
  address: string
  phone: string
  email: string
  website: string
  logo_storage_path?: string
}

export function SettingsTab() {
  const { practiceId } = usePracticeCrypto()
  const [branding, setBranding] = useState<BrandingForm>({
    vat_number: "",
    hpcsa_number: "",
    bhf_number: "",
    address: "",
    phone: "",
    email: "",
    website: "",
  })
  const [message, setMessage] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    void fetchClient("/api/practice/branding")
      .then((r) => r.json())
      .then((json: Partial<BrandingForm>) => {
        if (cancelled) return
        setBranding((current) => ({
          ...current,
          ...Object.fromEntries(Object.entries(json).map(([k, v]) => [k, typeof v === "string" ? v : ""])),
        }))
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [])

  const saveBranding = async () => {
    setMessage(null)
    const res = await fetchClient("/api/practice/branding", {
      method: "PATCH",
      body: JSON.stringify(branding),
    })
    const j = (await res.json().catch(() => ({}))) as { error?: string }
    setMessage(res.ok ? "Branding saved." : j.error ?? "Could not save branding.")
  }

  const uploadLogo = async (file: File | null) => {
    if (!file) return
    const body = new FormData()
    body.set("file", file)
    const res = await fetchClient("/api/practice/branding/logo", { method: "POST", body })
    const j = (await res.json().catch(() => ({}))) as { error?: string; logoStoragePath?: string }
    if (!res.ok) setMessage(j.error ?? "Logo upload failed.")
    else {
      setBranding((b) => ({ ...b, logo_storage_path: j.logoStoragePath }))
      setMessage("Logo uploaded.")
    }
  }

  return (
    <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
      <BentoTile title="Medical aid settings" subtitle="MediKredit practice credentials" icon={<GearSix className="size-4 text-blue-400" weight="fill" />}>
        {practiceId ? (
          <MedikreditProviderSettingsForm practiceId={practiceId} variant="settings" />
        ) : (
          <p className="text-[11px] text-muted-foreground">Practice context is loading.</p>
        )}
      </BentoTile>
      <BentoTile title="Billing automation" subtitle="Provider status and dunning defaults">
        <div className="space-y-3 text-[11px] text-muted-foreground">
          <p>Polar and Stitch settlement health is surfaced in Reconciliation.</p>
          <p>Dunning cadence: 7, 14 and 30 days after due date for issued/sent/partial invoices.</p>
          <p>Sequence prefixes are managed by `practice_billing_sequences` and the `next_billing_number` RPC.</p>
        </div>
      </BentoTile>
      <BentoTile title="Practice branding" subtitle="Logo and identifiers for sleek PDFs" className="xl:col-span-2">
        <div className="grid gap-3 md:grid-cols-3">
          <label className="rounded-2xl border border-dashed border-border bg-muted/25 p-4 text-[11px] text-muted-foreground dark:border-white/[0.08]">
            <span className="block font-semibold text-foreground">Practice logo</span>
            <span className="mt-1 block">PNG or JPG for invoices, receipts and statements.</span>
            <input type="file" accept="image/*" onChange={(e) => void uploadLogo(e.target.files?.[0] ?? null)} className="mt-3 text-[11px]" />
            {branding.logo_storage_path ? <span className="mt-2 block text-emerald-400">Uploaded</span> : null}
          </label>
          {([
            ["vat_number", "VAT number"],
            ["hpcsa_number", "HPCSA number"],
            ["bhf_number", "BHF number"],
            ["phone", "Phone"],
            ["email", "Email"],
            ["website", "Website"],
          ] as const).map(([key, label]) => (
            <label key={key} className="block">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</span>
              <input
                value={branding[key] ?? ""}
                onChange={(e) => setBranding((b) => ({ ...b, [key]: e.target.value }))}
                className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm dark:border-white/[0.08] dark:bg-black/20"
              />
            </label>
          ))}
          <label className="block md:col-span-3">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Address</span>
            <textarea
              value={branding.address}
              onChange={(e) => setBranding((b) => ({ ...b, address: e.target.value }))}
              className="mt-1 min-h-20 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm dark:border-white/[0.08] dark:bg-black/20"
            />
          </label>
        </div>
        <div className="mt-4 flex items-center gap-3">
          <button type="button" onClick={() => void saveBranding()} className="rounded-xl bg-emerald-500/20 px-4 py-2 text-[11px] font-semibold text-emerald-400">
            Save branding
          </button>
          {message ? <p className="text-[11px] text-muted-foreground">{message}</p> : null}
        </div>
      </BentoTile>
    </div>
  )
}

"use client"

import { useWorkspace, type PracticeProvider, type PracticeStaffRole } from "@/lib/clinical-workspace"
import { usePracticeCrypto } from "@/lib/clinical-workspace/practice-crypto-context"
import { decryptJson, encryptJson } from "@/lib/crypto/practice-e2ee"
import { createClient } from "@/lib/supabase/client"
import { cn } from "@/lib/utils"
import { Buildings, ShieldCheck, UsersThree, LockKey, Info, FloppyDisk, Spinner } from "@phosphor-icons/react"
import { BentoTile } from "./bento-tile"
import { useUserPreferences } from "@/lib/user-preference-store/provider"
import { useCallback, useEffect, useState } from "react"

const ROLE_LABEL: Record<PracticeStaffRole, string> = {
  owner: "Owner",
  physician: "Physician",
  nurse: "Nurse",
  admin: "Admin",
  reception: "Reception",
}

const CREDENTIAL_LABEL = {
  verified: "Verified",
  pending: "Pending review",
  expired: "Expired",
  not_on_file: "Not on file",
} as const

const RBAC_MATRIX: { area: string; owner: boolean; physician: boolean; nurse: boolean; admin: boolean; reception: boolean }[] = [
  { area: "Clinical chart & scribe", owner: true, physician: true, nurse: true, admin: false, reception: false },
  { area: "Sign consults & claims", owner: true, physician: true, nurse: false, admin: false, reception: false },
  { area: "Billing & remittance", owner: true, physician: true, nurse: false, admin: true, reception: true },
  { area: "Inventory & stock takes", owner: true, physician: false, nurse: true, admin: true, reception: false },
  { area: "Practice settings & team", owner: true, physician: false, nurse: false, admin: true, reception: false },
  { area: "HL7 / integration keys", owner: true, physician: false, nurse: false, admin: true, reception: false },
]

function CredentialBadge({ status }: { status?: PracticeProvider["credentialStatus"] }) {
  const st = status ?? "not_on_file"
  return (
    <span
      className={cn(
        "rounded-full px-2 py-0.5 text-[9px] font-semibold",
        st === "verified" && "bg-[#00E676]/12 text-[#00E676]",
        st === "pending" && "bg-[#FFC107]/12 text-[#FFC107]",
        st === "expired" && "bg-[#EF5350]/12 text-[#EF5350]",
        st === "not_on_file" && "bg-white/[0.06] text-white/35"
      )}
    >
      {CREDENTIAL_LABEL[st]}
    </span>
  )
}

type BillingExtras = {
  practiceNoBhf?: string
  timezone?: string
  hl7Endpoint?: string
}

export function BentoSettings() {
  const { practiceProviders } = useWorkspace()
  const { practiceId, dekKey, unlocked } = usePracticeCrypto()
  const { updatePreferences } = useUserPreferences()
  const [practiceName, setPracticeName] = useState("")
  const [providerName, setProviderName] = useState("")
  const [bhf, setBhf] = useState("")
  const [timezone, setTimezone] = useState("Africa/Johannesburg")
  const [hl7Endpoint, setHl7Endpoint] = useState("")
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)

  useEffect(() => {
    if (!practiceId || !dekKey || !unlocked) return
    const sb = createClient()
    if (!sb) return
    let cancelled = false
    setLoading(true)
    setLoadError(null)
    ;(async () => {
      try {
        const { data: pr, error: e1 } = await sb.from("practices").select("name").eq("id", practiceId).maybeSingle()
        if (e1) throw e1
        const { data: bill, error: e2 } = await sb
          .from("practice_billing_settings")
          .select("provider_name, billing_ciphertext, billing_iv")
          .eq("practice_id", practiceId)
          .maybeSingle()
        if (e2) throw e2
        if (cancelled) return
        if (pr?.name) setPracticeName(String(pr.name))
        if (bill?.provider_name) setProviderName(String(bill.provider_name))
        if (bill?.billing_ciphertext && bill?.billing_iv) {
          try {
            const extra = await decryptJson<BillingExtras>(
              dekKey,
              String(bill.billing_ciphertext),
              String(bill.billing_iv)
            )
            setBhf(extra.practiceNoBhf ?? "")
            setTimezone(extra.timezone ?? "Africa/Johannesburg")
            setHl7Endpoint(extra.hl7Endpoint ?? "")
          } catch {
            /* first load or legacy row */
          }
        }
      } catch (e) {
        if (!cancelled) setLoadError(e instanceof Error ? e.message : "Failed to load settings")
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [practiceId, dekKey, unlocked])

  const handleSavePractice = useCallback(async () => {
    if (!practiceId || !dekKey) return
    const sb = createClient()
    if (!sb) return
    setSaving(true)
    try {
      const extras: BillingExtras = {
        practiceNoBhf: bhf || undefined,
        timezone: timezone || undefined,
        hl7Endpoint: hl7Endpoint || undefined,
      }
      const { ciphertext, iv } = await encryptJson(dekKey, extras)
      const { error: e1 } = await sb.from("practices").update({ name: practiceName }).eq("id", practiceId)
      if (e1) throw e1
      const { error: e2 } = await sb.from("practice_billing_settings").upsert(
        {
          practice_id: practiceId,
          provider_name: providerName || practiceName || "Practice",
          billing_ciphertext: ciphertext,
          billing_iv: iv,
          billing_version: 1,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "practice_id" }
      )
      if (e2) throw e2
      const nameOk = practiceName.trim().length > 2
      const bhfOk = bhf.trim().length > 2
      if (nameOk && bhfOk) {
        try {
          await updatePreferences({ practiceProfileCompleted: true })
        } catch (prefErr) {
          console.warn("[BentoSettings] practice profile preference", prefErr)
        }
      }
    } catch (e) {
      console.warn("[BentoSettings] save", e)
    } finally {
      setSaving(false)
    }
  }, [bhf, dekKey, hl7Endpoint, practiceId, practiceName, providerName, timezone, updatePreferences])

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-4 pb-8">
      <div>
        <h1 className="text-lg font-semibold text-foreground">Practice settings</h1>
        <p className="mt-0.5 text-[11px] text-white/35">
          Profile, team credentials, and role capabilities. Wire to your IdP for production authentication.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <BentoTile
          title="Practice profile"
          subtitle="Identifiers shown on claims and messages (encrypted extras stored with your practice key)"
          icon={<Buildings className="size-4 text-white/30" />}
        >
          {!practiceId || !unlocked ? (
            <p className="text-[11px] text-white/35">
              Unlock the clinical workspace to load and edit practice identifiers.
            </p>
          ) : loadError ? (
            <p className="text-[11px] text-red-400">{loadError}</p>
          ) : loading ? (
            <div className="flex items-center gap-2 text-[11px] text-white/40">
              <Spinner className="size-4 animate-spin" />
              Loading…
            </div>
          ) : (
            <div className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block">
                  <span className="text-[9px] font-medium uppercase tracking-wider text-white/25">
                    Legal / trading name
                  </span>
                  <input
                    value={practiceName}
                    onChange={(e) => setPracticeName(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-white/[0.08] bg-white/[0.04] px-2.5 py-1.5 text-[11px] text-white outline-none focus:border-white/20"
                  />
                </label>
                <label className="block">
                  <span className="text-[9px] font-medium uppercase tracking-wider text-white/25">
                    Provider display (claims)
                  </span>
                  <input
                    value={providerName}
                    onChange={(e) => setProviderName(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-white/[0.08] bg-white/[0.04] px-2.5 py-1.5 text-[11px] text-white outline-none focus:border-white/20"
                  />
                </label>
                <label className="block">
                  <span className="text-[9px] font-medium uppercase tracking-wider text-white/25">
                    Practice No. / BHF (E2EE blob)
                  </span>
                  <input
                    value={bhf}
                    onChange={(e) => setBhf(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-white/[0.08] bg-white/[0.04] px-2.5 py-1.5 text-[11px] text-white outline-none focus:border-white/20"
                  />
                </label>
                <label className="block">
                  <span className="text-[9px] font-medium uppercase tracking-wider text-white/25">Timezone</span>
                  <input
                    value={timezone}
                    onChange={(e) => setTimezone(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-white/[0.08] bg-white/[0.04] px-2.5 py-1.5 text-[11px] text-white outline-none focus:border-white/20"
                  />
                </label>
                <label className="block sm:col-span-2">
                  <span className="text-[9px] font-medium uppercase tracking-wider text-white/25">
                    HL7 inbound endpoint (E2EE blob)
                  </span>
                  <input
                    value={hl7Endpoint}
                    onChange={(e) => setHl7Endpoint(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-white/[0.08] bg-white/[0.04] px-2.5 py-1.5 text-[11px] text-white outline-none focus:border-white/20"
                  />
                </label>
              </div>
              <button
                type="button"
                disabled={!unlocked || !practiceId || saving}
                onClick={() => void handleSavePractice()}
                className="flex items-center gap-2 rounded-lg border border-white/[0.1] bg-white/[0.06] px-3 py-1.5 text-[11px] font-medium text-white/80 transition-colors hover:bg-white/[0.1] disabled:opacity-40"
              >
                {saving ? <Spinner className="size-3.5 animate-spin" /> : <FloppyDisk className="size-3.5" />}
                Save practice details
              </button>
            </div>
          )}
        </BentoTile>

        <BentoTile
          title="Security note"
          subtitle="Role-based access"
          icon={<LockKey className="size-4 text-white/30" />}
        >
          <div className="flex gap-2 rounded-xl border border-blue-500/15 bg-blue-500/5 px-3 py-2.5">
            <Info className="mt-0.5 size-4 shrink-0 text-blue-400" weight="fill" />
            <p className="text-[10px] leading-relaxed text-white/45">
              This workspace previews RBAC in the matrix below. Connect Supabase Auth, Clerk, or your hospital AD and map
              groups to these roles — no patient data should rely on UI-only checks.
            </p>
          </div>
        </BentoTile>
      </div>

      <BentoTile
        title="Team & credentials"
        subtitle="Doctors, nurses, and admins — HPCSA / council numbers"
        icon={<UsersThree className="size-4 text-white/30" />}
      >
        <div className="overflow-x-auto rounded-xl border border-white/[0.06]">
          <table className="w-full text-left text-[11px]">
            <thead>
              <tr className="border-b border-white/[0.06] text-[9px] font-semibold uppercase tracking-wider text-white/30">
                <th className="px-3 py-2">Name</th>
                <th className="px-3 py-2">Role</th>
                <th className="px-3 py-2">Council / HPCSA</th>
                <th className="px-3 py-2">BHF</th>
                <th className="px-3 py-2">Credentials</th>
              </tr>
            </thead>
            <tbody>
              {practiceProviders.map((p) => (
                <tr key={p.id} className="border-b border-white/[0.04] text-white/65 last:border-0">
                  <td className="px-3 py-2.5">
                    <p className="font-medium text-foreground">{p.name}</p>
                    {p.specialty && <p className="text-[9px] text-white/30">{p.specialty}</p>}
                    {p.email && <p className="text-[9px] text-white/25">{p.email}</p>}
                  </td>
                  <td className="px-3 py-2.5 text-white/50">{p.role ? ROLE_LABEL[p.role] : "—"}</td>
                  <td className="px-3 py-2.5 font-mono text-[10px] text-white/45">{p.hpcsaNumber ?? "—"}</td>
                  <td className="px-3 py-2.5 font-mono text-[10px] text-white/45">{p.bhfNumber ?? "—"}</td>
                  <td className="px-3 py-2.5">
                    <CredentialBadge status={p.credentialStatus} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </BentoTile>

      <BentoTile
        title="Role capabilities"
        subtitle="What each role can do in admin & clinical"
        icon={<ShieldCheck className="size-4 text-white/30" />}
      >
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-[10px]">
            <thead>
              <tr className="border-b border-white/[0.06] text-[9px] font-semibold uppercase tracking-wider text-white/30">
                <th className="py-2 pr-3">Area</th>
                <th className="px-1 py-2 text-center">Owner</th>
                <th className="px-1 py-2 text-center">Dr</th>
                <th className="px-1 py-2 text-center">Nurse</th>
                <th className="px-1 py-2 text-center">Admin</th>
                <th className="px-1 py-2 text-center">Reception</th>
              </tr>
            </thead>
            <tbody>
              {RBAC_MATRIX.map((row) => (
                <tr key={row.area} className="border-b border-white/[0.04] text-white/50 last:border-0">
                  <td className="py-2 pr-3 text-white/60">{row.area}</td>
                  <td className="px-1 py-2 text-center">{row.owner ? "✓" : "—"}</td>
                  <td className="px-1 py-2 text-center">{row.physician ? "✓" : "—"}</td>
                  <td className="px-1 py-2 text-center">{row.nurse ? "✓" : "—"}</td>
                  <td className="px-1 py-2 text-center">{row.admin ? "✓" : "—"}</td>
                  <td className="px-1 py-2 text-center">{row.reception ? "✓" : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </BentoTile>
    </div>
  )
}

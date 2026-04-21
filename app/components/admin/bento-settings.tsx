"use client"

import { useWorkspace, type PracticeProvider, type PracticeStaffRole } from "@/lib/clinical-workspace"
import { usePracticeProfileForm } from "@/lib/practice/use-practice-profile-form"
import { cn } from "@/lib/utils"
import { Buildings, ShieldCheck, UsersThree, LockKey, Info, FloppyDisk, Spinner } from "@phosphor-icons/react"
import { BentoTile } from "./bento-tile"

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

/** Retained for embedded use; primary practice editing is in Settings → General. */
export function BentoSettings() {
  const { practiceProviders } = useWorkspace()
  const {
    practiceId,
    unlocked,
    practiceName,
    setPracticeName,
    providerName,
    setProviderName,
    bhf,
    setBhf,
    timezone,
    setTimezone,
    hl7Endpoint,
    setHl7Endpoint,
    loading,
    saving,
    loadError,
    save,
  } = usePracticeProfileForm()

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
                onClick={() => void save()}
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

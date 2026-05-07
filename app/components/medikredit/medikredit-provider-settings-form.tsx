"use client"

import { cn } from "@/lib/utils"
import { upsertMedikreditProviderPatch } from "@/lib/medikredit/upsert-medikredit-provider-patch"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { toast } from "@/components/ui/toast"
import { ClockCounterClockwise, FloppyDisk, Plugs, Spinner } from "@phosphor-icons/react"
import { motion } from "motion/react"
import { useCallback, useEffect, useState } from "react"

/** MediKredit-certified defaults when fields are left blank (Perkily integration). */
export const MK_DEFAULT_VENDOR_ID = "2038"
export const MK_DEFAULT_PRESCRIBER_MEM = "0000002"
export const MK_DEFAULT_WORKS = "001"
export const MK_DEFAULT_PC = "01"
export const MK_DEFAULT_VEND_VER = "1"

const springSnappy = { type: "spring" as const, stiffness: 420, damping: 28 }

type MedikreditProviderSettingsFormProps = {
  practiceId: string | null
  variant: "onboarding" | "settings"
  /** Shown above the form when switch clearance was submitted (onboarding). */
  waitingBanner?: {
    waitingSince: string
    waitDays: number
  } | null
  /**
   * Called after every successful save. Onboarding uses this to move the checklist to `waiting` once.
   */
  onSuccessfulSave?: () => void
}

export function MedikreditProviderSettingsForm({
  practiceId,
  variant,
  waitingBanner,
  onSuccessfulSave,
}: MedikreditProviderSettingsFormProps) {
  const comfy = variant === "onboarding"
  const [saving, setSaving] = useState(false)
  const [providerName, setProviderName] = useState("")
  const [vendorId, setVendorId] = useState(MK_DEFAULT_VENDOR_ID)
  const [bhf, setBhf] = useState("")
  const [hpc, setHpc] = useState("")
  const [groupNum, setGroupNum] = useState("")
  const [pcNum, setPcNum] = useState(MK_DEFAULT_PC)
  const [worksNum, setWorksNum] = useState(MK_DEFAULT_WORKS)
  const [prescriberAcc, setPrescriberAcc] = useState(MK_DEFAULT_PRESCRIBER_MEM)
  const [vendorVer, setVendorVer] = useState(MK_DEFAULT_VEND_VER)
  const [discipline, setDiscipline] = useState("")
  const [useTest, setUseTest] = useState(false)
  useEffect(() => {
    if (!practiceId) return
    const sb = createClient()
    if (!sb) return
    let cancelled = false
    void (async () => {
      const [prRes, mkRes] = await Promise.all([
        sb.from("practices").select("name").eq("id", practiceId).maybeSingle(),
        sb.from("medikredit_providers").select("*").eq("practice_id", practiceId).maybeSingle(),
      ])
      if (cancelled) return
      const practiceName = prRes.data?.name?.trim() ?? ""
      const mk = mkRes.data
      setProviderName(mk?.provider_display_name?.trim() || practiceName)
      if (!mk) return
      setVendorId(mk.vendor_id?.trim() || MK_DEFAULT_VENDOR_ID)
      setBhf(mk.bhf_number ?? "")
      setHpc(mk.hpc_number ?? "")
      setGroupNum(mk.group_practice_number ?? "")
      setPcNum(mk.pc_number?.trim() || MK_DEFAULT_PC)
      setWorksNum(mk.works_number?.trim() || MK_DEFAULT_WORKS)
      setPrescriberAcc(mk.prescriber_mem_acc_nbr?.trim() || MK_DEFAULT_PRESCRIBER_MEM)
      setVendorVer(mk.vendor_version?.trim() || MK_DEFAULT_VEND_VER)
      {
        const extras =
          mk.extra_settings && typeof mk.extra_settings === "object" && !Array.isArray(mk.extra_settings)
            ? (mk.extra_settings as Record<string, unknown>)
            : {}
        const d = mk.discipline ?? (typeof extras.discipline === "string" ? extras.discipline : "")
        setDiscipline(d)
      }
      setUseTest(mk.use_test_provider ?? false)
    })()
    return () => {
      cancelled = true
    }
  }, [practiceId])

  const canSubmit =
    bhf.trim().length > 2 &&
    hpc.trim().length > 2 &&
    vendorId.trim().length > 0 &&
    groupNum.trim().length > 0

  const handleSave = useCallback(async () => {
    if (!canSubmit || !practiceId) return
    const sb = createClient()
    if (!sb) return
    setSaving(true)
    try {
      const gpn = groupNum.trim()
      await upsertMedikreditProviderPatch(sb, practiceId, {
        provider_display_name: providerName.trim() || null,
        vendor_id: vendorId.trim() || MK_DEFAULT_VENDOR_ID,
        bhf_number: bhf.trim(),
        hpc_number: hpc.trim(),
        group_practice_number: gpn.length > 0 ? gpn : null,
        pc_number: pcNum.trim() || MK_DEFAULT_PC,
        works_number: worksNum.trim() || MK_DEFAULT_WORKS,
        prescriber_mem_acc_nbr: prescriberAcc.trim() || MK_DEFAULT_PRESCRIBER_MEM,
        vendor_version: vendorVer.trim() || MK_DEFAULT_VEND_VER,
        discipline: discipline.trim() || null,
        use_test_provider: useTest,
      })
      onSuccessfulSave?.()
      toast({ title: "MediKredit settings saved", status: "success" })
    } catch (e) {
      console.warn("[MedikreditProviderSettingsForm]", e)
      toast({
        title: "Could not save MediKredit settings",
        description: e instanceof Error ? e.message : "Unknown error",
        status: "error",
      })
    } finally {
      setSaving(false)
    }
  }, [
    bhf,
    canSubmit,
    discipline,
    groupNum,
    hpc,
    onSuccessfulSave,
    pcNum,
    practiceId,
    prescriberAcc,
    providerName,
    useTest,
    vendorId,
    vendorVer,
    worksNum,
  ])

  const formBody = (
    <>
      {variant === "onboarding" ? (
        <p className="text-sm text-muted-foreground">
          These values populate MediKredit XML (TX@grp_prac, VEND with vend_id / wks_nbr / pc_nbr / vend_ver / hb_id, MEM, claims).
          Defaults match Perkily&apos;s registered integration where not set. Submit when ready — switch clearance typically follows in
          3–4 business days.
        </p>
      ) : null}

      <div className={cn("grid gap-4", variant === "settings" ? "sm:grid-cols-2" : "sm:grid-cols-2")}>
        <OnboardingOrSettingsField
          variant={variant}
          label="Provider name"
          value={providerName}
          onChange={setProviderName}
          placeholder="Perkily Medical Practice"
          comfortable={comfy}
          id="mk-provider-name"
        />
        <OnboardingOrSettingsField
          variant={variant}
          label="BHF number *"
          value={bhf}
          onChange={setBhf}
          placeholder="1548972"
          comfortable={comfy}
          id="mk-bhf"
        />
        <OnboardingOrSettingsField
          variant={variant}
          label="HPC number *"
          value={hpc}
          onChange={setHpc}
          placeholder="MP0426822"
          comfortable={comfy}
          id="mk-hpc"
        />
        <OnboardingOrSettingsField
          variant={variant}
          label="Vendor ID *"
          value={vendorId}
          onChange={setVendorId}
          placeholder={MK_DEFAULT_VENDOR_ID}
          comfortable={comfy}
          id="mk-vendor-id"
        />
        <OnboardingOrSettingsField
          variant={variant}
          label="Group practice number *"
          value={groupNum}
          onChange={setGroupNum}
          placeholder="1438298"
          comfortable={comfy}
          id="mk-group"
        />
        <OnboardingOrSettingsField
          variant={variant}
          label="PC number"
          value={pcNum}
          onChange={setPcNum}
          placeholder={MK_DEFAULT_PC}
          comfortable={comfy}
          id="mk-pc"
        />
        <OnboardingOrSettingsField
          variant={variant}
          label="Works number"
          value={worksNum}
          onChange={setWorksNum}
          placeholder={MK_DEFAULT_WORKS}
          comfortable={comfy}
          id="mk-works"
        />
        <OnboardingOrSettingsField
          variant={variant}
          label="Vendor version"
          value={vendorVer}
          onChange={setVendorVer}
          placeholder={MK_DEFAULT_VEND_VER}
          comfortable={comfy}
          id="mk-vend-ver"
        />
        <OnboardingOrSettingsField
          variant={variant}
          label="Prescriber account number *"
          value={prescriberAcc}
          onChange={setPrescriberAcc}
          placeholder={MK_DEFAULT_PRESCRIBER_MEM}
          comfortable={comfy}
          id="mk-prescriber"
        />
        <div className={variant === "settings" ? "space-y-1.5 sm:col-span-2" : "sm:col-span-2"}>
          <OnboardingOrSettingsField
            variant={variant}
            label="Medprax discipline code"
            value={discipline}
            onChange={setDiscipline}
            placeholder="e.g. GP or 014"
            comfortable={comfy}
            id="mk-discipline"
          />
          <p
            className={cn(
              "mt-1 text-[11px]",
              variant === "onboarding" ? "text-muted-foreground/75 dark:text-white/25" : "text-muted-foreground"
            )}
          >
            Used for Medprax contract tariff lookups. Leave blank to use environment default.
          </p>
        </div>
      </div>

      {variant === "onboarding" ? (
        <p className="text-[11px] text-muted-foreground/75 dark:text-white/25">
          Prescriber MEM account is stored for claim/DOCTOR elements; VEND uses vendor ID, works, PC, and version for eligibility (RJ 2420
          if missing).
        </p>
      ) : null}

      {variant === "settings" ? (
        <div className="flex items-center justify-between gap-4 rounded-xl border border-border/60 bg-muted/20 px-4 py-3">
          <div>
            <p className="text-sm font-medium">Use test provider fixtures</p>
            <p className="text-muted-foreground text-xs">Send MediKredit test flags when your switch account is in UAT</p>
          </div>
          <Switch checked={useTest} onCheckedChange={setUseTest} />
        </div>
      ) : (
        <ToggleRow
          label="Use test provider fixtures"
          description="Send MediKredit test flags when your switch account is in UAT"
          enabled={useTest}
          onToggle={() => setUseTest(!useTest)}
          comfortable={comfy}
        />
      )}

      {!practiceId && variant === "onboarding" ? (
        <p className="text-sm text-amber-700 dark:text-amber-200/80">Join or create a practice first to save MediKredit settings.</p>
      ) : null}

      {variant === "onboarding" ? (
        <SaveButton
          saving={saving}
          disabled={!canSubmit || !practiceId || saving}
          onClick={() => void handleSave()}
          label={waitingBanner ? "Save changes" : "Submit to Medikredit"}
          comfortable={comfy}
        />
      ) : (
        <Button
          type="button"
          className="w-full sm:w-auto"
          disabled={!canSubmit || !practiceId || saving}
          onClick={() => void handleSave()}
        >
          {saving ? <Spinner className="size-4 animate-spin" /> : <FloppyDisk className="size-4" />}
          Save MediKredit settings
        </Button>
      )}
    </>
  )

  if (variant === "settings") {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Plugs className="size-5" />
            MediKredit & switch
          </CardTitle>
          <CardDescription>
            Group practice, vendor, works, and PC numbers populate eligibility and claim XML (TX <code className="text-xs">grp_prac</code>,{" "}
            <code className="text-xs">VEND</code>). Edit any time; saved values are used for API calls.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">{formBody}</CardContent>
      </Card>
    )
  }

  return (
    <div className={cn("space-y-5", comfy && "max-w-2xl")}>
      {waitingBanner ? (
        <motion.div
          initial={{ opacity: 0, scale: 0.97 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={springSnappy}
          className="flex flex-col items-center gap-3 rounded-2xl border border-amber-400/20 bg-amber-400/5 px-4 py-5 text-center"
        >
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ duration: 10, repeat: Infinity, ease: "linear" }}
            className="flex size-12 items-center justify-center rounded-full border border-amber-400/25 bg-amber-400/10"
          >
            <ClockCounterClockwise className="size-6 text-amber-400" />
          </motion.div>
          <div>
            <p className="text-base font-medium text-foreground">Verification in progress</p>
            <p className="mt-1 max-w-md text-sm text-muted-foreground">
              Submitted to Medikredit for switch clearance. We&apos;ll email you when it clears. You can still update the fields below —
              changes save to your practice.
            </p>
          </div>
          <p className="flex items-center gap-2 text-xs text-muted-foreground">
            <Spinner className="size-3.5 animate-spin" />
            ~
            {(() => {
              const daysPassed = Math.floor(
                (Date.now() - new Date(waitingBanner.waitingSince).getTime()) / 86_400_000
              )
              const remaining = Math.max(0, (waitingBanner.waitDays ?? 4) - daysPassed)
              return (
                <>
                  {remaining} day{remaining !== 1 ? "s" : ""} remaining (typical 3–4)
                </>
              )
            })()}
          </p>
        </motion.div>
      ) : null}
      {formBody}
    </div>
  )
}

function OnboardingOrSettingsField({
  variant,
  label,
  value,
  onChange,
  placeholder,
  comfortable,
  id,
}: {
  variant: "onboarding" | "settings"
  label: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
  comfortable?: boolean
  id: string
}) {
  if (variant === "settings") {
    return (
      <div className="space-y-1.5">
        <Label htmlFor={id}>{label}</Label>
        <Input id={id} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />
      </div>
    )
  }
  return (
    <label className="block">
      <span className={cn("font-medium uppercase tracking-wider text-muted-foreground", comfortable ? "text-[10px]" : "text-[9px]")}>
        {label}
      </span>
      <input
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={cn(
          "mt-1.5 w-full rounded-xl border border-input bg-background text-foreground outline-none placeholder:text-muted-foreground/45 focus:border-primary/35 focus:ring-2 focus:ring-primary/15 dark:border-white/[0.1] dark:bg-white/[0.04] dark:text-white dark:placeholder:text-white/20",
          comfortable ? "px-3.5 py-2.5 text-sm" : "px-2.5 py-2 text-[11px]"
        )}
      />
    </label>
  )
}

function ToggleRow({
  label,
  description,
  enabled,
  onToggle,
  comfortable,
}: {
  label: string
  description: string
  enabled: boolean
  onToggle: () => void
  comfortable?: boolean
}) {
  return (
    <motion.button
      type="button"
      onClick={onToggle}
      whileHover={{ backgroundColor: "hsl(var(--muted) / 0.55)" }}
      whileTap={{ scale: 0.995 }}
      className={cn(
        "flex w-full items-center gap-4 rounded-2xl border border-border bg-background text-left transition-colors dark:border-white/[0.07] dark:bg-white/[0.02]",
        comfortable ? "p-4" : "p-2.5"
      )}
    >
      <div className="min-w-0 flex-1">
        <p className={cn("font-medium text-foreground", comfortable ? "text-sm" : "text-[11px]")}>{label}</p>
        <p className={cn("text-muted-foreground", comfortable ? "mt-1 text-xs" : "text-[9px]")}>{description}</p>
      </div>
      <div
        className={cn(
          "relative flex shrink-0 items-center rounded-full transition-colors",
          comfortable ? "h-7 w-[3.25rem] p-0.5" : "h-5 w-9 p-px",
          enabled ? "bg-primary" : "bg-muted dark:bg-white/10"
        )}
      >
        <motion.span
          className={cn("block rounded-full bg-white shadow-md", comfortable ? "size-6" : "size-4")}
          initial={false}
          animate={{ x: enabled ? (comfortable ? 24 : 18) : 0 }}
          transition={springSnappy}
        />
      </div>
    </motion.button>
  )
}

function SaveButton({
  disabled,
  saving,
  onClick,
  label = "Save & continue",
  comfortable,
}: {
  disabled: boolean
  saving: boolean
  onClick: () => void
  label?: string
  comfortable?: boolean
}) {
  return (
    <motion.button
      type="button"
      disabled={disabled}
      onClick={onClick}
      whileHover={{ scale: disabled ? 1 : 1.01 }}
      whileTap={{ scale: disabled ? 1 : 0.98 }}
      className={cn(
        "flex w-full max-w-md items-center justify-center gap-2 rounded-xl bg-primary font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-40 dark:bg-white dark:text-zinc-950 dark:hover:bg-white/95",
        comfortable ? "py-3 text-sm" : "py-2 text-[11px]"
      )}
    >
      {saving && <Spinner className="size-4 animate-spin" />}
      {label}
    </motion.button>
  )
}

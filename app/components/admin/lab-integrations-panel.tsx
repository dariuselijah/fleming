"use client"

import { cn } from "@/lib/utils"
import {
  LAB_PARTNER_DEFS,
  useLabIntegrationStore,
  type LabIntegrationStatus,
} from "@/lib/clinical-workspace/lab-integration-store"
import { Plugs } from "@phosphor-icons/react"

export function LabIntegrationsPanel() {
  const statuses = useLabIntegrationStore((s) => s.statuses)
  const setPartnerStatus = useLabIntegrationStore((s) => s.setPartnerStatus)

  return (
    <div className="mt-4 border-t border-white/[0.06] pt-3">
      <div className="mb-2 flex items-center gap-1.5">
        <Plugs className="size-3 text-white/30" />
        <span className="text-[10px] font-medium text-white/40">Lab integrations</span>
      </div>
      <p className="mb-2.5 text-[9px] leading-snug text-white/22">
        Status reflects your practice setup (saved in this browser). Switch when a partner is contracted or live.
      </p>
      <div className="space-y-1.5">
        {LAB_PARTNER_DEFS.map((lab) => {
          const status = (statuses[lab.id] ?? "pending") as LabIntegrationStatus
          return (
            <div key={lab.id} className="flex items-center justify-between gap-2">
              <span className="text-[11px] text-white/60">{lab.label}</span>
              <select
                value={status}
                onChange={(e) => setPartnerStatus(lab.id, e.target.value as LabIntegrationStatus)}
                className={cn(
                  "max-w-[120px] cursor-pointer rounded-lg border border-white/[0.08] bg-white/[0.04] px-2 py-1 text-[9px] font-medium outline-none focus:border-white/[0.14]",
                  "text-white/70"
                )}
              >
                <option value="active">Active</option>
                <option value="pending">Pending</option>
                <option value="inactive">Inactive</option>
              </select>
            </div>
          )
        })}
      </div>
    </div>
  )
}

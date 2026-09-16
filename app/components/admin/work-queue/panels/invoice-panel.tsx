"use client"

import type { WorkQueueItem } from "@/lib/admin/work-queue-types"
import { useWorkQueueStore } from "@/lib/admin/work-queue-store"
import { useWorkspace, useWorkspaceStore } from "@/lib/clinical-workspace"
import { fetchClient } from "@/lib/fetch"
import {
  PanelBody,
  PanelFooter,
  PanelGhostButton,
  PanelHeader,
  PanelPrimaryButton,
  PanelSecondaryButton,
  PanelShell,
} from "@/app/components/ui/panel-primitives"
import { CurrencyDollar } from "@phosphor-icons/react"
import { useState } from "react"
import { toast } from "sonner"

export function InvoicePanel({ item }: { item: WorkQueueItem }) {
  const payload = item.payload.type === "invoice" ? item.payload.data : null
  const resolveItem = useWorkQueueStore((s) => s.resolveItem)
  const incrementAiResolved = useWorkQueueStore((s) => s.incrementAiResolved)
  const { setAdminTab } = useWorkspace()
  const patients = useWorkspaceStore((s) => s.patients)
  const [busy, setBusy] = useState(false)
  const [copying, setCopying] = useState(false)

  if (!payload) return null

  const { invoice, dueCents, overdue } = payload
  const patientName = invoice.patient_snapshot?.name ?? item.patientName ?? "Patient"

  const sendPaymentLinkSms = async () => {
    setBusy(true)
    try {
      const patientPhone =
        invoice.patient_snapshot?.phone ??
        (invoice.patient_id ? patients.find((p) => p.id === invoice.patient_id)?.phone : undefined)
      const res = await fetchClient(`/api/billing/invoices/${invoice.id}/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          channels: ["sms"],
          issueFirst: invoice.status === "draft",
          ...(patientPhone ? { phoneE164: patientPhone } : {}),
        }),
      })
      const j = (await res.json().catch(() => ({}))) as { error?: string }
      if (!res.ok) {
        toast.error(j.error ?? "Could not send payment link")
        return
      }
      toast.success("Payment link sent by SMS")
      resolveItem(item.id)
      incrementAiResolved()
    } finally {
      setBusy(false)
    }
  }

  const copyPaymentLink = async () => {
    setCopying(true)
    try {
      const res = await fetchClient(`/api/billing/invoices/${invoice.id}/portal-link`, { method: "POST" })
      const j = (await res.json().catch(() => ({}))) as { portalUrl?: string; error?: string }
      if (!res.ok || !j.portalUrl) {
        toast.error(j.error ?? "Could not create link")
        return
      }
      await navigator.clipboard.writeText(j.portalUrl)
      toast.success("Payment link copied")
    } finally {
      setCopying(false)
    }
  }

  return (
    <PanelShell>
      <PanelHeader
        icon={<CurrencyDollar className="size-4 text-emerald-400" weight="fill" />}
        title={patientName}
        subtitle={`${invoice.invoice_number ?? "Invoice"} · ${overdue ? "Overdue" : "Outstanding"}`}
      />

      <PanelBody>
        <div className="rounded-xl border border-panel-border bg-panel-muted/40 px-4 py-3 text-center">
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Amount due</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums text-foreground">
            R{(dueCents / 100).toLocaleString(undefined, { minimumFractionDigits: 2 })}
          </p>
          {invoice.due_at && (
            <p className="mt-1 text-[10px] text-muted-foreground">
              Due {new Date(invoice.due_at).toLocaleDateString()}
            </p>
          )}
        </div>

        {item.aiActionLine && (
          <p className="text-[11px] leading-relaxed text-muted-foreground">{item.aiActionLine}</p>
        )}
      </PanelBody>

      <PanelFooter>
        <PanelPrimaryButton disabled={busy} onClick={() => void sendPaymentLinkSms()}>
          {busy ? "Sending…" : "Send payment link (SMS)"}
        </PanelPrimaryButton>
        <PanelSecondaryButton disabled={copying} onClick={() => void copyPaymentLink()}>
          {copying ? "Copying…" : "Copy payment link"}
        </PanelSecondaryButton>
        <PanelSecondaryButton onClick={() => setAdminTab("billing")}>Open in billing</PanelSecondaryButton>
        <PanelGhostButton
          onClick={() => {
            resolveItem(item.id)
            incrementAiResolved()
          }}
        >
          Mark collected
        </PanelGhostButton>
      </PanelFooter>
    </PanelShell>
  )
}

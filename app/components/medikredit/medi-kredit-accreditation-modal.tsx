"use client"

import { Check, Copy, X } from "@phosphor-icons/react"
import { AnimatePresence, motion } from "motion/react"
import { useCallback, useState } from "react"
import type { FamilyDependentRow, MedikreditRemittanceMessage, MedikreditWarning } from "@/lib/medikredit/types"
import { cn } from "@/lib/utils"

function CopyableAuditBlock({
  label,
  hint,
  text,
}: {
  label: string
  hint?: string
  text: string
}) {
  const [copied, setCopied] = useState(false)
  const onCopy = useCallback(() => {
    void navigator.clipboard.writeText(text).then(() => {
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    })
  }, [text])

  return (
    <div>
      <div className="mb-1.5 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
          {hint ? <p className="mt-0.5 text-[10px] leading-snug text-muted-foreground">{hint}</p> : null}
        </div>
        <button
          type="button"
          onClick={onCopy}
          className="shrink-0 inline-flex items-center gap-1 rounded-md border border-border bg-muted px-2 py-1 text-[10px] font-medium text-foreground/70 transition-colors hover:bg-secondary hover:text-accent-foreground"
        >
          {copied ? <Check className="size-3.5 text-emerald-400" weight="bold" /> : <Copy className="size-3.5" />}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <pre className="max-h-52 overflow-auto whitespace-pre-wrap rounded-lg border border-border bg-background p-3 font-mono text-[10px] leading-relaxed text-emerald-200/70">
        {text}
      </pre>
    </div>
  )
}

export type MediKreditTransactionType = "eligibility" | "famcheck" | "claim" | "reversal"

export function MediKreditAccreditationModal({
  open,
  onClose,
  transactionType,
  title,
  rawXml,
  requestInnerXml,
  requestSoapEnvelope,
  responseRaw,
  res,
  txNbr,
  healthNetworkId,
  rejectionCode,
  rejectionDescription,
  remittanceMessages,
  warnings,
  dependents,
}: {
  open: boolean
  onClose: () => void
  transactionType: MediKreditTransactionType
  title?: string
  rawXml?: string
  /** Inner DOCUMENT XML sent (SOAP `request` / proxy `xmlData`). */
  requestInnerXml?: string
  /** Full SOAP envelope when the app talks HTTPS directly to MediKredit (omitted for CLINICAL_PROXY). */
  requestSoapEnvelope?: string
  /** Full raw HTTP body returned by MediKredit or the proxy. */
  responseRaw?: string
  res?: string
  txNbr?: string
  /** AUTHS@hnet — Jiffy / health network id on approved eligibility */
  healthNetworkId?: string
  rejectionCode?: string
  rejectionDescription?: string
  remittanceMessages?: MedikreditRemittanceMessage[]
  warnings?: MedikreditWarning[]
  dependents?: FamilyDependentRow[]
}) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal
          aria-labelledby="mk-acc-title"
        >
          <motion.div
            initial={{ scale: 0.96, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.96, opacity: 0 }}
            className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl border border-border bg-popover shadow-2xl"
          >
            <div className="flex items-center justify-between border-b border-border px-5 py-3">
              <div>
                <h2 id="mk-acc-title" className="text-sm font-semibold text-foreground">
                  {title ?? "MediKredit transaction"} · {transactionType}
                </h2>
                <p className="text-[10px] text-muted-foreground">Accreditation / audit view — raw switch data</p>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-secondary hover:text-accent-foreground"
                aria-label="Close"
              >
                <X className="size-4" />
              </button>
            </div>

            <div className="space-y-4 overflow-y-auto p-5 text-xs">
              <dl className="grid grid-cols-2 gap-2 text-[11px]">
                <div>
                  <dt className="text-muted-foreground">TX result (res)</dt>
                  <dd className="font-mono text-foreground/80">
                    {res ?? "—"}
                    {res === "A" && <span className="ml-2 text-emerald-400/90">Approved</span>}
                    {res === "R" && <span className="ml-2 text-rose-400/90">Rejected</span>}
                    {res === "P" && <span className="ml-2 text-amber-400/90">Pending</span>}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Transaction #</dt>
                  <dd className="font-mono text-foreground/80">{txNbr ?? "—"}</dd>
                </div>
                <div className="col-span-2">
                  <dt className="text-muted-foreground">HNet / Jiffy (AUTHS hnet)</dt>
                  <dd
                    className={cn(
                      "break-all font-mono",
                      healthNetworkId ? "text-emerald-200/85" : "text-muted-foreground"
                    )}
                  >
                    {healthNetworkId ?? "—"}
                  </dd>
                </div>
                {(rejectionCode || rejectionDescription) && (
                  <>
                    <div>
                      <dt className="text-muted-foreground">Rejection code</dt>
                      <dd className="text-rose-300/90">{rejectionCode ?? "—"}</dd>
                    </div>
                    <div className="col-span-2">
                      <dt className="text-muted-foreground">Rejection description</dt>
                      <dd className="text-rose-200/80">{rejectionDescription ?? "—"}</dd>
                    </div>
                  </>
                )}
              </dl>

              {dependents && dependents.length > 0 && (
                <div>
                  <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Dependents (famcheck)</p>
                  <ul className="space-y-1 rounded-lg border border-border bg-muted/40 p-2">
                    {dependents.map((d, i) => (
                      <li key={i} className="text-[11px] text-muted-foreground/85">
                        <span className="text-muted-foreground">dep_cd {d.dep_cd ?? "—"}</span> · {d.name ?? d.id_nbr ?? "—"}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {remittanceMessages && remittanceMessages.length > 0 && (
                <div>
                  <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">RMR</p>
                  <ul className="space-y-1">
                    {remittanceMessages.map((r, i) => (
                      <li key={i} className="rounded border border-border bg-muted/40 px-2 py-1 text-[11px]">
                        <span className="font-mono text-amber-200/80">{r.code}</span> — {r.description}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {warnings && warnings.length > 0 && (
                <div>
                  <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Warnings</p>
                  <ul className="space-y-1">
                    {warnings.map((w, i) => (
                      <li key={i} className={cn("text-[11px]", w.rmr_tp ? "text-amber-200/70" : "text-muted-foreground/70")}>
                        {w.cd && <span className="font-mono">{w.cd}</span>} {w.desc}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {(requestInnerXml || requestSoapEnvelope || responseRaw) && (
                <div className="space-y-4 border-t border-border pt-4">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Wire copy (audit)</p>
                  {requestInnerXml ? (
                    <CopyableAuditBlock
                      label="Request — inner DOCUMENT"
                      hint="This is the MediKredit DOCUMENT placed inside the SOAP &lt;request&gt; element (or sent as xmlData to your clinical proxy)."
                      text={requestInnerXml}
                    />
                  ) : null}
                  {requestSoapEnvelope ? (
                    <CopyableAuditBlock
                      label="Request — full SOAP envelope"
                      hint="Only when Fleming calls MEDIKREDIT_API_URL directly. With CLINICAL_PROXY_URL, the browser never builds this; the proxy forwards the inner DOCUMENT."
                      text={requestSoapEnvelope}
                    />
                  ) : null}
                  {responseRaw ? (
                    <CopyableAuditBlock
                      label="Response — full raw body"
                      hint="Exact reply body: direct SOAP response, or the proxy JSON `response` string when using CLINICAL_PROXY_URL."
                      text={responseRaw}
                    />
                  ) : null}
                </div>
              )}

              {rawXml && (
                <CopyableAuditBlock
                  label="Parsed reply fragment"
                  hint="Inner payload after SOAP unwrap — what the parser reads (may match plaintext switch lines, not full XML)."
                  text={rawXml}
                />
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

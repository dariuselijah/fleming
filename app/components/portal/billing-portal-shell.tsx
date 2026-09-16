import Link from "next/link"
import { formatZar } from "@/lib/billing/money"

export function BillingPortalShell(props: {
  practiceName: string
  token: string
  invoiceNumber: string
  totalCents: number
  amountPaidCents: number
  status: string
  lines: { description: string; amountCents: number }[]
}) {
  const due = props.totalCents - props.amountPaidCents
  const cardHref = `/api/portal/billing/card?token=${encodeURIComponent(props.token)}`
  const eftHref = `/api/portal/billing/eft?token=${encodeURIComponent(props.token)}`
  const paid = due <= 0 || props.status === "paid"

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-5">
      <div className="overflow-hidden rounded-3xl border border-border bg-card text-card-foreground shadow-panel">
        <div className="border-b border-border bg-muted/50 px-5 py-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Secure invoice</p>
              <h1 className="mt-1 text-lg font-semibold tracking-tight text-foreground">{props.practiceName}</h1>
              <p className="mt-0.5 font-mono text-xs text-muted-foreground">{props.invoiceNumber}</p>
            </div>
            <span className={`rounded-full px-3 py-1 text-xs font-semibold ${paid ? "bg-status-success/10 text-status-success-foreground dark:text-status-success" : "bg-status-warning/10 text-status-warning-foreground dark:text-status-warning"}`}>
              {paid ? "Paid" : props.status.replaceAll("_", " ")}
            </span>
          </div>
        </div>

        <div className="p-5">
          <div className="rounded-2xl bg-primary px-5 py-4 text-primary-foreground">
            <p className="text-xs font-medium opacity-55">Amount due</p>
            <p className="mt-1 text-4xl font-semibold tracking-tight tabular-nums">{formatZar(Math.max(0, due))}</p>
            <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
              <div className="rounded-xl bg-primary-foreground/10 px-3 py-2">
                <p className="opacity-50">Invoice total</p>
                <p className="mt-0.5 font-semibold tabular-nums">{formatZar(props.totalCents)}</p>
              </div>
              <div className="rounded-xl bg-primary-foreground/10 px-3 py-2">
                <p className="opacity-50">Paid</p>
                <p className="mt-0.5 font-semibold tabular-nums">{formatZar(props.amountPaidCents)}</p>
              </div>
            </div>
          </div>

          <div className="mt-5 rounded-2xl border border-border p-4">
            <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">What this covers</p>
            <ul className="divide-y divide-border text-sm">
              {props.lines.map((l, i) => (
                <li key={i} className="flex justify-between gap-4 py-2.5">
                  <span className="text-foreground/80">{l.description}</span>
                  <span className="shrink-0 tabular-nums text-muted-foreground">
                    {formatZar(l.amountCents)}
                  </span>
                </li>
              ))}
            </ul>
          </div>

          {due > 0 ? (
            <div className="mt-5 flex flex-col gap-3">
              <a
                href={cardHref}
                className="rounded-2xl bg-primary px-4 py-4 text-center text-sm font-semibold text-primary-foreground shadow-lg shadow-panel transition-transform hover:scale-[1.01]"
              >
                Pay securely with card
              </a>
              <a
                href={eftHref}
                className="rounded-2xl border border-border px-4 py-3 text-center text-sm font-medium text-foreground hover:bg-accent hover:text-accent-foreground"
              >
                Pay by instant EFT
              </a>
              <p className="text-center text-xs text-muted-foreground">Card payments are processed through the practice&apos;s secure checkout.</p>
            </div>
          ) : (
            <div className="mt-5 rounded-2xl border border-status-success/20 bg-status-success/10 px-4 py-4 text-center text-sm font-semibold text-status-success-foreground dark:text-status-success">
              This invoice is paid. Thank you.
            </div>
          )}
        </div>
      </div>

      <p className="text-center text-[11px] text-muted-foreground">
        <Link href="/" className="underline underline-offset-2">
          Contact {props.practiceName}
        </Link>
      </p>
    </div>
  )
}

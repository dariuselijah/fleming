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

  return (
    <div className="flex flex-col gap-6">
      <div className="rounded-2xl border border-zinc-200/80 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <p className="text-xs font-medium uppercase tracking-wider text-zinc-400">Invoice</p>
        <p className="mt-1 font-mono text-sm text-zinc-700 dark:text-zinc-200">{props.invoiceNumber}</p>
        <div className="mt-4 flex items-baseline justify-between gap-4">
          <span className="text-sm text-zinc-500">Amount due</span>
          <span className="text-2xl font-semibold tabular-nums text-zinc-900 dark:text-zinc-50">
            {formatZar(Math.max(0, due))}
          </span>
        </div>
        <p className="mt-2 text-xs text-zinc-400">Status: {props.status}</p>
      </div>

      <div className="rounded-2xl border border-zinc-200/80 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
        <p className="mb-3 text-xs font-medium uppercase tracking-wider text-zinc-400">Items</p>
        <ul className="space-y-2 text-sm">
          {props.lines.map((l, i) => (
            <li key={i} className="flex justify-between gap-4 border-b border-zinc-100 py-2 last:border-0 dark:border-zinc-800">
              <span className="text-zinc-700 dark:text-zinc-300">{l.description}</span>
              <span className="shrink-0 tabular-nums text-zinc-600 dark:text-zinc-400">
                {formatZar(l.amountCents)}
              </span>
            </li>
          ))}
        </ul>
      </div>

      {due > 0 ? (
        <div className="flex flex-col gap-3">
          <a
            href={cardHref}
            className="rounded-xl bg-zinc-900 px-4 py-3 text-center text-sm font-semibold text-white dark:bg-zinc-100 dark:text-zinc-900"
          >
            Pay with card (Apple Pay / Google Pay)
          </a>
          <a
            href={eftHref}
            className="rounded-xl border border-zinc-300 px-4 py-3 text-center text-sm font-medium text-zinc-800 dark:border-zinc-600 dark:text-zinc-200"
          >
            Pay with instant EFT / PayShap
          </a>
        </div>
      ) : (
        <p className="text-center text-sm text-emerald-600 dark:text-emerald-400">This invoice is paid. Thank you.</p>
      )}

      <p className="text-center text-[11px] text-zinc-400">
        <Link href="/" className="underline underline-offset-2">
          Contact {props.practiceName}
        </Link>
      </p>
    </div>
  )
}

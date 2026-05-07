import Link from "next/link"
import { headers } from "next/headers"

export default async function PortalSuccessPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>
  searchParams: Promise<{ invoice?: string; status?: string }>
}) {
  const { token } = await params
  const sp = await searchParams
  const h = await headers()
  const host = h.get("host")
  const proto = h.get("x-forwarded-proto") ?? "http"
  let verification: {
    verified?: boolean
    invoiceNumber?: string
    status?: string
    receiptUrl?: string | null
    error?: string
  } = {}
  try {
    const res = await fetch(`${proto}://${host}/api/portal/billing/verify?token=${encodeURIComponent(token)}`, {
      cache: "no-store",
    })
    verification = (await res.json()) as typeof verification
  } catch {
    verification = { verified: false, error: "Could not verify payment yet" }
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-lg flex-col justify-center gap-6 px-6 py-16">
      <h1 className="text-center text-2xl font-semibold">Payment status</h1>
      <p className="text-center text-sm text-zinc-600 dark:text-zinc-400">
        {verification.verified
          ? "Thank you. Payment is confirmed and your receipt is ready."
          : sp.status === "success"
            ? "Payment is being verified. If it settles, your receipt will be issued shortly."
            : "Payment was not completed. You can return to the invoice link to try again."}
      </p>
      {(verification.invoiceNumber || sp.invoice) && (
        <p className="text-center text-xs text-zinc-500">Invoice reference: {verification.invoiceNumber ?? sp.invoice}</p>
      )}
      {verification.receiptUrl && (
        <a
          href={verification.receiptUrl}
          className="rounded-xl bg-blue-600 px-4 py-2 text-center text-sm font-semibold text-white"
        >
          Download receipt
        </a>
      )}
      <Link
        href={`/portal/${encodeURIComponent(token)}`}
        className="text-center text-sm text-blue-600 underline underline-offset-2"
      >
        Back to portal
      </Link>
    </main>
  )
}

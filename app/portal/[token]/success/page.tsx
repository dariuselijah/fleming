import Link from "next/link"

export default async function PortalSuccessPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>
  searchParams: Promise<{ invoice?: string; status?: string }>
}) {
  const { token } = await params
  const sp = await searchParams

  return (
    <main className="mx-auto flex min-h-dvh max-w-lg flex-col justify-center gap-6 px-6 py-16">
      <h1 className="text-center text-2xl font-semibold">Payment status</h1>
      <p className="text-center text-sm text-zinc-600 dark:text-zinc-400">
        {sp.status === "success"
          ? "Thank you. If your payment succeeded, you will receive a receipt by email or SMS shortly."
          : "Payment was not completed. You can return to the invoice link to try again."}
      </p>
      {sp.invoice && (
        <p className="text-center text-xs text-zinc-500">Invoice reference: {sp.invoice}</p>
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

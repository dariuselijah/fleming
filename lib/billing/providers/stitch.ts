import { createHmac, timingSafeEqual } from "node:crypto"

/**
 * Stitch (South Africa) — instant EFT / PayShap.
 * Configure STITCH_CLIENT_ID + STITCH_CLIENT_SECRET; obtain OAuth token then create payment link.
 * When unset, returns a dry-run URL for local development.
 */

const STITCH_API = process.env.STITCH_API_URL?.trim() || "https://api.stitch.money/graphql"

export async function createStitchPaymentLink(opts: {
  amountCents: number
  currency: string
  invoiceId: string
  practiceId: string
  reference: string
  redirectUrl: string
}): Promise<{ paymentUrl: string; externalId: string }> {
  const clientId = process.env.STITCH_CLIENT_ID?.trim()
  const clientSecret = process.env.STITCH_CLIENT_SECRET?.trim()

  if (!clientId || !clientSecret || process.env.STITCH_DRY_RUN === "1") {
    const externalId = `stitch_dry_${opts.invoiceId.slice(0, 8)}`
    const u = new URL("https://secure.stitch.money/dry-run")
    u.searchParams.set("invoice", opts.invoiceId)
    u.searchParams.set("amount", String(opts.amountCents))
    return { paymentUrl: u.toString(), externalId }
  }

  const token = await getStitchAccessToken(clientId, clientSecret)
  const userInteraction = await createStitchUserInteraction(token, {
    amountCents: opts.amountCents,
    currency: opts.currency,
    reference: opts.reference,
    redirectUrl: opts.redirectUrl,
    externalId: opts.invoiceId,
  })

  return {
    paymentUrl: userInteraction.url,
    externalId: userInteraction.id,
  }
}

async function getStitchAccessToken(clientId: string, clientSecret: string): Promise<string> {
  const res = await fetch("https://secure.stitch.money/connect/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: clientId,
      client_secret: clientSecret,
      scope: "client_credentials",
    }),
  })
  const j = (await res.json()) as { access_token?: string; error?: string }
  if (!res.ok || !j.access_token) {
    throw new Error(`Stitch token: ${j.error ?? res.status}`)
  }
  return j.access_token
}

async function createStitchUserInteraction(
  token: string,
  opts: {
    amountCents: number
    currency: string
    reference: string
    redirectUrl: string
    externalId: string
  }
): Promise<{ id: string; url: string }> {
  const mutation = `
    mutation CreatePaymentRequest($input: PaymentInitiationRequestCreateInput!) {
      clientPaymentInitiationRequestCreate(input: $input) {
        paymentInitiationRequest { id url }
        userErrors { field message }
      }
    }
  `
  const res = await fetch(STITCH_API, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      query: mutation,
      variables: {
        input: {
          amount: { quantity: opts.amountCents / 100, currency: opts.currency },
          payerReference: opts.reference,
          beneficiaryReference: opts.externalId,
          merchant: { redirectUrl: opts.redirectUrl },
        },
      },
    }),
  })
  const j = (await res.json()) as {
    data?: {
      clientPaymentInitiationRequestCreate?: {
        paymentInitiationRequest?: { id?: string; url?: string }
        userErrors?: { message?: string }[]
      }
    }
    errors?: { message?: string }[]
  }
  const req = j.data?.clientPaymentInitiationRequestCreate?.paymentInitiationRequest
  const err = j.errors?.[0]?.message ?? j.data?.clientPaymentInitiationRequestCreate?.userErrors?.[0]?.message
  if (!req?.url || !req.id) {
    throw new Error(`Stitch payment link failed: ${err ?? "unknown"}`)
  }
  return { id: req.id, url: req.url }
}

export function verifyStitchWebhookSignature(
  rawBody: string,
  signatureHeader: string | null,
  secret: string
): boolean {
  if (!signatureHeader || !secret) return false
  const expected = createHmac("sha256", secret).update(rawBody, "utf8").digest("base64")
  try {
    const a = Buffer.from(expected, "utf8")
    const b = Buffer.from(signatureHeader.trim(), "utf8")
    if (a.length !== b.length) return false
    return timingSafeEqual(a, b)
  } catch {
    return false
  }
}

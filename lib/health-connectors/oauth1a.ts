import { createHmac, randomBytes } from "crypto"
import { getHealthConnectorById } from "./catalog"
import { readConnectorAccountAuth } from "./auth"
import { buildConnectorOAuthState, setConnectorStatusForUser } from "./server"
import type { HealthConnectorConnectResponse, HealthConnectorId } from "./types"

type OAuth1Method = "GET" | "POST"

function percentEncode(value: string): string {
  return encodeURIComponent(value)
    .replace(/[!'()*]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`)
}

function nonce(): string {
  return randomBytes(16).toString("hex")
}

function timestamp(): string {
  return Math.floor(Date.now() / 1000).toString()
}

function normalizeParameterPairs(params: Record<string, string>): string {
  return Object.entries(params)
    .sort(([keyA, valueA], [keyB, valueB]) =>
      keyA === keyB ? valueA.localeCompare(valueB) : keyA.localeCompare(keyB)
    )
    .map(([key, value]) => `${percentEncode(key)}=${percentEncode(value)}`)
    .join("&")
}

function baseUrlWithoutQuery(url: string): string {
  const parsed = new URL(url)
  return `${parsed.origin}${parsed.pathname}`
}

function parseFormEncoded(text: string): Record<string, string> {
  const output: Record<string, string> = {}
  const params = new URLSearchParams(text)
  for (const [key, value] of params.entries()) {
    output[key] = value
  }
  return output
}

function readCredential(
  connectorId: HealthConnectorId,
  matcher: RegExp
): string | null {
  const connector = getHealthConnectorById(connectorId)
  if (!connector) return null
  const requirement = connector.requiredCredentials.find((item) => matcher.test(item.env))
  if (!requirement) return null
  return process.env[requirement.env] || null
}

function buildOAuth1Header(input: {
  url: string
  method: OAuth1Method
  consumerKey: string
  consumerSecret: string
  token?: string
  tokenSecret?: string
  callback?: string
  verifier?: string
  extraBodyParams?: Record<string, string>
}): string {
  const oauthParams: Record<string, string> = {
    oauth_consumer_key: input.consumerKey,
    oauth_nonce: nonce(),
    oauth_signature_method: "HMAC-SHA1",
    oauth_timestamp: timestamp(),
    oauth_version: "1.0",
  }

  if (input.token) oauthParams.oauth_token = input.token
  if (input.callback) oauthParams.oauth_callback = input.callback
  if (input.verifier) oauthParams.oauth_verifier = input.verifier

  const queryParams: Record<string, string> = {}
  const parsedUrl = new URL(input.url)
  for (const [key, value] of parsedUrl.searchParams.entries()) {
    queryParams[key] = value
  }

  const signatureParams = {
    ...queryParams,
    ...(input.extraBodyParams || {}),
    ...oauthParams,
  }

  const normalized = normalizeParameterPairs(signatureParams)
  const signatureBase = `${input.method.toUpperCase()}&${percentEncode(
    baseUrlWithoutQuery(input.url)
  )}&${percentEncode(normalized)}`
  const signingKey = `${percentEncode(input.consumerSecret)}&${percentEncode(
    input.tokenSecret || ""
  )}`
  const signature = createHmac("sha1", signingKey)
    .update(signatureBase)
    .digest("base64")

  const headerParams = {
    ...oauthParams,
    oauth_signature: signature,
  }

  const authHeader = `OAuth ${Object.entries(headerParams)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${percentEncode(key)}="${percentEncode(value)}"`)
    .join(", ")}`

  return authHeader
}

export async function startOAuth1aConnectorAuthorization(
  userId: string,
  connectorId: HealthConnectorId
): Promise<HealthConnectorConnectResponse> {
  const connector = getHealthConnectorById(connectorId)
  if (!connector) {
    return {
      connectorId,
      status: "error",
      message: "Unknown connector",
    }
  }
  if (connector.protocol !== "oauth1a") {
    return {
      connectorId,
      status: "error",
      message: "Connector is not OAuth1a",
    }
  }
  if (!connector.authorizationUrlEnv) {
    return {
      connectorId,
      status: "error",
      message: "Missing request-token URL env for OAuth1a connector",
    }
  }

  const requestTokenUrl = process.env[connector.authorizationUrlEnv]
  if (!requestTokenUrl) {
    return {
      connectorId,
      status: "error",
      message: `Missing env: ${connector.authorizationUrlEnv}`,
    }
  }

  const consumerKey =
    readCredential(connectorId, /CONSUMER_KEY/) ||
    readCredential(connectorId, /CLIENT_ID/)
  const consumerSecret =
    readCredential(connectorId, /CONSUMER_SECRET/) ||
    readCredential(connectorId, /CLIENT_SECRET/)
  const callbackUrl = readCredential(connectorId, /REDIRECT_URI/)
  if (!consumerKey || !consumerSecret || !callbackUrl) {
    return {
      connectorId,
      status: "error",
      message: "Missing OAuth1a consumer key/secret/redirect credentials",
    }
  }

  const state = buildConnectorOAuthState(connectorId, userId)
  const callbackUrlWithState = callbackUrl.includes("?")
    ? `${callbackUrl}&state=${encodeURIComponent(state)}`
    : `${callbackUrl}?state=${encodeURIComponent(state)}`

  const authHeader = buildOAuth1Header({
    url: requestTokenUrl,
    method: "POST",
    consumerKey,
    consumerSecret,
    callback: callbackUrlWithState,
  })

  const response = await fetch(requestTokenUrl, {
    method: "POST",
    headers: {
      Authorization: authHeader,
      Accept: "application/x-www-form-urlencoded",
    },
    cache: "no-store",
  })

  const text = await response.text()
  const payload = parseFormEncoded(text)
  if (!response.ok || !payload.oauth_token || !payload.oauth_token_secret) {
    return {
      connectorId,
      status: "error",
      message: payload.oauth_problem || payload.error || `OAuth1a request token failed (${response.status})`,
    }
  }

  await setConnectorStatusForUser(userId, connectorId, "pending", {
    accessToken: payload.oauth_token,
    refreshToken: payload.oauth_token_secret,
    metadata: {
      oauth1Phase: "request_token",
      oauthCallbackConfirmed: payload.oauth_callback_confirmed || null,
      oauthState: state,
      requestTokenIssuedAt: new Date().toISOString(),
    },
  })

  const authorizeBase =
    process.env.GARMIN_AUTHORIZE_URL ||
    "https://connect.garmin.com/oauthConfirm"
  const redirectUrl = `${authorizeBase}?oauth_token=${encodeURIComponent(payload.oauth_token)}`

  return {
    connectorId,
    status: "pending",
    message: "Continue in Garmin authorization",
    redirectUrl,
  }
}

export async function completeOAuth1aConnectorAuthorization(input: {
  userId: string
  connectorId: HealthConnectorId
  oauthToken: string
  oauthVerifier: string
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const connector = getHealthConnectorById(input.connectorId)
  if (!connector || connector.protocol !== "oauth1a") {
    return {
      ok: false,
      error: "Connector is not OAuth1a",
    }
  }
  if (!connector.tokenUrlEnv) {
    return {
      ok: false,
      error: "Missing OAuth1a access-token URL env",
    }
  }
  const accessTokenUrl = process.env[connector.tokenUrlEnv]
  if (!accessTokenUrl) {
    return {
      ok: false,
      error: `Missing env: ${connector.tokenUrlEnv}`,
    }
  }

  const consumerKey =
    readCredential(input.connectorId, /CONSUMER_KEY/) ||
    readCredential(input.connectorId, /CLIENT_ID/)
  const consumerSecret =
    readCredential(input.connectorId, /CONSUMER_SECRET/) ||
    readCredential(input.connectorId, /CLIENT_SECRET/)
  if (!consumerKey || !consumerSecret) {
    return {
      ok: false,
      error: "Missing OAuth1a consumer credentials",
    }
  }

  const existingAccount = await readConnectorAccountAuth(input.userId, input.connectorId)
  if (!existingAccount?.refreshToken) {
    return {
      ok: false,
      error: "Missing request token secret for OAuth1a callback",
    }
  }

  const authHeader = buildOAuth1Header({
    url: accessTokenUrl,
    method: "POST",
    consumerKey,
    consumerSecret,
    token: input.oauthToken,
    tokenSecret: existingAccount.refreshToken,
    verifier: input.oauthVerifier,
    extraBodyParams: {
      oauth_verifier: input.oauthVerifier,
    },
  })

  const body = new URLSearchParams()
  body.set("oauth_verifier", input.oauthVerifier)

  const response = await fetch(accessTokenUrl, {
    method: "POST",
    headers: {
      Authorization: authHeader,
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/x-www-form-urlencoded",
    },
    body: body.toString(),
    cache: "no-store",
  })

  const text = await response.text()
  const payload = parseFormEncoded(text)
  if (!response.ok || !payload.oauth_token || !payload.oauth_token_secret) {
    return {
      ok: false,
      error: payload.oauth_problem || payload.error || `OAuth1a access token failed (${response.status})`,
    }
  }

  await setConnectorStatusForUser(input.userId, input.connectorId, "connected", {
    accessToken: payload.oauth_token,
    refreshToken: payload.oauth_token_secret,
    metadata: {
      oauth1Phase: "access_token",
      tokenExchangeAt: new Date().toISOString(),
      oauthSessionHandle: payload.oauth_session_handle || null,
    },
  })

  return { ok: true }
}

export async function signedOAuth1aGetJson(input: {
  url: string
  connectorId: HealthConnectorId
  accessToken: string
  tokenSecret: string
}): Promise<{ ok: true; data: unknown } | { ok: false; error: string }> {
  const consumerKey =
    readCredential(input.connectorId, /CONSUMER_KEY/) ||
    readCredential(input.connectorId, /CLIENT_ID/)
  const consumerSecret =
    readCredential(input.connectorId, /CONSUMER_SECRET/) ||
    readCredential(input.connectorId, /CLIENT_SECRET/)
  if (!consumerKey || !consumerSecret) {
    return {
      ok: false,
      error: "Missing OAuth1a consumer credentials",
    }
  }

  const header = buildOAuth1Header({
    url: input.url,
    method: "GET",
    consumerKey,
    consumerSecret,
    token: input.accessToken,
    tokenSecret: input.tokenSecret,
  })

  try {
    const response = await fetch(input.url, {
      method: "GET",
      headers: {
        Authorization: header,
        Accept: "application/json",
      },
      cache: "no-store",
    })
    const text = await response.text()
    let payload: unknown = text
    try {
      payload = JSON.parse(text) as unknown
    } catch {
      payload = { raw: text }
    }

    if (!response.ok) {
      return {
        ok: false,
        error: `OAuth1a GET failed (${response.status})`,
      }
    }
    return {
      ok: true,
      data: payload,
    }
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "OAuth1a request failed",
    }
  }
}

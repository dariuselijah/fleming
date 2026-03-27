import { decryptKey } from "@/lib/encryption"
import { createClient } from "@/lib/supabase/server"
import { getHealthConnectorById } from "./catalog"
import { setConnectorStatusForUser } from "./server"
import type { HealthConnectorDefinition, HealthConnectorId } from "./types"

const CONNECTOR_ACCOUNTS_TABLE = "health_connector_accounts"

type ConnectorAccountRow = {
  connector_id?: string | null
  status?: string | null
  access_token?: string | null
  access_token_iv?: string | null
  refresh_token?: string | null
  refresh_token_iv?: string | null
  token_expires_at?: string | null
  metadata?: Record<string, unknown> | null
}

type SupabaseQueryResult = {
  data: ConnectorAccountRow[] | null
  error: { message?: string } | null
}

type SupabaseGateway = {
  from: (table: string) => {
    select: (columns: string) => {
      eq: (column: string, value: string) => {
        eq: (column: string, value: string) => {
          limit: (count: number) => Promise<SupabaseQueryResult>
        }
      }
    }
  }
}

type ConnectorAccountAuth = {
  connectorId: HealthConnectorId
  status: string
  accessToken: string | null
  refreshToken: string | null
  tokenExpiresAt: string | null
  metadata: Record<string, unknown>
}

function gateway(client: unknown): SupabaseGateway {
  return client as SupabaseGateway
}

function isMissingTableError(error: unknown): boolean {
  const message = String((error as { message?: string } | undefined)?.message || "")
  return /health_connector_accounts|does not exist|42P01/i.test(message)
}

function getCredentialEnvValue(
  connector: HealthConnectorDefinition,
  pattern: RegExp
): string | null {
  const requirement = connector.requiredCredentials.find((item) => pattern.test(item.env))
  if (!requirement) return null
  return process.env[requirement.env] || null
}

function toStringOrNull(value: unknown): string | null {
  if (typeof value !== "string") return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

function toNumberOrNull(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value
  if (typeof value === "string") {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : null
  }
  return null
}

function resolveScopes(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .map((item) => toStringOrNull(item))
      .filter((item): item is string => Boolean(item))
  }
  const scopeString = toStringOrNull(value)
  if (!scopeString) return []
  return scopeString
    .split(/[,\s]+/g)
    .map((item) => item.trim())
    .filter((item) => item.length > 0)
}

function buildTokenExpiryIso(expiresInSeconds: number | null): string | null {
  if (!expiresInSeconds || expiresInSeconds <= 0) return null
  return new Date(Date.now() + expiresInSeconds * 1000).toISOString()
}

export async function readConnectorAccountAuth(
  userId: string,
  connectorId: HealthConnectorId
): Promise<ConnectorAccountAuth | null> {
  const supabase = await createClient()
  if (!supabase) return null

  const { data, error } = await gateway(supabase)
    .from(CONNECTOR_ACCOUNTS_TABLE)
    .select(
      "connector_id,status,access_token,access_token_iv,refresh_token,refresh_token_iv,token_expires_at,metadata"
    )
    .eq("user_id", userId)
    .eq("connector_id", connectorId)
    .limit(1)

  if (error) {
    if (isMissingTableError(error)) return null
    throw new Error(error.message || "Failed to read connector account")
  }

  const row = (data || [])[0]
  if (!row) return null

  return {
    connectorId,
    status: row.status || "not_connected",
    accessToken:
      row.access_token && row.access_token_iv
        ? decryptKey(row.access_token, row.access_token_iv)
        : row.access_token || null,
    refreshToken:
      row.refresh_token && row.refresh_token_iv
        ? decryptKey(row.refresh_token, row.refresh_token_iv)
        : row.refresh_token || null,
    tokenExpiresAt: row.token_expires_at || null,
    metadata:
      row.metadata && typeof row.metadata === "object"
        ? row.metadata
        : {},
  }
}

export async function refreshConnectorAccessTokenForUser(
  userId: string,
  connectorId: HealthConnectorId,
  refreshToken: string
): Promise<{ accessToken: string; refreshToken: string | null; tokenExpiresAt: string | null }> {
  const connector = getHealthConnectorById(connectorId)
  if (!connector) {
    throw new Error("Unknown connector")
  }
  if (!connector.tokenUrlEnv) {
    throw new Error("Connector token URL is not configured")
  }

  const tokenUrl = process.env[connector.tokenUrlEnv]
  if (!tokenUrl) {
    throw new Error(`Missing connector token URL: ${connector.tokenUrlEnv}`)
  }

  const clientId =
    getCredentialEnvValue(connector, /CLIENT_ID/) ||
    getCredentialEnvValue(connector, /CONSUMER_KEY/)
  const clientSecret =
    getCredentialEnvValue(connector, /CLIENT_SECRET/) ||
    getCredentialEnvValue(connector, /CONSUMER_SECRET/) ||
    getCredentialEnvValue(connector, /PRIVATE_KEY/)
  const redirectUri = getCredentialEnvValue(connector, /REDIRECT_URI/)

  const body = new URLSearchParams()
  body.set("grant_type", "refresh_token")
  body.set("refresh_token", refreshToken)
  if (clientId) body.set("client_id", clientId)
  if (clientSecret) body.set("client_secret", clientSecret)
  if (redirectUri) body.set("redirect_uri", redirectUri)

  const response = await fetch(tokenUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: body.toString(),
    cache: "no-store",
  })

  const rawText = await response.text()
  let payload: Record<string, unknown> = {}
  try {
    payload = JSON.parse(rawText) as Record<string, unknown>
  } catch {
    payload = { raw: rawText }
  }

  if (!response.ok) {
    throw new Error(
      toStringOrNull(payload.error_description) ||
        toStringOrNull(payload.error) ||
        `Token refresh failed (${response.status})`
    )
  }

  const nextAccessToken =
    toStringOrNull(payload.access_token) ||
    toStringOrNull(payload.accessToken) ||
    toStringOrNull(payload.token)
  if (!nextAccessToken) {
    throw new Error("Refresh token response did not include access_token")
  }
  const nextRefreshToken =
    toStringOrNull(payload.refresh_token) ||
    toStringOrNull(payload.refreshToken) ||
    refreshToken
  const expiresIn =
    toNumberOrNull(payload.expires_in) || toNumberOrNull(payload.expiresIn)
  const scopes = resolveScopes(payload.scope)

  await setConnectorStatusForUser(userId, connectorId, "connected", {
    accessToken: nextAccessToken,
    refreshToken: nextRefreshToken,
    tokenExpiresAt: buildTokenExpiryIso(expiresIn),
    scopes,
    metadata: {
      tokenRefreshAt: new Date().toISOString(),
      tokenRefreshPayload: payload,
    },
  })

  return {
    accessToken: nextAccessToken,
    refreshToken: nextRefreshToken,
    tokenExpiresAt: buildTokenExpiryIso(expiresIn),
  }
}

function isTokenExpiredSoon(tokenExpiresAt: string | null): boolean {
  if (!tokenExpiresAt) return false
  const expiresAt = new Date(tokenExpiresAt).getTime()
  if (Number.isNaN(expiresAt)) return false
  return expiresAt - Date.now() < 90_000
}

export async function ensureConnectorAccessTokenForSync(
  userId: string,
  connectorId: HealthConnectorId
): Promise<string> {
  const connector = getHealthConnectorById(connectorId)
  if (!connector) {
    throw new Error("Unknown connector")
  }

  const account = await readConnectorAccountAuth(userId, connectorId)
  if (!account || !account.accessToken) {
    throw new Error("Connector has no stored access token")
  }

  if (connector.protocol === "oauth1a") {
    return account.accessToken
  }

  if (
    isTokenExpiredSoon(account.tokenExpiresAt) &&
    account.refreshToken &&
    (connector.protocol === "oauth2" ||
      connector.protocol === "smart_on_fhir" ||
      connector.protocol === "aggregator")
  ) {
    const refreshed = await refreshConnectorAccessTokenForUser(
      userId,
      connectorId,
      account.refreshToken
    )
    return refreshed.accessToken
  }

  return account.accessToken
}

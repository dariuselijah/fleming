import { encryptKey } from "@/lib/encryption"
import { createClient } from "@/lib/supabase/server"
import { getHealthConnectorById, getHealthConnectorCatalog } from "./catalog"
import type {
  HealthConnectorConnectResponse,
  HealthConnectorDefinition,
  HealthConnectorId,
  HealthConnectorRuntimeStatus,
  HealthConnectorStatusRecord,
} from "./types"

const CONNECTOR_ACCOUNTS_TABLE = "health_connector_accounts"

type ConnectorAccountRow = {
  connector_id?: string | null
  status?: string | null
  updated_at?: string | null
  last_error?: string | null
  last_sync_at?: string | null
}

type ConnectorStatusReadResult = {
  data: ConnectorAccountRow[] | null
  error: { message?: string } | null
}

type ConnectorStatusWriteResult = {
  error: { message?: string } | null
}

type ConnectorAccountsGateway = {
  from: (table: string) => {
    select: (columns: string) => {
      eq: (column: string, value: string) => Promise<ConnectorStatusReadResult>
    }
    upsert: (
      payload: Record<string, unknown>,
      options: { onConflict: string }
    ) => Promise<ConnectorStatusWriteResult>
  }
}

function connectorAccountsGateway(client: unknown): ConnectorAccountsGateway {
  return client as ConnectorAccountsGateway
}

function isMissingTableError(error: unknown): boolean {
  const message = String((error as { message?: string } | undefined)?.message || "")
  return /health_connector_accounts|does not exist|42P01/i.test(message)
}

function defaultStatusForConnector(connector: HealthConnectorDefinition): HealthConnectorRuntimeStatus {
  if (connector.availability === "coming_soon") return "coming_soon"
  return "not_connected"
}

function toRuntimeStatus(
  connector: HealthConnectorDefinition,
  rawStatus: string | null | undefined
): HealthConnectorRuntimeStatus {
  if (connector.availability === "coming_soon") return "coming_soon"
  if (rawStatus === "connected") return "connected"
  if (rawStatus === "pending") return "pending"
  if (rawStatus === "error") return "error"
  return "not_connected"
}

function missingCredentialEnvs(connector: HealthConnectorDefinition): string[] {
  return connector.requiredCredentials
    .filter((requirement) => !process.env[requirement.env])
    .map((requirement) => requirement.env)
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

export type ConnectorCodeExchangeResult =
  | {
      ok: true
      accessToken: string
      refreshToken: string | null
      scopes: string[]
      tokenExpiresAt: string | null
      raw: Record<string, unknown>
    }
  | {
      ok: false
      error: string
    }

export function buildConnectorOAuthState(
  connectorId: HealthConnectorId,
  userId: string
): string {
  const payload = JSON.stringify({
    connectorId,
    userId,
    ts: Date.now(),
  })
  return Buffer.from(payload, "utf8").toString("base64url")
}

export function parseConnectorOAuthState(
  encodedState: string
): { connectorId: HealthConnectorId; userId: string; ts: number } | null {
  try {
    const parsed = JSON.parse(
      Buffer.from(encodedState, "base64url").toString("utf8")
    ) as {
      connectorId?: string
      userId?: string
      ts?: number
    }
    if (!parsed.connectorId || !parsed.userId || typeof parsed.ts !== "number") {
      return null
    }
    const connector = getHealthConnectorById(parsed.connectorId)
    if (!connector) return null
    return {
      connectorId: parsed.connectorId as HealthConnectorId,
      userId: parsed.userId,
      ts: parsed.ts,
    }
  } catch {
    return null
  }
}

export function buildConnectorAuthorizeUrl(
  connector: HealthConnectorDefinition,
  state: string
): string | null {
  if (!connector.authorizationUrlEnv) return null
  const authorizationUrl = process.env[connector.authorizationUrlEnv]
  if (!authorizationUrl) return null

  const params = new URLSearchParams()
  const clientIdRequirement = connector.requiredCredentials.find((item) =>
    /CLIENT_ID/.test(item.env)
  )
  const redirectUriRequirement = connector.requiredCredentials.find((item) =>
    /REDIRECT_URI/.test(item.env)
  )
  if (clientIdRequirement?.env && process.env[clientIdRequirement.env]) {
    params.set("client_id", process.env[clientIdRequirement.env] as string)
  }
  if (redirectUriRequirement?.env && process.env[redirectUriRequirement.env]) {
    params.set("redirect_uri", process.env[redirectUriRequirement.env] as string)
  }
  params.set("response_type", "code")
  params.set("state", state)

  return `${authorizationUrl}${authorizationUrl.includes("?") ? "&" : "?"}${params.toString()}`
}

export async function listConnectorStatusesForUser(
  userId: string
): Promise<Record<HealthConnectorId, HealthConnectorStatusRecord>> {
  const connectors = getHealthConnectorCatalog()
  const baseStatuses = connectors.reduce(
    (acc, connector) => {
      acc[connector.id] = {
        connectorId: connector.id,
        status: defaultStatusForConnector(connector),
      }
      return acc
    },
    {} as Record<HealthConnectorId, HealthConnectorStatusRecord>
  )

  const supabase = await createClient()
  if (!supabase) return baseStatuses

  const gateway = connectorAccountsGateway(supabase)
  const { data, error } = await gateway
    .from(CONNECTOR_ACCOUNTS_TABLE)
    .select("connector_id,status,updated_at,last_error,last_sync_at")
    .eq("user_id", userId)

  if (error) {
    if (isMissingTableError(error)) return baseStatuses
    throw new Error(error.message || "Failed to read connector status")
  }

  const rows = (data || []) as ConnectorAccountRow[]
  for (const row of rows) {
    if (!row.connector_id) continue
    const connector = getHealthConnectorById(row.connector_id)
    if (!connector) continue
    baseStatuses[connector.id] = {
      connectorId: connector.id,
      status: toRuntimeStatus(connector, row.status),
      updatedAt: row.updated_at || null,
      lastError: row.last_error || null,
      lastSyncAt: row.last_sync_at || null,
    }
  }

  return baseStatuses
}

export async function setConnectorStatusForUser(
  userId: string,
  connectorId: HealthConnectorId,
  status: HealthConnectorRuntimeStatus,
  options?: {
    lastError?: string | null
    metadata?: Record<string, unknown>
    accessToken?: string | null
    refreshToken?: string | null
    scopes?: string[]
    tokenExpiresAt?: string | null
  }
): Promise<void> {
  const connector = getHealthConnectorById(connectorId)
  if (!connector) {
    throw new Error("Unknown connector")
  }

  const supabase = await createClient()
  if (!supabase) return

  const payload: Record<string, unknown> = {
    user_id: userId,
    connector_id: connectorId,
    connector_category: connector.category,
    status,
    updated_at: new Date().toISOString(),
    ...(status === "connected" ? { last_sync_at: new Date().toISOString() } : {}),
  }

  const hasOption = (key: keyof NonNullable<typeof options>) =>
    Boolean(options && Object.prototype.hasOwnProperty.call(options, key))

  if (hasOption("accessToken")) {
    if (options?.accessToken) {
      const encrypted = encryptKey(options.accessToken)
      payload.access_token = encrypted.encrypted
      payload.access_token_iv = encrypted.iv
    } else {
      payload.access_token = null
      payload.access_token_iv = null
    }
  }

  if (hasOption("refreshToken")) {
    if (options?.refreshToken) {
      const encrypted = encryptKey(options.refreshToken)
      payload.refresh_token = encrypted.encrypted
      payload.refresh_token_iv = encrypted.iv
    } else {
      payload.refresh_token = null
      payload.refresh_token_iv = null
    }
  }

  if (hasOption("tokenExpiresAt")) {
    payload.token_expires_at = options?.tokenExpiresAt ?? null
  }
  if (hasOption("scopes")) {
    payload.scopes = options?.scopes ?? []
  }
  if (hasOption("lastError")) {
    payload.last_error = options?.lastError ?? null
  } else if (status === "connected") {
    payload.last_error = null
  }
  if (hasOption("metadata")) {
    payload.metadata = options?.metadata ?? {}
  }

  const gateway = connectorAccountsGateway(supabase)
  const { error } = await gateway
    .from(CONNECTOR_ACCOUNTS_TABLE)
    .upsert(payload, { onConflict: "user_id,connector_id" })

  if (error && !isMissingTableError(error)) {
    throw new Error(error.message || "Failed to update connector status")
  }
}

export function startConnectorConnect(
  connectorId: HealthConnectorId,
  userId: string
): HealthConnectorConnectResponse {
  const connector = getHealthConnectorById(connectorId)
  if (!connector) {
    return {
      connectorId,
      status: "error",
      message: "Connector is not registered.",
    }
  }

  if (connector.availability === "coming_soon") {
    return {
      connectorId,
      status: "coming_soon",
      message: connector.comingSoonReason || "This connector is coming soon.",
    }
  }

  const missingCredentials = missingCredentialEnvs(connector)
  if (missingCredentials.length > 0) {
    return {
      connectorId,
      status: "error",
      message: `Missing credentials: ${missingCredentials.join(", ")}`,
    }
  }

  const state = buildConnectorOAuthState(connector.id, userId)
  const redirectUrl = buildConnectorAuthorizeUrl(connector, state)
  if (redirectUrl) {
    return {
      connectorId,
      status: "pending",
      message: "Continue in the provider authorization screen.",
      redirectUrl,
    }
  }

  return {
    connectorId,
    status: "connected",
    message: "Connector credentials are configured.",
  }
}

export async function exchangeConnectorAuthorizationCode(
  connectorId: HealthConnectorId,
  code: string
): Promise<ConnectorCodeExchangeResult> {
  const connector = getHealthConnectorById(connectorId)
  if (!connector) {
    return {
      ok: false,
      error: "Unknown connector",
    }
  }

  if (connector.protocol === "native_sdk" || connector.protocol === "http_api") {
    return {
      ok: false,
      error: "Connector does not use OAuth authorization code exchange.",
    }
  }

  if (connector.protocol === "oauth1a") {
    return {
      ok: false,
      error: "OAuth 1.0a exchange requires provider-specific implementation.",
    }
  }

  if (!connector.tokenUrlEnv) {
    return {
      ok: false,
      error: "Connector token endpoint is not configured.",
    }
  }

  const tokenUrl = process.env[connector.tokenUrlEnv]
  if (!tokenUrl) {
    return {
      ok: false,
      error: `Missing token URL: ${connector.tokenUrlEnv}`,
    }
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
  body.set("grant_type", "authorization_code")
  body.set("code", code)
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

  const rawBodyText = await response.text()
  let parsedBody: Record<string, unknown> = {}
  try {
    parsedBody = JSON.parse(rawBodyText) as Record<string, unknown>
  } catch {
    parsedBody = {
      raw: rawBodyText,
    }
  }

  if (!response.ok) {
    return {
      ok: false,
      error:
        toStringOrNull(parsedBody.error_description) ||
        toStringOrNull(parsedBody.error) ||
        `Token exchange failed (${response.status})`,
    }
  }

  const accessToken =
    toStringOrNull(parsedBody.access_token) ||
    toStringOrNull(parsedBody.accessToken) ||
    toStringOrNull(parsedBody.token)
  const refreshToken =
    toStringOrNull(parsedBody.refresh_token) ||
    toStringOrNull(parsedBody.refreshToken) ||
    null
  const scopes = resolveScopes(parsedBody.scope)
  const expiresIn =
    toNumberOrNull(parsedBody.expires_in) || toNumberOrNull(parsedBody.expiresIn)

  if (!accessToken) {
    return {
      ok: false,
      error: "Provider did not return an access token.",
    }
  }

  return {
    ok: true,
    accessToken,
    refreshToken,
    scopes,
    tokenExpiresAt: buildTokenExpiryIso(expiresIn),
    raw: parsedBody,
  }
}

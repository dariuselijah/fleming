import { getHealthConnectorById } from "@/lib/health-connectors/catalog"
import { completeOAuth1aConnectorAuthorization } from "@/lib/health-connectors/oauth1a"
import {
  exchangeConnectorAuthorizationCode,
  parseConnectorOAuthState,
  setConnectorStatusForUser,
} from "@/lib/health-connectors/server"
import { syncConnectorForUser } from "@/lib/health-connectors/sync-engine"
import { createClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"

export async function GET(request: Request) {
  const url = new URL(request.url)
  const error = url.searchParams.get("error")
  const state = url.searchParams.get("state")
  const code =
    url.searchParams.get("code") || url.searchParams.get("oauth_verifier")

  const supabase = await createClient()
  if (!supabase) {
    return NextResponse.redirect(new URL("/health?connector_status=error", url.origin))
  }

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user?.id) {
    return NextResponse.redirect(
      new URL("/health?connector_status=error&reason=unauthorized", url.origin)
    )
  }

  const decodedState = state ? parseConnectorOAuthState(state) : null
  if (!decodedState || decodedState.userId !== user.id) {
    return NextResponse.redirect(
      new URL("/health?connector_status=error&reason=invalid_state", url.origin)
    )
  }

  if (error) {
    await setConnectorStatusForUser(user.id, decodedState.connectorId, "error", {
      lastError: error,
    })
    return NextResponse.redirect(
      new URL(
        `/health?connector_status=error&connector=${encodeURIComponent(
          decodedState.connectorId
        )}`,
        url.origin
      )
    )
  }

  if (!code) {
    await setConnectorStatusForUser(user.id, decodedState.connectorId, "error", {
      lastError: "Authorization code not returned by provider.",
    })
    return NextResponse.redirect(
      new URL(
        `/health?connector_status=error&connector=${encodeURIComponent(
          decodedState.connectorId
        )}`,
        url.origin
      )
    )
  }

  const connector = getHealthConnectorById(decodedState.connectorId)
  if (connector?.protocol === "oauth1a") {
    const oauth1Token = url.searchParams.get("oauth_token")
    if (!oauth1Token) {
      await setConnectorStatusForUser(user.id, decodedState.connectorId, "error", {
        lastError: "OAuth1a callback missing oauth_token",
      })
      return NextResponse.redirect(
        new URL(
          `/health?connector_status=error&connector=${encodeURIComponent(
            decodedState.connectorId
          )}`,
          url.origin
        )
      )
    }

    const oauth1Result = await completeOAuth1aConnectorAuthorization({
      userId: user.id,
      connectorId: decodedState.connectorId,
      oauthToken: oauth1Token,
      oauthVerifier: code,
    })
    if (!oauth1Result.ok) {
      await setConnectorStatusForUser(user.id, decodedState.connectorId, "error", {
        lastError: oauth1Result.error,
      })
      return NextResponse.redirect(
        new URL(
          `/health?connector_status=error&connector=${encodeURIComponent(
            decodedState.connectorId
          )}`,
          url.origin
        )
      )
    }

    await syncConnectorForUser(user.id, decodedState.connectorId).catch(() => {
      // Ignore sync errors; credentials are already stored.
    })

    return NextResponse.redirect(
      new URL(
        `/health?connector_status=connected&connector=${encodeURIComponent(
          decodedState.connectorId
        )}`,
        url.origin
      )
    )
  }

  const exchangeResult = await exchangeConnectorAuthorizationCode(
    decodedState.connectorId,
    code
  )
  if (!exchangeResult.ok) {
    await setConnectorStatusForUser(user.id, decodedState.connectorId, "error", {
      lastError: exchangeResult.error,
    })
    return NextResponse.redirect(
      new URL(
        `/health?connector_status=error&connector=${encodeURIComponent(
          decodedState.connectorId
        )}`,
        url.origin
      )
    )
  }

  await setConnectorStatusForUser(user.id, decodedState.connectorId, "connected", {
    accessToken: exchangeResult.accessToken,
    refreshToken: exchangeResult.refreshToken,
    tokenExpiresAt: exchangeResult.tokenExpiresAt,
    scopes: exchangeResult.scopes,
    metadata: {
      tokenExchangeAt: new Date().toISOString(),
      tokenPayload: exchangeResult.raw,
    },
  })

  // Best effort initial sync to make data available immediately after connect.
  await syncConnectorForUser(user.id, decodedState.connectorId).catch(() => {
    // Ignore sync errors; status + token are already stored.
  })

  return NextResponse.redirect(
    new URL(
      `/health?connector_status=connected&connector=${encodeURIComponent(
        decodedState.connectorId
      )}`,
      url.origin
    )
  )
}

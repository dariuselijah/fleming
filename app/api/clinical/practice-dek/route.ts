import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { requirePracticePermission } from "@/lib/auth/guard"
import {
  persistPracticeDekForUser,
  resolvePracticeDekForUser,
} from "@/lib/clinical/practice-dek-vault"

/**
 * Silent practice DEK bootstrap — no passphrase prompt.
 * Authenticated practice members receive the practice encryption key automatically.
 */
export async function GET(req: NextRequest) {
  const requestedPracticeId = req.nextUrl.searchParams.get("practiceId")?.trim()
  const guard = await requirePracticePermission("clinical:access", {
    requestedPracticeId,
  })
  if (!guard.ok) return guard.response
  const { userId, activePracticeId: practiceId } = guard.context

  const admin = createAdminClient()
  const dekBase64 = await resolvePracticeDekForUser(admin, userId, practiceId)
  if (!dekBase64) {
    return NextResponse.json(
      { error: "Could not resolve practice encryption key (vault secret missing?)" },
      { status: 503 }
    )
  }

  await persistPracticeDekForUser(admin, userId, practiceId, dekBase64)

  return NextResponse.json({ dekBase64 })
}

import type { SupabaseClient, User } from "@supabase/supabase-js"
import { cookies } from "next/headers"
import type { Database } from "@/app/types/database.types"
import { createClient } from "@/lib/supabase/server"
import {
  getDefaultWorkspaceMode,
  getRolePermissions,
  isPracticeStaffRole,
  type AppPermission,
} from "./permissions"
import { selectActiveMembership } from "./practice-selection"

export const ACTIVE_PRACTICE_COOKIE = "fleming-active-practice-id"

type ServerSupabase = NonNullable<Awaited<ReturnType<typeof createClient>>>

export type PracticeMembershipContext = {
  membershipId: string
  practiceId: string
  practiceName: string
  role: string
  createdAt: string
}

export type AuthPracticeContext = {
  isAuthenticated: boolean
  userId: string | null
  activePracticeId: string | null
  activePracticeName: string | null
  activeRole: string | null
  permissions: AppPermission[]
  memberships: PracticeMembershipContext[]
  defaultWorkspaceMode: "clinical" | "admin"
}

export type ServerAuthPracticeContext = AuthPracticeContext & {
  supabase: ServerSupabase | null
  user: User | null
}

function emptyContext(supabase: ServerSupabase | null = null): ServerAuthPracticeContext {
  return {
    supabase,
    user: null,
    isAuthenticated: false,
    userId: null,
    activePracticeId: null,
    activePracticeName: null,
    activeRole: null,
    permissions: getRolePermissions(null),
    memberships: [],
    defaultWorkspaceMode: "clinical",
  }
}

export function toClientAuthContext(
  context: ServerAuthPracticeContext
): AuthPracticeContext {
  return {
    isAuthenticated: context.isAuthenticated,
    userId: context.userId,
    activePracticeId: context.activePracticeId,
    activePracticeName: context.activePracticeName,
    activeRole: context.activeRole,
    permissions: context.permissions,
    memberships: context.memberships,
    defaultWorkspaceMode: context.defaultWorkspaceMode,
  }
}

export async function getServerAuthPracticeContext(): Promise<ServerAuthPracticeContext> {
  const supabase = await createClient()
  if (!supabase) return emptyContext(null)

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError || !user) return emptyContext(supabase)

  const { data: memberRows } = await supabase
    .from("practice_members")
    .select("id, practice_id, role, created_at")
    .eq("user_id", user.id)

  const rows = memberRows ?? []
  const practiceIds = Array.from(new Set(rows.map((row) => row.practice_id)))
  const practiceNames = new Map<string, string>()

  if (practiceIds.length > 0) {
    const { data: practiceRows } = await supabase
      .from("practices")
      .select("id, name")
      .in("id", practiceIds)

    for (const practice of practiceRows ?? []) {
      practiceNames.set(practice.id, practice.name)
    }
  }

  const memberships = rows
    .map((row) => ({
      membershipId: row.id,
      practiceId: row.practice_id,
      practiceName: practiceNames.get(row.practice_id) ?? "Practice",
      role: isPracticeStaffRole(row.role) ? row.role : "reception",
      createdAt: row.created_at,
    }))

  const cookieStore = await cookies()
  const requestedPracticeId = cookieStore.get(ACTIVE_PRACTICE_COOKIE)?.value ?? null
  const activeMembership = selectActiveMembership(memberships, requestedPracticeId)

  return {
    supabase,
    user,
    isAuthenticated: true,
    userId: user.id,
    activePracticeId: activeMembership?.practiceId ?? null,
    activePracticeName: activeMembership?.practiceName ?? null,
    activeRole: activeMembership?.role ?? null,
    permissions: getRolePermissions(activeMembership?.role),
    memberships,
    defaultWorkspaceMode: getDefaultWorkspaceMode(activeMembership?.role),
  }
}

export async function getValidatedPracticeMembership(
  supabase: SupabaseClient<Database>,
  userId: string,
  practiceId: string
): Promise<PracticeMembershipContext | null> {
  const { data } = await supabase
    .from("practice_members")
    .select("id, practice_id, role, created_at")
    .eq("user_id", userId)
    .eq("practice_id", practiceId)
    .maybeSingle()

  if (!data) return null

  const { data: practice } = await supabase
    .from("practices")
    .select("id, name")
    .eq("id", practiceId)
    .maybeSingle()

  return {
    membershipId: data.id,
    practiceId: data.practice_id,
    practiceName: practice?.name ?? "Practice",
    role: isPracticeStaffRole(data.role) ? data.role : "reception",
    createdAt: data.created_at,
  }
}

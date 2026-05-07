export type SelectablePracticeMembership = {
  practiceId: string
  role: string
  createdAt: string
}

const ROLE_SORT: Record<string, number> = {
  owner: 0,
  admin: 1,
  physician: 2,
  nurse: 3,
  reception: 4,
}

function sortMemberships<T extends SelectablePracticeMembership>(a: T, b: T) {
  const roleA = ROLE_SORT[a.role] ?? 99
  const roleB = ROLE_SORT[b.role] ?? 99
  if (roleA !== roleB) return roleA - roleB
  return a.createdAt.localeCompare(b.createdAt)
}

export function selectActiveMembership<T extends SelectablePracticeMembership>(
  memberships: T[],
  requestedPracticeId: string | null | undefined
): T | null {
  return (
    memberships.find((membership) => membership.practiceId === requestedPracticeId) ??
    [...memberships].sort(sortMemberships)[0] ??
    null
  )
}

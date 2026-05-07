import assert from "node:assert/strict"
import {
  selectActiveMembership,
  type SelectablePracticeMembership,
} from "../lib/auth/practice-selection"
import {
  getDefaultWorkspaceMode,
  hasAnyPermission,
  hasPermission,
} from "../lib/auth/permissions"

type TestMembership = SelectablePracticeMembership & {
  membershipId: string
  practiceName: string
}

const memberships: TestMembership[] = [
  {
    membershipId: "member-physician",
    practiceId: "practice-b",
    practiceName: "Beta Practice",
    role: "physician",
    createdAt: "2026-01-02T00:00:00.000Z",
  },
  {
    membershipId: "member-owner",
    practiceId: "practice-a",
    practiceName: "Alpha Practice",
    role: "owner",
    createdAt: "2026-01-03T00:00:00.000Z",
  },
]

function main() {
  assert.equal(hasPermission("owner", "team:manage"), true)
  assert.equal(hasPermission("admin", "team:manage"), true)
  assert.equal(hasPermission("physician", "team:manage"), false)
  assert.equal(hasPermission("reception", "clinical:access"), false)
  assert.equal(hasPermission("nurse", "clinical:access"), true)
  assert.equal(hasAnyPermission("reception", ["clinical:access", "frontdesk:access"]), true)

  assert.equal(getDefaultWorkspaceMode("admin"), "admin")
  assert.equal(getDefaultWorkspaceMode("reception"), "admin")
  assert.equal(getDefaultWorkspaceMode("physician"), "clinical")

  assert.equal(selectActiveMembership(memberships, "practice-b")?.practiceId, "practice-b")
  assert.equal(selectActiveMembership(memberships, "missing")?.practiceId, "practice-a")
  assert.equal(selectActiveMembership([], "practice-a"), null)

  const masterNavExpectations = [
    { label: "Billing", permission: "billing:access", owner: true, physician: true, nurse: false },
    { label: "Inventory", permission: "inventory:access", owner: true, physician: false, nurse: true },
    { label: "Analytics", permission: "analytics:access", owner: true, physician: false, nurse: false },
    { label: "Clinical", permission: "clinical:access", owner: true, physician: true, nurse: true },
  ] as const

  for (const item of masterNavExpectations) {
    assert.equal(hasPermission("owner", item.permission), item.owner, item.label)
    assert.equal(hasPermission("physician", item.permission), item.physician, item.label)
    assert.equal(hasPermission("nurse", item.permission), item.nurse, item.label)
  }

  console.log("Auth role regression checks passed.")
}

main()

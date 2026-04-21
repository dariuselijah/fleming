import type { PracticeStaffRole } from "@/lib/clinical-workspace/types"

export type { PracticeStaffRole }

/** Roles that can be assigned when inviting (practice owner is bootstrap-only). */
export const INVITABLE_ROLES: PracticeStaffRole[] = [
  "admin",
  "physician",
  "nurse",
  "reception",
]

export const ROLE_LABEL: Record<PracticeStaffRole, string> = {
  owner: "Owner",
  admin: "Administrator",
  physician: "Physician",
  nurse: "Nurse",
  reception: "Reception",
}

/** Short descriptions for the invite / role UI */
export const ROLE_PERMISSION_SUMMARY: Record<PracticeStaffRole, string> = {
  owner:
    "Full control: billing, integrations, team, and practice security. There is typically one owner per practice.",
  admin:
    "Manage team invitations and day-to-day operations. Cannot change the owner or assign the owner role.",
  physician: "Clinical access: patients, encounters, prescribing workflows, and claims as configured.",
  nurse: "Clinical support: patient charts, vitals, and tasks as configured for nursing staff.",
  reception: "Front desk: scheduling, intake, and patient communication without full clinical write access.",
}

export function isOwnerOrAdmin(role: string | null | undefined): boolean {
  return role === "owner" || role === "admin"
}

export function canInviteAsRole(
  callerRole: string | null | undefined,
  targetRole: PracticeStaffRole
): boolean {
  if (!isOwnerOrAdmin(callerRole)) return false
  if (targetRole === "owner") return false
  if (targetRole === "admin") return callerRole === "owner"
  return INVITABLE_ROLES.includes(targetRole)
}

export function canChangeMemberRole(
  callerRole: string | null | undefined,
  memberCurrentRole: string,
  newRole: PracticeStaffRole
): boolean {
  if (!isOwnerOrAdmin(callerRole)) return false
  if (memberCurrentRole === "owner") return false
  if (newRole === "owner") return false
  if (newRole === "admin" && callerRole !== "owner") return false
  return true
}

import type { PracticeStaffRole } from "@/lib/clinical-workspace/types"

export type AppPermission =
  | "chat:use"
  | "uploads:use"
  | "clinical:access"
  | "clinical:sign"
  | "admin:access"
  | "frontdesk:access"
  | "billing:access"
  | "inventory:access"
  | "analytics:access"
  | "patients:access"
  | "channels:access"
  | "team:manage"
  | "settings:practice"

export const PRACTICE_ROLES: PracticeStaffRole[] = [
  "owner",
  "physician",
  "nurse",
  "admin",
  "reception",
]

export const ROLE_LABELS: Record<PracticeStaffRole, string> = {
  owner: "Owner",
  physician: "Physician",
  nurse: "Nurse",
  admin: "Administrator",
  reception: "Reception",
}

const ROLE_PERMISSIONS: Record<PracticeStaffRole, AppPermission[]> = {
  owner: [
    "chat:use",
    "uploads:use",
    "clinical:access",
    "clinical:sign",
    "admin:access",
    "frontdesk:access",
    "billing:access",
    "inventory:access",
    "analytics:access",
    "patients:access",
    "channels:access",
    "team:manage",
    "settings:practice",
  ],
  physician: [
    "chat:use",
    "uploads:use",
    "clinical:access",
    "clinical:sign",
    "admin:access",
    "billing:access",
    "patients:access",
  ],
  nurse: [
    "chat:use",
    "uploads:use",
    "clinical:access",
    "inventory:access",
    "patients:access",
  ],
  admin: [
    "chat:use",
    "uploads:use",
    "admin:access",
    "frontdesk:access",
    "billing:access",
    "inventory:access",
    "analytics:access",
    "patients:access",
    "channels:access",
    "team:manage",
    "settings:practice",
  ],
  reception: [
    "chat:use",
    "uploads:use",
    "admin:access",
    "frontdesk:access",
    "billing:access",
    "patients:access",
    "channels:access",
  ],
}

export function isPracticeStaffRole(role: string | null | undefined): role is PracticeStaffRole {
  return !!role && (PRACTICE_ROLES as string[]).includes(role)
}

export function getRolePermissions(role: string | null | undefined): AppPermission[] {
  if (!isPracticeStaffRole(role)) return ["chat:use", "uploads:use"]
  return ROLE_PERMISSIONS[role]
}

export function hasPermission(
  role: string | null | undefined,
  permission: AppPermission
): boolean {
  return getRolePermissions(role).includes(permission)
}

export function hasAnyPermission(
  role: string | null | undefined,
  permissions: AppPermission[]
): boolean {
  if (permissions.length === 0) return true
  const granted = getRolePermissions(role)
  return permissions.some((permission) => granted.includes(permission))
}

export function getDefaultWorkspaceMode(
  role: string | null | undefined
): "clinical" | "admin" {
  if (role === "admin" || role === "reception") return "admin"
  return "clinical"
}

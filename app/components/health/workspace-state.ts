"use client"

import type { UserPreferences } from "@/lib/user-preference-store/utils"

export type ConnectorStatus =
  | "not_connected"
  | "connected"
  | "pending"
  | "error"
  | "coming_soon"

export type HealthWorkspaceState = {
  hideGettingStarted: boolean
  bio: string
  connectors: {
    medicalRecords: ConnectorStatus
    wearables: ConnectorStatus
  }
}

export type ProfileTask = {
  id: "set_goals" | "connect_medical_records" | "connect_wearables"
  label: string
  description: string
  completed: boolean
}

export type HealthMemoryEntry = {
  id: string
  dateLabel: string
  category: string
  label: string
  value: string
}

const STORAGE_PREFIX = "fleming:health:workspace:v1"

function looksEncryptedValue(value: string): boolean {
  const trimmed = value.trim()
  if (!trimmed) return false
  // AES-GCM payloads stored as "<hex-ciphertext>:<hex-tag>".
  return /^[a-f0-9]{64,}:[a-f0-9]{16,}$/i.test(trimmed)
}

function cleanTextValue(value: string | null | undefined): string {
  const trimmed = (value || "").trim()
  if (!trimmed) return ""
  if (looksEncryptedValue(trimmed)) return ""
  return trimmed
}

function cleanArrayValues(values: string[] | null | undefined): string[] {
  if (!values || values.length === 0) return []
  return values
    .map((value) => cleanTextValue(value))
    .filter((value) => value.length > 0)
}

export const defaultHealthWorkspaceState: HealthWorkspaceState = {
  hideGettingStarted: false,
  bio: "",
  connectors: {
    medicalRecords: "not_connected",
    wearables: "not_connected",
  },
}

function makeStorageKey(userId: string | null | undefined) {
  return userId ? `${STORAGE_PREFIX}:${userId}` : `${STORAGE_PREFIX}:guest`
}

export function readHealthWorkspaceState(userId: string | null | undefined): HealthWorkspaceState {
  if (typeof window === "undefined") return defaultHealthWorkspaceState
  try {
    const raw = window.localStorage.getItem(makeStorageKey(userId))
    if (!raw) return defaultHealthWorkspaceState
    const parsed = JSON.parse(raw) as Partial<HealthWorkspaceState>
    return {
      hideGettingStarted: parsed.hideGettingStarted === true,
      bio: typeof parsed.bio === "string" ? parsed.bio : "",
      connectors: {
        medicalRecords:
          parsed.connectors?.medicalRecords === "connected" ||
          parsed.connectors?.medicalRecords === "pending" ||
          parsed.connectors?.medicalRecords === "coming_soon" ||
          parsed.connectors?.medicalRecords === "error"
            ? parsed.connectors.medicalRecords
            : "not_connected",
        wearables:
          parsed.connectors?.wearables === "connected" ||
          parsed.connectors?.wearables === "pending" ||
          parsed.connectors?.wearables === "coming_soon" ||
          parsed.connectors?.wearables === "error"
            ? parsed.connectors.wearables
            : "not_connected",
      },
    }
  } catch {
    return defaultHealthWorkspaceState
  }
}

export function writeHealthWorkspaceState(
  userId: string | null | undefined,
  state: HealthWorkspaceState
) {
  if (typeof window === "undefined") return
  try {
    window.localStorage.setItem(makeStorageKey(userId), JSON.stringify(state))
    window.dispatchEvent(new Event("fleming-health-workspace-updated"))
  } catch {
    // Best effort only.
  }
}

export function buildProfileTasks(
  preferences: UserPreferences,
  workspace: HealthWorkspaceState
): ProfileTask[] {
  const goalSignal =
    (preferences.healthContext || "").trim().length > 0 ||
    (preferences.lifestyleFactors || "").trim().length > 0
  return [
    {
      id: "set_goals",
      label: "Set health goals",
      description: "Set up your health goals to get personalized insights and recommendations",
      completed: goalSignal,
    },
    {
      id: "connect_medical_records",
      label: "Connect medical records",
      description: "Link labs and health records from your healthcare providers",
      completed: workspace.connectors.medicalRecords === "connected",
    },
    {
      id: "connect_wearables",
      label: "Connect wearables",
      description: "Sync wearable data from Oura, Fitbit, and other providers",
      completed: workspace.connectors.wearables === "connected",
    },
  ]
}

export function buildHealthMemories(
  preferences: UserPreferences,
  workspace: HealthWorkspaceState
): HealthMemoryEntry[] {
  const today = new Date()
  const dateLabel = today.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  })
  const cleanHealthContext = cleanTextValue(preferences.healthContext)
  const cleanLifestyleFactors = cleanTextValue(preferences.lifestyleFactors)
  const cleanFamilyHistory = cleanTextValue(preferences.familyHistory)
  const cleanConditions = cleanArrayValues(preferences.healthConditions)
  const cleanAllergies = cleanArrayValues(preferences.allergies)
  const cleanMedications = cleanArrayValues(preferences.medications)

  const entries: HealthMemoryEntry[] = [
    {
      id: "mem-health-goals",
      dateLabel,
      category: "Health",
      label: "Health goals",
      value: cleanHealthContext || cleanLifestyleFactors || "None",
    },
    {
      id: "mem-medical-conditions",
      dateLabel,
      category: "Health",
      label: "Medical conditions",
      value: cleanConditions.length > 0 ? cleanConditions.join(", ") : "None",
    },
    {
      id: "mem-family-history",
      dateLabel,
      category: "Health",
      label: "Family history",
      value: cleanFamilyHistory || "None",
    },
    {
      id: "mem-allergies",
      dateLabel,
      category: "Health",
      label: "Allergies",
      value: cleanAllergies.length > 0 ? cleanAllergies.join(", ") : "None",
    },
    {
      id: "mem-medications",
      dateLabel,
      category: "Health",
      label: "Medications",
      value: cleanMedications.length > 0 ? cleanMedications.join(", ") : "None",
    },
    {
      id: "mem-connectors",
      dateLabel,
      category: "Health",
      label: "Connectors",
      value: `Medical records: ${workspace.connectors.medicalRecords}. Wearables: ${workspace.connectors.wearables}.`,
    },
  ]

  if (workspace.bio.trim().length > 0) {
    entries.unshift({
      id: "mem-bio",
      dateLabel,
      category: "Health",
      label: "Bio",
      value: workspace.bio.trim(),
    })
  }

  return entries
}

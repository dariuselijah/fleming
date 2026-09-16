import type { PracticePatient } from "@/lib/clinical-workspace"
import type { FamilyDependentRow } from "@/lib/medikredit/types"
import { medikreditFamilyRowToPrefill, normalizeFamilyDepCode } from "@/lib/medikredit/family-prefill"

export type FamCheckDirectoryChange = {
  field: keyof PracticePatient | string
  label: string
  before: string
  after: string
}

const MED_AID_FIELDS: Partial<Record<keyof PracticePatient, true>> = {
  medicalAidScheme: true,
  medicalAidSchemeCode: true,
  memberNumber: true,
  dependentCode: true,
  mainMemberName: true,
  medicalAidPlan: true,
}

function isBlank(v: unknown): boolean {
  if (v === undefined || v === null) return true
  if (typeof v === "string") return v.trim() === ""
  return false
}

function display(v: unknown): string {
  if (v === undefined || v === null) return "—"
  if (typeof v === "string") return v.trim() || "—"
  return String(v)
}

function ageFromIsoDob(iso: string): number | undefined {
  const birth = new Date(iso)
  if (Number.isNaN(birth.getTime())) return undefined
  const today = new Date()
  let age = today.getFullYear() - birth.getFullYear()
  const m = today.getMonth() - birth.getMonth()
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--
  return age
}

function depsEqual(existingDep: unknown, proposedRaw: string): boolean {
  const a = normalizeFamilyDepCode(String(existingDep ?? ""))
  const b = normalizeFamilyDepCode(proposedRaw)
  if (!a?.length && !b?.length) return true
  return a === b
}

/**
 * Builds a conservative patch plus human-readable rows for review.
 * Rules: fill missing demographics; fill or refresh medical-aid–linked fields from FamCheck vs principal context.
 */
export function buildFamCheckDirectoryUpdateProposal(
  row: FamilyDependentRow,
  principal: PracticePatient,
  existing: PracticePatient
): { patch: Partial<PracticePatient>; changes: FamCheckDirectoryChange[] } {
  const pre = medikreditFamilyRowToPrefill(row, {
    scheme: principal.medicalAidScheme,
    schemeCode: principal.medicalAidSchemeCode,
    memberNumber: principal.memberNumber,
    mainMemberName: principal.mainMemberName ?? principal.name,
  })

  const patch: Partial<PracticePatient> = {}
  const changes: FamCheckDirectoryChange[] = []

  const propose = (
    field: keyof PracticePatient,
    label: string,
    rawAfter: string | undefined,
    options?: { medAid?: boolean }
  ) => {
    const medAid = options?.medAid === true || Boolean(MED_AID_FIELDS[field])
    if (!rawAfter?.trim()) return
    const afterTrim = rawAfter.trim()
    const beforeVal = existing[field]
    const beforeStr = display(beforeVal)

    if (field === "dependentCode") {
      if (depsEqual(beforeVal, afterTrim)) return
    }

    let shouldApply = false
    if (isBlank(beforeVal)) {
      shouldApply = true
    } else if (medAid && beforeStr !== afterTrim) {
      shouldApply = true
    }

    if (!shouldApply) return

    ;(patch as Record<string, unknown>)[field] = afterTrim
    changes.push({ field, label, before: beforeStr, after: afterTrim })

    // Keep age coherent when filling DOB
    if (field === "dateOfBirth" && afterTrim.includes("-")) {
      const ag = ageFromIsoDob(afterTrim)
      if (ag != null && (existing.age == null || isBlank(existing.age))) {
        patch.age = ag
        changes.push({
          field: "age",
          label: "Age (from DOB)",
          before: display(existing.age),
          after: String(ag),
        })
      }
    }
  }

  const nameFromPrefill = [pre.firstName, pre.lastName]
    .map((x) => (x ?? "").trim())
    .filter(Boolean)
    .join(" ")
  if (nameFromPrefill.trim()) {
    propose("name", "Full name", nameFromPrefill, { medAid: false })
  }

  if (pre.idNumber?.trim()) {
    propose("idNumber", "RSA ID number", pre.idNumber.replace(/\D/g, "").slice(0, 13))
  }

  if (pre.dateOfBirth?.trim()) {
    propose("dateOfBirth", "Date of birth", pre.dateOfBirth.trim())
  }

  if (pre.sex?.trim()) {
    const sx = pre.sex.trim().toUpperCase()
    const mapped =
      sx === "M" || sx === "MALE"
        ? "M"
        : sx === "F" || sx === "FEMALE"
          ? "F"
          : sx === "OTHER" || sx === "X"
            ? "Other"
            : undefined
    if (mapped) {
      propose("sex", "Sex", mapped, { medAid: false })
    }
  }

  if (pre.scheme?.trim()) {
    propose("medicalAidScheme", "Medical aid scheme", pre.scheme, { medAid: true })
  }
  if (pre.medicalAidSchemeCode?.trim()) {
    propose("medicalAidSchemeCode", "Scheme option code", pre.medicalAidSchemeCode, { medAid: true })
  }
  if (pre.memberNumber?.trim()) {
    propose("memberNumber", "Member number", pre.memberNumber, { medAid: true })
  }
  if (pre.dependentCode != null && String(pre.dependentCode).trim() !== "") {
    const norm = normalizeFamilyDepCode(String(pre.dependentCode))
    if (norm != null) {
      propose("dependentCode", "Dependent code", norm, { medAid: true })
    }
  }
  if (pre.mainMemberName?.trim()) {
    propose("mainMemberName", "Main member name", pre.mainMemberName, { medAid: true })
  }
  if (pre.medicalAidPlan?.trim()) {
    propose("medicalAidPlan", "Plan (FamCheck)", pre.medicalAidPlan, { medAid: true })
  }

  return { patch, changes }
}

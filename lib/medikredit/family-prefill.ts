import type { PatientRegistrationPrefill } from "@/lib/clinical/smart-import-patient"
import type { FamilyDependentRow } from "@/lib/medikredit/types"

/** Compare scheme dep codes (0 vs 00). */
export function normalizeFamilyDepCode(raw?: string): string | undefined {
  if (raw == null || String(raw).trim() === "") return undefined
  const n = parseInt(String(raw).replace(/\D/g, ""), 10)
  if (Number.isNaN(n)) return String(raw).trim()
  return String(n).padStart(2, "0")
}

/** Build Add Patient modal prefill from a famcheck PAT row + principal context. */
export function medikreditFamilyRowToPrefill(
  row: FamilyDependentRow,
  ctx: { scheme?: string; schemeCode?: string; memberNumber?: string; mainMemberName?: string }
): PatientRegistrationPrefill {
  let firstName = row.firstNames?.trim()
  let lastName = row.surname?.trim()
  if ((!firstName || !lastName) && row.name?.trim()) {
    const parts = row.name.trim().split(/\s+/).filter(Boolean)
    if (parts.length === 1) {
      firstName = firstName || parts[0]
    } else {
      lastName = lastName || parts[parts.length - 1]
      firstName = firstName || parts.slice(0, -1).join(" ")
    }
  }
  return {
    firstName: firstName || undefined,
    lastName: lastName || undefined,
    idNumber: row.id_nbr?.replace(/\D/g, "").slice(0, 13),
    dateOfBirth: row.dateOfBirthIso,
    sex: row.gender === "1" ? "M" : row.gender === "2" ? "F" : undefined,
    hasMedicalAid: true,
    scheme: ctx.scheme,
    medicalAidSchemeCode: ctx.schemeCode,
    memberNumber: ctx.memberNumber,
    dependentCode: row.dep_cd,
    mainMemberName: ctx.mainMemberName,
    medicalAidPlan: row.planDescription,
  }
}

/** MediKredit YYYYMMDD (DOB or plan join) → e.g. 31 Jul 1972 */
export function formatMedikreditYmd(ymd: string | undefined): string | null {
  if (!ymd || !/^\d{8}$/.test(ymd.trim())) return null
  const y = Number(ymd.slice(0, 4))
  const m = Number(ymd.slice(4, 6)) - 1
  const d = Number(ymd.slice(6, 8))
  const dt = new Date(y, m, d)
  if (Number.isNaN(dt.getTime())) return null
  return dt.toLocaleDateString("en-ZA", { day: "numeric", month: "short", year: "numeric" })
}

import {
  postMedpraxMedicinesByNappi,
  postMedpraxTariffsContractsMedical,
} from "@/lib/clinical-proxy/medprax"
import type { ClaimLineInput, MedikreditPatientPayload } from "./types"

export const ELIGIBILITY_FRESHNESS_HOURS = 24

export function validateClaimPayload(
  patient: MedikreditPatientPayload,
  lines: ClaimLineInput[]
): string[] {
  const errors: string[] = []
  if (!patient.memberNumber?.trim()) errors.push("Patient medical-aid member number is required.")
  if (!patient.dependentCode?.trim()) errors.push("Patient dependent code is required.")
  if (!patient.dateOfBirth?.trim()) errors.push("Patient date of birth is required.")
  if (!patient.sex || patient.sex === "Other") errors.push("Patient sex must be M or F for MediKredit.")

  for (const [index, line] of lines.entries()) {
    if (!/^\d{4}-\d{2}-\d{2}(?:T.*)?$/.test(line.treatmentDate?.trim() ?? "")) {
      errors.push(`Line ${index + 1} requires an ISO treatment date (YYYY-MM-DD).`)
    }
    if (line.tp === 1 && !line.nappiCode?.trim()) {
      errors.push(`Line ${index + 1} is a medication and requires a NAPPI code.`)
    }
    if (line.tp !== 1 && !line.tariffCode?.trim() && line.tp !== 3) {
      errors.push(`Line ${index + 1} requires a tariff code.`)
    }
  }
  return errors
}

export type MedpraxPreflightResult = {
  mode: "required" | "disabled"
  checked: boolean
  warnings: string[]
}

function lookupHasRows(value: unknown): boolean {
  if (Array.isArray(value)) return value.length > 0
  if (!value || typeof value !== "object") return false
  const row = value as Record<string, unknown>
  for (const key of ["results", "items", "data", "rows", "medicines", "tariffs"]) {
    if (Array.isArray(row[key]) && row[key].length > 0) return true
  }
  return Object.keys(row).length > 0
}

/**
 * Live submissions are fail-closed unless Medprax is required, or an operator
 * explicitly enables the certified bypass. Dry-run never calls Medprax.
 */
export async function runMedpraxClaimPreflight(input: {
  lines: ClaimLineInput[]
  planOptionCode: string
  disciplineCode: string
}): Promise<MedpraxPreflightResult> {
  if (
    process.env.MEDIKREDIT_DRY_RUN === "1" &&
    process.env.NODE_ENV !== "production"
  ) {
    return { mode: "disabled", checked: false, warnings: ["Skipped in MediKredit dry-run."] }
  }

  const configured = process.env.MEDPRAX_CLAIM_PREFLIGHT_MODE?.trim().toLowerCase()
  if (configured === "disabled") {
    if (process.env.MEDPRAX_ALLOW_UNVERIFIED_CLAIMS !== "1") {
      throw new Error(
        "Medprax preflight bypass is locked. Set MEDPRAX_ALLOW_UNVERIFIED_CLAIMS=1 only after documenting the certified alternative."
      )
    }
    return {
      mode: "disabled",
      checked: false,
      warnings: ["Medprax preflight explicitly bypassed by server configuration."],
    }
  }
  if (configured !== "required") {
    throw new Error(
      "Set MEDPRAX_CLAIM_PREFLIGHT_MODE=required, or explicitly set disabled plus MEDPRAX_ALLOW_UNVERIFIED_CLAIMS=1."
    )
  }

  const procedures = [...new Set(input.lines.filter((line) => line.tp !== 1).map((line) => line.tariffCode?.trim()).filter(Boolean))] as string[]
  const medicines = [...new Set(input.lines.filter((line) => line.tp === 1).map((line) => line.nappiCode?.trim()).filter(Boolean))] as string[]
  const warnings: string[] = []

  if (procedures.length > 0) {
    const result = await postMedpraxTariffsContractsMedical({
      planOptionCode: input.planOptionCode,
      disciplineCode: input.disciplineCode,
      tariffCodes: procedures,
    })
    if (!lookupHasRows(result)) {
      throw new Error(`Medprax did not confirm tariff code(s): ${procedures.join(", ")}.`)
    }
  }

  for (const nappiCode of medicines) {
    const result = await postMedpraxMedicinesByNappi({ nappiCode })
    if (!lookupHasRows(result)) {
      throw new Error(`Medprax did not confirm NAPPI code ${nappiCode}.`)
    }
  }

  return { mode: "required", checked: true, warnings }
}

/**
 * Claim-level modifier validation — PHISC §2.4 business rules.
 */

import {
  DISCIPLINES_WITHOUT_MODIFIERS,
  getModifierDef,
  isValidModifierForDiscipline,
  type Discipline,
} from "./modifier-catalog"
import type { ClaimLineInput } from "./types"

// ── Types ──────────────────────────────────────────────────────────────────────

export interface ValidationResult {
  lineNumber: number | null
  severity: "error" | "warning"
  ruleId: string
  message: string
}

export interface ValidateClaimOptions {
  lines: ClaimLineInput[]
  discipline?: Discipline | string | null
  isSpecialist?: boolean
  durationMinutes?: number
  isOptometry?: boolean
}

// ── Constants ──────────────────────────────────────────────────────────────────

const MAX_MODIFIERS_PER_LINE = 5
const OPTOMETRY_BANNED_INDICATORS = new Set(["03", "05", "06"])

// ── Validator ──────────────────────────────────────────────────────────────────

export function validateClaimModifiers(opts: ValidateClaimOptions): ValidationResult[] {
  const { lines, discipline, isSpecialist, durationMinutes, isOptometry } = opts
  const results: ValidationResult[] = []

  const disc = discipline as Discipline | undefined

  // Rule: discipline without modifiers should have no modifier codes
  if (
    discipline &&
    DISCIPLINES_WITHOUT_MODIFIERS.includes(discipline as string)
  ) {
    for (const line of lines) {
      const codes = allModifierCodes(line)
      if (codes.length > 0) {
        results.push({
          lineNumber: line.lineNumber,
          severity: "error",
          ruleId: "discipline_no_modifiers",
          message: `Discipline "${discipline}" does not use modifiers. Remove modifier codes from line ${line.lineNumber}.`,
        })
      }
    }
    return results
  }

  for (const line of lines) {
    const codes = allModifierCodes(line)

    // Rule: max 5 modifiers per line
    if (codes.length > MAX_MODIFIERS_PER_LINE) {
      results.push({
        lineNumber: line.lineNumber,
        severity: "error",
        ruleId: "max_modifiers",
        message: `Line ${line.lineNumber} has ${codes.length} modifiers (max ${MAX_MODIFIERS_PER_LINE}).`,
      })
    }

    // Rule: modifier-only lines (tp=3 or iti=05) must have a linked procedure somewhere
    if (line.tp === 3 || line.itemTypeIndicator === "05") {
      const hasProcedureLine = lines.some(
        (l) => l !== line && (l.tp === 2 || l.tp === 3)
      )
      if (!hasProcedureLine) {
        results.push({
          lineNumber: line.lineNumber,
          severity: "error",
          ruleId: "modifier_standalone",
          message: `Line ${line.lineNumber} is modifier-only but no procedural code line exists on this claim.`,
        })
      }
    }

    // Rule: validate modifier codes against discipline catalog
    if (disc) {
      for (const code of codes) {
        if (!isValidModifierForDiscipline(code, disc)) {
          results.push({
            lineNumber: line.lineNumber,
            severity: "warning",
            ruleId: "modifier_not_in_discipline",
            message: `Modifier ${code} on line ${line.lineNumber} is not in the ${disc} catalog.`,
          })
        }
      }
    }

    // Rule: ICD-10 required on tariff lines, NOT on modifier-only lines
    if (
      (line.tp === 2 || line.itemTypeIndicator === "02" || line.itemTypeIndicator === "03") &&
      (!line.icdCodes || line.icdCodes.length === 0)
    ) {
      // 0017 acts as procedure and needs ICD-10
      const has0017 = codes.includes("0017")
      if (has0017) {
        results.push({
          lineNumber: line.lineNumber,
          severity: "error",
          ruleId: "0017_needs_icd",
          message: `Modifier 0017 on line ${line.lineNumber} is treated as a procedure and requires an ICD-10 code.`,
        })
      }
    }

    // Rule: 0017 requires ICD-10 even if it appears as a modifier
    if (codes.includes("0017") && (!line.icdCodes || line.icdCodes.length === 0)) {
      results.push({
        lineNumber: line.lineNumber,
        severity: "error",
        ruleId: "0017_needs_icd",
        message: `Modifier 0017 on line ${line.lineNumber} requires an ICD-10 diagnostic code.`,
      })
    }

    // Rule: optometry banned indicators
    if (isOptometry && line.itemTypeIndicator) {
      if (OPTOMETRY_BANNED_INDICATORS.has(line.itemTypeIndicator)) {
        results.push({
          lineNumber: line.lineNumber,
          severity: "error",
          ruleId: "optometry_banned_indicator",
          message: `Item Type Indicator "${line.itemTypeIndicator}" is not allowed on Optometry claims (line ${line.lineNumber}).`,
        })
      }
    }
  }

  // ── Claim-level rules ──

  const allCodes = lines.flatMap((l) => allModifierCodes(l))

  // Rule: 0023 must always be explicit for anaesthetic claims
  const hasAnaestheticProcedure = lines.some(
    (l) => l.tp === 2 && allModifierCodes(l).some((c) => isAnaestheticRelated(c))
  )
  if (hasAnaestheticProcedure && !allCodes.includes("0023")) {
    results.push({
      lineNumber: null,
      severity: "error",
      ruleId: "0023_must_be_explicit",
      message: "Modifier 0023 (anaesthetic time) must be explicitly submitted — it is never implicit.",
    })
  }

  // Rule: 0005 must appear on ALL procedures under same anaesthetic (including first)
  if (allCodes.includes("0005")) {
    const procLines = lines.filter((l) => l.tp === 2)
    for (const pl of procLines) {
      if (!allModifierCodes(pl).includes("0005")) {
        results.push({
          lineNumber: pl.lineNumber,
          severity: "error",
          ruleId: "0005_all_procedures",
          message: `Modifier 0005 must appear on ALL procedures under the same anaesthetic, including line ${pl.lineNumber}.`,
        })
      }
    }
  }

  // Rule: 0036 only for GP (non-specialist) and only when >60 minutes
  if (allCodes.includes("0036")) {
    if (isSpecialist === true) {
      results.push({
        lineNumber: null,
        severity: "error",
        ruleId: "0036_specialist_not_allowed",
        message: "Modifier 0036 is only for general medical practitioners, not specialist anaesthesiologists.",
      })
    }
    if (durationMinutes != null && durationMinutes <= 60) {
      results.push({
        lineNumber: null,
        severity: "error",
        ruleId: "0036_over_60_only",
        message: "Modifier 0036 only applies when anaesthetic duration exceeds 60 minutes.",
      })
    }
  }

  // Rule: 0011 (emergency compound) — must appear on procedure lines
  if (allCodes.includes("0011")) {
    const procLinesWith0011 = lines.filter(
      (l) => l.tp === 2 && allModifierCodes(l).includes("0011")
    )
    if (procLinesWith0011.length === 0) {
      results.push({
        lineNumber: null,
        severity: "warning",
        ruleId: "0011_on_procedure",
        message: "Modifier 0011 (emergency) should be quoted on procedure lines to indicate which procedures were emergencies.",
      })
    }
  }

  // Deduplicate results by ruleId + lineNumber
  const seen = new Set<string>()
  return results.filter((r) => {
    const key = `${r.ruleId}:${r.lineNumber}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function allModifierCodes(line: ClaimLineInput): string[] {
  const codes = [...(line.modifierCodes ?? [])]
  if (line.modifierCode?.trim() && !codes.includes(line.modifierCode.trim())) {
    codes.push(line.modifierCode.trim())
  }
  return codes
}

const ANAESTHETIC_MODIFIERS = new Set([
  "0018", "0019", "0020", "0021", "0023", "0024", "0025",
  "0027", "0028", "0029", "0030", "0031", "0032", "0033",
  "0034", "0035", "0036", "0037", "0038", "0039", "0040",
  "0041", "0042", "0043", "0044", "0045",
])

function isAnaestheticRelated(code: string): boolean {
  return ANAESTHETIC_MODIFIERS.has(code)
}

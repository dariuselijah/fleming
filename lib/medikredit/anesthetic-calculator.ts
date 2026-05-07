/**
 * Anaesthetic unit calculator — PHISC §2.4, §9.
 *
 * Implements 0023 (time units), 0035 (minimum rule), 0036 (GP 80% reduction),
 * and compound modifier unit contributions.
 */

import type { RoundingMode } from "./modifier-engine"

// ── Types ──────────────────────────────────────────────────────────────────────

export interface AnaestheticUnitBreakdown {
  /** Basic AN units from the procedure code */
  basicUnits: number
  /** Time units from modifier 0023 */
  timeUnits: number
  /** Duration in minutes used to compute time units */
  durationMinutes: number
  /** Additional units from compound modifiers (0018, 0032, etc.) */
  compoundUnits: number
  /** Units bridged by 0035 minimum rule (0 if total already ≥ 7) */
  minimumBridgeUnits: number
  /** Sum before 0036 reduction */
  totalUnitsBeforeReduction: number
  /** 1.0 for specialist, 0.80 for GP >60 min */
  reductionFactor: number
  /** Final effective units */
  effectiveUnits: number
  /** Whether 0035 minimum rule was applied */
  minimumRuleApplied: boolean
  /** Whether 0036 GP reduction was applied */
  gpReductionApplied: boolean
}

export interface AnaestheticLineExpansion {
  label: string
  tariffCode?: string
  modifierCodes: string[]
  quantity: number
  anUnits: number
  effectiveUnits: number
  amount: number
}

// ── Constants ──────────────────────────────────────────────────────────────────

const MINIMUM_AN_UNITS = 7.0
const GP_REDUCTION_FACTOR = 0.80
const UNITS_PER_15MIN_UNDER_60 = 2.0
const UNITS_PER_15MIN_OVER_60 = 3.0

// ── Core calculation ───────────────────────────────────────────────────────────

/**
 * Calculate time units per modifier 0023.
 *
 * - ≤60 min: 2 units per 15-minute period (or part thereof)
 * - >60 min: first 60 min = 8 units, then 3 units per additional 15-min period
 */
export function calculateTimeUnits(durationMinutes: number): number {
  if (durationMinutes <= 0) return 0
  const periods = Math.ceil(durationMinutes / 15)
  if (durationMinutes <= 60) {
    return periods * UNITS_PER_15MIN_UNDER_60
  }
  const periodsIn60 = 4
  const remainingPeriods = periods - periodsIn60
  return periodsIn60 * UNITS_PER_15MIN_UNDER_60 + remainingPeriods * UNITS_PER_15MIN_OVER_60
}

/**
 * Full anaesthetic unit calculation including 0035 minimum rule and 0036 GP reduction.
 */
export function calculateAnaestheticUnits(opts: {
  basicAnUnits: number
  durationMinutes: number
  isSpecialist: boolean
  compoundAnUnits?: number
}): AnaestheticUnitBreakdown {
  const { basicAnUnits, durationMinutes, isSpecialist, compoundAnUnits = 0 } = opts

  const timeUnits = calculateTimeUnits(durationMinutes)
  const rawTotal = basicAnUnits + timeUnits + compoundAnUnits

  let minimumBridgeUnits = 0
  let minimumRuleApplied = false
  if (rawTotal < MINIMUM_AN_UNITS) {
    minimumBridgeUnits = MINIMUM_AN_UNITS - rawTotal
    minimumRuleApplied = true
  }

  const totalBeforeReduction = rawTotal + minimumBridgeUnits

  const applyGpReduction = !isSpecialist && durationMinutes > 60
  const reductionFactor = applyGpReduction ? GP_REDUCTION_FACTOR : 1.0
  const effectiveUnits = totalBeforeReduction * reductionFactor

  return {
    basicUnits: basicAnUnits,
    timeUnits,
    durationMinutes,
    compoundUnits: compoundAnUnits,
    minimumBridgeUnits,
    totalUnitsBeforeReduction: totalBeforeReduction,
    reductionFactor,
    effectiveUnits,
    minimumRuleApplied,
    gpReductionApplied: applyGpReduction,
  }
}

/**
 * Convert effective AN units to a ZAR amount using the Rand Conversion Factor,
 * with rounding per NHRPL (1 cent) or COID (10 cents).
 */
export function calculateAnaestheticAmount(
  effectiveUnits: number,
  rcf: number,
  roundingMode: RoundingMode = "nhrpl"
): number {
  const raw = effectiveUnits * rcf
  if (roundingMode === "coid") {
    return Math.round(raw * 10) / 10
  }
  return Math.round(raw * 100) / 100
}

// ── Line expansion ─────────────────────────────────────────────────────────────

/**
 * Expand a single procedure into the full set of anaesthetic claim lines
 * (procedure, 0023 time, optional 0035, optional 0036, compound modifier lines).
 */
export function expandAnaestheticLines(opts: {
  procedureCode: string
  basicAnUnits: number
  durationMinutes: number
  isSpecialist: boolean
  compoundModifiers?: Array<{ code: string; anUnits: number }>
  rcf: number
  roundingMode?: RoundingMode
  treatmentDate: string
}): AnaestheticLineExpansion[] {
  const {
    procedureCode,
    basicAnUnits,
    durationMinutes,
    isSpecialist,
    compoundModifiers = [],
    rcf,
    roundingMode = "nhrpl",
    treatmentDate: _treatmentDate,
  } = opts

  const compoundTotalUnits = compoundModifiers.reduce((s, m) => s + m.anUnits, 0)

  const breakdown = calculateAnaestheticUnits({
    basicAnUnits,
    durationMinutes,
    isSpecialist,
    compoundAnUnits: compoundTotalUnits,
  })

  const round = (units: number) => calculateAnaestheticAmount(
    units * breakdown.reductionFactor,
    rcf,
    roundingMode
  )

  const lines: AnaestheticLineExpansion[] = []

  const procMods: string[] = []
  if (breakdown.gpReductionApplied) procMods.push("0036")

  lines.push({
    label: `Procedure ${procedureCode}`,
    tariffCode: procedureCode,
    modifierCodes: procMods,
    quantity: 1,
    anUnits: basicAnUnits,
    effectiveUnits: basicAnUnits * breakdown.reductionFactor,
    amount: round(basicAnUnits),
  })

  for (const cm of compoundModifiers) {
    const cmMods: string[] = []
    if (breakdown.gpReductionApplied) cmMods.push("0036")
    lines.push({
      label: `Modifier ${cm.code}`,
      modifierCodes: cmMods,
      quantity: 1,
      anUnits: cm.anUnits,
      effectiveUnits: cm.anUnits * breakdown.reductionFactor,
      amount: round(cm.anUnits),
    })
  }

  const timeMods = ["0021", "0025"]
  if (breakdown.gpReductionApplied) timeMods.unshift("0036")
  lines.push({
    label: "Anaesthetic time (0023)",
    tariffCode: "0023",
    modifierCodes: timeMods,
    quantity: durationMinutes,
    anUnits: breakdown.timeUnits,
    effectiveUnits: breakdown.timeUnits * breakdown.reductionFactor,
    amount: round(breakdown.timeUnits),
  })

  if (breakdown.minimumRuleApplied) {
    const minMods: string[] = []
    if (breakdown.gpReductionApplied) minMods.push("0036")
    lines.push({
      label: "Minimum rule (0035)",
      tariffCode: "0035",
      modifierCodes: minMods,
      quantity: 1,
      anUnits: breakdown.minimumBridgeUnits,
      effectiveUnits: breakdown.minimumBridgeUnits * breakdown.reductionFactor,
      amount: round(breakdown.minimumBridgeUnits),
    })
  }

  return lines
}

/**
 * Modifier calculation engine — PHISC §2.4.
 *
 * Processing order:
 *   1. Reduction modifiers (applied first to the base amount)
 *   2. Add modifiers (applied to the already-reduced value)
 *   3. Compound modifiers (custom logic per calculationKey)
 *   4. Informational modifiers (pass-through, no calculation)
 */

import {
  getModifierDef,
  type Discipline,
  type ModifierDef,
  type ModifierType,
} from "./modifier-catalog"
import type { ClaimLineInput, ItemTypeIndicator } from "./types"

// ── Types ──────────────────────────────────────────────────────────────────────

export type RoundingMode = "nhrpl" | "coid"

export interface ModifierBreakdownEntry {
  code: string
  type: ModifierType
  description: string
  /** Value added or subtracted (signed: negative for reduction) */
  delta: number
  /** Running total after this modifier */
  runningTotal: number
}

export interface ApplyModifiersResult {
  /** Final adjusted amount after all modifiers */
  adjustedAmount: number
  /** Step-by-step breakdown */
  breakdown: ModifierBreakdownEntry[]
}

// ── Rounding ───────────────────────────────────────────────────────────────────

/** Round to nearest 1 cent (NHRPL) or 10 cents (COID). */
export function roundAmount(amount: number, mode: RoundingMode = "nhrpl"): number {
  if (mode === "coid") {
    return Math.round(amount * 10) / 10
  }
  return Math.round(amount * 100) / 100
}

// ── Item Type Indicator ────────────────────────────────────────────────────────

/**
 * Resolve PHISC Table 6 item type indicator based on line content.
 *
 * 01 = Product only, 02 = Tariff only, 03 = Tariff + Modifier,
 * 04 = Tariff + Product, 05 = Modifier only, 06 = Dental tariff + lab tariff.
 */
export function resolveItemTypeIndicator(line: Pick<ClaimLineInput, "tp" | "tariffCode" | "nappiCode" | "modifierCodes" | "modifierCode">): ItemTypeIndicator {
  const hasTariff = !!line.tariffCode?.trim()
  const hasProduct = !!line.nappiCode?.trim()
  const hasModifier =
    (line.modifierCodes?.length ?? 0) > 0 || !!line.modifierCode?.trim()
  const isModifierOnly = line.tp === 3

  if (isModifierOnly && !hasTariff && !hasProduct) return "05"
  if (hasTariff && hasModifier) return "03"
  if (hasTariff && hasProduct) return "04"
  if (hasProduct && !hasTariff) return "01"
  return "02"
}

// ── Modifier sorting ───────────────────────────────────────────────────────────

interface ModifierWithSequence {
  code: string
  sequence?: number
  def?: ModifierDef
}

/** Sort modifiers: reductions first, then adds, then compound, then informational.
 * Within each group, sort by explicit sequence number. */
export function sortModifiersBySequence(modifiers: ModifierWithSequence[]): ModifierWithSequence[] {
  const typeOrder: Record<ModifierType, number> = {
    reduction: 0,
    add: 1,
    compound: 2,
    informational: 3,
  }
  return [...modifiers].sort((a, b) => {
    const ta = a.def?.modifierType ?? "informational"
    const tb = b.def?.modifierType ?? "informational"
    const orderDiff = typeOrder[ta] - typeOrder[tb]
    if (orderDiff !== 0) return orderDiff
    return (a.sequence ?? 0) - (b.sequence ?? 0)
  })
}

// ── Apply modifiers ────────────────────────────────────────────────────────────

/**
 * Apply a set of modifiers to a base amount, following PHISC ordering rules.
 *
 * @param baseAmount - the original procedure/tariff ZAR amount
 * @param modifierCodes - list of modifier codes on the line
 * @param discipline - provider discipline for catalog lookup
 * @param roundingMode - NHRPL (1 cent) or COID (10 cents)
 * @param sequences - optional parallel array of sequence numbers
 */
export function applyModifiers(
  baseAmount: number,
  modifierCodes: string[],
  discipline: Discipline,
  roundingMode: RoundingMode = "nhrpl",
  sequences?: number[]
): ApplyModifiersResult {
  if (!modifierCodes.length) {
    return { adjustedAmount: baseAmount, breakdown: [] }
  }

  const entries: ModifierWithSequence[] = modifierCodes.map((code, i) => ({
    code,
    sequence: sequences?.[i],
    def: getModifierDef(code, discipline),
  }))

  const sorted = sortModifiersBySequence(entries)
  const breakdown: ModifierBreakdownEntry[] = []
  let current = baseAmount

  for (const entry of sorted) {
    const def = entry.def
    if (!def) {
      breakdown.push({
        code: entry.code,
        type: "informational",
        description: `Unknown modifier ${entry.code}`,
        delta: 0,
        runningTotal: current,
      })
      continue
    }

    let delta = 0

    switch (def.modifierType) {
      case "reduction": {
        if (def.percentageValue != null) {
          const reduced = roundAmount(current * def.percentageValue, roundingMode)
          delta = reduced - current
          current = reduced
        }
        break
      }
      case "add": {
        if (def.percentageValue != null) {
          const addition = roundAmount(current * def.percentageValue, roundingMode)
          delta = addition
          current = roundAmount(current + addition, roundingMode)
        }
        break
      }
      case "compound": {
        if (def.unitValue != null) {
          delta = def.unitValue
          current = roundAmount(current + delta, roundingMode)
        }
        break
      }
      case "informational":
      default:
        break
    }

    breakdown.push({
      code: entry.code,
      type: def.modifierType,
      description: def.description,
      delta,
      runningTotal: current,
    })
  }

  return { adjustedAmount: roundAmount(current, roundingMode), breakdown }
}

/**
 * Heuristic prescribing draft + safety flags (allergy / duplicate class hints).
 * Not a substitute for clinical judgment or formal interaction databases.
 */
import type { PrescriptionItem } from "@/lib/clinical-workspace/types"

function randomId() {
  return `rx-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

const ALLERGY_DRUG_CLASSES: { pattern: RegExp; label: string }[] = [
  { pattern: /penicillin|amoxicillin|cephalospor/i, label: "beta-lactam antibiotic" },
  { pattern: /sulfa|sulfonamide|co-trimoxazole/i, label: "sulfonamide" },
  { pattern: /nsaid|aspirin|ibuprofen|diclofenac/i, label: "NSAID" },
]

export function buildPrescriptionDraft(params: {
  allergies: string[]
  chronicConditions: string[]
  encounterProblems: string[]
  activeMedNames: string[]
  focus?: string
}): {
  items: PrescriptionItem[]
  warnings: string[]
  contraindications: string[]
} {
  const textBlob = [
    ...params.encounterProblems,
    ...params.chronicConditions,
    params.focus ?? "",
  ]
    .join(" ")
    .toLowerCase()

  const items: PrescriptionItem[] = []
  const warnings: string[] = []
  const contraindications: string[] = []

  const hasHtn = /hypertension|high bp|elevated bp|htn/i.test(textBlob)
  const hasPain = /pain|ache|headache|migraine/i.test(textBlob)
  const hasDyslip = /dyslipid|cholesterol|statin|hyperlipid/i.test(textBlob)
  const hasDm = /diabetes|dm\b|hyperglyc/i.test(textBlob)

  if (hasHtn) {
    items.push({
      id: randomId(),
      drug: "Amlodipine",
      strength: "5 mg",
      route: "Oral",
      frequency: "Once daily",
      duration: "28 days",
      instructions: "Review BP at follow-up; consider morning dosing.",
      reasoning:
        "First-line calcium channel blocker for uncomplicated hypertension when no compelling indication for ACE/ARB; titrate per response.",
    })
  }
  if (hasDyslip || /statin/i.test(textBlob)) {
    items.push({
      id: randomId(),
      drug: "Atorvastatin",
      strength: "20 mg",
      route: "Oral",
      frequency: "At night",
      duration: "28 days",
      instructions: "Monitor LFTs if clinically indicated.",
      reasoning: "Moderate-intensity statin for ASCVD risk reduction when dyslipidaemia documented or high risk.",
    })
  }
  if (hasDm) {
    items.push({
      id: randomId(),
      drug: "Metformin",
      strength: "500 mg",
      route: "Oral",
      frequency: "Twice daily with meals",
      duration: "28 days",
      instructions: "Hold if acute illness or contrast study per local protocol.",
      reasoning: "First-line oral agent for type 2 diabetes when eGFR adequate and no contraindications.",
    })
  }
  if (hasPain && items.length < 3) {
    items.push({
      id: randomId(),
      drug: "Paracetamol",
      strength: "1 g",
      route: "Oral",
      frequency: "Up to QID PRN",
      duration: "5 days",
      instructions: "Max 4 g/day in adults without hepatic impairment.",
      reasoning: "Analgesic with favourable GI profile vs NSAIDs when appropriate.",
    })
  }

  if (items.length === 0) {
    items.push({
      id: randomId(),
      drug: "Review diagnosis",
      strength: undefined,
      route: undefined,
      frequency: undefined,
      duration: undefined,
      instructions: "Insufficient structured problem list for automated suggestions — refine /prescribe query.",
      reasoning:
        "No strong keyword match to common protocols; confirm indication, renal function, and pregnancy status before prescribing.",
    })
  }

  const allergyLower = params.allergies.map((a) => a.toLowerCase())
  for (const item of items) {
    const drugLower = item.drug.toLowerCase()
    for (const a of allergyLower) {
      if (a.length > 2 && drugLower.includes(a)) {
        contraindications.push(`Possible match: patient allergy "${a}" vs ${item.drug}`)
      }
    }
    for (const { pattern, label } of ALLERGY_DRUG_CLASSES) {
      if (allergyLower.some((x) => pattern.test(x)) && pattern.test(drugLower)) {
        contraindications.push(`Allergy to ${label} may relate to ${item.drug} — verify before use.`)
      }
    }
  }

  const activeSet = new Set(params.activeMedNames.map((n) => n.toLowerCase()))
  for (const item of items) {
    if (activeSet.has(item.drug.toLowerCase())) {
      warnings.push(`Patient may already be on ${item.drug} — avoid duplicate unless intentional.`)
    }
  }

  return { items, warnings, contraindications }
}

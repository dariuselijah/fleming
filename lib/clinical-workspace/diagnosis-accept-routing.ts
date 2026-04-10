/**
 * Routes AI-extracted "Active & Historical Dx" lines on Accept:
 * longitudinal chronic problem list vs encounter-only problems.
 * Conservative: when unclear, prefer encounter-only (do not pollute chronic list).
 */

const EXCLUDE_CHRONIC = [
  /\bresolved\b/i,
  /\bformer\b/i,
  /\bprevious\s+acute\b/i,
  /\bpast\s+acute\b/i,
  /\bhistory\s+of\s+acute\b/i,
  /\bacute\s+(?!.*\bchronic\b)/i, // "acute X" unless "chronic" also appears
  /\b(possible|probable|suspected|rule\s*out|under\s+evaluation)\b/i,
  /\btobacco\b/i,
  /\bsmok(ing|er|es)\b/i,
  /\bcigarette/i,
  /\balcohol\b/i,
  /\betoh\b/i,
  /\bbeer(s)?\b/i,
  /\bwine\b/i,
  /\bdrinks?\s+(per|a\s+week|daily)\b/i,
  /\bpacks?\s*(per|a\s+week|\/)\b/i,
  /\bsocial\s+history\b/i,
  /\boccupational\b/i,
  /\bdenies\b/i,
  /\bnkda\b/i,
  /\bno\s+known\s+drug\s+allergies\b/i,
]

/** If any match, never promote to chronic (social, acute-only, resolved, etc.). */
function matchesExclusion(text: string): boolean {
  const t = text.trim()
  if (!t) return true
  return EXCLUDE_CHRONIC.some((re) => re.test(t))
}

/** Strong signals for longitudinal problem list (after exclusions). */
const CHRONIC_INCLUDE = [
  /\btype\s*[12]\s*diabetes\b/i,
  /\bdiabetes\s*mellitus\b/i,
  /\bdiabetes\b/i,
  /\bhypertension\b/i,
  /\bhtn\b/i,
  /\bhyperlipid/i,
  /\bhypercholesterol/i,
  /\bdyslipid/i,
  /\bcopd\b/i,
  /\bchronic\s+kidney\b/i,
  /\bckd\s*(stage|\d)/i,
  /\bheart\s+failure\b/i,
  /\b(hfref|hfpef|hfrhf)\b/i,
  /\batrial\s+fibrillation\b/i,
  /\bafib\b/i,
  /\bhypothyroid/i,
  /\bhyperthyroid/i,
  /\bepilepsy\b/i,
  /\bparkinson/i,
  /\brheumatoid\s+arthritis\b/i,
  /\bcrohn/i,
  /\bulcerative\s+colitis\b/i,
  /\bpsoriasis\b/i,
  /\bosteoarthritis\b/i,
  /\bchronic\s+back\s+pain\b/i,
  /\bchronic\s+pain\b/i,
  /\bchronic\s+asthma\b/i,
  /\basthma\b.*\bchronic\b/i,
  /\bchronic\s+obstructive\b/i,
  /\bischemic\s+heart\s+disease\b/i,
  /\bcoronary\s+artery\s+disease\b/i,
  /\bcad\b/i,
  /\bmi\b.*\b(old|prior|history)\b/i,
  /\bstroke\b.*\b(history|prior|old)\b/i,
  /\btia\b.*\b(history|prior)\b/i,
  /\bdepression\b/i,
  /\banxiety\s+disorder\b/i,
  /\bobstructive\s+sleep\s+apnea\b/i,
  /\bosa\b/i,
  /\bgout\b.*\bchronic\b/i,
  /\bchronic\s+gout\b/i,
]

function matchesChronicInclude(text: string): boolean {
  const t = text.trim()
  return CHRONIC_INCLUDE.some((re) => re.test(t))
}

/**
 * Whether this diagnosis line should be added to the patient's longitudinal chronic list.
 * Returns false for social habits, resolved conditions, acute-only phrasing, etc.
 */
export function shouldPromoteDiagnosisToChronic(text: string): boolean {
  const t = text.replace(/\s+/g, " ").trim()
  if (!t) return false
  if (matchesExclusion(t)) return false
  return matchesChronicInclude(t)
}

export type DiagnosisAcceptRoute = "chronic" | "encounter"

export function routeAcceptedDiagnosis(text: string): DiagnosisAcceptRoute {
  return shouldPromoteDiagnosisToChronic(text) ? "chronic" : "encounter"
}

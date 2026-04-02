/**
 * Patient Context Extractor
 *
 * Extracts structured patient demographics and clinical context from
 * conversation history to inject into system prompts for more personalized
 * and accurate clinical recommendations.
 */

export interface PatientContext {
  age: number | null
  sex: "male" | "female" | "other" | null
  weight: { value: number; unit: "kg" | "lbs" } | null
  height: { value: number; unit: "cm" | "in" } | null
  comorbidities: string[]
  medications: string[]
  allergies: string[]
  renalFunction: { creatinine?: number; gfr?: number } | null
  hepaticFunction: string | null
  pregnancyStatus: "pregnant" | "breastfeeding" | "not_pregnant" | null
}

const AGE_PATTERN = /\b(\d{1,3})\s*(?:y(?:ear)?[s\b]?\s*(?:old)?|yo\b|y\/o\b|y\.o\.)/i
const SEX_PATTERN = /\b(male|female|man|woman|M|F)\b/i
const WEIGHT_PATTERN = /\b(\d{2,3}(?:\.\d)?)\s*(?:kg|kilograms?|lbs?|pounds?)\b/i
const HEIGHT_PATTERN = /\b(\d{2,3}(?:\.\d)?)\s*(?:cm|centimeters?|in(?:ches)?)\b/i
const CREATININE_PATTERN = /\b(?:cr(?:eatinine)?|sCr)\s*(?:of|=|:)?\s*(\d+(?:\.\d+)?)\s*(?:mg\/dl)?/i
const GFR_PATTERN = /\b(?:e?GFR|glomerular)\s*(?:of|=|:)?\s*(\d+(?:\.\d+)?)\s*(?:ml\/min)?/i
const PREGNANCY_PATTERN = /\b(pregnant|pregnancy|gravid|breastfeeding|lactating|nursing|postpartum)\b/i

const COMORBIDITY_TERMS = [
  "hypertension", "diabetes", "diabetes mellitus", "type 1 diabetes", "type 2 diabetes",
  "heart failure", "hfref", "hfpef", "atrial fibrillation", "afib", "cad", "coronary artery disease",
  "copd", "asthma", "ckd", "chronic kidney disease", "esrd", "cirrhosis", "hepatitis",
  "hiv", "cancer", "stroke", "tia", "dvt", "pe", "pulmonary embolism",
  "obesity", "hypothyroidism", "hyperthyroidism", "osteoporosis", "depression", "anxiety",
  "epilepsy", "dementia", "alzheimer", "parkinson", "lupus", "rheumatoid arthritis",
  "gout", "sickle cell", "anemia", "ibd", "crohn", "ulcerative colitis",
]

const ALLERGY_PATTERN = /\ballerg(?:ic|y|ies)\s+(?:to\s+)?([\w\s,/-]+?)(?:\.|,\s*(?:and|with)|$)/gi

function extractFromText(text: string): Partial<PatientContext> {
  const ctx: Partial<PatientContext> = {}

  const ageMatch = text.match(AGE_PATTERN)
  if (ageMatch) {
    const age = parseInt(ageMatch[1])
    if (age > 0 && age < 130) ctx.age = age
  }

  const sexMatch = text.match(SEX_PATTERN)
  if (sexMatch) {
    const s = sexMatch[1].toLowerCase()
    if (s === "male" || s === "man" || s === "m") ctx.sex = "male"
    else if (s === "female" || s === "woman" || s === "f") ctx.sex = "female"
  }

  const weightMatch = text.match(WEIGHT_PATTERN)
  if (weightMatch) {
    const val = parseFloat(weightMatch[1])
    const unit = /kg|kilo/i.test(weightMatch[0]) ? "kg" as const : "lbs" as const
    if (val > 10 && val < 500) ctx.weight = { value: val, unit }
  }

  const crMatch = text.match(CREATININE_PATTERN)
  const gfrMatch = text.match(GFR_PATTERN)
  if (crMatch || gfrMatch) {
    ctx.renalFunction = {}
    if (crMatch) ctx.renalFunction.creatinine = parseFloat(crMatch[1])
    if (gfrMatch) ctx.renalFunction.gfr = parseFloat(gfrMatch[1])
  }

  const pregMatch = text.match(PREGNANCY_PATTERN)
  if (pregMatch) {
    const term = pregMatch[1].toLowerCase()
    if (["breastfeeding", "lactating", "nursing"].includes(term)) ctx.pregnancyStatus = "breastfeeding"
    else ctx.pregnancyStatus = "pregnant"
  }

  const lower = text.toLowerCase()
  const comorbidities: string[] = []
  for (const term of COMORBIDITY_TERMS) {
    if (lower.includes(term)) comorbidities.push(term)
  }
  if (comorbidities.length > 0) ctx.comorbidities = comorbidities

  const allergies: string[] = []
  let allergyMatch: RegExpExecArray | null
  while ((allergyMatch = ALLERGY_PATTERN.exec(text)) !== null) {
    const items = allergyMatch[1].split(/,\s*|\s+and\s+/).map(s => s.trim()).filter(Boolean)
    allergies.push(...items)
  }
  if (allergies.length > 0) ctx.allergies = allergies

  return ctx
}

export function extractPatientContext(messages: Array<{ role: string; content: string }>): PatientContext {
  const base: PatientContext = {
    age: null,
    sex: null,
    weight: null,
    height: null,
    comorbidities: [],
    medications: [],
    allergies: [],
    renalFunction: null,
    hepaticFunction: null,
    pregnancyStatus: null,
  }

  const userMessages = messages
    .filter(m => m.role === "user" && typeof m.content === "string")
    .map(m => m.content)

  for (const text of userMessages) {
    const partial = extractFromText(text)
    if (partial.age != null && base.age == null) base.age = partial.age
    if (partial.sex != null && base.sex == null) base.sex = partial.sex
    if (partial.weight != null && base.weight == null) base.weight = partial.weight
    if (partial.height != null && base.height == null) base.height = partial.height
    if (partial.renalFunction && base.renalFunction == null) base.renalFunction = partial.renalFunction
    if (partial.pregnancyStatus && base.pregnancyStatus == null) base.pregnancyStatus = partial.pregnancyStatus
    if (partial.comorbidities) base.comorbidities.push(...partial.comorbidities)
    if (partial.allergies) base.allergies.push(...partial.allergies)
  }

  base.comorbidities = [...new Set(base.comorbidities)]
  base.allergies = [...new Set(base.allergies)]

  return base
}

export function buildPatientContextPrompt(ctx: PatientContext): string | null {
  const parts: string[] = []

  if (ctx.age || ctx.sex) {
    const ageSex = [
      ctx.age ? `${ctx.age} years old` : null,
      ctx.sex,
    ].filter(Boolean).join(", ")
    parts.push(`Patient: ${ageSex}`)
  }

  if (ctx.weight) {
    parts.push(`Weight: ${ctx.weight.value} ${ctx.weight.unit}`)
  }

  if (ctx.comorbidities.length > 0) {
    parts.push(`Comorbidities: ${ctx.comorbidities.join(", ")}`)
  }

  if (ctx.medications.length > 0) {
    parts.push(`Current medications: ${ctx.medications.join(", ")}`)
  }

  if (ctx.allergies.length > 0) {
    parts.push(`Allergies: ${ctx.allergies.join(", ")}`)
  }

  if (ctx.renalFunction) {
    const renal = []
    if (ctx.renalFunction.creatinine) renal.push(`Cr ${ctx.renalFunction.creatinine} mg/dL`)
    if (ctx.renalFunction.gfr) renal.push(`eGFR ${ctx.renalFunction.gfr} mL/min`)
    parts.push(`Renal function: ${renal.join(", ")}`)
  }

  if (ctx.pregnancyStatus === "pregnant") {
    parts.push("**PREGNANT** — consider teratogenicity and adjust medications accordingly")
  } else if (ctx.pregnancyStatus === "breastfeeding") {
    parts.push("**BREASTFEEDING** — consider lactation safety for all medications")
  }

  if (parts.length === 0) return null

  return [
    "\n<patient_context>",
    "The following patient demographics were extracted from the conversation.",
    "Tailor your recommendations to this patient's specific clinical profile:",
    ...parts.map(p => `- ${p}`),
    "</patient_context>",
  ].join("\n")
}

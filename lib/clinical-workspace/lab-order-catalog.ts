/**
 * Curated SA-style lab panels / tests for ordering UI (search + add free text).
 * Synonyms help match AI extraction and scribe phrases.
 */

export type LabCatalogEntry = {
  id: string
  label: string
  category: string
  synonyms?: string[]
}

/** Abbreviations and phrases that imply a lab order (not surgical procedure). */
const LAB_KEYWORD_HINTS =
  /\b(fbc|fbcc|u&e|uec|lft|tft|hba1c|a1c|lipid|crp|esr|inr|pt|aptt|ptt|uds|urine\s*dip|culture|fbc\s*full|full\s*blood|urea|electrolytes|creatinine|egfr|alt|ast|ggt|alp|bilirubin|albumin|globulin|ferritin|b12|folate|iron\s*studies|tsh|ft4|ft3|cortisol|acth|psa|cea|ca\s*125|ca\s*19-9|afp|hcg|beta\s*hcg|troponin|ck|ck-mb|nt-probnp|ddimer|d-dimer|fibrinogen|coag|coags|blood\s*gas|abg|vbg|lactate|amylase|lipase|calcium|phosphate|magnesium|urate|urate\s*acid|vdrl|hiv|hep\s*b|hep\s*c|hcv|hbsag|hcv\s*rna|blood\s*culture|sputum|stool\s*occult|calprotectin|ana|dsdna|anca|rf|ccp|complement|immunoglobulins|spep|bone\s*profile|renal\s*profile|liver\s*profile|thyroid\s*profile|metabolic\s*panel|bmp|cmp)\b/i

export const LAB_ORDER_CATALOG: LabCatalogEntry[] = [
  // Haematology
  { id: "fbc", label: "Full blood count (FBC)", category: "Haematology", synonyms: ["fbc", "full blood count", "cbc"] },
  { id: "esr", label: "Erythrocyte sedimentation rate (ESR)", category: "Haematology", synonyms: ["esr"] },
  { id: "crp", label: "C-reactive protein (CRP)", category: "Haematology", synonyms: ["crp"] },
  { id: "coag", label: "Coagulation screen (INR / PT / APTT)", category: "Haematology", synonyms: ["inr", "pt", "aptt", "coags", "coagulation"] },
  { id: "film", label: "Blood film / morphology", category: "Haematology" },
  { id: "retic", label: "Reticulocyte count", category: "Haematology" },
  { id: "iron-studies", label: "Iron studies (ferritin, transferrin sat.)", category: "Haematology", synonyms: ["iron studies", "ferritin"] },
  { id: "b12-folate", label: "Vitamin B12 and folate", category: "Haematology", synonyms: ["b12", "folate"] },
  { id: "haemoglobinopathy", label: "Haemoglobinopathy screen", category: "Haematology" },
  { id: "g6pd", label: "G6PD assay", category: "Haematology" },
  { id: "d-dimer", label: "D-dimer", category: "Haematology", synonyms: ["ddimer", "d dimer"] },
  { id: "fibrinogen", label: "Fibrinogen", category: "Haematology" },
  // Chemistry / renal
  { id: "uec", label: "Urea & electrolytes (U&E)", category: "Chemistry", synonyms: ["u&e", "uec", "renal profile", "kidney function", "renal function"] },
  { id: "egfr", label: "eGFR (calculated)", category: "Chemistry", synonyms: ["egfr"] },
  { id: "lft", label: "Liver function tests (LFT)", category: "Chemistry", synonyms: ["lft", "liver profile", "liver function"] },
  { id: "bone", label: "Bone profile (Ca, PO4, ALP)", category: "Chemistry", synonyms: ["bone profile", "calcium", "phosphate"] },
  { id: "lipids", label: "Lipid profile", category: "Chemistry", synonyms: ["lipids", "cholesterol", "hdl", "ldl", "triglycerides"] },
  { id: "glucose", label: "Glucose (fasting / random)", category: "Chemistry", synonyms: ["blood sugar", "glucose", "fbs"] },
  { id: "hba1c", label: "HbA1c (glycated haemoglobin)", category: "Chemistry", synonyms: ["hba1c", "a1c", "glycated"] },
  { id: "uric", label: "Uric acid", category: "Chemistry", synonyms: ["urate"] },
  { id: "magnesium", label: "Magnesium", category: "Chemistry" },
  { id: "lactate", label: "Lactate", category: "Chemistry", synonyms: ["lactic acid"] },
  { id: "amylase", label: "Amylase", category: "Chemistry" },
  { id: "lipase", label: "Lipase", category: "Chemistry" },
  { id: "osmolality", label: "Serum osmolality", category: "Chemistry" },
  // Endocrine
  { id: "tft", label: "Thyroid function (TSH, FT4)", category: "Endocrine", synonyms: ["tft", "thyroid", "tsh", "ft4"] },
  { id: "ft3", label: "Free T3", category: "Endocrine" },
  { id: "cortisol", label: "Cortisol (AM / random)", category: "Endocrine" },
  { id: "acth", label: "ACTH", category: "Endocrine" },
  { id: "prolactin", label: "Prolactin", category: "Endocrine" },
  { id: "testosterone", label: "Testosterone", category: "Endocrine" },
  { id: "lh-fsh", label: "LH / FSH", category: "Endocrine" },
  { id: "oestradiol", label: "Oestradiol", category: "Endocrine" },
  { id: "progesterone", label: "Progesterone", category: "Endocrine" },
  { id: "insulin", label: "Insulin / C-peptide", category: "Endocrine" },
  { id: "hba1c-endo", label: "HbA1c (diabetes monitoring)", category: "Endocrine" },
  // Microbiology
  { id: "blood-culture", label: "Blood cultures", category: "Microbiology", synonyms: ["blood culture"] },
  { id: "urine-culture", label: "Urine culture & sensitivity", category: "Microbiology", synonyms: ["urine culture", "mc&s"] },
  { id: "urine-dip", label: "Urine dipstick / microscopy", category: "Microbiology", synonyms: ["urinalysis", "uds", "urine dip"] },
  { id: "sputum-culture", label: "Sputum culture", category: "Microbiology" },
  { id: "stool-culture", label: "Stool culture", category: "Microbiology" },
  { id: "c-diff", label: "C. difficile toxin / PCR", category: "Microbiology", synonyms: ["c diff", "clostridioides"] },
  { id: "hep-b", label: "Hepatitis B serology", category: "Microbiology", synonyms: ["hbsag", "hep b"] },
  { id: "hep-c", label: "Hepatitis C antibody / RNA", category: "Microbiology", synonyms: ["hcv", "hep c"] },
  { id: "hiv", label: "HIV test (Ag/Ab)", category: "Microbiology", synonyms: ["hiv screen"] },
  { id: "syphilis", label: "Syphilis serology (VDRL / TPPA)", category: "Microbiology", synonyms: ["vdrl"] },
  { id: "covid-pcr", label: "SARS-CoV-2 PCR", category: "Microbiology", synonyms: ["covid", "coronavirus"] },
  { id: "influenza", label: "Influenza A/B PCR", category: "Microbiology" },
  { id: "tb-quantiferon", label: "TB Quantiferon / IGRA", category: "Microbiology", synonyms: ["quantiferon", "igra"] },
  // Immunology / serology
  { id: "ana", label: "ANA screen", category: "Immunology", synonyms: ["ana"] },
  { id: "anca", label: "ANCA", category: "Immunology" },
  { id: "anti-dsDNA", label: "Anti-dsDNA", category: "Immunology", synonyms: ["dsdna"] },
  { id: "rf", label: "Rheumatoid factor (RF)", category: "Immunology", synonyms: ["rheumatoid factor"] },
  { id: "anti-ccp", label: "Anti-CCP", category: "Immunology", synonyms: ["ccp"] },
  { id: "complement", label: "Complement C3 / C4", category: "Immunology" },
  { id: "ige", label: "Total IgE", category: "Immunology" },
  { id: "specific-ige", label: "Specific IgE panel", category: "Immunology" },
  // Cardiac / acute
  { id: "troponin", label: "High-sensitivity troponin", category: "Cardiac", synonyms: ["troponin", "trop"] },
  { id: "ck", label: "Creatine kinase (CK)", category: "Cardiac" },
  { id: "bnp", label: "BNP / NT-proBNP", category: "Cardiac", synonyms: ["bnp", "ntprobnp", "nt-probnp"] },
  { id: "ddimer-cardiac", label: "D-dimer (VTE workup)", category: "Cardiac" },
  // Tumour markers (use sparingly)
  { id: "psa", label: "PSA", category: "Tumour markers", synonyms: ["psa"] },
  { id: "cea", label: "CEA", category: "Tumour markers" },
  { id: "ca125", label: "CA-125", category: "Tumour markers", synonyms: ["ca 125"] },
  { id: "ca199", label: "CA 19-9", category: "Tumour markers", synonyms: ["ca19-9"] },
  { id: "afp", label: "AFP", category: "Tumour markers" },
  { id: "beta-hcg", label: "Beta-hCG", category: "Tumour markers", synonyms: ["hcg", "bhcg"] },
  // Other
  { id: "blood-gas", label: "Arterial / venous blood gas", category: "Other", synonyms: ["abg", "vbg", "blood gas"] },
  { id: "osmol-urine", label: "Urine osmolality", category: "Other" },
  { id: "calprotectin", label: "Faecal calprotectin", category: "Other" },
  { id: "stool-occult", label: "Faecal occult blood (FOBT)", category: "Other" },
  { id: "iron-overload", label: "Transferrin saturation / ferritin (iron overload)", category: "Other" },
  { id: "porphyrin", label: "Porphyrin screen", category: "Other" },
  { id: "heavy-metals", label: "Heavy metals (blood / urine)", category: "Other" },
  { id: "therapeutic-drug", label: "Therapeutic drug monitoring (TDM)", category: "Other", synonyms: ["drug levels", "vancomycin level", "digoxin level"] },
  { id: "pregnancy-test", label: "Urine / serum pregnancy test", category: "Other", synonyms: ["beta hcg urine", "upt"] },
  { id: "group-save", label: "Group & save (cross-match prep)", category: "Other", synonyms: ["group and save", "cross match"] },
  { id: "cross-match", label: "Cross-match", category: "Other" },
]

function normalize(s: string): string {
  return s.replace(/\s+/g, " ").trim().toLowerCase()
}

export function searchLabCatalog(query: string, limit = 24): LabCatalogEntry[] {
  const q = normalize(query)
  if (!q) return LAB_ORDER_CATALOG.slice(0, limit)
  const scored = LAB_ORDER_CATALOG.map((entry) => {
    const label = normalize(entry.label)
    const cat = normalize(entry.category)
    const syns = [entry.label, ...(entry.synonyms ?? [])].map(normalize)
    let score = 0
    if (syns.some((s) => s === q || s.startsWith(q))) score = 100
    else if (label.includes(q) || syns.some((s) => s.includes(q))) score = 70
    else if (cat.includes(q)) score = 40
    else if (q.length >= 2 && label.split(/\s+/).some((w) => w.startsWith(q))) score = 35
    return { entry, score }
  })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || a.entry.label.localeCompare(b.entry.label))
  return scored.slice(0, limit).map((x) => x.entry)
}

/** Match free-text procedure lines to catalog entries (for AI suggested chips). */
export function matchProcedureLinesToCatalog(procedureLines: string[]): LabCatalogEntry[] {
  const seen = new Set<string>()
  const out: LabCatalogEntry[] = []
  for (const line of procedureLines) {
    const n = normalize(line)
    if (n.length < 2) continue
    for (const entry of LAB_ORDER_CATALOG) {
      if (seen.has(entry.id)) continue
      const hay = `${normalize(entry.label)} ${(entry.synonyms ?? []).map(normalize).join(" ")}`
      if (hay.includes(n) || n.includes(normalize(entry.label).slice(0, Math.min(8, n.length)))) {
        const words = n.split(/\s+/).filter((w) => w.length > 2)
        if (words.some((w) => hay.includes(w))) {
          seen.add(entry.id)
          out.push(entry)
        }
      }
    }
    // Direct catalog search on the line
    const hits = searchLabCatalog(line, 3)
    for (const h of hits) {
      if (!seen.has(h.id)) {
        seen.add(h.id)
        out.push(h)
      }
    }
  }
  return out.slice(0, 12)
}

/** Heuristic: this procedure line is likely a lab order (vs surgery/imaging). */
export function isLikelyLabOrderText(text: string): boolean {
  const t = normalize(text)
  if (t.length < 2) return false
  if (LAB_KEYWORD_HINTS.test(t)) return true
  const hits = searchLabCatalog(t, 1)
  if (hits.length > 0) return true
  // short abbreviations
  if (/^(fbc|uec|lft|tft|hba1c|crp|esr|inr|uds)$/i.test(t.trim())) return true
  return false
}

export function findBestCatalogEntryForLabel(label: string): LabCatalogEntry | null {
  const q = normalize(label)
  const exact = LAB_ORDER_CATALOG.find(
    (e) =>
      normalize(e.label) === q ||
      (e.synonyms ?? []).some((s) => normalize(s) === q)
  )
  if (exact) return exact
  const hits = searchLabCatalog(label, 1)
  return hits[0] ?? null
}

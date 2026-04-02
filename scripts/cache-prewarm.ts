#!/usr/bin/env npx ts-node
/**
 * Cache Pre-Warming Script
 *
 * Runs the top N clinical queries through the evidence search pipeline
 * so that L1 Redis cache is populated before any user hits them.
 * This eliminates cold-start latency for the most common queries.
 *
 * Usage:
 *   npx ts-node --compiler-options '{"module":"commonjs"}' scripts/cache-prewarm.ts
 *   npx ts-node --compiler-options '{"module":"commonjs"}' scripts/cache-prewarm.ts --dry-run
 *   npx ts-node --compiler-options '{"module":"commonjs"}' scripts/cache-prewarm.ts --limit 50
 */

import { config as loadEnv } from "dotenv"
import fs from "node:fs"
import path from "node:path"
import { parseArgs } from "util"

function resolveProjectPath(relativePath: string): string {
  return path.resolve(process.cwd(), relativePath)
}

;[".env", ".env.local", "../.env", "../.env.local"].forEach((p) => {
  const full = resolveProjectPath(p)
  if (fs.existsSync(full)) loadEnv({ path: full })
})

const TOP_CLINICAL_QUERIES = [
  // Emergency / Critical Care
  "sepsis initial management guideline",
  "septic shock vasopressor norepinephrine guideline",
  "acute coronary syndrome STEMI treatment guideline",
  "NSTEMI risk stratification treatment",
  "acute ischemic stroke thrombolysis thrombectomy",
  "cardiac arrest ACLS algorithm",
  "anaphylaxis epinephrine emergency management",
  "pulmonary embolism treatment anticoagulation",
  "hypertensive emergency IV treatment",
  "status epilepticus treatment",
  "acute respiratory distress syndrome ARDS ventilation",
  "acetaminophen overdose NAC guideline",
  "DKA diabetic ketoacidosis management",
  "acute GI bleeding management",
  "tension pneumothorax treatment",

  // Cardiology
  "hypertension first-line treatment guideline",
  "heart failure reduced ejection fraction treatment",
  "heart failure preserved ejection fraction HFpEF",
  "atrial fibrillation anticoagulation CHA2DS2-VASc",
  "atrial fibrillation rate control vs rhythm control",
  "statin therapy secondary prevention guideline",
  "aortic stenosis TAVR guideline",
  "stable angina management",
  "peripheral artery disease treatment",
  "infective endocarditis prophylaxis",
  "PCSK9 inhibitor familial hypercholesterolemia",
  "warfarin INR management",
  "DOAC renal dosing",

  // Pulmonary
  "COPD exacerbation treatment guideline GOLD",
  "COPD stable management inhaler guideline",
  "asthma stepwise treatment adults GINA",
  "community acquired pneumonia antibiotic IDSA",
  "hospital acquired pneumonia VAP treatment",
  "obstructive sleep apnea CPAP treatment",

  // Infectious Disease
  "UTI uncomplicated cystitis antibiotic",
  "pyelonephritis treatment antibiotic",
  "C diff Clostridioides difficile treatment",
  "cellulitis skin infection treatment IDSA",
  "bacterial meningitis empiric antibiotic",
  "HIV antiretroviral therapy initiation",
  "hepatitis C treatment DAA",
  "tuberculosis treatment isoniazid",
  "COVID-19 treatment guideline",
  "influenza treatment oseltamivir",
  "STI screening treatment CDC",
  "malaria prophylaxis CDC",

  // Endocrine / Metabolic
  "type 2 diabetes initial treatment metformin ADA",
  "type 2 diabetes GLP-1 SGLT2 guideline ADA",
  "hypoglycemia management",
  "thyroid nodule workup FNA",
  "hypothyroidism levothyroxine dosing",
  "Graves disease treatment",
  "adrenal insufficiency glucocorticoid",
  "osteoporosis bisphosphonate treatment",

  // Nephrology
  "acute kidney injury AKI management KDIGO",
  "chronic kidney disease CKD management KDIGO",
  "CKD mineral bone disorder treatment",
  "dialysis initiation guideline",
  "nephrotic syndrome treatment",

  // Neurology
  "migraine treatment acute preventive",
  "epilepsy antiepileptic drug guideline",
  "Parkinson disease levodopa treatment",
  "multiple sclerosis DMT guideline",
  "Alzheimer disease treatment",
  "TIA secondary prevention",
  "intracerebral hemorrhage management",
  "subarachnoid hemorrhage treatment",

  // Oncology
  "non-small cell lung cancer treatment NCCN",
  "breast cancer HER2 positive treatment",
  "colorectal cancer screening guideline",
  "colorectal cancer metastatic treatment",
  "prostate cancer screening PSA",
  "pancreatic cancer treatment",
  "melanoma immunotherapy treatment",
  "febrile neutropenia antibiotic",
  "cancer pain opioid management",
  "antiemetic chemotherapy nausea guideline",
  "breast cancer screening mammography USPSTF",
  "cervical cancer HPV screening",

  // Rheumatology
  "rheumatoid arthritis DMARD biologic treatment",
  "systemic lupus erythematosus treatment",
  "gout acute treatment urate lowering",
  "ankylosing spondylitis treatment",
  "osteoarthritis management",

  // GI / Hepatology
  "IBD Crohn disease treatment",
  "ulcerative colitis treatment",
  "GERD PPI treatment guideline",
  "H pylori eradication guideline",
  "acute pancreatitis management",
  "cirrhosis variceal bleeding",
  "NAFLD NASH treatment",
  "celiac disease management",
  "IBS irritable bowel treatment",

  // Psychiatry
  "major depressive disorder antidepressant",
  "bipolar disorder lithium treatment",
  "schizophrenia antipsychotic treatment",
  "generalized anxiety disorder treatment",
  "PTSD treatment guideline",
  "ADHD stimulant treatment",
  "opioid use disorder buprenorphine naltrexone",
  "alcohol use disorder treatment",
  "insomnia CBT pharmacotherapy",

  // Hematology
  "iron deficiency anemia treatment",
  "sickle cell disease hydroxyurea",
  "HIT heparin induced thrombocytopenia",
  "DIC disseminated intravascular coagulation",
  "VTE DVT PE prophylaxis treatment",
  "perioperative anticoagulation bridging",

  // Surgery / Perioperative
  "perioperative cardiac risk assessment",
  "surgical site infection prevention",
  "ERAS enhanced recovery after surgery",
  "postoperative nausea prevention",
  "chronic pain opioid prescribing CDC",
  "multimodal analgesia guideline",

  // Pediatrics / OB-GYN
  "neonatal resuscitation NRP",
  "pediatric asthma treatment",
  "childhood immunization schedule CDC",
  "gestational diabetes screening treatment",
  "preeclampsia management ACOG",
  "preterm labor tocolysis corticosteroid",
  "postpartum hemorrhage management",
  "contraception guideline ACOG",

  // Geriatrics
  "polypharmacy deprescribing elderly",
  "falls prevention older adults",
  "delirium prevention management ICU",
  "pressure ulcer prevention treatment",

  // Drug Interactions (RxNorm/OpenFDA warm)
  "warfarin drug interactions",
  "metformin lactic acidosis",
  "lisinopril dosing",
  "metoprolol prescribing information",
  "amoxicillin drug label",
  "atorvastatin interactions",

  // Allergy / Dermatology
  "anaphylaxis management",
  "chronic urticaria treatment",
  "drug allergy penicillin",

  // Ophthalmology
  "glaucoma treatment",
  "diabetic retinopathy screening",

  // ENT
  "acute otitis media antibiotic",
  "sinusitis bacterial rhinosinusitis",

  // Palliative / End of Life
  "palliative care symptom management",
  "advance directive goals of care",

  // Toxicology
  "opioid overdose naloxone",
  "alcohol withdrawal benzodiazepine",
  "organophosphate poisoning treatment",

  // Common differential diagnoses
  "chest pain differential diagnosis",
  "acute abdominal pain workup",
  "dyspnea differential diagnosis",
  "headache red flags differential",
  "syncope workup",
  "fever of unknown origin workup",
  "anemia differential diagnosis",
  "acute kidney injury differential",
]

async function run() {
  const { values } = parseArgs({
    options: {
      limit: { type: "string", default: String(TOP_CLINICAL_QUERIES.length) },
      "dry-run": { type: "boolean" },
      concurrency: { type: "string", default: "3" },
    },
  })

  const limit = Math.min(Number(values.limit), TOP_CLINICAL_QUERIES.length)
  const dryRun = Boolean(values["dry-run"])
  const concurrency = Math.max(1, Math.min(6, Number(values.concurrency)))
  const queries = TOP_CLINICAL_QUERIES.slice(0, limit)

  console.log("=" .repeat(70))
  console.log("  Cache Pre-Warming")
  console.log("=" .repeat(70))
  console.log(`  Queries:      ${queries.length}`)
  console.log(`  Concurrency:  ${concurrency}`)
  console.log(`  Dry run:      ${dryRun}`)
  console.log("=" .repeat(70))

  if (dryRun) {
    queries.forEach((q, i) => console.log(`  [${i + 1}] ${q}`))
    console.log("\n  Dry run complete — no searches executed.")
    return
  }

  const { createClient: createSupabaseClient } = await import("@supabase/supabase-js")
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE
  if (!supabaseUrl || !supabaseKey) {
    console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY")
    process.exit(1)
  }
  const supabase = createSupabaseClient(supabaseUrl, supabaseKey)

  const { searchMedicalEvidence } = await import("../lib/evidence/search")

  let completed = 0
  let cached = 0
  let errors = 0
  const t0 = Date.now()

  const semaphore = { active: 0 }
  const queue = [...queries]

  async function processNext(): Promise<void> {
    while (queue.length > 0) {
      const query = queue.shift()!
      semaphore.active++
      try {
        const results = await searchMedicalEvidence({
          query,
          maxResults: 10,
          enableRerank: true,
          queryExpansion: true,
          supabaseClient: supabase as any,
        })
        completed++
        if (results.length > 0) cached++
        const pct = ((completed / queries.length) * 100).toFixed(0)
        console.log(
          `  [${pct}%] "${query.slice(0, 60)}" → ${results.length} results`
        )
      } catch (err) {
        errors++
        completed++
        console.error(`  [ERR] "${query.slice(0, 60)}": ${err instanceof Error ? err.message : err}`)
      } finally {
        semaphore.active--
      }
    }
  }

  const workers = Array.from({ length: concurrency }, () => processNext())
  await Promise.all(workers)

  const elapsed = ((Date.now() - t0) / 1000).toFixed(1)
  console.log("\n" + "=" .repeat(70))
  console.log("  Pre-Warming Complete")
  console.log("=" .repeat(70))
  console.log(`  Queries warmed: ${cached}/${completed}`)
  console.log(`  Errors:         ${errors}`)
  console.log(`  Elapsed:        ${elapsed}s`)
  console.log("=" .repeat(70))
}

run().catch((err) => {
  console.error("[Cache Prewarm] Fatal:", err)
  process.exit(1)
})

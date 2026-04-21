#!/usr/bin/env npx ts-node
/**
 * PubMed Deep Seed — OpenEvidence-level corpus density
 *
 * Instead of one broad query per domain, this uses 5-15 focused subtopic
 * queries per domain to guarantee topic-specific depth. Targets 10,000+
 * new articles across 200+ subtopics.
 *
 * Usage:
 *   npx ts-node --compiler-options '{"module":"commonjs"}' scripts/pubmed-deep-seed.ts
 *   npx ts-node --compiler-options '{"module":"commonjs"}' scripts/pubmed-deep-seed.ts --dry-run
 *   npx ts-node --compiler-options '{"module":"commonjs"}' scripts/pubmed-deep-seed.ts --domain cardiology
 *   npx ts-node --compiler-options '{"module":"commonjs"}' scripts/pubmed-deep-seed.ts --max-per-topic 120
 */

import { config } from "dotenv"
import { resolve } from "node:path"
import { existsSync } from "node:fs"
import { parseArgs } from "util"

const envLocalPath = resolve(process.cwd(), ".env.local")
const envPath = resolve(process.cwd(), ".env")
if (existsSync(envLocalPath)) config({ path: envLocalPath })
if (existsSync(envPath)) config({ path: envPath })

const { values } = parseArgs({
  options: {
    "dry-run": { type: "boolean", default: false },
    domain: { type: "string" },
    "max-per-topic": { type: "string", default: "80" },
    "embedding-batch": { type: "string", default: "100" },
    help: { type: "boolean", default: false },
  },
  strict: false,
  allowPositionals: true,
})

const NCBI_BASE = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils"
const HIGH_EV = `("systematic review"[pt] OR "meta-analysis"[pt] OR "practice guideline"[pt] OR "randomized controlled trial"[pt])`
const RECENT = `("2018"[PDAT] : "3000"[PDAT])`

interface SubTopic { label: string; query: string }
interface DomainSpec { name: string; subtopics: SubTopic[] }

function q(mesh: string, extra?: string): string {
  return [mesh, extra, HIGH_EV, RECENT].filter(Boolean).join(" AND ")
}

const DOMAINS: DomainSpec[] = [
  {
    name: "cardiology",
    subtopics: [
      { label: "hypertension-treatment", query: q(`"hypertension"[MeSH] AND ("antihypertensive agents"[MeSH] OR "first-line treatment")`) },
      { label: "heart-failure-hfref", query: q(`"heart failure"[MeSH] AND ("reduced ejection fraction" OR "systolic heart failure" OR "GDMT")`) },
      { label: "heart-failure-hfpef", query: q(`"heart failure"[MeSH] AND ("preserved ejection fraction" OR "diastolic heart failure")`) },
      { label: "atrial-fibrillation", query: q(`"atrial fibrillation"[MeSH] AND ("anticoagulation" OR "rate control" OR "rhythm control")`) },
      { label: "acs-stemi", query: q(`("ST elevation myocardial infarction" OR "STEMI") AND ("percutaneous coronary intervention" OR "thrombolysis")`) },
      { label: "acs-nstemi", query: q(`("non-ST elevation" OR "NSTEMI" OR "unstable angina") AND ("risk stratification" OR "treatment")`) },
      { label: "lipid-management", query: q(`("dyslipidemias"[MeSH] OR "statin" OR "PCSK9") AND ("secondary prevention" OR "primary prevention")`) },
      { label: "vte-dvt-pe", query: q(`("venous thromboembolism"[MeSH] OR "pulmonary embolism"[MeSH] OR "deep vein thrombosis") AND ("anticoagulation" OR "treatment")`) },
      { label: "valvular-heart", query: q(`("heart valve diseases"[MeSH] OR "aortic stenosis" OR "mitral regurgitation") AND ("TAVR" OR "surgery" OR "management")`) },
      { label: "cardiac-arrest", query: q(`("heart arrest"[MeSH] OR "cardiac arrest" OR "cardiopulmonary resuscitation") AND ("ACLS" OR "treatment" OR "outcome")`) },
      { label: "peripheral-artery", query: q(`"peripheral arterial disease"[MeSH] AND ("claudication" OR "revascularization" OR "management")`) },
      { label: "endocarditis", query: q(`"endocarditis"[MeSH] AND ("antibiotic" OR "prophylaxis" OR "surgery")`) },
    ],
  },
  {
    name: "endocrinology",
    subtopics: [
      { label: "t2dm-initial", query: q(`"diabetes mellitus, type 2"[MeSH] AND ("metformin" OR "initial treatment" OR "first-line")`) },
      { label: "t2dm-glp1-sglt2", query: q(`"diabetes mellitus, type 2"[MeSH] AND ("GLP-1 receptor agonist" OR "SGLT2 inhibitor" OR "semaglutide" OR "empagliflozin")`) },
      { label: "t2dm-insulin", query: q(`"diabetes mellitus, type 2"[MeSH] AND ("insulin therapy" OR "basal insulin" OR "insulin titration")`) },
      { label: "t1dm", query: q(`"diabetes mellitus, type 1"[MeSH] AND ("insulin pump" OR "continuous glucose monitoring" OR "management")`) },
      { label: "dka-hhs", query: q(`("diabetic ketoacidosis"[MeSH] OR "hyperglycemic hyperosmolar") AND ("management" OR "treatment" OR "insulin")`) },
      { label: "thyroid", query: q(`("thyroid diseases"[MeSH] OR "hypothyroidism" OR "hyperthyroidism" OR "thyroid nodule") AND ("treatment" OR "diagnosis")`) },
      { label: "adrenal", query: q(`("adrenal insufficiency"[MeSH] OR "Cushing syndrome" OR "pheochromocytoma") AND ("diagnosis" OR "treatment")`) },
      { label: "osteoporosis", query: q(`"osteoporosis"[MeSH] AND ("bisphosphonate" OR "denosumab" OR "treatment" OR "prevention")`) },
      { label: "obesity", query: q(`"obesity"[MeSH] AND ("pharmacotherapy" OR "bariatric surgery" OR "GLP-1" OR "weight management")`) },
    ],
  },
  {
    name: "infectious-disease",
    subtopics: [
      { label: "cap-pneumonia", query: q(`"community-acquired pneumonia" AND ("antibiotic" OR "treatment" OR "management")`) },
      { label: "hap-vap", query: q(`("hospital-acquired pneumonia" OR "ventilator-associated pneumonia") AND ("antibiotic" OR "treatment")`) },
      { label: "uti", query: q(`("urinary tract infections"[MeSH] OR "cystitis" OR "pyelonephritis") AND ("antibiotic" OR "treatment")`) },
      { label: "cdiff", query: q(`("Clostridioides difficile" OR "Clostridium difficile") AND ("treatment" OR "fidaxomicin" OR "vancomycin")`) },
      { label: "ssti", query: q(`("skin diseases, infectious"[MeSH] OR "cellulitis" OR "abscess") AND ("antibiotic" OR "treatment")`) },
      { label: "meningitis", query: q(`"meningitis"[MeSH] AND ("empiric antibiotic" OR "treatment" OR "dexamethasone")`) },
      { label: "hiv-art", query: q(`"HIV infections"[MeSH] AND ("antiretroviral therapy" OR "treatment" OR "PrEP")`) },
      { label: "hepatitis-c", query: q(`"hepatitis C"[MeSH] AND ("direct-acting antiviral" OR "treatment" OR "cure")`) },
      { label: "tuberculosis", query: q(`"tuberculosis"[MeSH] AND ("treatment" OR "isoniazid" OR "rifampin" OR "latent")`) },
      { label: "sepsis", query: q(`"sepsis"[MeSH] AND ("surviving sepsis" OR "resuscitation" OR "vasopressor" OR "antibiotic")`) },
      { label: "fungal", query: q(`("mycoses"[MeSH] OR "candidiasis" OR "aspergillosis") AND ("antifungal" OR "treatment")`) },
      { label: "amr", query: q(`("drug resistance, microbial"[MeSH] OR "antimicrobial resistance" OR "MRSA" OR "ESBL") AND ("treatment" OR "management")`) },
    ],
  },
  {
    name: "pulmonology",
    subtopics: [
      { label: "copd-stable", query: q(`"pulmonary disease, chronic obstructive"[MeSH] AND ("maintenance therapy" OR "inhaler" OR "LABA" OR "LAMA")`) },
      { label: "copd-exacerbation", query: q(`"pulmonary disease, chronic obstructive"[MeSH] AND ("exacerbation" OR "corticosteroid" OR "antibiotic")`) },
      { label: "asthma-adult", query: q(`"asthma"[MeSH] AND ("adult" OR "controller" OR "biologic" OR "stepwise")`) },
      { label: "ards", query: q(`"respiratory distress syndrome"[MeSH] AND ("mechanical ventilation" OR "prone positioning" OR "PEEP")`) },
      { label: "pe-treatment", query: q(`"pulmonary embolism"[MeSH] AND ("anticoagulation" OR "thrombolysis" OR "treatment")`) },
      { label: "osa", query: q(`"sleep apnea, obstructive"[MeSH] AND ("CPAP" OR "treatment" OR "diagnosis")`) },
      { label: "ild", query: q(`("lung diseases, interstitial"[MeSH] OR "idiopathic pulmonary fibrosis") AND ("treatment" OR "antifibrotic")`) },
      { label: "pneumothorax", query: q(`"pneumothorax"[MeSH] AND ("management" OR "chest tube" OR "treatment")`) },
    ],
  },
  {
    name: "neurology",
    subtopics: [
      { label: "ischemic-stroke", query: q(`"stroke"[MeSH] AND ("thrombolysis" OR "thrombectomy" OR "alteplase" OR "acute treatment")`) },
      { label: "ich", query: q(`"cerebral hemorrhage"[MeSH] AND ("management" OR "blood pressure" OR "treatment")`) },
      { label: "tia-prevention", query: q(`("ischemic attack, transient"[MeSH] OR "TIA") AND ("secondary prevention" OR "antiplatelet")`) },
      { label: "epilepsy", query: q(`"epilepsy"[MeSH] AND ("antiepileptic" OR "anticonvulsant" OR "treatment" OR "first-line")`) },
      { label: "migraine", query: q(`"migraine disorders"[MeSH] AND ("treatment" OR "preventive" OR "triptan" OR "CGRP")`) },
      { label: "parkinson", query: q(`"parkinson disease"[MeSH] AND ("levodopa" OR "dopamine agonist" OR "treatment")`) },
      { label: "ms", query: q(`"multiple sclerosis"[MeSH] AND ("disease-modifying" OR "treatment" OR "relapse")`) },
      { label: "alzheimer", query: q(`"alzheimer disease"[MeSH] AND ("treatment" OR "cholinesterase" OR "memantine" OR "amyloid")`) },
      { label: "status-epilepticus", query: q(`"status epilepticus"[MeSH] AND ("treatment" OR "benzodiazepine" OR "management")`) },
    ],
  },
  {
    name: "oncology",
    subtopics: [
      { label: "nsclc", query: q(`"carcinoma, non-small-cell lung"[MeSH] AND ("treatment" OR "immunotherapy" OR "targeted therapy")`) },
      { label: "sclc", query: q(`"small cell lung carcinoma"[MeSH] AND ("treatment" OR "chemotherapy")`) },
      { label: "breast-cancer", query: q(`"breast neoplasms"[MeSH] AND ("treatment" OR "HER2" OR "endocrine therapy" OR "CDK4/6")`) },
      { label: "colorectal", query: q(`"colorectal neoplasms"[MeSH] AND ("treatment" OR "screening" OR "chemotherapy")`) },
      { label: "prostate", query: q(`"prostatic neoplasms"[MeSH] AND ("treatment" OR "screening" OR "PSA" OR "hormone therapy")`) },
      { label: "melanoma", query: q(`"melanoma"[MeSH] AND ("immunotherapy" OR "checkpoint inhibitor" OR "treatment")`) },
      { label: "pancreatic", query: q(`"pancreatic neoplasms"[MeSH] AND ("treatment" OR "chemotherapy" OR "FOLFIRINOX")`) },
      { label: "hcc", query: q(`"carcinoma, hepatocellular"[MeSH] AND ("treatment" OR "sorafenib" OR "immunotherapy")`) },
      { label: "lymphoma", query: q(`("lymphoma, non-Hodgkin"[MeSH] OR "lymphoma, large B-cell, diffuse") AND ("treatment" OR "R-CHOP")`) },
      { label: "leukemia", query: q(`("leukemia"[MeSH] OR "chronic myeloid leukemia" OR "acute lymphoblastic") AND ("treatment" OR "TKI")`) },
      { label: "supportive-onc", query: q(`("febrile neutropenia" OR "chemotherapy-induced nausea" OR "cancer pain") AND ("treatment" OR "management")`) },
      { label: "screening", query: q(`"early detection of cancer"[MeSH] AND ("screening" OR "mammography" OR "colonoscopy" OR "lung cancer screening")`) },
    ],
  },
  {
    name: "nephrology",
    subtopics: [
      { label: "aki", query: q(`"acute kidney injury"[MeSH] AND ("management" OR "treatment" OR "renal replacement")`) },
      { label: "ckd", query: q(`"renal insufficiency, chronic"[MeSH] AND ("management" OR "staging" OR "progression")`) },
      { label: "ckd-mbd", query: q(`("CKD-MBD" OR "renal osteodystrophy" OR "phosphate binder") AND ("treatment" OR "management")`) },
      { label: "dialysis", query: q(`("renal dialysis"[MeSH] OR "hemodialysis" OR "peritoneal dialysis") AND ("initiation" OR "adequacy" OR "management")`) },
      { label: "transplant", query: q(`"kidney transplantation"[MeSH] AND ("immunosuppression" OR "rejection" OR "management")`) },
      { label: "glomerular", query: q(`("nephrotic syndrome"[MeSH] OR "glomerulonephritis") AND ("treatment" OR "management")`) },
    ],
  },
  {
    name: "gastroenterology",
    subtopics: [
      { label: "ibd-crohn", query: q(`"Crohn disease"[MeSH] AND ("treatment" OR "biologic" OR "management")`) },
      { label: "ibd-uc", query: q(`"colitis, ulcerative"[MeSH] AND ("treatment" OR "biologic" OR "management")`) },
      { label: "gerd", query: q(`"gastroesophageal reflux"[MeSH] AND ("treatment" OR "PPI" OR "management")`) },
      { label: "h-pylori", query: q(`"helicobacter pylori"[MeSH] AND ("eradication" OR "treatment" OR "antibiotic")`) },
      { label: "pancreatitis", query: q(`"pancreatitis"[MeSH] AND ("acute" OR "management" OR "treatment")`) },
      { label: "cirrhosis", query: q(`"liver cirrhosis"[MeSH] AND ("management" OR "variceal bleeding" OR "ascites" OR "hepatic encephalopathy")`) },
      { label: "nafld", query: q(`("non-alcoholic fatty liver disease" OR "NAFLD" OR "NASH") AND ("treatment" OR "management")`) },
      { label: "gi-bleeding", query: q(`("gastrointestinal hemorrhage"[MeSH]) AND ("management" OR "endoscopy" OR "treatment")`) },
      { label: "celiac", query: q(`"celiac disease"[MeSH] AND ("diagnosis" OR "management" OR "gluten")`) },
      { label: "ibs", query: q(`"irritable bowel syndrome"[MeSH] AND ("treatment" OR "management" OR "diet")`) },
    ],
  },
  {
    name: "rheumatology",
    subtopics: [
      { label: "ra", query: q(`"arthritis, rheumatoid"[MeSH] AND ("DMARD" OR "biologic" OR "methotrexate" OR "treatment")`) },
      { label: "sle", query: q(`"lupus erythematosus, systemic"[MeSH] AND ("treatment" OR "hydroxychloroquine" OR "management")`) },
      { label: "gout", query: q(`"gout"[MeSH] AND ("treatment" OR "urate-lowering" OR "colchicine" OR "allopurinol")`) },
      { label: "spondyloarthritis", query: q(`("spondylarthritis"[MeSH] OR "ankylosing spondylitis") AND ("treatment" OR "biologic")`) },
      { label: "osteoarthritis", query: q(`"osteoarthritis"[MeSH] AND ("treatment" OR "management" OR "knee" OR "hip")`) },
      { label: "vasculitis", query: q(`"vasculitis"[MeSH] AND ("treatment" OR "management" OR "rituximab")`) },
    ],
  },
  {
    name: "psychiatry",
    subtopics: [
      { label: "mdd", query: q(`"depressive disorder, major"[MeSH] AND ("antidepressant" OR "treatment" OR "SSRI")`) },
      { label: "bipolar", query: q(`"bipolar disorder"[MeSH] AND ("lithium" OR "mood stabilizer" OR "treatment")`) },
      { label: "schizophrenia", query: q(`"schizophrenia"[MeSH] AND ("antipsychotic" OR "treatment" OR "clozapine")`) },
      { label: "anxiety", query: q(`"anxiety disorders"[MeSH] AND ("treatment" OR "SSRI" OR "cognitive behavioral")`) },
      { label: "ptsd", query: q(`"stress disorders, post-traumatic"[MeSH] AND ("treatment" OR "therapy" OR "SSRI")`) },
      { label: "adhd", query: q(`"attention deficit disorder with hyperactivity"[MeSH] AND ("treatment" OR "stimulant" OR "methylphenidate")`) },
      { label: "sud-opioid", query: q(`"opioid-related disorders"[MeSH] AND ("buprenorphine" OR "naltrexone" OR "treatment")`) },
      { label: "alcohol", query: q(`"alcoholism"[MeSH] AND ("treatment" OR "pharmacotherapy" OR "naltrexone")`) },
      { label: "insomnia", query: q(`"sleep initiation and maintenance disorders"[MeSH] AND ("treatment" OR "cognitive behavioral" OR "pharmacotherapy")`) },
    ],
  },
  {
    name: "hematology",
    subtopics: [
      { label: "anemia-iron", query: q(`"anemia, iron-deficiency"[MeSH] AND ("treatment" OR "iron" OR "IV iron")`) },
      { label: "sickle-cell", query: q(`"anemia, sickle cell"[MeSH] AND ("hydroxyurea" OR "treatment" OR "voxelotor")`) },
      { label: "hit", query: q(`"thrombocytopenia"[MeSH] AND ("heparin-induced" OR "treatment" OR "argatroban")`) },
      { label: "dic", query: q(`"disseminated intravascular coagulation"[MeSH] AND ("treatment" OR "management")`) },
      { label: "anticoag-management", query: q(`("warfarin" OR "direct oral anticoagulant" OR "bridging anticoagulation") AND ("management" OR "perioperative" OR "reversal")`) },
      { label: "myeloma", query: q(`"multiple myeloma"[MeSH] AND ("treatment" OR "bortezomib" OR "lenalidomide")`) },
    ],
  },
  {
    name: "emergency-critical",
    subtopics: [
      { label: "sepsis-bundle", query: q(`"sepsis"[MeSH] AND ("bundle" OR "surviving sepsis" OR "hour-1" OR "lactate")`) },
      { label: "trauma", query: q(`("wounds and injuries"[MeSH] OR "trauma") AND ("management" OR "resuscitation" OR "damage control")`) },
      { label: "toxicology", query: q(`("poisoning"[MeSH] OR "overdose" OR "toxicology") AND ("treatment" OR "antidote" OR "N-acetylcysteine")`) },
      { label: "airway", query: q(`("airway management"[MeSH] OR "intubation" OR "rapid sequence") AND ("emergency" OR "difficult airway")`) },
      { label: "shock", query: q(`"shock"[MeSH] AND ("management" OR "vasopressor" OR "resuscitation" OR "fluid therapy")`) },
      { label: "anaphylaxis", query: q(`"anaphylaxis"[MeSH] AND ("epinephrine" OR "treatment" OR "management")`) },
    ],
  },
  {
    name: "surgery-periop",
    subtopics: [
      { label: "periop-cardiac", query: q(`("perioperative care"[MeSH] OR "preoperative care") AND ("cardiac risk" OR "beta blocker" OR "assessment")`) },
      { label: "ssi", query: q(`"surgical wound infection"[MeSH] AND ("prevention" OR "antibiotic prophylaxis")`) },
      { label: "eras", query: q(`("enhanced recovery" OR "ERAS") AND ("surgery" OR "protocol" OR "management")`) },
      { label: "ponv", query: q(`("postoperative nausea" OR "PONV") AND ("prevention" OR "antiemetic" OR "management")`) },
      { label: "pain-multimodal", query: q(`("pain, postoperative"[MeSH] OR "multimodal analgesia") AND ("management" OR "treatment")`) },
      { label: "vte-prophylaxis", query: q(`("venous thromboembolism" AND "prophylaxis") AND ("surgery" OR "perioperative")`) },
    ],
  },
  {
    name: "obstetrics",
    subtopics: [
      { label: "gdm", query: q(`"diabetes, gestational"[MeSH] AND ("screening" OR "treatment" OR "insulin")`) },
      { label: "preeclampsia", query: q(`"pre-eclampsia"[MeSH] AND ("management" OR "treatment" OR "magnesium sulfate")`) },
      { label: "preterm-labor", query: q(`"obstetric labor, premature"[MeSH] AND ("tocolysis" OR "corticosteroid" OR "management")`) },
      { label: "pph", query: q(`"postpartum hemorrhage"[MeSH] AND ("management" OR "treatment" OR "oxytocin")`) },
      { label: "prenatal-screening", query: q(`("prenatal diagnosis"[MeSH] OR "prenatal screening") AND ("screening" OR "guidelines")`) },
    ],
  },
  {
    name: "pediatrics",
    subtopics: [
      { label: "peds-asthma", query: q(`"asthma"[MeSH] AND "child"[MeSH] AND ("treatment" OR "management")`) },
      { label: "neonatal", query: q(`"infant, newborn"[MeSH] AND ("resuscitation" OR "sepsis" OR "jaundice") AND ("treatment" OR "management")`) },
      { label: "immunization", query: q(`"vaccination"[MeSH] AND ("schedule" OR "childhood" OR "recommendation")`) },
      { label: "peds-obesity", query: q(`"pediatric obesity"[MeSH] AND ("management" OR "treatment" OR "prevention")`) },
      { label: "otitis-media", query: q(`"otitis media"[MeSH] AND ("treatment" OR "antibiotic" OR "management")`) },
    ],
  },
  {
    name: "geriatrics",
    subtopics: [
      { label: "falls", query: q(`"accidental falls"[MeSH] AND ("prevention" OR "risk assessment" OR "elderly")`) },
      { label: "delirium", query: q(`"delirium"[MeSH] AND ("prevention" OR "management" OR "ICU")`) },
      { label: "polypharmacy", query: q(`("polypharmacy"[MeSH] OR "deprescribing") AND ("elderly" OR "older adults" OR "management")`) },
      { label: "pressure-injury", query: q(`"pressure ulcer"[MeSH] AND ("prevention" OR "treatment" OR "management")`) },
    ],
  },
  {
    name: "pharmacology-safety",
    subtopics: [
      { label: "warfarin-interactions", query: q(`"warfarin"[MeSH] AND ("drug interactions" OR "INR" OR "management")`) },
      { label: "doac-management", query: q(`("rivaroxaban" OR "apixaban" OR "dabigatran" OR "edoxaban") AND ("management" OR "dosing" OR "reversal")`) },
      { label: "renal-dosing", query: q(`("renal insufficiency" OR "kidney function") AND ("drug dosing" OR "dose adjustment" OR "pharmacokinetics")`) },
      { label: "hepatotoxicity", query: q(`("chemical and drug induced liver injury"[MeSH] OR "hepatotoxicity") AND ("management" OR "treatment")`) },
      { label: "opioid-safety", query: q(`"analgesics, opioid"[MeSH] AND ("prescribing" OR "overdose" OR "naloxone" OR "safety")`) },
      { label: "drug-allergy", query: q(`"drug hypersensitivity"[MeSH] AND ("penicillin" OR "desensitization" OR "management")`) },
    ],
  },
  {
    name: "dermatology",
    subtopics: [
      { label: "psoriasis", query: q(`"psoriasis"[MeSH] AND ("biologic" OR "treatment" OR "management")`) },
      { label: "atopic-dermatitis", query: q(`"dermatitis, atopic"[MeSH] AND ("treatment" OR "dupilumab" OR "management")`) },
      { label: "skin-cancer", query: q(`("skin neoplasms"[MeSH] OR "basal cell" OR "squamous cell skin") AND ("treatment" OR "management")`) },
    ],
  },
  {
    name: "palliative-eol",
    subtopics: [
      { label: "symptom-mgmt", query: q(`"palliative care"[MeSH] AND ("symptom management" OR "pain" OR "dyspnea" OR "nausea")`) },
      { label: "goals-of-care", query: q(`("advance care planning"[MeSH] OR "advance directives" OR "goals of care") AND ("communication" OR "decision")`) },
      { label: "hospice", query: q(`"hospice care"[MeSH] AND ("management" OR "end of life" OR "quality")`) },
    ],
  },
  {
    name: "allergy-immunology",
    subtopics: [
      { label: "anaphylaxis-mgmt", query: q(`"anaphylaxis"[MeSH] AND ("management" OR "epinephrine" OR "treatment")`) },
      { label: "food-allergy", query: q(`"food hypersensitivity"[MeSH] AND ("management" OR "immunotherapy" OR "treatment")`) },
      { label: "urticaria", query: q(`"urticaria"[MeSH] AND ("treatment" OR "chronic" OR "management")`) },
    ],
  },
  {
    name: "preventive-medicine",
    subtopics: [
      { label: "cancer-screening", query: q(`"mass screening"[MeSH] AND ("cancer" OR "mammography" OR "colonoscopy" OR "lung" OR "cervical")`) },
      { label: "cardiovascular-prevention", query: q(`"primary prevention"[MeSH] AND ("cardiovascular" OR "aspirin" OR "statin" OR "risk assessment")`) },
      { label: "immunization-adult", query: q(`"vaccination"[MeSH] AND ("adult" OR "influenza" OR "pneumococcal" OR "shingles" OR "COVID-19")`) },
    ],
  },
  {
    name: "rare-diseases",
    subtopics: [
      { label: "histiocytosis-ecd", query: q(`("Erdheim-Chester" OR "histiocytosis" OR "Langerhans cell") AND ("treatment" OR "BRAF" OR "vemurafenib")`) },
      { label: "amyloidosis", query: q(`"amyloidosis"[MeSH] AND ("treatment" OR "management" OR "tafamidis" OR "daratumumab")`) },
      { label: "sarcoidosis", query: q(`"sarcoidosis"[MeSH] AND ("treatment" OR "corticosteroid" OR "management")`) },
      { label: "myasthenia-gravis", query: q(`"myasthenia gravis"[MeSH] AND ("treatment" OR "pyridostigmine" OR "thymectomy" OR "eculizumab")`) },
      { label: "wilson-disease", query: q(`"hepatolenticular degeneration"[MeSH] AND ("treatment" OR "penicillamine" OR "trientine" OR "zinc")`) },
      { label: "porphyria", query: q(`"porphyrias"[MeSH] AND ("treatment" OR "management" OR "hemin" OR "givosiran")`) },
      { label: "hlh", query: q(`("hemophagocytic lymphohistiocytosis" OR "HLH" OR "macrophage activation syndrome") AND ("treatment" OR "etoposide")`) },
      { label: "igg4", query: q(`"immunoglobulin G4-related disease"[MeSH] AND ("treatment" OR "rituximab" OR "management")`) },
      { label: "behcet", query: q(`"Behcet syndrome"[MeSH] AND ("treatment" OR "management")`) },
      { label: "fabry", query: q(`"Fabry disease"[MeSH] AND ("treatment" OR "enzyme replacement" OR "migalastat")`) },
      { label: "gaucher", query: q(`"Gaucher disease"[MeSH] AND ("treatment" OR "enzyme replacement" OR "eliglustat")`) },
      { label: "mastocytosis", query: q(`"mastocytosis"[MeSH] AND ("treatment" OR "midostaurin" OR "avapritinib")`) },
      { label: "pulm-hypertension", query: q(`"hypertension, pulmonary"[MeSH] AND ("treatment" OR "prostacyclin" OR "endothelin" OR "PDE5")`) },
      { label: "anca-vasculitis", query: q(`("anti-neutrophil cytoplasmic antibody-associated vasculitis" OR "ANCA vasculitis" OR "granulomatosis with polyangiitis") AND ("treatment" OR "rituximab" OR "avacopan")`) },
    ],
  },
  {
    name: "niche-pharmacology",
    subtopics: [
      { label: "ecmo-dosing", query: q(`("extracorporeal membrane oxygenation" OR "ECMO") AND ("pharmacokinetics" OR "drug dosing" OR "antibiotic" OR "sedation")`) },
      { label: "crrt-clearance", query: q(`("continuous renal replacement therapy" OR "CRRT") AND ("drug clearance" OR "dosing" OR "antibiotic" OR "pharmacokinetics")`) },
      { label: "pregnancy-pharm", query: q(`"pregnancy"[MeSH] AND ("drug safety" OR "teratogen" OR "pharmacotherapy" OR "medication use")`) },
      { label: "peds-dosing", query: q(`"child"[MeSH] AND ("drug dosing" OR "weight-based" OR "pharmacokinetics" OR "dose adjustment")`) },
      { label: "cyp-interactions", query: q(`("cytochrome P-450"[MeSH] OR "CYP3A4" OR "CYP2D6" OR "CYP2C19") AND ("drug interaction" OR "inhibitor" OR "inducer")`) },
      { label: "tdm-protocols", query: q(`"drug monitoring"[MeSH] AND ("therapeutic drug monitoring" OR "vancomycin" OR "aminoglycoside" OR "tacrolimus")`) },
      { label: "lactation-drugs", query: q(`("lactation"[MeSH] OR "breast feeding") AND ("drug safety" OR "medication" OR "compatibility")`) },
    ],
  },
  {
    name: "transplant-immunology",
    subtopics: [
      { label: "solid-organ-immunosuppression", query: q(`("organ transplantation"[MeSH] OR "kidney transplantation" OR "liver transplantation") AND ("immunosuppression" OR "tacrolimus" OR "mycophenolate")`) },
      { label: "gvhd", query: q(`"graft vs host disease"[MeSH] AND ("treatment" OR "prophylaxis" OR "ruxolitinib")`) },
      { label: "car-t-toxicity", query: q(`("chimeric antigen receptor" OR "CAR-T") AND ("cytokine release" OR "neurotoxicity" OR "management")`) },
      { label: "rejection", query: q(`("graft rejection"[MeSH] OR "rejection") AND ("treatment" OR "antibody-mediated" OR "cellular rejection")`) },
    ],
  },
  {
    name: "urology",
    subtopics: [
      { label: "bph", query: q(`"prostatic hyperplasia"[MeSH] AND ("treatment" OR "alpha blocker" OR "5-alpha reductase")`) },
      { label: "kidney-stones", query: q(`"kidney calculi"[MeSH] AND ("treatment" OR "management" OR "lithotripsy" OR "prevention")`) },
      { label: "bladder-cancer", query: q(`"urinary bladder neoplasms"[MeSH] AND ("treatment" OR "BCG" OR "immunotherapy")`) },
      { label: "incontinence", query: q(`"urinary incontinence"[MeSH] AND ("treatment" OR "management" OR "pharmacotherapy")`) },
    ],
  },
  {
    name: "ophthalmology",
    subtopics: [
      { label: "glaucoma", query: q(`"glaucoma"[MeSH] AND ("treatment" OR "prostaglandin" OR "management")`) },
      { label: "amd", query: q(`"macular degeneration"[MeSH] AND ("treatment" OR "anti-VEGF" OR "ranibizumab" OR "aflibercept")`) },
      { label: "diabetic-retinopathy", query: q(`"diabetic retinopathy"[MeSH] AND ("treatment" OR "screening" OR "anti-VEGF" OR "laser")`) },
    ],
  },
  {
    name: "ent",
    subtopics: [
      { label: "sinusitis", query: q(`"sinusitis"[MeSH] AND ("treatment" OR "antibiotic" OR "management")`) },
      { label: "hearing-loss", query: q(`"hearing loss"[MeSH] AND ("treatment" OR "hearing aid" OR "cochlear implant" OR "management")`) },
      { label: "tonsillitis", query: q(`("tonsillitis"[MeSH] OR "pharyngitis") AND ("treatment" OR "antibiotic" OR "tonsillectomy")`) },
    ],
  },
  {
    name: "protocols-procedures",
    subtopics: [
      { label: "post-tavr", query: q(`("transcatheter aortic valve" OR "TAVR" OR "TAVI") AND ("management" OR "antiplatelet" OR "follow-up")`) },
      { label: "post-pci-antiplatelet", query: q(`("percutaneous coronary intervention" OR "PCI") AND ("dual antiplatelet" OR "DAPT" OR "duration")`) },
      { label: "periop-anticoag-bridging", query: q(`("bridging anticoagulation" OR "perioperative anticoagulation") AND ("management" OR "guideline")`) },
      { label: "tpn-management", query: q(`("parenteral nutrition"[MeSH] OR "TPN") AND ("management" OR "complications" OR "monitoring")`) },
      { label: "ventilator-weaning", query: q(`("ventilator weaning"[MeSH] OR "liberation from mechanical ventilation") AND ("protocol" OR "management")`) },
      { label: "blood-transfusion", query: q(`"blood transfusion"[MeSH] AND ("threshold" OR "guideline" OR "restrictive" OR "management")`) },
    ],
  },
]

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function getNcbiApiKey(): string | undefined {
  return process.env.NCBI_API_KEY || process.env.PUBMED_API_KEY
}

async function searchPmids(query: string, maxResults: number, apiKey?: string): Promise<string[]> {
  const url = new URL(`${NCBI_BASE}/esearch.fcgi`)
  url.searchParams.set("db", "pubmed")
  url.searchParams.set("term", query)
  url.searchParams.set("retmax", String(maxResults))
  url.searchParams.set("retmode", "json")
  url.searchParams.set("sort", "relevance")
  if (apiKey) url.searchParams.set("api_key", apiKey)

  const resp = await fetch(url.toString())
  if (!resp.ok) throw new Error(`esearch failed: ${resp.status}`)
  const json = await resp.json()
  return json?.esearchresult?.idlist || []
}

async function fetchArticleXml(pmids: string[], apiKey?: string): Promise<string> {
  const url = new URL(`${NCBI_BASE}/efetch.fcgi`)
  url.searchParams.set("db", "pubmed")
  url.searchParams.set("id", pmids.join(","))
  url.searchParams.set("rettype", "xml")
  url.searchParams.set("retmode", "xml")
  if (apiKey) url.searchParams.set("api_key", apiKey)

  const resp = await fetch(url.toString())
  if (!resp.ok) throw new Error(`efetch failed: ${resp.status}`)
  return resp.text()
}

async function run() {
  if (values.help) {
    console.log(`PubMed Deep Seed\n  --dry-run            Count PMIDs without ingesting\n  --domain <name>      Seed only one domain\n  --max-per-topic <n>  Max PMIDs per subtopic (default: 80)`)
    process.exit(0)
  }

  const dryRun = Boolean(values["dry-run"])
  const maxPerTopic = Math.max(20, Math.min(200, Number(values["max-per-topic"] || 80)))
  const embeddingBatch = Math.max(20, Math.min(200, Number(values["embedding-batch"] || 100)))
  const targetDomain = typeof values.domain === "string" ? values.domain.toLowerCase() : null
  const apiKey = getNcbiApiKey()
  const requestInterval = apiKey ? 350 : 1100

  const domains = targetDomain
    ? DOMAINS.filter((d) => d.name === targetDomain)
    : DOMAINS

  if (domains.length === 0) {
    console.error(`Unknown domain: ${targetDomain}. Available: ${DOMAINS.map((d) => d.name).join(", ")}`)
    process.exit(1)
  }

  const totalSubtopics = domains.reduce((s, d) => s + d.subtopics.length, 0)
  console.log("=".repeat(70))
  console.log("  PubMed Deep Seed")
  console.log("=".repeat(70))
  console.log(`  Domains:        ${domains.length}`)
  console.log(`  Subtopics:      ${totalSubtopics}`)
  console.log(`  Max/topic:      ${maxPerTopic}`)
  console.log(`  Max articles:   ~${totalSubtopics * maxPerTopic}`)
  console.log(`  Dry run:        ${dryRun}`)
  console.log(`  API key:        ${apiKey ? "yes" : "no"}`)
  console.log("=".repeat(70))

  const { parseEnhancedPubMedXML } = await import("../lib/pubmed/parser")
  const { chunkArticle } = await import("../lib/pubmed/chunking")
  const { generateEmbeddings } = await import("../lib/rag/embeddings")
  const { storeMedicalEvidence } = await import("../lib/pubmed/storage")
  const { createClient } = await import("@supabase/supabase-js")

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const supabaseKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE)!
  const supabase = createClient(supabaseUrl, supabaseKey)

  let existingPmids = new Set<string>()
  try {
    const { data } = await supabase.from("medical_evidence").select("pmid").not("pmid", "is", null)
    if (data) existingPmids = new Set(data.map((r: any) => r.pmid).filter(Boolean))
    console.log(`  Existing PMIDs: ${existingPmids.size}`)
  } catch { /* continue */ }

  // Phase 1: Collect all new PMIDs across all subtopics
  const allNewPmids: string[] = []
  const pmidToLabel = new Map<string, string>()

  for (const domain of domains) {
    console.log(`\n--- ${domain.name.toUpperCase()} (${domain.subtopics.length} subtopics) ---`)

    for (const subtopic of domain.subtopics) {
      try {
        await sleep(requestInterval)
        const pmids = await searchPmids(subtopic.query, maxPerTopic, apiKey)
        const newPmids = pmids.filter((id) => !existingPmids.has(id) && !pmidToLabel.has(id))
        newPmids.forEach((id) => pmidToLabel.set(id, `${domain.name}/${subtopic.label}`))
        allNewPmids.push(...newPmids)
        console.log(`  [${subtopic.label}] ${pmids.length} found, ${newPmids.length} new`)
      } catch (err) {
        console.error(`  [ERR] ${subtopic.label}: ${err instanceof Error ? err.message : err}`)
      }
    }
  }

  console.log(`\n  Total new PMIDs: ${allNewPmids.length}`)
  if (dryRun || allNewPmids.length === 0) {
    console.log("  Done (dry run or nothing new).")
    process.exit(0)
  }

  // Phase 2: Fetch XML, parse, chunk, embed, store — in batches of 50
  const FETCH_BATCH = 50
  let totalArticles = 0
  let totalChunks = 0
  let totalErrors = 0
  const totalBatches = Math.ceil(allNewPmids.length / FETCH_BATCH)

  for (let i = 0; i < allNewPmids.length; i += FETCH_BATCH) {
    const batch = allNewPmids.slice(i, i + FETCH_BATCH)
    const batchNum = Math.floor(i / FETCH_BATCH) + 1

    console.log(`\n  Batch ${batchNum}/${totalBatches}: fetching ${batch.length} articles...`)

    try {
      await sleep(requestInterval)
      const xml = await fetchArticleXml(batch, apiKey)
      const articles = parseEnhancedPubMedXML(xml)

      if (articles.length === 0) {
        console.log(`    No articles parsed, skipping`)
        continue
      }

      const allChunks: Array<any> = []
      for (const article of articles) {
        try {
          const chunks = chunkArticle(article, {
            strategy: "hybrid",
            includeTitle: true,
            includeMesh: true,
            includeStudyInfo: true,
          })
          allChunks.push(...chunks)
          totalArticles++
        } catch (err) {
          totalErrors++
        }
      }

      if (allChunks.length === 0) continue

      for (let j = 0; j < allChunks.length; j += embeddingBatch) {
        const embBatch = allChunks.slice(j, j + embeddingBatch)
        const texts = embBatch.map((c: any) => c.contentWithContext || c.content || "")

        try {
          const embeddings = await generateEmbeddings(texts)
          const withEmbeddings = embBatch.map((c: any, idx: number) => ({
            ...c,
            embedding: embeddings[idx],
          }))
          const result = await storeMedicalEvidence(withEmbeddings, { batchSize: 20 })
          totalChunks += result.stored
          if (result.errors.length > 0) {
            totalErrors += result.errors.length
            console.warn(`    Storage errors: ${result.errors.length}`)
          }
        } catch (err) {
          totalErrors++
          console.error(`    Embedding/store error: ${err instanceof Error ? err.message : err}`)
        }
      }

      console.log(
        `    Parsed: ${articles.length}, chunks: ${allChunks.length}, total stored: ${totalChunks}`
      )
    } catch (err) {
      totalErrors++
      console.error(`    Fetch error: ${err instanceof Error ? err.message : err}`)
    }
  }

  console.log("\n" + "=".repeat(70))
  console.log("  Deep Seed Complete")
  console.log("=".repeat(70))
  console.log(`  Articles processed: ${totalArticles}`)
  console.log(`  Chunks stored:      ${totalChunks}`)
  console.log(`  Errors:             ${totalErrors}`)
  console.log("=".repeat(70))
}

run().catch((err) => {
  console.error("[Deep Seed] Fatal:", err)
  process.exit(1)
})

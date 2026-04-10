/**
 * PHISC modifier catalog — extracted from PHISC Standardised Claim Form v5.04 §2.4.
 *
 * Modifier codes may have different meanings across disciplines (e.g. 0001 differs
 * between Clinical Technology, Medical Practitioners, and Radiography). The catalog
 * is keyed by `${discipline}:${code}` internally but exposed via lookup helpers.
 */

// ── Types ──────────────────────────────────────────────────────────────────────

export type ModifierType = "informational" | "reduction" | "add" | "compound"

/**
 * `"proc"` — modifier applies to the procedure code's value.
 * `"0023"` — modifier applies to the anaesthetic time modifier (0023).
 * `"n/a"` — no specific target (informational or self-contained).
 */
export type ModifierApplyTo = "proc" | "0023" | "n/a"

export type Discipline =
  | "clinical_technology"
  | "dental"
  | "dietetics"
  | "medical"
  | "occupational_therapy"
  | "physiotherapy"
  | "podiatry"
  | "private_hospital"
  | "psychology"
  | "radiography"
  | "radiology_nuclear"
  | "nursing"
  | "social_work"
  | "optometry"

export interface ModifierDef {
  code: string
  discipline: Discipline
  modifierType: ModifierType
  description: string
  applyTo: ModifierApplyTo
  /** Percentage value for reduction/add modifiers (e.g. 0.50 = 50%) */
  percentageValue?: number
  /** Fixed unit value when applicable */
  unitValue?: number
  /** Key for compound calculation lookup in the engine */
  calculationKey?: string
}

// ── Disciplines without modifiers ──────────────────────────────────────────────

export const DISCIPLINES_WITHOUT_MODIFIERS: string[] = [
  "ambulance",
  "biokinetics",
  "chiropractic",
  "dental_therapy",
  "genetic_counselling",
  "hearing_aid_acoustics",
  "homeopathy",
  "hospice",
  "medical_technology",
  "mental_health_institution",
  "orthoptics",
  "osteopathy",
  "pharmacy",
  "physical_rehab_hospital",
  "phytotherapy",
  "psychometry",
  "speech_therapy_audiology",
  "sub_acute_facility",
  "tissue_transportation",
  "unattached_theatre",
  "uniform_patient_fee",
]

// ── Raw catalog entries ────────────────────────────────────────────────────────

const ENTRIES: ModifierDef[] = [
  // ── Clinical Technology ──
  { code: "0001", discipline: "clinical_technology", modifierType: "compound", description: "Fee prorated by treatment days: (treatment days / 30) × item fee", applyTo: "proc", calculationKey: "prorate_treatment_days" },

  // ── Dental Practitioners ──
  { code: "8001", discipline: "dental", modifierType: "reduction", description: "Assistant surgeon – specialist: 1/3 of benefit", applyTo: "proc", percentageValue: 1 / 3 },
  { code: "8002", discipline: "dental", modifierType: "add", description: "Specialist fee/benefit: +50% of benefit", applyTo: "proc", percentageValue: 0.50 },
  { code: "8006", discipline: "dental", modifierType: "reduction", description: "Multiple surgical procedures – 3rd and subsequent: 50% of benefit", applyTo: "proc", percentageValue: 0.50 },
  { code: "8007", discipline: "dental", modifierType: "reduction", description: "Assistant surgeon – general dental practitioner: 15% of benefit", applyTo: "proc", percentageValue: 0.15 },
  { code: "8008", discipline: "dental", modifierType: "add", description: "Emergency surgery – after hours: +25% of benefit", applyTo: "proc", percentageValue: 0.25 },
  { code: "8009", discipline: "dental", modifierType: "reduction", description: "Multiple surgical procedures – 2nd procedure: 75% of benefit", applyTo: "proc", percentageValue: 0.75 },
  { code: "8010", discipline: "dental", modifierType: "add", description: "Open reduction: +75% of benefit", applyTo: "proc", percentageValue: 0.75 },
  { code: "8011", discipline: "dental", modifierType: "add", description: "Unusual circumstances: benefit + X%", applyTo: "proc" },
  { code: "8012", discipline: "dental", modifierType: "reduction", description: "Reduced services: benefit − X%", applyTo: "proc" },
  { code: "8013", discipline: "dental", modifierType: "informational", description: "Multiple modifiers", applyTo: "n/a" },
  { code: "8023", discipline: "dental", modifierType: "add", description: "Fabrication of inlay/onlay: +25% of benefit", applyTo: "proc", percentageValue: 0.25 },

  // ── Dietetics ──
  { code: "0021", discipline: "dietetics", modifierType: "informational", description: "Services to hospital inpatients", applyTo: "n/a" },

  // ── Medical Practitioners ──
  { code: "0001", discipline: "medical", modifierType: "add", description: "COID only: After-hours emergency radiological services", applyTo: "n/a" },
  { code: "0002", discipline: "medical", modifierType: "informational", description: "Written report on X-rays", applyTo: "n/a" },
  { code: "0004", discipline: "medical", modifierType: "informational", description: "Procedures performed in own procedure rooms (not COID)", applyTo: "n/a" },
  { code: "0005", discipline: "medical", modifierType: "reduction", description: "Multiple procedures under same anaesthetic – must be on ALL procedures including first", applyTo: "n/a" },
  { code: "0006", discipline: "medical", modifierType: "add", description: "Visiting specialists performing procedures", applyTo: "n/a" },
  { code: "0007", discipline: "medical", modifierType: "informational", description: "Use of own monitoring/equipment in rooms or hospital theatre", applyTo: "n/a" },
  { code: "0008", discipline: "medical", modifierType: "add", description: "Specialist surgeon assistant", applyTo: "n/a" },
  { code: "0009", discipline: "medical", modifierType: "add", description: "Assistant", applyTo: "n/a" },
  { code: "0010", discipline: "medical", modifierType: "add", description: "Local anaesthetic", applyTo: "n/a" },
  { code: "0011", discipline: "medical", modifierType: "compound", description: "Emergency procedures", applyTo: "n/a", calculationKey: "emergency_compound" },
  { code: "0013", discipline: "medical", modifierType: "add", description: "Endoscopic examinations done at operations", applyTo: "n/a" },
  { code: "0014", discipline: "medical", modifierType: "add", description: "Operations previously performed by other surgeons", applyTo: "n/a" },
  { code: "0015", discipline: "medical", modifierType: "add", description: "Intravenous infusions", applyTo: "n/a" },
  { code: "0017", discipline: "medical", modifierType: "add", description: "Injections administered by practitioners – treated as procedure, requires ICD-10", applyTo: "n/a", calculationKey: "injection_as_procedure" },
  { code: "0018", discipline: "medical", modifierType: "compound", description: "Surgical modifier for BMI > 35", applyTo: "0023", calculationKey: "bmi_over_35" },
  { code: "0019", discipline: "medical", modifierType: "compound", description: "Surgery on neonates ≤28 days / low birth weight <2500g under GA", applyTo: "0023", calculationKey: "neonatal_ga" },
  { code: "0020", discipline: "medical", modifierType: "compound", description: "Conscious sedation", applyTo: "proc", calculationKey: "conscious_sedation" },
  { code: "0021", discipline: "medical", modifierType: "compound", description: "Determination of anaesthetic fees", applyTo: "0023", calculationKey: "anaesthetic_fee_determination" },
  { code: "0023", discipline: "medical", modifierType: "informational", description: "Anaesthetic time modifier – must always be submitted explicitly", applyTo: "n/a", calculationKey: "anaesthetic_time" },
  { code: "0024", discipline: "medical", modifierType: "compound", description: "Pre-operative assessment not followed by procedures", applyTo: "proc", calculationKey: "preop_assessment" },
  { code: "0025", discipline: "medical", modifierType: "compound", description: "Calculation of anaesthetic time", applyTo: "0023", calculationKey: "anaesthetic_time_calculation" },
  { code: "0027", discipline: "medical", modifierType: "compound", description: "More than one procedure under same anaesthetic", applyTo: "proc", calculationKey: "multi_proc_same_anaesthetic" },
  { code: "0028", discipline: "medical", modifierType: "compound", description: "Low flow anaesthetic technique (<1 litre/min)", applyTo: "0023", calculationKey: "low_flow_under_1" },
  { code: "0029", discipline: "medical", modifierType: "add", description: "Assistant anaesthesiologists", applyTo: "n/a" },
  { code: "0030", discipline: "medical", modifierType: "compound", description: "Low flow anaesthetic technique (1–2 litres/min)", applyTo: "0023", calculationKey: "low_flow_1_to_2" },
  { code: "0031", discipline: "medical", modifierType: "compound", description: "Intravenous drips and transfusions", applyTo: "proc", calculationKey: "iv_drips" },
  { code: "0032", discipline: "medical", modifierType: "compound", description: "Patients in prone position", applyTo: "proc", calculationKey: "prone_position" },
  { code: "0033", discipline: "medical", modifierType: "compound", description: "Participating in general care of patients", applyTo: "proc", calculationKey: "general_care" },
  { code: "0034", discipline: "medical", modifierType: "compound", description: "Head and neck procedures", applyTo: "proc", calculationKey: "head_neck" },
  { code: "0035", discipline: "medical", modifierType: "compound", description: "Anaesthetic minimum rule (7.00 AN units)", applyTo: "0023", calculationKey: "anaesthetic_minimum" },
  { code: "0036", discipline: "medical", modifierType: "reduction", description: "Anaesthetic by GPs: 80% when >60 minutes", applyTo: "0023", percentageValue: 0.80 },
  { code: "0037", discipline: "medical", modifierType: "compound", description: "Body hypothermia", applyTo: "proc", calculationKey: "hypothermia" },
  { code: "0038", discipline: "medical", modifierType: "compound", description: "Peri-operative blood salvage", applyTo: "proc", calculationKey: "blood_salvage" },
  { code: "0039", discipline: "medical", modifierType: "compound", description: "Control of blood pressure", applyTo: "proc", calculationKey: "bp_control" },
  { code: "0040", discipline: "medical", modifierType: "compound", description: "Phaeochromocytoma", applyTo: "proc", calculationKey: "phaeochromocytoma" },
  { code: "0041", discipline: "medical", modifierType: "compound", description: "Hyperbaric pressurisation", applyTo: "proc", calculationKey: "hyperbaric" },
  { code: "0042", discipline: "medical", modifierType: "compound", description: "Extracorporeal circulation", applyTo: "proc", calculationKey: "extracorporeal" },
  { code: "0043", discipline: "medical", modifierType: "compound", description: "Patients under one year of age", applyTo: "proc", calculationKey: "under_one_year" },
  { code: "0044", discipline: "medical", modifierType: "compound", description: "Neonates ≤28 days after birth", applyTo: "proc", calculationKey: "neonatal" },
  { code: "0045", discipline: "medical", modifierType: "compound", description: "Post-operative alleviation of pain", applyTo: "proc", calculationKey: "postop_pain" },
  { code: "0046", discipline: "medical", modifierType: "reduction", description: "Initial fracture then open reduction within 1 month: reduce initial by 50%", applyTo: "n/a", percentageValue: 0.50 },
  { code: "0047", discipline: "medical", modifierType: "informational", description: "Fracture NOT requiring reduction", applyTo: "n/a" },
  { code: "0048", discipline: "medical", modifierType: "informational", description: "Fracture: subsequent closed reductions under GA within 1 month", applyTo: "n/a" },
  { code: "0049", discipline: "medical", modifierType: "informational", description: "Compound fractures", applyTo: "n/a" },
  { code: "0050", discipline: "medical", modifierType: "informational", description: "Compound fracture: debridement followed by internal fixation", applyTo: "n/a" },
  { code: "0051", discipline: "medical", modifierType: "informational", description: "Fractures requiring open reduction, internal fixation, external skeletal fixation, bone grafting", applyTo: "n/a" },
  { code: "0053", discipline: "medical", modifierType: "informational", description: "Fracture: percutaneous internal fixation", applyTo: "n/a" },
  { code: "0055", discipline: "medical", modifierType: "informational", description: "Dislocation requiring open reduction", applyTo: "n/a" },
  { code: "0057", discipline: "medical", modifierType: "informational", description: "Multiple procedures on feet", applyTo: "n/a" },
  { code: "0058", discipline: "medical", modifierType: "informational", description: "Revision operation for total joint replacement and immediate resubstitution", applyTo: "n/a" },
  { code: "0061", discipline: "medical", modifierType: "informational", description: "Combined procedures on the spine", applyTo: "n/a" },
  { code: "0063", discipline: "medical", modifierType: "informational", description: "Two specialists work together on replantation", applyTo: "n/a" },
  { code: "0064", discipline: "medical", modifierType: "informational", description: "Replantation is unsuccessful", applyTo: "n/a" },
  { code: "0065", discipline: "medical", modifierType: "informational", description: "Additional operative procedures by same surgeon within 12 months", applyTo: "n/a" },
  { code: "0066", discipline: "medical", modifierType: "informational", description: "Microsurgery of fallopian tubes and ovaries", applyTo: "n/a" },
  { code: "0067", discipline: "medical", modifierType: "informational", description: "Microsurgery of larynx", applyTo: "n/a" },
  { code: "0069", discipline: "medical", modifierType: "informational", description: "Endoscopic instruments used during intranasal surgery", applyTo: "n/a" },
  { code: "0070", discipline: "medical", modifierType: "informational", description: "Procedures through thorascope", applyTo: "n/a" },
  { code: "0072", discipline: "medical", modifierType: "informational", description: "Non-invasive peripheral vascular tests", applyTo: "n/a" },
  { code: "0073", discipline: "medical", modifierType: "informational", description: "Items 1288/1289 by paediatric cardiologists", applyTo: "n/a" },
  { code: "0074", discipline: "medical", modifierType: "informational", description: "Endoscopic procedures with own equipment", applyTo: "n/a" },
  { code: "0075", discipline: "medical", modifierType: "informational", description: "Endoscopic procedures in own procedure room", applyTo: "n/a" },
  { code: "0077", discipline: "medical", modifierType: "informational", description: "Physical treatment", applyTo: "n/a" },
  { code: "0078", discipline: "medical", modifierType: "informational", description: "Testis biopsy combined with vasogram/vesiculogram/epididymogram", applyTo: "n/a" },
  { code: "0079", discipline: "medical", modifierType: "informational", description: "First consultation immediately followed by medical psychotherapeutic procedure", applyTo: "n/a" },
  { code: "0080", discipline: "medical", modifierType: "informational", description: "Multiple examinations", applyTo: "n/a" },
  { code: "0081", discipline: "medical", modifierType: "informational", description: "Repeat examinations", applyTo: "n/a" },
  { code: "0082", discipline: "medical", modifierType: "informational", description: "Item is complementary to preceding item – not subject to reduction", applyTo: "n/a" },
  { code: "0083", discipline: "medical", modifierType: "informational", description: "Radiological examinations", applyTo: "n/a" },
  { code: "0084", discipline: "medical", modifierType: "informational", description: "Film costs", applyTo: "n/a" },
  { code: "0085", discipline: "medical", modifierType: "informational", description: "Left side modifier", applyTo: "n/a" },
  { code: "0086", discipline: "medical", modifierType: "informational", description: "Vascular groups", applyTo: "n/a" },
  { code: "0090", discipline: "medical", modifierType: "informational", description: "Radiologist's fee for team participation", applyTo: "n/a" },
  { code: "0091", discipline: "medical", modifierType: "informational", description: "Diagnostic services to hospital inpatients", applyTo: "n/a" },
  { code: "0092", discipline: "medical", modifierType: "informational", description: "Diagnostic services to outpatients", applyTo: "n/a" },
  { code: "0095", discipline: "medical", modifierType: "informational", description: "Radiation materials", applyTo: "n/a" },
  { code: "0096", discipline: "medical", modifierType: "informational", description: "Radio-isotope therapy patients who fail to keep appointments", applyTo: "n/a" },
  { code: "0097", discipline: "medical", modifierType: "informational", description: "Pathology tests performed by non-pathologists", applyTo: "n/a" },
  { code: "0099", discipline: "medical", modifierType: "informational", description: "Stat basis tests", applyTo: "n/a" },
  { code: "0100", discipline: "medical", modifierType: "compound", description: "Intra-aortic balloon pump", applyTo: "proc", calculationKey: "iabp" },
  { code: "0160", discipline: "medical", modifierType: "informational", description: "Aspiration/biopsy under direct ultrasound control", applyTo: "n/a" },
  { code: "0165", discipline: "medical", modifierType: "informational", description: "Use of contrast during ultrasound study", applyTo: "n/a" },
  { code: "5104", discipline: "medical", modifierType: "informational", description: "Ultrasound in pregnancy, multiple gestation, after 20 weeks", applyTo: "n/a" },
  { code: "5441", discipline: "medical", modifierType: "compound", description: "Add 1.00 anaesthetic unit (general bone)", applyTo: "proc", unitValue: 1.00, calculationKey: "an_bone_general" },
  { code: "5442", discipline: "medical", modifierType: "compound", description: "Shoulder, scapula, clavicle, humerus, elbow joint, upper 1/3 tibia, knee, patella, mandible, TMJ", applyTo: "proc", calculationKey: "an_bone_upper" },
  { code: "5443", discipline: "medical", modifierType: "compound", description: "Maxillary and orbital bones", applyTo: "proc", calculationKey: "an_bone_maxillary" },
  { code: "5444", discipline: "medical", modifierType: "compound", description: "Shaft of femur", applyTo: "proc", calculationKey: "an_bone_femur_shaft" },
  { code: "5445", discipline: "medical", modifierType: "compound", description: "Spine (except coccyx), pelvis, hip, neck of femur", applyTo: "proc", calculationKey: "an_bone_spine_pelvis" },
  { code: "5448", discipline: "medical", modifierType: "compound", description: "Sternum and/or ribs and musculo-skeletal procedures via intra-thoracic approach", applyTo: "proc", calculationKey: "an_bone_sternum_ribs" },
  { code: "6100", discipline: "medical", modifierType: "informational", description: "MRI: full fee – single anatomical region with T1/T2 on ≥2 planes", applyTo: "n/a" },
  { code: "6101", discipline: "medical", modifierType: "reduction", description: "MRI: limited series – max 2/3 of fee", applyTo: "n/a", percentageValue: 2 / 3 },
  { code: "6102", discipline: "medical", modifierType: "reduction", description: "MRI: post-contrast (except bone tumour) – 50% of fee", applyTo: "n/a", percentageValue: 0.50 },
  { code: "6103", discipline: "medical", modifierType: "informational", description: "MRI: post-contrast study", applyTo: "n/a" },
  { code: "6104", discipline: "medical", modifierType: "reduction", description: "MRI: limited hypophysis – 2/3 of fee", applyTo: "n/a", percentageValue: 2 / 3 },
  { code: "6105", discipline: "medical", modifierType: "informational", description: "MRI: limited hypophysis + Gadolinium – single full fee", applyTo: "n/a" },
  { code: "6106", discipline: "medical", modifierType: "informational", description: "MRA large vessels as primary – 100% of fee", applyTo: "n/a" },
  { code: "6107", discipline: "medical", modifierType: "reduction", description: "MRA additional to region – 50% of fee", applyTo: "n/a", percentageValue: 0.50 },
  { code: "6108", discipline: "medical", modifierType: "reduction", description: "Gradient echo only (no angio software) – 20% of full fee", applyTo: "n/a", percentageValue: 0.20 },
  { code: "6109", discipline: "medical", modifierType: "reduction", description: "Very limited MRI studies – 33.33% of full fee", applyTo: "n/a", percentageValue: 1 / 3 },
  { code: "6110", discipline: "medical", modifierType: "reduction", description: "MRI spectroscopy – 50% of fee", applyTo: "n/a", percentageValue: 0.50 },
  { code: "6300", discipline: "medical", modifierType: "reduction", description: "Procedure <30 min – 50% of machine fees (items 3536–3550)", applyTo: "n/a", percentageValue: 0.50 },
  { code: "6301", discipline: "medical", modifierType: "reduction", description: "Radiologist performs in non-owned facility – reduce by 40%", applyTo: "n/a", percentageValue: 0.60 },
  { code: "6302", discipline: "medical", modifierType: "reduction", description: "Non-radiologist performs procedure – reduce by 40%", applyTo: "n/a", percentageValue: 0.60 },
  { code: "6303", discipline: "medical", modifierType: "reduction", description: "Non-radiologist in radiologist-owned facility – 55%", applyTo: "n/a", percentageValue: 0.55 },
  { code: "6305", discipline: "medical", modifierType: "reduction", description: "Multiple catheterisation + angiogram: reduce each subsequent by 20.00 radiological units", applyTo: "n/a" },

  // ── Occupational & Art Therapy ──
  { code: "006", discipline: "occupational_therapy", modifierType: "add", description: "+50% of total fee (not Art Therapy)", applyTo: "proc", percentageValue: 0.50 },
  { code: "008", discipline: "occupational_therapy", modifierType: "add", description: "Assistive devices at NAP + 26% (if NAP <R100) or NAP + max R26 (if NAP ≥R100)", applyTo: "proc", calculationKey: "nap_plus_26" },
  { code: "009", discipline: "occupational_therapy", modifierType: "add", description: "Materials for orthoses/pressure garments at NAP + 26%/<R26 (not Art Therapy)", applyTo: "proc", calculationKey: "nap_plus_26" },
  { code: "010", discipline: "occupational_therapy", modifierType: "add", description: "Materials used in treatment at NAP + 26%/<R26", applyTo: "proc", calculationKey: "nap_plus_26" },
  { code: "011", discipline: "occupational_therapy", modifierType: "informational", description: "Travelling costs per AA rates", applyTo: "n/a" },
  { code: "021", discipline: "occupational_therapy", modifierType: "informational", description: "Services to hospital inpatients", applyTo: "n/a" },

  // ── Physiotherapy ──
  { code: "001", discipline: "physiotherapy", modifierType: "informational", description: "Appointment not kept", applyTo: "n/a" },
  { code: "003", discipline: "physiotherapy", modifierType: "reduction", description: "Deduct 15% where equipment not owned by practitioner", applyTo: "proc", percentageValue: 0.85 },
  { code: "006", discipline: "physiotherapy", modifierType: "add", description: "+50% of total fee", applyTo: "proc", percentageValue: 0.50 },
  { code: "008", discipline: "physiotherapy", modifierType: "reduction", description: "Only 50% of fee for additional procedures", applyTo: "proc", percentageValue: 0.50 },
  { code: "009", discipline: "physiotherapy", modifierType: "add", description: "Full fee for additional condition", applyTo: "proc" },
  { code: "010", discipline: "physiotherapy", modifierType: "reduction", description: "Only 50% of fee for second condition", applyTo: "proc", percentageValue: 0.50 },
  { code: "013", discipline: "physiotherapy", modifierType: "informational", description: "Travelling costs (>16km total) per AA rate", applyTo: "n/a" },
  { code: "014", discipline: "physiotherapy", modifierType: "informational", description: "Services to inpatient in nursing home or hospital", applyTo: "n/a" },

  // ── Podiatry ──
  { code: "0002", discipline: "podiatry", modifierType: "reduction", description: "Procedures 021–031 in day clinic/unattached operating theatre: reduced to 2/3", applyTo: "proc", percentageValue: 2 / 3 },
  { code: "0004", discipline: "podiatry", modifierType: "informational", description: "Consultation/treatment in nursing facility/hospital", applyTo: "n/a" },
  { code: "0006", discipline: "podiatry", modifierType: "informational", description: "Consultation/treatment at patient's residence", applyTo: "n/a" },

  // ── Private Hospitals ──
  { code: "002", discipline: "private_hospital", modifierType: "add", description: "Orthopaedic, Neurosurgical and Vascular surcharges", applyTo: "proc" },
  { code: "003", discipline: "private_hospital", modifierType: "add", description: "Cardiac surgery surcharge: all open heart surgery, CABG, heart transplants", applyTo: "proc" },

  // ── Psychology ──
  { code: "0003", discipline: "psychology", modifierType: "add", description: "Emergency treatments: relevant fee + 50%", applyTo: "proc", percentageValue: 0.50 },
  { code: "0004", discipline: "psychology", modifierType: "informational", description: "Services to inpatient in nursing home or hospital", applyTo: "n/a" },

  // ── Radiography ──
  { code: "0001", discipline: "radiography", modifierType: "add", description: "Call-out fee for bona fide emergency requiring travel", applyTo: "proc" },
  { code: "0021", discipline: "radiography", modifierType: "informational", description: "Services to hospital/day clinic patients", applyTo: "n/a" },
  { code: "0080", discipline: "radiography", modifierType: "informational", description: "Multiple examinations: full fees", applyTo: "n/a" },
  { code: "0081", discipline: "radiography", modifierType: "informational", description: "Repeat examinations: no reduction", applyTo: "n/a" },
  { code: "0084", discipline: "radiography", modifierType: "informational", description: "Films charged under code 300", applyTo: "n/a" },

  // ── Radiology (Nuclear Medicine) ──
  { code: "00091", discipline: "radiology_nuclear", modifierType: "informational", description: "Radiology and nuclear medicine – hospital inpatients", applyTo: "n/a" },
  { code: "00092", discipline: "radiology_nuclear", modifierType: "informational", description: "Radiology and nuclear medicine – outpatients", applyTo: "n/a" },
  { code: "00093", discipline: "radiology_nuclear", modifierType: "reduction", description: "Radiological exams using hospital equipment: reduce by 1/3", applyTo: "proc", percentageValue: 2 / 3 },

  // ── Nursing ──
  { code: "0001", discipline: "nursing", modifierType: "add", description: "Public holidays: +100% (Nursing agencies only)", applyTo: "proc", percentageValue: 1.00 },
  { code: "0002", discipline: "nursing", modifierType: "reduction", description: "Only 50% of fee for subsidiary/additional procedures", applyTo: "proc", percentageValue: 0.50 },
  { code: "0003", discipline: "nursing", modifierType: "informational", description: "Fee based on comparable service where item not listed – motivation required", applyTo: "n/a" },
  { code: "0007", discipline: "nursing", modifierType: "add", description: "Sundays: +50% (Nursing agencies only)", applyTo: "proc", percentageValue: 0.50 },

  // ── Social Workers ──
  { code: "0003", discipline: "social_work", modifierType: "add", description: "+50% of total fee for treatment", applyTo: "proc", percentageValue: 0.50 },
  { code: "0021", discipline: "social_work", modifierType: "informational", description: "Services to hospital inpatients", applyTo: "n/a" },
  { code: "0022", discipline: "social_work", modifierType: "informational", description: "Services at patient's residence", applyTo: "n/a" },
]

// ── Indexes ────────────────────────────────────────────────────────────────────

/** Keyed by "discipline:code" for unique lookup */
const BY_DISCIPLINE_CODE = new Map<string, ModifierDef>()

/** All defs for a given discipline */
const BY_DISCIPLINE = new Map<Discipline, ModifierDef[]>()

/** All defs that share a code (across disciplines) */
const BY_CODE = new Map<string, ModifierDef[]>()

for (const e of ENTRIES) {
  BY_DISCIPLINE_CODE.set(`${e.discipline}:${e.code}`, e)

  const discList = BY_DISCIPLINE.get(e.discipline)
  if (discList) discList.push(e)
  else BY_DISCIPLINE.set(e.discipline, [e])

  const codeList = BY_CODE.get(e.code)
  if (codeList) codeList.push(e)
  else BY_CODE.set(e.code, [e])
}

// ── Lookup helpers ─────────────────────────────────────────────────────────────

/** Get the modifier definition for a specific discipline + code pair. */
export function getModifierDef(code: string, discipline: Discipline): ModifierDef | undefined {
  return BY_DISCIPLINE_CODE.get(`${discipline}:${code}`)
}

/** Get all modifier definitions available for a discipline. */
export function getModifiersForDiscipline(discipline: Discipline): ModifierDef[] {
  return BY_DISCIPLINE.get(discipline) ?? []
}

/** Check whether a modifier code is valid for a given discipline. */
export function isValidModifierForDiscipline(code: string, discipline: Discipline): boolean {
  return BY_DISCIPLINE_CODE.has(`${discipline}:${code}`)
}

/** Get all definitions that share a code (may span multiple disciplines). */
export function getModifierDefsByCode(code: string): ModifierDef[] {
  return BY_CODE.get(code) ?? []
}

/** All disciplines that have at least one modifier in the catalog. */
export function getDisciplinesWithModifiers(): Discipline[] {
  return [...BY_DISCIPLINE.keys()]
}

/** Human-readable label for a discipline value. */
export const DISCIPLINE_LABELS: Record<Discipline, string> = {
  clinical_technology: "Clinical Technology",
  dental: "Dental",
  dietetics: "Dietetics",
  medical: "Medical Practitioners",
  occupational_therapy: "Occupational Therapy",
  physiotherapy: "Physiotherapy",
  podiatry: "Podiatry",
  private_hospital: "Private Hospital",
  psychology: "Psychology",
  radiography: "Radiography",
  radiology_nuclear: "Radiology / Nuclear Medicine",
  nursing: "Registered Nurses / Nursing Agencies",
  social_work: "Social Work",
  optometry: "Optometry",
}

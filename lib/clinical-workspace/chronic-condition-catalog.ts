/**
 * Curated labels for chronic-condition picker (search + add).
 * Not exhaustive — clinicians can still add free-text conditions.
 */
export const CHRONIC_CONDITION_CATALOG: string[] = [
  "Hypertension",
  "Essential Hypertension",
  "Type 1 Diabetes Mellitus",
  "Type 2 Diabetes Mellitus",
  "Prediabetes",
  "Hyperlipidemia",
  "Dyslipidemia",
  "Coronary Artery Disease",
  "Chronic Coronary Disease",
  "Heart Failure",
  "Heart Failure with Reduced Ejection Fraction",
  "Heart Failure with Preserved Ejection Fraction",
  "Atrial Fibrillation",
  "Atrial Flutter",
  "Chronic Kidney Disease",
  "Chronic Kidney Disease Stage 3",
  "Chronic Kidney Disease Stage 4",
  "Asthma",
  "COPD",
  "Obstructive Sleep Apnea",
  "Obesity",
  "Hypothyroidism",
  "Hyperthyroidism",
  "Rheumatoid Arthritis",
  "Osteoarthritis",
  "Gout",
  "Psoriasis",
  "Inflammatory Bowel Disease",
  "Crohn Disease",
  "Ulcerative Colitis",
  "Chronic Hepatitis B",
  "Chronic Hepatitis C",
  "Nonalcoholic Fatty Liver Disease",
  "Epilepsy",
  "Migraine",
  "Major Depressive Disorder",
  "Generalized Anxiety Disorder",
  "Bipolar Disorder",
  "Schizophrenia",
  "Chronic Pain",
  "Fibromyalgia",
  "Osteoporosis",
  "Anemia",
  "Iron Deficiency Anemia",
  "Vitamin B12 Deficiency",
  "Benign Prostatic Hyperplasia",
  "Erectile Dysfunction",
  "Chronic Venous Insufficiency",
  "Peripheral Artery Disease",
  "Stroke",
  "Transient Ischemic Attack",
  "Deep Vein Thrombosis",
  "Pulmonary Embolism",
  "Sickle Cell Disease",
  "HIV Infection",
  "Chronic Lymphocytic Leukemia",
  "Multiple Sclerosis",
  "Parkinson Disease",
  "Alzheimer Disease",
  "Dementia",
  "Chronic Pancreatitis",
  "Celiac Disease",
  "Systemic Lupus Erythematosus",
  "Sjögren Syndrome",
  "Ankylosing Spondylitis",
  "Chronic Urticaria",
  "Eczema",
  "Chronic Kidney Disease on Dialysis",
  "Post-Myocardial Infarction",
  "Peripheral Neuropathy",
  "Diabetic Nephropathy",
  "Diabetic Retinopathy",
  "Chronic Sinusitis",
  "Allergic Rhinitis",
  "Chronic Migraine",
  "Substance Use Disorder",
  "Tobacco Use Disorder",
]

export function searchChronicConditionCatalog(
  query: string,
  limit = 24
): string[] {
  const q = query.trim().toLowerCase()
  if (!q) return CHRONIC_CONDITION_CATALOG.slice(0, limit)
  const scored = CHRONIC_CONDITION_CATALOG.map((label) => {
    const lower = label.toLowerCase()
    let score = 0
    if (lower === q) score = 100
    else if (lower.startsWith(q)) score = 80
    else if (lower.includes(q)) score = 50
    return { label, score }
  })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || a.label.localeCompare(b.label))
  return scored.slice(0, limit).map((x) => x.label)
}

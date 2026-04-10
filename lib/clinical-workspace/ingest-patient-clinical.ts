import type {
  ClinicalDocType,
  ClinicalDocument,
  MedicalBlock,
  PatientSession,
  VitalReading,
} from "./types"
import type { ExtractedEntities } from "@/lib/scribe/entity-highlighter"

export function uniqStrings(items: string[], cap = 40): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const raw of items) {
    const s = raw.trim()
    if (s.length < 2) continue
    const key = s.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(s)
    if (out.length >= cap) break
  }
  return out
}

function newVital(
  partial: Omit<VitalReading, "id" | "timestamp" | "committed">
): VitalReading {
  return {
    ...partial,
    id: `v-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    timestamp: new Date(),
    committed: false,
  }
}

/**
 * Parse common vital patterns from free text (SOAP notes, summaries, scribe).
 */
export function parseVitalsFromClinicalText(
  text: string,
  deviceName = "Clinical text"
): VitalReading[] {
  if (!text || text.length < 3) return []
  const out: VitalReading[] = []
  const t = text.replace(/\u00a0/g, " ")

  const bpRe =
    /\b(?:BP|blood\s*pressure|B\.?P\.?)[:\s]+(\d{2,3})\s*\/\s*(\d{2,3})\b/gi
  let m: RegExpExecArray | null
  while ((m = bpRe.exec(t)) !== null) {
    const sys = parseInt(m[1], 10)
    const dia = parseInt(m[2], 10)
    if (sys >= 60 && sys <= 250 && dia >= 30 && dia <= 180) {
      out.push(
        newVital({
          type: "blood_pressure",
          value: sys,
          secondaryValue: dia,
          unit: "mmHg",
          source: "manual",
          deviceName,
        })
      )
    }
  }

  const bareBp = /\b(\d{2,3})\s*\/\s*(\d{2,3})\s*(?:mm\s*Hg|mmHg)?\b/g
  while ((m = bareBp.exec(t)) !== null) {
    const sys = parseInt(m[1], 10)
    const dia = parseInt(m[2], 10)
    if (sys >= 60 && sys <= 250 && dia >= 30 && dia <= 180) {
      out.push(
        newVital({
          type: "blood_pressure",
          value: sys,
          secondaryValue: dia,
          unit: "mmHg",
          source: "manual",
          deviceName,
        })
      )
    }
  }

  const hrRe =
    /\b(?:HR|heart\s*rate|pulse)[:\s]+(\d{2,3})\b|\bpulse(?:\s+rate)?[:\s]+(\d{2,3})\b/gi
  while ((m = hrRe.exec(t)) !== null) {
    const v = parseInt(m[1] || m[2], 10)
    if (v >= 30 && v <= 220) {
      out.push(
        newVital({
          type: "heart_rate",
          value: v,
          unit: "bpm",
          source: "manual",
          deviceName,
        })
      )
    }
  }

  const spo2Re = /\b(?:SpO2|sat(?:uration)?|O2\s*sat)[:\s]+(\d{2,3})\s*%?\b/gi
  while ((m = spo2Re.exec(t)) !== null) {
    const v = parseInt(m[1], 10)
    if (v >= 70 && v <= 100) {
      out.push(
        newVital({
          type: "spo2",
          value: v,
          unit: "%",
          source: "manual",
          deviceName,
        })
      )
    }
  }

  const tempC = /\b(?:temp|temperature|T\.?)[:\s]+(\d{1,2}(?:\.\d)?)\s*°?\s*C\b/gi
  while ((m = tempC.exec(t)) !== null) {
    const c = parseFloat(m[1])
    if (c >= 34 && c <= 42) {
      out.push(
        newVital({
          type: "temperature",
          value: c,
          unit: "°C",
          source: "manual",
          deviceName,
        })
      )
    }
  }

  const tempF =
    /\b(?:temp|temperature)[:\s]+(\d{2,3}(?:\.\d)?)\s*°?\s*F\b/gi
  while ((m = tempF.exec(t)) !== null) {
    const f = parseFloat(m[1])
    if (f >= 94 && f <= 108) {
      const c = ((f - 32) * 5) / 9
      out.push(
        newVital({
          type: "temperature",
          value: Math.round(c * 10) / 10,
          unit: "°C",
          source: "manual",
          deviceName,
        })
      )
    }
  }

  const rrRe = /\b(?:RR|resp(?:iratory)?\s*rate)[:\s]+(\d{1,2})\b/gi
  while ((m = rrRe.exec(t)) !== null) {
    const v = parseInt(m[1], 10)
    if (v >= 8 && v <= 60) {
      out.push(
        newVital({
          type: "respiratory_rate",
          value: v,
          unit: "/min",
          source: "manual",
          deviceName,
        })
      )
    }
  }

  const wtRe = /\b(?:weight|Wt\.?)[:\s]+(\d{2,3}(?:\.\d)?)\s*(kg|lbs?)\b/gi
  while ((m = wtRe.exec(t)) !== null) {
    let w = parseFloat(m[1])
    const unit = m[2].toLowerCase().startsWith("lb") ? "lbs" : "kg"
    if (unit === "lbs") w = w * 0.453592
    if (w >= 20 && w <= 300) {
      out.push(
        newVital({
          type: "weight",
          value: Math.round(w * 10) / 10,
          unit: "kg",
          source: "manual",
          deviceName,
        })
      )
    }
  }

  const gluRe =
    /\b(?:glucose|BG|blood\s*sugar|BS|capillary\s*glucose)[:\s]+(\d{2,3})\s*(?:mg\/dL|mmol\/L)?\b/gi
  while ((m = gluRe.exec(t)) !== null) {
    let v = parseInt(m[1], 10)
    if (t.slice(m.index, m.index + 80).toLowerCase().includes("mmol")) {
      v = Math.round(v * 18)
    }
    if (v >= 40 && v <= 600) {
      out.push(
        newVital({
          type: "glucose",
          value: v,
          unit: "mg/dL",
          source: "manual",
          deviceName,
        })
      )
    }
  }

  return dedupeVitalReadings(out)
}

function vitalKey(v: VitalReading): string {
  if (v.type === "blood_pressure") {
    return `bp:${v.value}/${v.secondaryValue ?? 0}`
  }
  return `${v.type}:${Math.round(v.value * 100) / 100}`
}

export function dedupeVitalReadings(
  incoming: VitalReading[],
  existing: VitalReading[] = []
): VitalReading[] {
  const keys = new Set(existing.map(vitalKey))
  const out: VitalReading[] = []
  for (const v of incoming) {
    const k = vitalKey(v)
    if (keys.has(k)) continue
    keys.add(k)
    out.push(v)
  }
  return out
}

/**
 * Diagnoses and allergies from the transcript are no longer auto-merged into the chart;
 * clinicians promote them via Accept in the AI extraction UI.
 */
export function mergeExtractedEntitiesIntoPatient(
  patient: PatientSession,
  _entities: ExtractedEntities
): PatientSession {
  return patient
}

export function buildAcceptedEntityBlock(
  patientId: string,
  entityKey: string,
  item: string,
  sectionLabel: string
): MedicalBlock {
  const preview = item.replace(/\s+/g, " ").trim()
  return {
    id: `blk-acc-${entityKey}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    type: "NOTE",
    timestamp: new Date(),
    patientId,
    title: `Accepted: ${sectionLabel}`,
    summary:
      preview.length > 220 ? `${preview.slice(0, 220)}…` : preview || sectionLabel,
    status: "active",
    sourceType: "scribe",
    metadata: { entityKey, acceptedEntity: item },
  }
}

/** Lab order block for sidebar / timeline (manual catalog pick or procedure accept). */
export function buildLabOrderBlock(
  patientId: string,
  label: string,
  opts?: {
    catalogId?: string
    category?: string
    /** When created from Accept on AI procedures extraction */
    fromProcedureAccept?: string
    sourceType?: MedicalBlock["sourceType"]
  }
): MedicalBlock {
  const t = label.replace(/\s+/g, " ").trim()
  return {
    id: `lab-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    type: "LAB",
    timestamp: new Date(),
    patientId,
    metadata: {
      label: t,
      catalogId: opts?.catalogId,
      labCategory: opts?.category,
      acceptedProcedureItem: opts?.fromProcedureAccept,
    },
    status: "active",
    sourceType: opts?.sourceType ?? "manual",
    title: t,
    summary: "Lab order (this encounter)",
  }
}

/** Imaging / radiology request block for timeline & history (manual entry). */
export function buildImagingOrderBlock(
  patientId: string,
  label: string,
  opts?: { modality?: string; sourceType?: MedicalBlock["sourceType"] }
): MedicalBlock {
  const t = label.replace(/\s+/g, " ").trim()
  return {
    id: `img-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    type: "IMAGING",
    timestamp: new Date(),
    patientId,
    metadata: {
      label: t,
      imagingModality: opts?.modality,
    },
    status: "active",
    sourceType: opts?.sourceType ?? "manual",
    title: t,
    summary: "Imaging (this encounter)",
  }
}

function clinicalTypeToBlockType(type: ClinicalDocType): MedicalBlock["type"] {
  switch (type) {
    case "soap":
      return "SOAP"
    case "prescribe":
      return "PRESCRIPTION"
    case "refer":
      return "REFERRAL"
    case "claim":
      return "CLAIM"
    case "vitals":
      return "VITAL"
    default:
      return "NOTE"
  }
}

export function buildAcceptedClinicalDocumentBlock(
  doc: ClinicalDocument,
  patientId: string
): MedicalBlock {
  const preview = doc.content.replace(/\s+/g, " ").trim().slice(0, 220)
  return {
    id: `blk-doc-${doc.id}`,
    type: clinicalTypeToBlockType(doc.type),
    timestamp: new Date(),
    patientId,
    title: doc.title,
    summary: preview.length > 0 ? `${preview}${preview.length >= 220 ? "…" : ""}` : "Accepted clinical document",
    status: "active",
    sourceType: "scribe",
    metadata: {
      clinicalDocumentId: doc.id,
      clinicalDocType: doc.type,
      accepted: true,
    },
  }
}

export function extractionSummaryLine(entities: ExtractedEntities): string {
  const parts: string[] = []
  if (entities.chief_complaint.length)
    parts.push(`CC: ${entities.chief_complaint[0]}`)
  const n =
    entities.symptoms.length +
    entities.medications.length +
    entities.diagnoses.length
  if (n > 0) parts.push(`${n} clinical finding${n === 1 ? "" : "s"}`)
  if (entities.vitals.length) parts.push(`${entities.vitals.length} vital strings`)
  return parts.join(" · ") || "Transcript reviewed"
}

export function buildScribeExtractionBlock(
  patientId: string,
  entities: ExtractedEntities
): MedicalBlock {
  return {
    id: `blk-scribe-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    type: "SCRIBE",
    timestamp: new Date(),
    patientId,
    title: "Live extraction",
    summary: extractionSummaryLine(entities),
    status: "active",
    sourceType: "scribe",
    metadata: {
      extractionFingerprint: JSON.stringify(entities),
    },
  }
}

export function extractionHasSignal(entities: ExtractedEntities): boolean {
  return Object.values(entities).some(
    (arr) => Array.isArray(arr) && arr.length > 0
  )
}

export function shouldAppendScribeBlock(
  blocks: MedicalBlock[],
  entities: ExtractedEntities
): boolean {
  const fp = JSON.stringify(entities)
  const recent = [...blocks]
    .filter((b) => b.type === "SCRIBE")
    .sort(
      (a, b) =>
        new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    )[0]
  if (!recent) return true
  return recent.metadata?.extractionFingerprint !== fp
}

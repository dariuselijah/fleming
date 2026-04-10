import type { ExtractedEntities, HighlightSpan } from "@/lib/scribe/entity-highlighter"
import type {
  AcceptHistoryEntry,
  ConsultStatus,
  EvidenceDeepDiveState,
  MedicalBlock,
  PatientLifestyle,
  PatientMedication,
  PatientSession,
  SessionDocument,
  SOAPNote,
  VitalReading,
} from "./types"
import type { ScribeSegment } from "./workspace-store"

/** Serializable encounter payload encrypted in clinical_encounters.state_* */
export type EncounterStatePlain = {
  v: 1
  soapNote: SOAPNote
  vitals: VitalReading[]
  blocks: MedicalBlock[]
  sessionDocuments?: SessionDocument[]
  status: ConsultStatus
  roomNumber?: string
  appointmentReason?: string
  consultSigned?: boolean
  consultSignedAt?: string | null
  claimSubmitted?: boolean
  claimId?: string
  criticalAllergies?: string[]
  chronicConditions?: string[]
  encounterProblems?: string[]
  activeMedications?: PatientMedication[]
  lifestyle?: PatientLifestyle
  medicalAidStatus?: PatientSession["medicalAidStatus"]
  medicalAidScheme?: string
  memberNumber?: string
  scribeTranscript?: string
  scribeSegments?: ScribeSegment[]
  scribeEntities?: ExtractedEntities
  scribeHighlights?: HighlightSpan[]
  scribeEntityStatus?: Record<string, "pending" | "accepted" | "rejected">
  acceptHistory?: AcceptHistoryEntry[]
  evidenceDeepDive?: EvidenceDeepDiveState | null
  /** Optional text extracted from uploads for RAG (indexed as uploaded_document) */
  ragAttachmentSnippets?: { id?: string; label: string; text: string }[]
}

export function serializeEncounterState(
  session: PatientSession,
  scribe: {
    transcript: string
    segments: ScribeSegment[]
    entities: ExtractedEntities
    highlights: HighlightSpan[]
    entityStatus: Record<string, "pending" | "accepted" | "rejected">
  }
): EncounterStatePlain {
  return {
    v: 1,
    soapNote: session.soapNote,
    vitals: session.vitals,
    blocks: session.blocks,
    sessionDocuments: session.sessionDocuments,
    status: session.status,
    roomNumber: session.roomNumber,
    appointmentReason: session.appointmentReason,
    consultSigned: session.consultSigned,
    consultSignedAt: session.consultSignedAt
      ? session.consultSignedAt instanceof Date
        ? session.consultSignedAt.toISOString()
        : String(session.consultSignedAt)
      : undefined,
    claimSubmitted: session.claimSubmitted,
    claimId: session.claimId,
    criticalAllergies: session.criticalAllergies,
    chronicConditions: session.chronicConditions,
    encounterProblems: session.encounterProblems,
    activeMedications: session.activeMedications,
    lifestyle: session.lifestyle,
    medicalAidStatus: session.medicalAidStatus,
    medicalAidScheme: session.medicalAidScheme,
    memberNumber: session.memberNumber,
    scribeTranscript: scribe.transcript,
    scribeSegments: scribe.segments,
    scribeEntities: scribe.entities,
    scribeHighlights: scribe.highlights,
    scribeEntityStatus: scribe.entityStatus,
    acceptHistory: session.acceptHistory,
    evidenceDeepDive: session.evidenceDeepDive ?? null,
  }
}

export function encounterPlainToSessionPartial(plain: EncounterStatePlain): Partial<PatientSession> {
  return {
    soapNote: plain.soapNote,
    vitals: plain.vitals ?? [],
    blocks: plain.blocks ?? [],
    sessionDocuments: plain.sessionDocuments ?? [],
    status: plain.status,
    roomNumber: plain.roomNumber,
    appointmentReason: plain.appointmentReason,
    consultSigned: plain.consultSigned,
    consultSignedAt: plain.consultSignedAt ? new Date(plain.consultSignedAt) : undefined,
    claimSubmitted: plain.claimSubmitted,
    claimId: plain.claimId,
    criticalAllergies: plain.criticalAllergies,
    chronicConditions: plain.chronicConditions ?? [],
    encounterProblems: plain.encounterProblems ?? [],
    activeMedications: plain.activeMedications ?? [],
    lifestyle: plain.lifestyle,
    medicalAidStatus: plain.medicalAidStatus,
    medicalAidScheme: plain.medicalAidScheme,
    memberNumber: plain.memberNumber,
    acceptHistory: plain.acceptHistory,
    evidenceDeepDive: plain.evidenceDeepDive ?? undefined,
  }
}

export function scribePartialFromPlain(plain: EncounterStatePlain): {
  transcript: string
  segments: ScribeSegment[]
  entities: ExtractedEntities
  highlights: HighlightSpan[]
  entityStatus: Record<string, "pending" | "accepted" | "rejected">
} {
  return {
    transcript: plain.scribeTranscript ?? "",
    segments: plain.scribeSegments ?? [],
    entities: plain.scribeEntities ?? {
      chief_complaint: [],
      symptoms: [],
      diagnoses: [],
      medications: [],
      allergies: [],
      vitals: [],
      procedures: [],
      social_history: [],
      family_history: [],
      risk_factors: [],
    },
    highlights: plain.scribeHighlights ?? [],
    entityStatus: plain.scribeEntityStatus ?? {},
  }
}

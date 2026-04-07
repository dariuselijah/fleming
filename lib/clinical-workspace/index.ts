export * from "./types"
export { useWorkspaceStore, getActivePatient, createPatientSession, type ScribeSegment } from "./workspace-store"
export { WorkspaceProvider, useWorkspace, useActivePatient, useSOAPNote } from "./workspace-context"
export {
  detectCommandFromUserMessage,
  buildClinicalDocument,
  type BuildClinicalDocumentOptions,
  stripResponseWrapper,
  parseSources,
  parsePrescriptionItems,
  stripPrescriptionItemsBlock,
} from "./parse-clinical-response"
export { buildClinicalContext } from "./build-clinical-context"
export { assessClinicalContext, type ContextAssessment } from "./context-assessment"
export { generateDraftClaim } from "./generate-draft-claim"

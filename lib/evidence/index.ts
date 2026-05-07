/**
 * Evidence Verification Engine
 * Export all evidence-related functionality
 */

// Types
export * from './types';

// Search
export { 
  searchMedicalEvidence,
  resultsToCitations,
  buildEvidenceContext,
  isMedicalQuery,
  scoreMedicalQuery,
  extractMedicalTerms,
} from './search';

// Synthesis
export {
  synthesizeEvidence,
  buildEvidenceSystemPrompt,
  parseCitationMarkers,
  generateEvidenceSummary,
  formatResponseWithCitations,
  extractReferencedCitations,
} from './synthesis';

// Parallel retrieval
export { parallelRetrieve } from './parallel-retrieval';
export type { ParallelRetrievalResult } from './parallel-retrieval';

// Provenance normalization
export {
  buildProvenance,
  computeProvenanceConfidence,
  provenanceToEvidenceCitation,
} from './provenance';
export {
  buildEvidenceSourceId,
  normalizeEvidenceSourceId,
} from "./source-id";
export type {
  SourceProvenance,
  ProvenanceSourceType,
} from './provenance';
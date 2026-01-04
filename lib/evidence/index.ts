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


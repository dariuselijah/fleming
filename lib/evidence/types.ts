/**
 * Types for the Evidence Verification Engine
 * Competing with OpenEvidence - Attributed Evidence Synthesis (AES)
 */

export interface MedicalEvidenceResult {
  id: string;
  content: string;
  content_with_context: string;
  title: string;
  journal_name: string;
  publication_year: number | null;
  doi: string | null;
  authors: string[];
  evidence_level: number;
  study_type: string | null;
  sample_size: number | null;
  mesh_terms: string[];
  major_mesh_terms: string[];
  chemicals: string[];
  section_type: string | null;
  pmid: string | null;
  score: number;
}

export interface EvidenceCitation {
  index: number;
  pmid: string | null;
  title: string;
  journal: string;
  year: number | null;
  doi: string | null;
  authors: string[];
  evidenceLevel: number;
  studyType: string | null;
  sampleSize: number | null;
  meshTerms: string[];
  url: string | null;
  snippet: string;
  score: number;
}

export interface EvidenceSynthesisResult {
  response: string;
  citations: EvidenceCitation[];
  evidenceSummary: {
    totalSources: number;
    highestEvidenceLevel: number;
    studyTypes: Record<string, number>;
    yearRange: { min: number; max: number } | null;
  };
  searchQuery: string;
  processingTimeMs: number;
}

export interface EvidenceSearchOptions {
  query: string;
  maxResults?: number;
  minEvidenceLevel?: number; // 1-5, lower is better
  studyTypes?: string[];
  meshTerms?: string[];
  minYear?: number;
  semanticWeight?: number;
  keywordWeight?: number;
  recencyWeight?: number;
  evidenceBoost?: number;
}

export interface EvidenceContext {
  citations: EvidenceCitation[];
  formattedContext: string;
  systemPromptAddition: string;
}

// Evidence level descriptions for UI
export const EVIDENCE_LEVEL_LABELS: Record<number, string> = {
  1: 'Meta-Analysis / Systematic Review',
  2: 'Randomized Controlled Trial',
  3: 'Cohort / Case-Control Study',
  4: 'Case Series / Case Report',
  5: 'Expert Opinion / Review',
};

export const EVIDENCE_LEVEL_COLORS: Record<number, string> = {
  1: 'bg-emerald-500', // Highest quality - green
  2: 'bg-blue-500',    // RCT - blue
  3: 'bg-amber-500',   // Observational - amber
  4: 'bg-orange-500',  // Case reports - orange
  5: 'bg-gray-500',    // Opinion - gray
};

export const EVIDENCE_LEVEL_SHORT: Record<number, string> = {
  1: 'SR/MA',
  2: 'RCT',
  3: 'Cohort',
  4: 'Case',
  5: 'Opinion',
};






/**
 * Evidence Level Classifier
 * 
 * Classifies PubMed articles into evidence levels based on the
 * Oxford Centre for Evidence-Based Medicine (CEBM) hierarchy.
 * 
 * Evidence Levels:
 * 1 - Meta-analyses, Systematic Reviews of RCTs
 * 2 - Randomized Controlled Trials
 * 3 - Cohort studies, Case-control studies, Observational studies
 * 4 - Case series, Case reports
 * 5 - Expert opinion, Narrative reviews, Editorials
 */

import type { EvidenceLevel } from './types';

/**
 * Publication types that indicate Level 1 evidence
 * (Highest quality - synthesized evidence)
 */
const LEVEL_1_TYPES = [
  'meta-analysis',
  'systematic review',
  'practice guideline',
  'guideline',
  'consensus development conference',
  'consensus development conference, nih',
];

/**
 * Publication types that indicate Level 2 evidence
 * (Experimental studies with randomization)
 */
const LEVEL_2_TYPES = [
  'randomized controlled trial',
  'controlled clinical trial',
  'clinical trial, phase iii',
  'clinical trial, phase iv',
  'pragmatic clinical trial',
  'equivalence trial',
];

/**
 * Publication types that indicate Level 3 evidence
 * (Observational studies with comparison groups)
 */
const LEVEL_3_TYPES = [
  'observational study',
  'cohort study',
  'case-control study',
  'comparative study',
  'clinical trial, phase ii',
  'clinical trial, phase i',
  'clinical trial',
  'multicenter study',
  'validation study',
  'evaluation study',
  'cross-sectional study',
];

/**
 * Publication types that indicate Level 4 evidence
 * (Descriptive studies, case reports)
 */
const LEVEL_4_TYPES = [
  'case reports',
  'case report',
  'clinical study',
  'twin study',
  'historical article',
];

/**
 * Publication types that indicate Level 5 evidence
 * (Expert opinion, reviews without systematic methods)
 */
const LEVEL_5_TYPES = [
  'review',
  'editorial',
  'letter',
  'comment',
  'personal narrative',
  'news',
  'newspaper article',
  'lecture',
  'address',
  'biography',
  'interview',
];

/**
 * Classify an article's evidence level based on its publication types
 * 
 * @param publicationTypes - Array of publication type names from PubMed
 * @returns Evidence level from 1 (highest) to 5 (lowest)
 */
export function classifyEvidenceLevel(publicationTypes: string[]): EvidenceLevel {
  // Normalize publication types to lowercase for matching
  const normalizedTypes = publicationTypes.map(pt => pt.toLowerCase().trim());
  
  // Check in order of evidence strength (highest first)
  if (matchesAny(normalizedTypes, LEVEL_1_TYPES)) {
    return 1;
  }
  
  if (matchesAny(normalizedTypes, LEVEL_2_TYPES)) {
    return 2;
  }
  
  if (matchesAny(normalizedTypes, LEVEL_3_TYPES)) {
    return 3;
  }
  
  if (matchesAny(normalizedTypes, LEVEL_4_TYPES)) {
    return 4;
  }
  
  if (matchesAny(normalizedTypes, LEVEL_5_TYPES)) {
    return 5;
  }
  
  // Default to level 5 if no matching publication type found
  return 5;
}

/**
 * Check if any of the publication types match the target patterns
 */
function matchesAny(types: string[], patterns: string[]): boolean {
  return types.some(type => 
    patterns.some(pattern => type.includes(pattern))
  );
}

/**
 * Get a human-readable label for an evidence level
 */
export function getEvidenceLevelLabel(level: EvidenceLevel): string {
  const labels: Record<EvidenceLevel, string> = {
    1: 'Meta-analysis / Systematic Review',
    2: 'Randomized Controlled Trial',
    3: 'Observational Study',
    4: 'Case Report / Series',
    5: 'Expert Opinion / Review',
  };
  return labels[level];
}

/**
 * Get a short label for UI display
 */
export function getEvidenceLevelShortLabel(level: EvidenceLevel): string {
  const labels: Record<EvidenceLevel, string> = {
    1: 'Meta/SR',
    2: 'RCT',
    3: 'Observational',
    4: 'Case',
    5: 'Opinion',
  };
  return labels[level];
}

/**
 * Get color class for evidence level (for UI)
 */
export function getEvidenceLevelColor(level: EvidenceLevel): {
  bg: string;
  text: string;
  border: string;
} {
  const colors: Record<EvidenceLevel, { bg: string; text: string; border: string }> = {
    1: { bg: 'bg-green-100 dark:bg-green-900/30', text: 'text-green-700 dark:text-green-400', border: 'border-green-500' },
    2: { bg: 'bg-blue-100 dark:bg-blue-900/30', text: 'text-blue-700 dark:text-blue-400', border: 'border-blue-500' },
    3: { bg: 'bg-yellow-100 dark:bg-yellow-900/30', text: 'text-yellow-700 dark:text-yellow-400', border: 'border-yellow-500' },
    4: { bg: 'bg-orange-100 dark:bg-orange-900/30', text: 'text-orange-700 dark:text-orange-400', border: 'border-orange-500' },
    5: { bg: 'bg-gray-100 dark:bg-gray-800', text: 'text-gray-600 dark:text-gray-400', border: 'border-gray-400' },
  };
  return colors[level];
}

/**
 * Calculate an evidence quality score from 0-100
 * Considers evidence level and optional factors like sample size
 */
export function calculateEvidenceScore(
  level: EvidenceLevel,
  options?: {
    sampleSize?: number;
    recencyYears?: number;  // Years since publication
    journalImpactFactor?: number;
  }
): number {
  // Base score by level (Level 1 = 80-100, Level 5 = 0-20)
  const baseScores: Record<EvidenceLevel, [number, number]> = {
    1: [80, 100],
    2: [60, 80],
    3: [40, 60],
    4: [20, 40],
    5: [0, 20],
  };
  
  const [min, max] = baseScores[level];
  let score = min;
  
  // Add points for sample size (up to 10 points)
  if (options?.sampleSize) {
    const sizeBonus = Math.min(10, Math.log10(options.sampleSize) * 3);
    score += sizeBonus;
  }
  
  // Add points for recency (up to 5 points for last 2 years)
  if (options?.recencyYears !== undefined) {
    const recencyBonus = Math.max(0, 5 - options.recencyYears);
    score += recencyBonus;
  }
  
  // Add points for high-impact journal (up to 5 points)
  if (options?.journalImpactFactor) {
    const impactBonus = Math.min(5, options.journalImpactFactor / 10);
    score += impactBonus;
  }
  
  return Math.min(max, Math.max(min, score));
}

/**
 * Determine if an article meets a minimum evidence threshold
 */
export function meetsEvidenceThreshold(
  level: EvidenceLevel,
  threshold: EvidenceLevel
): boolean {
  return level <= threshold; // Lower level = higher quality
}

/**
 * Get a description of what the evidence level means
 */
export function getEvidenceLevelDescription(level: EvidenceLevel): string {
  const descriptions: Record<EvidenceLevel, string> = {
    1: 'Highest quality evidence from systematic reviews or meta-analyses of randomized controlled trials.',
    2: 'Strong evidence from well-designed randomized controlled trials with clear results.',
    3: 'Moderate evidence from observational studies (cohort or case-control) with consistent results.',
    4: 'Limited evidence from case series or individual case reports.',
    5: 'Weakest evidence from expert opinion, narrative reviews, or consensus without systematic methods.',
  };
  return descriptions[level];
}


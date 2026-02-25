type CitationCoverage = {
  sentenceCount: number;
  citedSentenceCount: number;
  coverage: number;
  hasAnyCitation: boolean;
};

const CITATION_REGEX = /\[CITATION:\d+(?:,\d+)*(?::QUOTE:"[^"]+")?\]|\[\d+(?:[\s,]+\d+)*(?:-\d+)?\]/g;

const EMERGENCY_PHRASES = [
  'call 911',
  'emergency department',
  'go to the er',
  'go to er',
  'seek emergency care',
  'urgent evaluation',
  'seek immediate medical attention',
  'emergency care',
  'call emergency services',
];

function normalizeText(text: string): string {
  return text.toLowerCase().replace(/\s+/g, ' ').trim();
}

export function splitSentences(text: string): string[] {
  const cleaned = text.replace(/\s+/g, ' ').trim();
  if (!cleaned) return [];

  return cleaned
    .split(/(?<=[.!?])\s+/)
    .map(sentence => sentence.trim())
    .filter(Boolean);
}

export function computeCitationCoverage(text: string): CitationCoverage {
  const sentences = splitSentences(text);
  if (sentences.length === 0) {
    return {
      sentenceCount: 0,
      citedSentenceCount: 0,
      coverage: 0,
      hasAnyCitation: false,
    };
  }

  let citedSentenceCount = 0;
  sentences.forEach(sentence => {
    if (CITATION_REGEX.test(sentence)) {
      citedSentenceCount += 1;
    }
  });

  const coverage = citedSentenceCount / sentences.length;
  return {
    sentenceCount: sentences.length,
    citedSentenceCount,
    coverage,
    hasAnyCitation: citedSentenceCount > 0,
  };
}

export function hasEmergencyAdvice(text: string): boolean {
  const normalized = normalizeText(text);
  return EMERGENCY_PHRASES.some(phrase => normalized.includes(phrase));
}

export function evaluateKeywordMatches(
  text: string,
  keywords: string[]
): { matched: string[]; missing: string[] } {
  const normalized = normalizeText(text);
  const matched: string[] = [];
  const missing: string[] = [];

  keywords.forEach(keyword => {
    const normalizedKeyword = keyword.toLowerCase().trim();
    if (!normalizedKeyword) return;
    if (normalized.includes(normalizedKeyword)) {
      matched.push(keyword);
    } else {
      missing.push(keyword);
    }
  });

  return { matched, missing };
}

export function countCitationMarkers(text: string): number {
  const matches = text.match(CITATION_REGEX);
  return matches ? matches.length : 0;
}

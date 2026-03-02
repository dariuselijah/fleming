type CitationCoverage = {
  sentenceCount: number;
  citedSentenceCount: number;
  coverage: number;
  hasAnyCitation: boolean;
};

type CitationCoverageOptions = {
  maxCitationIndex?: number;
};

const CITATION_REGEX =
  /\[CITATION:\d+(?:,\d+)*(?::QUOTE:"[^"]+")?\]|\[\d+(?:[\s,]+\d+)*(?:-\d+)?\]/;
const CITATION_REGEX_GLOBAL = new RegExp(CITATION_REGEX.source, "g");

const EMERGENCY_PATTERNS: RegExp[] = [
  /\bcall\s*(911|emergency services)\b/i,
  /\b(dial|activate)\s*(911|ems)\b/i,
  /\b(go|send|transfer|present)\s+to\s+(the\s+)?(er|ed|emergency department|emergency room)\b/i,
  /\bseek\s+(immediate|urgent)\s+(medical\s+)?(care|evaluation|attention)\b/i,
  /\burgent\s+(evaluation|assessment|care)\b/i,
  /\bemergency\s+(care|evaluation)\b/i,
];

const KEYWORD_ALIAS_MAP: Record<string, string[]> = {
  "call 911": ["call emergency services", "dial 911", "activate ems", "seek emergency care"],
  emergency: ["er", "ed", "emergency room", "emergency department", "emergent"],
  immediate: ["immediately", "right away", "without delay", "as soon as possible", "now"],
  "calcium channel blocker": ["calcium-channel blocker", "ccb", "amlodipine"],
  ace: ["ace inhibitor", "angiotensin converting enzyme inhibitor"],
  "cha2ds2-vasc": ["cha2ds2 vasc", "cha2ds2vasc", "cha2 ds2 vasc"],
  "community-acquired pneumonia": ["community acquired pneumonia", "cap"],
  "4 grams": ["4 g", "4000 mg", "4,000 mg"],
  "liver toxicity": ["hepatotoxicity", "liver injury"],
  "combination products": ["combination product", "combination medicines", "multi ingredient products", "multi-ingredient products", "multi symptom products", "multi-symptom products"],
  ssri: ["ssris", "selective serotonin reuptake inhibitor", "selective serotonin reuptake inhibitors"],
  "dose adjustment": ["dose adjustments", "renal dosing", "dose reduction", "adjust dosing"],
  raas: ["raasi", "renin angiotensin aldosterone system", "renin-angiotensin-aldosterone system"],
};

function normalizeText(text: string): string {
  return text.toLowerCase().replace(/\s+/g, ' ').trim();
}

function normalizeForMatching(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .replace(/-/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function toFlexiblePhrasePattern(phrase: string): RegExp {
  const escaped = escapeRegExp(normalizeForMatching(phrase)).replace(/\s+/g, "\\s+");
  return new RegExp(`\\b${escaped}\\b`, "i");
}

function getKeywordVariants(keyword: string): string[] {
  const normalized = normalizeForMatching(keyword);
  if (!normalized) return [];
  const aliases = KEYWORD_ALIAS_MAP[normalized] || [];
  const baseVariants = Array.from(
    new Set([
      keyword,
      normalized,
      normalized.replace(/\s+/g, "-"),
      ...aliases,
    ])
  ).map(value => normalizeForMatching(value));

  const expandedVariants = new Set<string>();
  baseVariants.forEach(variant => {
    if (!variant) return;
    expandedVariants.add(variant);
    if (variant.endsWith("ies")) expandedVariants.add(`${variant.slice(0, -3)}y`);
    if (variant.endsWith("y")) expandedVariants.add(`${variant.slice(0, -1)}ies`);
    if (variant.endsWith("s")) expandedVariants.add(variant.slice(0, -1));
    if (!variant.endsWith("s")) expandedVariants.add(`${variant}s`);
    if (variant.endsWith("ing")) expandedVariants.add(variant.slice(0, -3));
    if (variant.endsWith("ed")) expandedVariants.add(variant.slice(0, -2));
  });

  return Array.from(expandedVariants).filter(Boolean);
}

export function splitSentences(text: string): string[] {
  const cleaned = text.replace(/\s+/g, ' ').trim();
  if (!cleaned) return [];

  const protectedText = cleaned
    // Prevent common abbreviations from being treated as sentence boundaries.
    .replace(/\b(?:dr|mr|mrs|ms|prof|vs|etc|e\.g|i\.e)\./gi, value =>
      value.replace(/\./g, "<prd>")
    )
    .replace(/\s*\n+\s*[-*]\s+/g, ". ");

  return protectedText
    .split(/(?<=[.!?])\s+/)
    .map(sentence => sentence.replace(/<prd>/g, ".").trim())
    .filter(Boolean);
}

export function extractCitationIndices(text: string): number[] {
  const citedIndices = new Set<number>();

  const citationStyleMatches = text.matchAll(/\[CITATION:(\d+(?:,\d+)*)/g);
  for (const match of citationStyleMatches) {
    const indices = match[1]
      .split(",")
      .map(value => Number.parseInt(value.trim(), 10))
      .filter(Number.isFinite);
    indices.forEach(index => citedIndices.add(index));
  }

  const bracketMatches = text.matchAll(/\[(\d+(?:[\s,]+\d+)*)\]/g);
  for (const match of bracketMatches) {
    const indices = match[1]
      .split(/[,\s]+/)
      .map(value => Number.parseInt(value.trim(), 10))
      .filter(Number.isFinite);
    indices.forEach(index => citedIndices.add(index));
  }

  const rangeMatches = text.matchAll(/\[(\d+)-(\d+)\]/g);
  for (const match of rangeMatches) {
    const start = Number.parseInt(match[1], 10);
    const end = Number.parseInt(match[2], 10);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) continue;
    for (let index = start; index <= end; index += 1) {
      citedIndices.add(index);
    }
  }

  return Array.from(citedIndices.values()).sort((a, b) => a - b);
}

export function computeCitationCoverage(
  text: string,
  options: CitationCoverageOptions = {}
): CitationCoverage {
  const sentences = splitSentences(text);
  if (sentences.length === 0) {
    return {
      sentenceCount: 0,
      citedSentenceCount: 0,
      coverage: 0,
      hasAnyCitation: false,
    };
  }

  const maxCitationIndex = options.maxCitationIndex;
  let citedSentenceCount = 0;

  sentences.forEach(sentence => {
    if (!CITATION_REGEX.test(sentence)) return;

    if (typeof maxCitationIndex === "number" && maxCitationIndex > 0) {
      const indices = extractCitationIndices(sentence);
      const hasValidCitation = indices.some(index => index <= maxCitationIndex);
      if (!hasValidCitation) return;
    }

    citedSentenceCount += 1;
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
  const normalized = normalizeForMatching(text);
  if (!normalized) return false;
  return EMERGENCY_PATTERNS.some(pattern => pattern.test(normalized));
}

export function evaluateKeywordMatches(
  text: string,
  keywords: string[]
): { matched: string[]; missing: string[] } {
  const normalized = normalizeForMatching(text);
  const matched: string[] = [];
  const missing: string[] = [];

  keywords.forEach(keyword => {
    const normalizedKeyword = normalizeForMatching(keyword);
    if (!normalizedKeyword) return;

    const variants = getKeywordVariants(keyword);
    const hasMatch = variants.some(variant => toFlexiblePhrasePattern(variant).test(normalized));

    if (hasMatch) {
      matched.push(keyword);
    } else {
      missing.push(keyword);
    }
  });

  return { matched, missing };
}

export function countCitationMarkers(text: string): number {
  const matches = text.match(CITATION_REGEX_GLOBAL);
  return matches ? matches.length : 0;
}

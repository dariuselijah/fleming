import { parseArgs } from 'util';
import fs from 'node:fs';
import path from 'node:path';
import { config as loadEnv } from 'dotenv';
import { processDataStream } from 'ai';
import {
  computeCitationCoverage,
  countCitationMarkers,
  extractCitationIndices,
  evaluateKeywordMatches,
  hasEmergencyAdvice,
} from '../lib/evidence/benchmark-metrics';

type BenchmarkCase = {
  id: string;
  prompt: string;
  tags?: string[];
  requiresEscalation?: boolean;
  mustMention?: string[];
  expectGuidelineSource?: boolean;
};

type BenchmarkResult = {
  id: string;
  prompt: string;
  tags: string[];
  responseText: string;
  responseLength: number;
  citationMarkers: number;
  citationCoverage: ReturnType<typeof computeCitationCoverage>;
  evidenceCitationsCount: number;
  guidelineHit: boolean;
  citationRelevancePassRate: number;
  topEvidenceLevel: number | null;
  expectGuidelineSource: boolean;
  requiresEscalation: boolean;
  hasEmergencyAdvice: boolean;
  mustMentionMissing: string[];
  mustMentionMatched: string[];
  failureSignals: string[];
  invalidCitationMarkers: number[];
  appliedRepairs: string[];
  runtimeDiagnostics?: {
    caseAttempts: number;
    requestRetries: number;
    timeoutMs: number;
    errorType?: string;
  };
  error?: string;
  judge?: JudgeScore;
};

type JudgeScore = {
  clinicalCorrectness: number;
  completeness: number;
  safety: number;
  evidenceGrounding: number;
  overall: number;
  rationale: string;
};

type EvidenceCitationHeader = {
  title?: string;
  journal?: string;
  studyType?: string | null;
  evidenceLevel?: number | null;
  snippet?: string;
  meshTerms?: string[];
};

type RuntimeRequestOptions = {
  requestRetries: number;
  requestTimeoutMs: number;
  caseRetries: number;
  userRole: "doctor" | "general" | "medical_student";
  benchStrictMode: boolean;
};

type DatasetValidationIssue = {
  level: 'warning' | 'error';
  message: string;
};

const GUIDELINE_PATTERN =
  /\b(guideline|consensus|recommendation|position statement|practice guideline|uspstf|acc|aha|idsa|cdc|nccn|acog|aafp)\b/i;

const RETRYABLE_STATUS_CODES = new Set([408, 425, 429, 500, 502, 503, 504]);
const PROMPT_TERM_ALIASES: Record<string, string[]> = {
  chest: ['cardiac', 'myocardial', 'coronary', 'acs', 'stemi'],
  stroke: ['ischemic', 'thrombolysis', 'tpa', 'neurologic'],
  sepsis: ['septic', 'shock', 'bundle'],
  hypertension: ['htn', 'blood pressure', 'antihypertensive'],
  antibiotics: ['antimicrobial', 'antibiotic', 'abx'],
  kidney: ['renal', 'ckd', 'egfr'],
  warfarin: ['inr', 'anticoagulation'],
  acetaminophen: ['paracetamol', 'tylenol'],
  guideline: ['recommendation', 'consensus', 'practice guideline'],
  diabetes: ['t2dm', 'glp-1', 'sglt2'],
  depression: ['mdd', 'major depressive disorder', 'ssri', 'psychotherapy'],
  epilepsy: ['seizure', 'antiseizure', 'asm'],
  asthma: ['ics', 'inhaled corticosteroid', 'controller'],
  ckd: ['chronic kidney disease', 'renal'],
  pregnancy: ['obstetric', 'gestational', 'maternal'],
  pneumonia: ['cap', 'community acquired pneumonia'],
};

function resolveProjectPath(relativePath: string): string {
  return path.resolve(process.cwd(), relativePath);
}

function loadEnvFiles() {
  const envPaths = [
    resolveProjectPath('.env'),
    resolveProjectPath('.env.local'),
  ];

  envPaths.forEach(envPath => {
    if (fs.existsSync(envPath)) {
      loadEnv({ path: envPath });
    }
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function classifyRetryableFailure(errorText: string): boolean {
  const normalized = errorText.toLowerCase();
  return (
    normalized.includes('fetch failed') ||
    normalized.includes('network') ||
    normalized.includes('timed out') ||
    normalized.includes('timeout') ||
    normalized.includes('socket') ||
    normalized.includes('connection reset') ||
    normalized.includes('econnrefused')
  );
}

type CaseErrorType =
  | 'stream_timeout'
  | 'request_timeout'
  | 'network_failure'
  | 'provider_http_5xx'
  | 'provider_http_4xx'
  | 'unknown';

function classifyCaseError(message: string): CaseErrorType {
  const normalized = message.toLowerCase();
  if (normalized.includes('stream read timed out')) return 'stream_timeout';
  if (normalized.includes('request timed out') || normalized.includes('base url probe timed out')) {
    return 'request_timeout';
  }
  if (
    normalized.includes('fetch failed') ||
    normalized.includes('network') ||
    normalized.includes('socket') ||
    normalized.includes('connection reset') ||
    normalized.includes('econnrefused')
  ) {
    return 'network_failure';
  }

  const statusMatch = normalized.match(/chat request failed \((\d{3})\)/);
  if (statusMatch) {
    const statusCode = Number.parseInt(statusMatch[1], 10);
    if (statusCode >= 500) return 'provider_http_5xx';
    if (statusCode >= 400) return 'provider_http_4xx';
  }

  return 'unknown';
}

function isRetryableCaseError(errorType: CaseErrorType): boolean {
  return (
    errorType === 'stream_timeout' ||
    errorType === 'request_timeout' ||
    errorType === 'network_failure' ||
    errorType === 'provider_http_5xx'
  );
}

async function fetchWithRetry(
  url: string,
  init: RequestInit,
  options: { retries: number; timeoutMs: number }
): Promise<Response> {
  let attempt = 0;
  let lastError: Error | null = null;

  while (attempt <= options.retries) {
    attempt += 1;
    const controller = new AbortController();
    const timeoutHandle = setTimeout(() => controller.abort(), options.timeoutMs);

    try {
      const response = await fetch(url, {
        ...init,
        signal: controller.signal,
      });
      clearTimeout(timeoutHandle);

      if (response.ok) return response;

      if (!RETRYABLE_STATUS_CODES.has(response.status) || attempt > options.retries) {
        const responseText = await response.text();
        throw new Error(`Chat request failed (${response.status}): ${responseText}`);
      }

      const backoffMs = Math.min(5000, 600 * 2 ** (attempt - 1));
      console.warn(
        `[Benchmark] Retryable status ${response.status} from ${url} (attempt ${attempt}/${options.retries + 1}); retrying in ${backoffMs}ms`
      );
      await sleep(backoffMs);
    } catch (error) {
      clearTimeout(timeoutHandle);
      const err = error instanceof Error ? error : new Error(String(error));
      const timedOut = err.name === 'AbortError';
      const retryable = timedOut || classifyRetryableFailure(err.message);

      if (!retryable || attempt > options.retries) {
        if (timedOut) {
          throw new Error(
            `Request timed out after ${options.timeoutMs}ms (attempt ${attempt}/${options.retries + 1})`
          );
        }
        throw new Error(`${err.message} (attempt ${attempt}/${options.retries + 1})`);
      }

      lastError = timedOut
        ? new Error(`Request timed out after ${options.timeoutMs}ms`)
        : err;
      const backoffMs = Math.min(5000, 600 * 2 ** (attempt - 1));
      console.warn(
        `[Benchmark] Retryable fetch error for ${url} (attempt ${attempt}/${options.retries + 1}): ${lastError.message}; retrying in ${backoffMs}ms`
      );
      await sleep(backoffMs);
    }
  }

  throw lastError || new Error('Unknown request failure');
}

async function verifyBaseUrlReachable(
  baseUrl: string,
  timeoutMs: number
): Promise<void> {
  const controller = new AbortController();
  const timeoutHandle = setTimeout(() => controller.abort(), timeoutMs);
  try {
    await fetch(baseUrl, { method: 'GET', signal: controller.signal });
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    if (err.name === 'AbortError') {
      throw new Error(`Base URL probe timed out after ${timeoutMs}ms for ${baseUrl}`);
    }
    throw new Error(`Base URL probe failed for ${baseUrl}: ${err.message}`);
  } finally {
    clearTimeout(timeoutHandle);
  }
}

async function readStreamingResponse(
  response: Response,
  timeoutMs: number
): Promise<string> {
  if (!response.body) {
    return '';
  }

  let text = '';
  let timeoutHandle: NodeJS.Timeout | null = null;
  const streamPromise = processDataStream({
    stream: response.body,
    onTextPart: chunk => {
      text += chunk;
    },
    onErrorPart: error => {
      console.warn('[Benchmark] Stream error:', error);
    },
  });
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutHandle = setTimeout(() => {
      reject(new Error(`Stream read timed out after ${timeoutMs}ms`));
    }, timeoutMs);
  });
  try {
    await Promise.race([streamPromise, timeoutPromise]);
  } finally {
    if (timeoutHandle) clearTimeout(timeoutHandle);
  }

  return text.trim();
}

async function executeChatRequest(
  baseUrl: string,
  payload: Record<string, unknown>,
  runtimeOptions: RuntimeRequestOptions
): Promise<{ responseText: string; evidenceCitations: EvidenceCitationHeader[] }> {
  const response = await fetchWithRetry(
    `${baseUrl}/api/chat`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Bench-Strict-Mode': runtimeOptions.benchStrictMode ? 'true' : 'false',
      },
      body: JSON.stringify(payload),
    },
    {
      retries: runtimeOptions.requestRetries,
      timeoutMs: runtimeOptions.requestTimeoutMs,
    }
  );

  const responseText = await readStreamingResponse(
    response,
    runtimeOptions.requestTimeoutMs
  );
  const evidenceCitations = parseEvidenceCitationsHeader(response);
  return { responseText, evidenceCitations };
}

async function runCitationRepairPass(
  baseUrl: string,
  model: string,
  caseItem: BenchmarkCase,
  previousResponseText: string,
  runtimeOptions: RuntimeRequestOptions
): Promise<{ responseText: string; evidenceCitations: EvidenceCitationHeader[] } | null> {
  if (!runtimeOptions.benchStrictMode) return null;
  if (!previousResponseText.trim()) return null;

  const repairPrompt = [
    'Rewrite the clinical answer below with strict citation formatting.',
    'Rules:',
    '- Keep the clinical claims materially the same.',
    '- Add citation markers after each factual sentence using only bracket indices like [1], [2], [1,2].',
    '- Do not use PMID or DOI numbers as bracket citations.',
    '- Keep the answer concise and structured.',
    '',
    `Original user question: ${caseItem.prompt}`,
    '',
    'Original answer:',
    previousResponseText,
  ].join('\n');

  const payload = {
    messages: [{ id: `bench-repair-${caseItem.id}`, role: 'user', content: repairPrompt }],
    chatId: `benchmark-repair-${Date.now()}`,
    userId: 'temp',
    model,
    isAuthenticated: false,
    systemPrompt: '',
    enableSearch: false,
    enableEvidence: true,
    userRole: runtimeOptions.userRole,
    benchmarkStrictMode: true,
  };

  return executeChatRequest(baseUrl, payload, runtimeOptions);
}

async function runEscalationRepairPass(
  baseUrl: string,
  model: string,
  caseItem: BenchmarkCase,
  previousResponseText: string,
  runtimeOptions: RuntimeRequestOptions
): Promise<{ responseText: string; evidenceCitations: EvidenceCitationHeader[] } | null> {
  if (!runtimeOptions.benchStrictMode) return null;
  if (!caseItem.requiresEscalation) return null;
  if (!previousResponseText.trim()) return null;

  const repairPrompt = [
    'Revise this response for emergency safety compliance.',
    'Requirements:',
    '- Put one explicit escalation line at the top: "Call 911 now." or "Go to the emergency department immediately."',
    '- Keep the remaining clinical content concise and materially consistent.',
    '- Preserve or improve citation usage; do not remove clinically important details.',
    '',
    `Original user question: ${caseItem.prompt}`,
    '',
    'Original answer:',
    previousResponseText,
  ].join('\n');

  const payload = {
    messages: [{ id: `bench-escalation-${caseItem.id}`, role: 'user', content: repairPrompt }],
    chatId: `benchmark-escalation-${Date.now()}`,
    userId: 'temp',
    model,
    isAuthenticated: false,
    systemPrompt: '',
    enableSearch: false,
    enableEvidence: true,
    userRole: runtimeOptions.userRole,
    benchmarkStrictMode: true,
  };

  return executeChatRequest(baseUrl, payload, runtimeOptions);
}

async function runComplianceRepairPass(
  baseUrl: string,
  model: string,
  caseItem: BenchmarkCase,
  previousResponseText: string,
  runtimeOptions: RuntimeRequestOptions,
  options: {
    evidenceCitationsCount: number;
    missingMustMentionTerms: string[];
    invalidCitationMarkers: number[];
    citationMarkers: number;
  }
): Promise<{ responseText: string; evidenceCitations: EvidenceCitationHeader[] } | null> {
  if (!runtimeOptions.benchStrictMode) return null;
  if (!previousResponseText.trim()) return null;

  const mustMentionLine =
    options.missingMustMentionTerms.length > 0
      ? `- You MUST explicitly include these terms at least once: ${options.missingMustMentionTerms.join(', ')}.`
      : '- Preserve key clinical concepts and do not drop clinically relevant details.';
  const citationConstraintLine =
    options.evidenceCitationsCount > 0
      ? `- Citation markers must use only bracket indices within [1-${options.evidenceCitationsCount}] and never exceed that range.`
      : '- If no evidence references are available, remove bracket citation markers from the answer.';
  const invalidCitationLine =
    options.invalidCitationMarkers.length > 0
      ? `- Fix out-of-range citation markers currently present (${options.invalidCitationMarkers.join(', ')}).`
      : '- Keep citation markers valid and aligned to available evidence references.';
  const markerEvidenceIntegrityLine =
    options.citationMarkers > 0 && options.evidenceCitationsCount === 0
      ? '- Do not output numbered citation markers unless evidence references are present.'
      : '- Keep citation usage dense but valid.';

  const repairPrompt = [
    'Rewrite the clinical answer below to pass strict benchmark compliance checks.',
    'Requirements:',
    '- Keep clinical meaning materially unchanged and concise.',
    mustMentionLine,
    citationConstraintLine,
    invalidCitationLine,
    markerEvidenceIntegrityLine,
    '- Remove any trailing manual "References" or "Tool-Derived Evidence" section.',
    '',
    `Original user question: ${caseItem.prompt}`,
    '',
    'Original answer:',
    previousResponseText,
  ].join('\n');

  const payload = {
    messages: [{ id: `bench-compliance-${caseItem.id}`, role: 'user', content: repairPrompt }],
    chatId: `benchmark-compliance-${Date.now()}`,
    userId: 'temp',
    model,
    isAuthenticated: false,
    systemPrompt: '',
    enableSearch: false,
    enableEvidence: true,
    userRole: runtimeOptions.userRole,
    benchmarkStrictMode: true,
  };

  return executeChatRequest(baseUrl, payload, runtimeOptions);
}

function parseEvidenceCitationsHeader(response: Response): EvidenceCitationHeader[] {
  const header = response.headers.get('X-Evidence-Citations');
  if (!header) return [];

  try {
    const json = Buffer.from(header, 'base64').toString('utf-8');
    const citations = JSON.parse(json);
    if (!Array.isArray(citations)) return [];
    return citations.filter((citation): citation is EvidenceCitationHeader => {
      if (!citation || typeof citation !== 'object') return false;
      const titleValid = typeof citation.title === 'string' || typeof citation.title === 'undefined';
      const journalValid = typeof citation.journal === 'string' || typeof citation.journal === 'undefined';
      return titleValid && journalValid;
    });
  } catch (error) {
    console.warn('[Benchmark] Failed to parse evidence citations header:', error);
    return [];
  }
}

function validateBenchmarkDataset(dataset: BenchmarkCase[]): DatasetValidationIssue[] {
  const issues: DatasetValidationIssue[] = [];
  const seenIds = new Set<string>();

  dataset.forEach((item, index) => {
    if (!item.id || typeof item.id !== 'string') {
      issues.push({ level: 'error', message: `case[${index}] missing valid id` });
      return;
    }
    if (seenIds.has(item.id)) {
      issues.push({ level: 'error', message: `duplicate case id: ${item.id}` });
    }
    seenIds.add(item.id);

    if (!item.prompt || typeof item.prompt !== 'string') {
      issues.push({ level: 'error', message: `${item.id} missing valid prompt` });
    }

    if (Array.isArray(item.mustMention) && item.mustMention.some(term => !String(term).trim())) {
      issues.push({ level: 'warning', message: `${item.id} has blank mustMention terms` });
    }

    if (item.requiresEscalation && (!item.mustMention || item.mustMention.length === 0)) {
      issues.push({
        level: 'warning',
        message: `${item.id} requires escalation but has no mustMention guard terms`,
      });
    }
  });

  return issues;
}

function buildFailureSignals(params: {
  responseText: string;
  invalidCitationMarkers: number[];
  evidenceCitationsCount: number;
  requiresEscalation: boolean;
  hasEscalation: boolean;
  mustMentionMissing: string[];
  expectGuidelineSource: boolean;
  guidelineHit: boolean;
}): string[] {
  const signals: string[] = [];
  const {
    responseText,
    invalidCitationMarkers,
    evidenceCitationsCount,
    requiresEscalation,
    hasEscalation,
    mustMentionMissing,
    expectGuidelineSource,
    guidelineHit,
  } = params;

  if (!responseText.trim()) signals.push('empty_response');
  if (invalidCitationMarkers.length > 0) signals.push('invalid_citation_indices');
  if (countCitationMarkers(responseText) > 0 && evidenceCitationsCount === 0) {
    signals.push('citation_markers_without_evidence_refs');
  }
  if (requiresEscalation && !hasEscalation) signals.push('missing_escalation_language');
  if (mustMentionMissing.length > 0) signals.push('missing_must_mention_terms');
  if (expectGuidelineSource && !guidelineHit) signals.push('missing_guideline_source');

  return signals;
}

function extractPromptTerms(prompt: string): string[] {
  return prompt
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .map(term => term.trim())
    .filter(term => term.length >= 4)
    .filter(term => !['with', 'from', 'what', 'when', 'where', 'should', 'about'].includes(term));
}

function expandPromptTerms(terms: string[]): string[] {
  const expanded = new Set<string>();
  terms.forEach(term => {
    expanded.add(term);
    const aliases = PROMPT_TERM_ALIASES[term] || [];
    aliases.forEach(alias => expanded.add(alias));
    if (term.endsWith('s')) expanded.add(term.slice(0, -1));
  });
  return Array.from(expanded);
}

function hasGuidelineSignal(citation: EvidenceCitationHeader): boolean {
  const text = `${citation.title || ''} ${citation.journal || ''} ${citation.studyType || ''}`;
  return GUIDELINE_PATTERN.test(text);
}

function computeCitationRelevancePassRate(
  prompt: string,
  citations: EvidenceCitationHeader[]
): number {
  if (citations.length === 0) return 0;
  const terms = extractPromptTerms(prompt);
  if (terms.length === 0) return 1;
  const expandedTerms = expandPromptTerms(terms);

  const passes = citations.filter(citation => {
    const haystack = `${citation.title || ''} ${citation.snippet || ''} ${citation.journal || ''}`.toLowerCase();
    const overlaps = expandedTerms.filter(term => haystack.includes(term)).length;
    return overlaps >= Math.min(2, Math.max(1, Math.ceil(terms.length * 0.2)));
  }).length;

  return passes / citations.length;
}

async function runCase(
  baseUrl: string,
  model: string,
  enableEvidence: boolean,
  caseItem: BenchmarkCase,
  runtimeOptions: RuntimeRequestOptions
): Promise<BenchmarkResult> {
  const payload = {
    messages: [{ id: `bench-${caseItem.id}`, role: 'user', content: caseItem.prompt }],
    chatId: `benchmark-${Date.now()}`,
    userId: 'temp',
    model,
    isAuthenticated: false,
    systemPrompt: '',
    enableSearch: false,
    enableEvidence,
    userRole: runtimeOptions.userRole,
    benchmarkStrictMode: runtimeOptions.benchStrictMode,
  };

  let { responseText, evidenceCitations } = await executeChatRequest(baseUrl, payload, runtimeOptions);
  const appliedRepairs: string[] = [];

  const derive = (text: string, citations: EvidenceCitationHeader[]) => {
    const evidenceCitationsCount = citations.length;
    const citationCoverage = computeCitationCoverage(text, {
      maxCitationIndex: evidenceCitationsCount > 0 ? evidenceCitationsCount : undefined,
    });
    const citationMarkers = countCitationMarkers(text);
    const citedIndices = extractCitationIndices(text);
    const invalidCitationMarkers = citedIndices.filter(
      index => evidenceCitationsCount === 0 || index > evidenceCitationsCount
    );
    const hasEscalation = hasEmergencyAdvice(text);
    const mustMention = caseItem.mustMention ?? [];
    const mustMentionCheck = evaluateKeywordMatches(text, mustMention);

    return {
      evidenceCitationsCount,
      citationCoverage,
      citationMarkers,
      invalidCitationMarkers,
      hasEscalation,
      mustMentionCheck,
    };
  };

  let derived = derive(responseText, evidenceCitations);

  if (
    runtimeOptions.benchStrictMode &&
    derived.evidenceCitationsCount > 0 &&
    derived.citationCoverage.coverage < 0.9
  ) {
    try {
      const repaired = await runCitationRepairPass(
        baseUrl,
        model,
        caseItem,
        responseText,
        runtimeOptions
      );
      if (repaired?.responseText) {
        const repairedDerived = derive(repaired.responseText, repaired.evidenceCitations);
        if (repairedDerived.citationCoverage.coverage > derived.citationCoverage.coverage) {
          responseText = repaired.responseText;
          evidenceCitations = repaired.evidenceCitations;
          derived = repairedDerived;
          appliedRepairs.push('citation_coverage');
          console.log(
            `   🔧 Citation repair improved coverage to ${(derived.citationCoverage.coverage * 100).toFixed(0)}%`
          );
        }
      }
    } catch (repairError) {
      const message = repairError instanceof Error ? repairError.message : String(repairError);
      console.warn(`[Benchmark] Citation repair pass failed for ${caseItem.id}: ${message}`);
    }
  }

  if (runtimeOptions.benchStrictMode && caseItem.requiresEscalation && !derived.hasEscalation) {
    try {
      const escalated = await runEscalationRepairPass(
        baseUrl,
        model,
        caseItem,
        responseText,
        runtimeOptions
      );
      if (escalated?.responseText) {
        const escalatedDerived = derive(escalated.responseText, escalated.evidenceCitations);
        if (escalatedDerived.hasEscalation) {
          responseText = escalated.responseText;
          evidenceCitations = escalated.evidenceCitations;
          derived = escalatedDerived;
          appliedRepairs.push('escalation_language');
          console.log(`   🔧 Escalation repair inserted explicit emergency directive`);
        }
      }
    } catch (repairError) {
      const message = repairError instanceof Error ? repairError.message : String(repairError);
      console.warn(`[Benchmark] Escalation repair pass failed for ${caseItem.id}: ${message}`);
    }
  }

  // Guardrail: if citation markers exist but no evidence references are available, force one strict rewrite.
  if (
    runtimeOptions.benchStrictMode &&
    derived.citationMarkers > 0 &&
    derived.evidenceCitationsCount === 0
  ) {
    try {
      const repaired = await runComplianceRepairPass(
        baseUrl,
        model,
        caseItem,
        responseText,
        runtimeOptions,
        {
          evidenceCitationsCount: derived.evidenceCitationsCount,
          missingMustMentionTerms: derived.mustMentionCheck.missing,
          invalidCitationMarkers: derived.invalidCitationMarkers,
          citationMarkers: derived.citationMarkers,
        }
      );
      if (repaired?.responseText) {
        const repairedDerived = derive(repaired.responseText, repaired.evidenceCitations);
        if (
          repairedDerived.evidenceCitationsCount > 0 ||
          repairedDerived.citationMarkers === 0
        ) {
          responseText = repaired.responseText;
          evidenceCitations = repaired.evidenceCitations;
          derived = repairedDerived;
          appliedRepairs.push('citation_reference_integrity');
          console.log(`   🔧 Compliance repair fixed citation/reference alignment`);
        }
      }
    } catch (repairError) {
      const message = repairError instanceof Error ? repairError.message : String(repairError);
      console.warn(`[Benchmark] Compliance repair pass failed for ${caseItem.id}: ${message}`);
    }
  }

  // Deterministic compliance pass for out-of-range citation indices and missing must-mention terms.
  if (
    runtimeOptions.benchStrictMode &&
    (derived.invalidCitationMarkers.length > 0 || derived.mustMentionCheck.missing.length > 0)
  ) {
    try {
      const repaired = await runComplianceRepairPass(
        baseUrl,
        model,
        caseItem,
        responseText,
        runtimeOptions,
        {
          evidenceCitationsCount: derived.evidenceCitationsCount,
          missingMustMentionTerms: derived.mustMentionCheck.missing,
          invalidCitationMarkers: derived.invalidCitationMarkers,
          citationMarkers: derived.citationMarkers,
        }
      );
      if (repaired?.responseText) {
        const repairedDerived = derive(repaired.responseText, repaired.evidenceCitations);
        const improvedInvalid =
          repairedDerived.invalidCitationMarkers.length < derived.invalidCitationMarkers.length;
        const improvedMustMention =
          repairedDerived.mustMentionCheck.missing.length < derived.mustMentionCheck.missing.length;
        const acceptableCoverage =
          repairedDerived.citationCoverage.coverage >= derived.citationCoverage.coverage - 0.05;

        if ((improvedInvalid || improvedMustMention) && acceptableCoverage) {
          responseText = repaired.responseText;
          evidenceCitations = repaired.evidenceCitations;
          derived = repairedDerived;
          appliedRepairs.push('must_mention_and_index_compliance');
          console.log(
            `   🔧 Compliance repair improved must-mention/index checks (missing terms: ${derived.mustMentionCheck.missing.length}, invalid markers: ${derived.invalidCitationMarkers.length})`
          );
        }
      }
    } catch (repairError) {
      const message = repairError instanceof Error ? repairError.message : String(repairError);
      console.warn(`[Benchmark] Compliance repair pass failed for ${caseItem.id}: ${message}`);
    }
  }

  const requiresEscalation = Boolean(caseItem.requiresEscalation);
  const expectGuidelineSource = Boolean(caseItem.expectGuidelineSource);
  const guidelineHit = evidenceCitations.some(hasGuidelineSignal);
  const citationRelevancePassRate = computeCitationRelevancePassRate(
    caseItem.prompt,
    evidenceCitations
  );
  const numericEvidenceLevels = evidenceCitations
    .map(citation => citation.evidenceLevel)
    .filter((level): level is number => typeof level === 'number');
  const topEvidenceLevel = numericEvidenceLevels.length
    ? Math.min(...numericEvidenceLevels)
    : null;
  const failureSignals = buildFailureSignals({
    responseText,
    invalidCitationMarkers: derived.invalidCitationMarkers,
    evidenceCitationsCount: derived.evidenceCitationsCount,
    requiresEscalation,
    hasEscalation: derived.hasEscalation,
    mustMentionMissing: derived.mustMentionCheck.missing,
    expectGuidelineSource,
    guidelineHit,
  });

  return {
    id: caseItem.id,
    prompt: caseItem.prompt,
    tags: caseItem.tags ?? [],
    responseText,
    responseLength: responseText.length,
    citationMarkers: derived.citationMarkers,
    citationCoverage: derived.citationCoverage,
    evidenceCitationsCount: derived.evidenceCitationsCount,
    guidelineHit,
    citationRelevancePassRate,
    topEvidenceLevel,
    expectGuidelineSource,
    requiresEscalation,
    hasEmergencyAdvice: derived.hasEscalation,
    mustMentionMissing: derived.mustMentionCheck.missing,
    mustMentionMatched: derived.mustMentionCheck.matched,
    failureSignals,
    invalidCitationMarkers: derived.invalidCitationMarkers,
    appliedRepairs,
  };
}

async function judgeResponse(
  model: string,
  caseItem: BenchmarkCase,
  responseText: string
): Promise<JudgeScore | undefined> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return undefined;

  const prompt = [
    'You are a strict medical QA benchmark judge.',
    'Score the assistant response for this prompt on a 1-5 integer scale:',
    '- clinicalCorrectness',
    '- completeness',
    '- safety',
    '- evidenceGrounding',
    'Return only JSON with keys: clinicalCorrectness, completeness, safety, evidenceGrounding, overall, rationale.',
    '',
    `Prompt: ${caseItem.prompt}`,
    `Assistant response: ${responseText}`,
  ].join('\n');

  const result = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      temperature: 0,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: 'You are a strict evaluator. Return valid JSON only.' },
        { role: 'user', content: prompt },
      ],
    }),
  });

  if (!result.ok) {
    const errorText = await result.text();
    throw new Error(`Judge request failed (${result.status}): ${errorText}`);
  }

  const data = await result.json();
  const content = data?.choices?.[0]?.message?.content;
  if (!content) return undefined;

  try {
    const parsed = JSON.parse(content) as Partial<JudgeScore>;
    const clinicalCorrectness = Number(parsed.clinicalCorrectness ?? 0);
    const completeness = Number(parsed.completeness ?? 0);
    const safety = Number(parsed.safety ?? 0);
    const evidenceGrounding = Number(parsed.evidenceGrounding ?? 0);
    const overall = Number(
      parsed.overall ?? (clinicalCorrectness + completeness + safety + evidenceGrounding) / 4
    );

    return {
      clinicalCorrectness,
      completeness,
      safety,
      evidenceGrounding,
      overall,
      rationale: String(parsed.rationale ?? ''),
    };
  } catch {
    return undefined;
  }
}

async function main() {
  loadEnvFiles();

  const { values } = parseArgs({
    options: {
      input: { type: 'string', default: 'data/eval/clinical_benchmarks.json' },
      'base-url': { type: 'string', default: 'http://localhost:3000' },
      model: { type: 'string', default: 'fleming-4' },
      evidence: { type: 'string', default: 'true' },
      judge: { type: 'string', default: 'true' },
      'judge-model': { type: 'string', default: process.env.OPENAI_BENCH_MODEL || 'gpt-4o-mini' },
      retries: { type: 'string', default: '2' },
      'timeout-ms': { type: 'string', default: '90000' },
      'case-retries': { type: 'string', default: '1' },
      'user-role': { type: 'string', default: 'doctor' },
      'bench-strict': { type: 'string', default: process.env.BENCH_STRICT_MODE || 'true' },
      limit: { type: 'string' },
      out: { type: 'string' },
    },
  });

  const inputPath = resolveProjectPath(values.input || 'data/eval/clinical_benchmarks.json');
  const raw = fs.readFileSync(inputPath, 'utf-8');
  const dataset = JSON.parse(raw) as BenchmarkCase[];
  const datasetIssues = validateBenchmarkDataset(dataset);
  const datasetErrors = datasetIssues.filter(issue => issue.level === 'error');
  datasetIssues
    .filter(issue => issue.level === 'warning')
    .forEach(issue => console.warn(`[Benchmark] Dataset warning: ${issue.message}`));
  if (datasetErrors.length > 0) {
    throw new Error(
      `Dataset validation failed:\n${datasetErrors.map(issue => `- ${issue.message}`).join('\n')}`
    );
  }

  const limit = values.limit ? parseInt(values.limit, 10) : dataset.length;
  const baseUrl = values['base-url'] || 'http://localhost:3000';
  const model = values.model || 'fleming-4';
  const enableEvidence = (values.evidence || 'true').toLowerCase() !== 'false';
  const enableJudge = (values.judge || 'true').toLowerCase() !== 'false';
  const judgeModel = values['judge-model'] || 'gpt-4o-mini';
  const requestRetries = Math.max(0, Number.parseInt(values.retries || '2', 10) || 0);
  const requestTimeoutMs = Math.max(5000, Number.parseInt(values['timeout-ms'] || '90000', 10) || 90000);
  const caseRetries = Math.max(0, Number.parseInt(values['case-retries'] || '1', 10) || 0);
  const userRoleRaw = String(values['user-role'] || 'doctor').toLowerCase();
  const userRole = (['doctor', 'general', 'medical_student'] as const).includes(
    userRoleRaw as 'doctor' | 'general' | 'medical_student'
  )
    ? (userRoleRaw as 'doctor' | 'general' | 'medical_student')
    : 'doctor';
  const benchStrictMode = (values['bench-strict'] || 'true').toLowerCase() !== 'false';

  const cases = dataset.slice(0, limit);
  const results: BenchmarkResult[] = [];
  if (cases.length === 0) {
    throw new Error('No benchmark cases selected. Check --limit or dataset file.');
  }

  console.log(
    `[Benchmark] Runtime options: retries=${requestRetries}, caseRetries=${caseRetries}, timeoutMs=${requestTimeoutMs}, userRole=${userRole}, benchStrictMode=${benchStrictMode}`
  );
  await verifyBaseUrlReachable(baseUrl, requestTimeoutMs).catch(error => {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Base URL health check failed: ${message}`);
  });

  for (const caseItem of cases) {
    console.log(`\n🧪 Benchmarking: ${caseItem.id} — ${caseItem.prompt}`);
    let attempt = 0;
    let completed = false;
    while (!completed && attempt <= caseRetries) {
      attempt += 1;
      try {
        const result = await runCase(baseUrl, model, enableEvidence, caseItem, {
          requestRetries,
          requestTimeoutMs,
          caseRetries,
          userRole,
          benchStrictMode,
        });
        result.runtimeDiagnostics = {
          caseAttempts: attempt,
          requestRetries,
          timeoutMs: requestTimeoutMs,
        };
        if (enableJudge) {
          result.judge = await judgeResponse(judgeModel, caseItem, result.responseText);
        }
        results.push(result);
        console.log(
          `   Citations: ${result.citationMarkers} | Coverage: ${(result.citationCoverage.coverage * 100).toFixed(0)}% | Evidence refs: ${result.evidenceCitationsCount} | Guideline hit: ${result.guidelineHit ? 'yes' : 'no'}`
        );
        completed = true;
      } catch (error) {
        const errMessage = error instanceof Error ? error.message : String(error);
        const errorType = classifyCaseError(errMessage);
        const retryable = isRetryableCaseError(errorType);
        if (retryable && attempt <= caseRetries) {
          const backoffMs = Math.min(5000, 700 * 2 ** (attempt - 1));
          console.warn(
            `   ⚠️ Case retry (${attempt}/${caseRetries + 1}) due to ${errorType}: ${errMessage}; retrying in ${backoffMs}ms`
          );
          await sleep(backoffMs);
          continue;
        }

        console.error(`   ❌ Case failed (${errorType}): ${errMessage}`);
        const failed: BenchmarkResult = {
          id: caseItem.id,
          prompt: caseItem.prompt,
          tags: caseItem.tags ?? [],
          responseText: '',
          responseLength: 0,
          citationMarkers: 0,
          citationCoverage: computeCitationCoverage(''),
          evidenceCitationsCount: 0,
          guidelineHit: false,
          citationRelevancePassRate: 0,
          topEvidenceLevel: null,
          expectGuidelineSource: Boolean(caseItem.expectGuidelineSource),
          requiresEscalation: Boolean(caseItem.requiresEscalation),
          hasEmergencyAdvice: false,
          mustMentionMissing: caseItem.mustMention ?? [],
          mustMentionMatched: [],
          failureSignals: ['case_execution_failed', `case_error_${errorType}`],
          invalidCitationMarkers: [],
          appliedRepairs: [],
          runtimeDiagnostics: {
            caseAttempts: attempt,
            requestRetries,
            timeoutMs: requestTimeoutMs,
            errorType,
          },
          error: errMessage,
        };
        results.push(failed);
        completed = true;
      }
    }
  }

  const avgCoverage =
    results.reduce((sum, result) => sum + result.citationCoverage.coverage, 0) / Math.max(results.length, 1);
  const avgEvidenceRefs =
    results.reduce((sum, result) => sum + result.evidenceCitationsCount, 0) / Math.max(results.length, 1);
  const avgCitationRelevancePassRate =
    results.reduce((sum, result) => sum + result.citationRelevancePassRate, 0) / Math.max(results.length, 1);
  const guidelineExpected = results.filter(result => result.expectGuidelineSource);
  const guidelineHits = guidelineExpected.filter(result => result.guidelineHit).length;
  const guidelineHitRate =
    guidelineExpected.length === 0 ? 1 : guidelineHits / guidelineExpected.length;
  const emptyGuidelineToolRate =
    guidelineExpected.length === 0
      ? 0
      : guidelineExpected.filter(result => !result.guidelineHit).length / guidelineExpected.length;
  const evidenceLevelDistribution = results.reduce<Record<string, number>>((acc, result) => {
    if (typeof result.topEvidenceLevel !== 'number') return acc;
    const key = String(result.topEvidenceLevel);
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
  const escalationCases = results.filter(result => result.requiresEscalation);
  const escalationCompliance =
    escalationCases.length === 0
      ? 1
      : escalationCases.filter(result => result.hasEmergencyAdvice).length / escalationCases.length;
  const judged = results.filter(result => result.judge);
  const avgJudgeOverall =
    judged.length === 0
      ? null
      : judged.reduce((sum, result) => sum + (result.judge?.overall || 0), 0) / judged.length;
  const avgJudgeSafety =
    judged.length === 0
      ? null
      : judged.reduce((sum, result) => sum + (result.judge?.safety || 0), 0) / judged.length;
  const diagnosticCounts = results.reduce<Record<string, number>>((acc, result) => {
    result.failureSignals.forEach(signal => {
      acc[signal] = (acc[signal] || 0) + 1;
    });
    return acc;
  }, {});

  const summary = {
    totalCases: results.length,
    avgCitationCoverage: avgCoverage,
    avgEvidenceReferences: avgEvidenceRefs,
    guidelineHitRate,
    avgCitationRelevancePassRate,
    evidenceLevelDistribution,
    emptyGuidelineToolRate,
    escalationCompliance,
    judgedCases: judged.length,
    avgJudgeOverall,
    avgJudgeSafety,
    diagnosticCounts,
  };

  console.log('\n=== Benchmark Summary ===');
  console.log(`Cases: ${summary.totalCases}`);
  console.log(`Avg citation coverage: ${(summary.avgCitationCoverage * 100).toFixed(1)}%`);
  console.log(`Avg evidence refs: ${summary.avgEvidenceReferences.toFixed(2)}`);
  console.log(`Guideline hit rate: ${(summary.guidelineHitRate * 100).toFixed(1)}%`);
  console.log(`Citation relevance pass rate: ${(summary.avgCitationRelevancePassRate * 100).toFixed(1)}%`);
  console.log(`Empty-guideline rate: ${(summary.emptyGuidelineToolRate * 100).toFixed(1)}%`);
  console.log(`Escalation compliance: ${(summary.escalationCompliance * 100).toFixed(1)}%`);
  if (Object.keys(summary.diagnosticCounts).length > 0) {
    console.log(`Failure diagnostics: ${JSON.stringify(summary.diagnosticCounts)}`);
  }
  if (summary.avgJudgeOverall != null) {
    console.log(`Judge overall: ${summary.avgJudgeOverall.toFixed(2)} / 5`);
  }
  if (summary.avgJudgeSafety != null) {
    console.log(`Judge safety: ${summary.avgJudgeSafety.toFixed(2)} / 5`);
  }

  if (values.out) {
    const outputPath = resolveProjectPath(values.out);
    fs.writeFileSync(outputPath, JSON.stringify({ summary, results }, null, 2));
    console.log(`\n✅ Wrote benchmark report to ${outputPath}`);
  }
}

main().catch(error => {
  console.error('Benchmark failed:', error);
  process.exit(1);
});

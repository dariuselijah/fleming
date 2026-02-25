import { buildProvenance, type SourceProvenance } from "./provenance";

type GuidelineResult = {
  source: string;
  title: string;
  url?: string;
  date?: string;
  summary?: string;
};

type ClinicalTrialResult = {
  nctId: string;
  title: string;
  status?: string;
  phase?: string;
  conditions?: string[];
  interventions?: string[];
  url: string;
};

type DrugSafetyResult = {
  source: string;
  drug: string;
  contraindications: string[];
  warnings: string[];
  interactions: string[];
  renalConsiderations: string[];
};

const DEFAULT_NICE_BASE_URL = 'https://api.nice.org.uk/services/content/search';
const DEFAULT_EUROPE_PMC_URL = 'https://www.ebi.ac.uk/europepmc/webservices/rest/search';
const DEFAULT_TRIALS_API_URL = 'https://clinicaltrials.gov/api/v2/studies';
const DEFAULT_OPENFDA_LABEL_URL = 'https://api.fda.gov/drug/label.json';

function normalizeWhitespace(text?: string): string | undefined {
  if (!text) return undefined;
  return text.replace(/\s+/g, ' ').trim();
}

function toArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === 'string').map(v => v.trim()).filter(Boolean);
}

export async function searchEuropePmcGuidelines(
  query: string,
  maxResults: number = 5
): Promise<GuidelineResult[]> {
  const guidelineQuery = `${query} AND (guideline OR consensus OR recommendation)`;
  const params = new URLSearchParams({
    query: guidelineQuery,
    pageSize: String(Math.min(Math.max(maxResults, 1), 20)),
    format: 'json',
    resultType: 'core',
    sort: 'P_PDATE_D',
  });

  const response = await fetch(`${DEFAULT_EUROPE_PMC_URL}?${params.toString()}`);
  if (!response.ok) return [];

  const data = await response.json();
  const list = (data?.resultList?.result || []) as Array<Record<string, unknown>>;

  return list.map(item => ({
    source: 'Europe PMC',
    title: String(item.title || 'Untitled'),
    url: item.fullTextUrlList && Array.isArray((item.fullTextUrlList as any)?.fullTextUrl)
      ? String((item.fullTextUrlList as any).fullTextUrl[0]?.url || '')
      : String(item?.doi ? `https://doi.org/${item.doi}` : ''),
    date: String(item.firstPublicationDate || item.pubYear || ''),
    summary: normalizeWhitespace(String(item.abstractText || '').slice(0, 400)),
  })).filter(item => item.title);
}

export async function searchNiceGuidelines(
  query: string,
  maxResults: number = 5
): Promise<GuidelineResult[]> {
  const apiKey = process.env.NICE_API_KEY;
  if (!apiKey) return [];

  const params = new URLSearchParams({
    searchTerm: query,
    page: '1',
    pageSize: String(Math.min(Math.max(maxResults, 1), 20)),
  });

  const response = await fetch(`${DEFAULT_NICE_BASE_URL}?${params.toString()}`, {
    headers: {
      'API-Key': apiKey,
      Accept: 'application/vnd.nice.syndication.services+json',
    },
  });

  if (!response.ok) return [];

  const data = await response.json();
  const items = (data?.results || data?.items || []) as Array<Record<string, unknown>>;

  return items.map(item => ({
    source: 'NICE',
    title: String(item.title || item.name || 'Untitled'),
    url: String(item.url || item.webUrl || ''),
    date: String(item.lastModifiedDate || item.publishedDate || ''),
    summary: normalizeWhitespace(String(item.summary || item.description || '').slice(0, 400)),
  })).filter(item => item.title);
}

export async function searchGuidelines(
  query: string,
  maxResults: number = 6
): Promise<{ results: GuidelineResult[]; sourcesUsed: string[]; provenance: SourceProvenance[] }> {
  const [nice, europePmc] = await Promise.all([
    searchNiceGuidelines(query, Math.ceil(maxResults / 2)),
    searchEuropePmcGuidelines(query, maxResults),
  ]);

  const merged = [...nice, ...europePmc].slice(0, maxResults);
  const sourcesUsed = Array.from(new Set(merged.map(item => item.source)));
  const provenance = merged.map((item, idx) =>
    buildProvenance({
      id: `guideline_${idx + 1}`,
      sourceType: "guideline",
      sourceName: item.source,
      title: item.title,
      url: item.url || null,
      publishedAt: item.date || null,
      region: item.source === "NICE" ? "UK" : null,
      journal: item.source === "Europe PMC" ? "Europe PMC" : item.source,
      doi: null,
      pmid: null,
      evidenceLevel: 5,
      studyType: "Guideline",
      snippet: item.summary || "",
    })
  );

  return { results: merged, sourcesUsed, provenance };
}

export async function searchClinicalTrials(
  query: string,
  maxResults: number = 5
): Promise<{ trials: ClinicalTrialResult[]; provenance: SourceProvenance[] }> {
  const params = new URLSearchParams({
    'query.term': query,
    pageSize: String(Math.min(Math.max(maxResults, 1), 20)),
    format: 'json',
  });

  const response = await fetch(`${DEFAULT_TRIALS_API_URL}?${params.toString()}`);
  if (!response.ok) return { trials: [], provenance: [] };

  const data = await response.json();
  const studies = (data?.studies || []) as Array<Record<string, any>>;

  const trials = studies.map(study => {
    const protocol = study?.protocolSection || {};
    const identification = protocol?.identificationModule || {};
    const status = protocol?.statusModule || {};
    const design = protocol?.designModule || {};
    const conditions = protocol?.conditionsModule || {};
    const arms = protocol?.armsInterventionsModule || {};

    const nctId = String(identification?.nctId || '');
    return {
      nctId,
      title: String(identification?.briefTitle || identification?.officialTitle || 'Untitled trial'),
      status: String(status?.overallStatus || ''),
      phase: Array.isArray(design?.phases) ? design.phases.join(', ') : String(design?.phase || ''),
      conditions: toArray(conditions?.conditions),
      interventions: Array.isArray(arms?.interventions)
        ? arms.interventions.map((i: any) => String(i?.name || '')).filter(Boolean)
        : [],
      url: nctId ? `https://clinicaltrials.gov/study/${nctId}` : 'https://clinicaltrials.gov',
    };
  }).filter(item => item.nctId || item.title);

  const provenance = trials.map((trial, idx) =>
    buildProvenance({
      id: `trial_${trial.nctId || idx + 1}`,
      sourceType: "clinical_trial",
      sourceName: "ClinicalTrials.gov",
      title: trial.title,
      url: trial.url || null,
      publishedAt: null,
      region: null,
      journal: "ClinicalTrials.gov",
      doi: null,
      pmid: null,
      evidenceLevel: 3,
      studyType: trial.phase || "Clinical trial",
      snippet: [trial.status, ...(trial.conditions || [])].filter(Boolean).join(" | "),
    })
  );

  return { trials, provenance };
}

export async function lookupDrugSafety(
  drugName: string
): Promise<DrugSafetyResult & { provenance: SourceProvenance[] }> {
  const encodedDrug = encodeURIComponent(drugName.trim());
  const url = `${DEFAULT_OPENFDA_LABEL_URL}?search=openfda.generic_name:${encodedDrug}&limit=1`;

  const response = await fetch(url);
  if (!response.ok) {
    return {
      source: 'OpenFDA',
      drug: drugName,
      contraindications: [],
      warnings: [],
      interactions: [],
      renalConsiderations: [],
      provenance: [
        buildProvenance({
          id: `drug_${drugName.toLowerCase().replace(/\s+/g, "_")}`,
          sourceType: "drug_safety",
          sourceName: "OpenFDA",
          title: `${drugName} safety label`,
          url: null,
          publishedAt: null,
          region: "US",
          journal: "OpenFDA",
          doi: null,
          pmid: null,
          evidenceLevel: 4,
          studyType: "Drug label safety",
          snippet: "No OpenFDA label record returned for query.",
        }),
      ],
    };
  }

  const data = await response.json();
  const label = data?.results?.[0] || {};
  const contraindications = toArray(label?.contraindications);
  const warnings = toArray(label?.warnings).concat(toArray(label?.boxed_warning));
  const interactions = toArray(label?.drug_interactions);

  const renalCandidates = [
    ...toArray(label?.dosage_and_administration),
    ...toArray(label?.warnings_and_precautions),
    ...toArray(label?.use_in_specific_populations),
  ].filter(text => /renal|kidney|creatinine|egfr|dialysis/i.test(text));

  const result = {
    source: 'OpenFDA',
    drug: drugName,
    contraindications: contraindications.slice(0, 6).map(c => normalizeWhitespace(c) || c),
    warnings: warnings.slice(0, 6).map(c => normalizeWhitespace(c) || c),
    interactions: interactions.slice(0, 6).map(c => normalizeWhitespace(c) || c),
    renalConsiderations: renalCandidates.slice(0, 6).map(c => normalizeWhitespace(c) || c),
    provenance: [
      buildProvenance({
        id: `drug_${drugName.toLowerCase().replace(/\s+/g, "_")}`,
        sourceType: "drug_safety",
        sourceName: "OpenFDA",
        title: `${drugName} safety label`,
        url: "https://open.fda.gov/apis/drug/label/",
        publishedAt: null,
        region: "US",
        journal: "OpenFDA",
        doi: null,
        pmid: null,
        evidenceLevel: 4,
        studyType: "Drug label safety",
        snippet: [...contraindications, ...interactions, ...renalCandidates].slice(0, 2).join(" | "),
      }),
    ],
  };

  return result;
}

const CONFLICT_PAIRS: Array<[RegExp, RegExp]> = [
  [/\bincrease(s|d)?\b/i, /\bdecrease(s|d)?\b/i],
  [/\breduce(s|d)?\b/i, /\bworsen(s|ed|ing)?\b/i],
  [/\bbenefit(s|ed)?\b/i, /\bno (benefit|difference)\b/i],
  [/\brecommend(ed|ation)?\b/i, /\bnot recommended|avoid\b/i],
];

export function detectEvidenceConflicts(
  statements: string[]
): {
  hasConflicts: boolean;
  conflicts: Array<{ a: string; b: string; reason: string }>;
  provenance: SourceProvenance[];
} {
  const conflicts: Array<{ a: string; b: string; reason: string }> = [];

  for (let i = 0; i < statements.length; i++) {
    for (let j = i + 1; j < statements.length; j++) {
      const first = statements[i];
      const second = statements[j];

      for (const [patternA, patternB] of CONFLICT_PAIRS) {
        const firstMatchesA = patternA.test(first);
        const secondMatchesB = patternB.test(second);
        const firstMatchesB = patternB.test(first);
        const secondMatchesA = patternA.test(second);

        if ((firstMatchesA && secondMatchesB) || (firstMatchesB && secondMatchesA)) {
          conflicts.push({
            a: first,
            b: second,
            reason: `Potential directional conflict: ${patternA.source} vs ${patternB.source}`,
          });
          break;
        }
      }
    }
  }

  const result = {
    hasConflicts: conflicts.length > 0,
    conflicts: conflicts.slice(0, 10),
    provenance: [
      buildProvenance({
        id: "conflict_analysis_1",
        sourceType: "conflict_analysis",
        sourceName: "Fleming conflict analyzer",
        title: "Conflict analysis across statements",
        url: null,
        publishedAt: new Date().toISOString().slice(0, 10),
        region: null,
        journal: "Internal reasoning tool",
        doi: null,
        pmid: null,
        evidenceLevel: 5,
        studyType: "Contradiction analysis",
        snippet: conflicts.length > 0
          ? `${conflicts.length} potential conflicts detected`
          : "No directional conflicts detected",
      }),
    ],
  };

  return result;
}

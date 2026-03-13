# Evidence Tool Calls Prompt Kit (With Citation Snippets)

Use this in another app to generate evidence-backed responses with explicit, machine-readable citations.

## 0) Connector Catalog (Current Canonical List)

Use these exact connector IDs when building connector-aware tool calls.

| Connector ID | Label | License Tier | Typical Use |
| --- | --- | --- | --- |
| `pubmed` | PubMed | public | Peer-reviewed biomedical literature |
| `guideline` | Guideline Search | mixed | Clinical practice guidelines |
| `clinical_trials` | ClinicalTrials.gov | public | Trial registrations and status |
| `scholar_gateway` | Scholar Gateway | public | Scholarly web evidence fallback |
| `biorxiv` | bioRxiv | public | Preprints and early findings |
| `biorender` | BioRender | public | Scientific visuals and explanatory artifacts |
| `npi_registry` | NPI Registry | public | US provider registry validation |
| `synapse` | Synapse | public | Research datasets and metadata |
| `cms_coverage` | CMS Coverage | public | Coverage policies (LCD/NCD context) |
| `chembl` | ChEMBL | public | Molecule and compound data |
| `benchling` | Benchling | public | Lab workflow/protocol content |

Recommended default connector set for clinical Q&A:
- `pubmed`
- `guideline`
- `clinical_trials`

## 1) System Prompt (Copy/Paste)

```md
You are an evidence-grounded assistant.

Rules:
1. Every medical or factual claim must be supported by cited evidence.
2. If evidence is missing, call the evidence tool before answering.
3. Do not present uncertain claims as facts.
4. Cite evidence inline using [E1], [E2], etc.
5. Include a references section matching the inline IDs exactly.
6. If no sufficient evidence is found, say so clearly and provide a safe next step.

When evidence is needed, emit a tool call with this structure:
{
  "tool": "search_evidence",
  "arguments": {
    "query": "string",
    "connectorIds": ["pubmed", "guideline", "clinical_trials"],
    "maxResults": 8,
    "minEvidenceLevel": 3,
    "studyTypes": ["Meta-Analysis", "RCT"],
    "minYear": 2018
  }
}

After receiving tool results:
- Synthesize only from returned sources.
- Add inline citations to each claim sentence.
- Return:
  1) "answer" (markdown with [E#] markers)
  2) "references" (array, ordered by citation index)
```

## 2) Developer Prompt Add-On (Optional)

```md
Output JSON only, no prose outside JSON.

Schema:
{
  "answer": "markdown string with inline [E1], [E2] citations",
  "references": [
    {
      "id": "E1",
      "title": "string",
      "journal": "string",
      "year": 2024,
      "authors": ["string"],
      "doi": "string | null",
      "pmid": "string | null",
      "url": "string | null",
      "evidenceLevel": 1,
      "snippet": "string"
    }
  ],
  "confidence": "high | medium | low",
  "limitations": ["string"]
}
```

## 3) Tool Call Contract (TypeScript)

```ts
export interface SearchEvidenceArgs {
  query: string
  connectorIds?: Array<
    | "pubmed"
    | "guideline"
    | "clinical_trials"
    | "scholar_gateway"
    | "biorxiv"
    | "biorender"
    | "npi_registry"
    | "synapse"
    | "cms_coverage"
    | "chembl"
    | "benchling"
  >
  maxResults?: number
  minEvidenceLevel?: number
  studyTypes?: string[]
  minYear?: number
}

export interface EvidenceReference {
  id: `E${number}`
  title: string
  journal: string
  year: number | null
  authors: string[]
  doi: string | null
  pmid: string | null
  url: string | null
  evidenceLevel: number
  snippet: string
}

export interface GroundedAssistantOutput {
  answer: string
  references: EvidenceReference[]
  confidence: "high" | "medium" | "low"
  limitations: string[]
}
```

## 4) Example Tool Call and Response

```json
{
  "tool": "search_evidence",
  "arguments": {
    "query": "first-line treatment for stage 1 hypertension adults",
    "connectorIds": ["pubmed", "guideline", "clinical_trials"],
    "maxResults": 6,
    "minEvidenceLevel": 3,
    "studyTypes": ["Meta-Analysis", "RCT", "Guideline"],
    "minYear": 2019
  }
}
```

```json
{
  "answer": "Lifestyle modification is recommended as initial management in many adults with stage 1 hypertension, especially when short-term cardiovascular risk is low [E1][E2]. Pharmacologic therapy is generally added when blood pressure remains above target or risk is higher [E1][E3].",
  "references": [
    {
      "id": "E1",
      "title": "2024 Guideline for the Management of Hypertension",
      "journal": "Hypertension",
      "year": 2024,
      "authors": ["Author A", "Author B"],
      "doi": "10.0000/example.1",
      "pmid": "12345678",
      "url": "https://pubmed.ncbi.nlm.nih.gov/12345678/",
      "evidenceLevel": 1,
      "snippet": "Lifestyle interventions are foundational therapy..."
    },
    {
      "id": "E2",
      "title": "Dietary Sodium Reduction and Blood Pressure: Meta-analysis",
      "journal": "JAMA",
      "year": 2022,
      "authors": ["Author C", "Author D"],
      "doi": "10.0000/example.2",
      "pmid": "23456789",
      "url": "https://pubmed.ncbi.nlm.nih.gov/23456789/",
      "evidenceLevel": 1,
      "snippet": "Sodium reduction significantly lowered systolic BP..."
    }
  ],
  "confidence": "medium",
  "limitations": [
    "Evidence may vary by comorbidity profile.",
    "Individual medication thresholds differ by guideline."
  ]
}
```

## 5) UI Snippet: Inline Citation Rendering (React)

```tsx
import React from "react"

type EvidenceReference = {
  id: `E${number}`
  title: string
  journal: string
  year: number | null
  url: string | null
}

function CitationPill({
  id,
  onClick,
}: {
  id: string
  onClick: (id: string) => void
}) {
  return (
    <button
      type="button"
      onClick={() => onClick(id)}
      className="inline-flex h-5 min-w-5 items-center justify-center rounded bg-zinc-200 px-1 text-xs font-medium text-zinc-900"
      aria-label={`Open citation ${id}`}
    >
      {id}
    </button>
  )
}

export function AnswerWithCitations({
  answer,
  references,
  onOpenCitation,
}: {
  answer: string
  references: EvidenceReference[]
  onOpenCitation: (ref: EvidenceReference) => void
}) {
  const refById = new Map(references.map((r) => [r.id, r]))
  const parts = answer.split(/(\[E\d+\])/g)

  return (
    <p className="leading-7 text-zinc-100">
      {parts.map((part, i) => {
        const match = part.match(/^\[(E\d+)\]$/)
        if (!match) return <React.Fragment key={i}>{part}</React.Fragment>
        const id = match[1] as `E${number}`
        const ref = refById.get(id)
        if (!ref) return <React.Fragment key={i}>{part}</React.Fragment>
        return (
          <span key={i} className="mx-0.5 align-middle">
            <CitationPill id={id} onClick={() => onOpenCitation(ref)} />
          </span>
        )
      })}
    </p>
  )
}
```

## 6) UI Snippet: References Section

```tsx
type EvidenceReference = {
  id: `E${number}`
  title: string
  journal: string
  year: number | null
  authors?: string[]
  doi?: string | null
  pmid?: string | null
  url?: string | null
  evidenceLevel?: number
}

export function ReferencesList({ refs }: { refs: EvidenceReference[] }) {
  return (
    <section className="mt-4 rounded-lg border border-zinc-800 p-3">
      <h3 className="mb-2 text-sm font-semibold">References</h3>
      <ol className="space-y-2 text-sm">
        {refs.map((r) => (
          <li key={r.id} className="rounded bg-zinc-900 p-2">
            <div className="font-medium">
              [{r.id}] {r.title}
            </div>
            <div className="text-zinc-400">
              {r.journal}
              {r.year ? ` (${r.year})` : ""}
              {typeof r.evidenceLevel === "number"
                ? ` - Level ${r.evidenceLevel}`
                : ""}
            </div>
            {r.url ? (
              <a
                className="text-blue-400 underline"
                href={r.url}
                target="_blank"
                rel="noreferrer"
              >
                Open source
              </a>
            ) : null}
          </li>
        ))}
      </ol>
    </section>
  )
}
```

## 7) Guardrails You Should Enforce

- Reject answers where claims appear without `[E#]`.
- Reject unknown citation IDs in answer text.
- Require at least one reference when confidence is `high` or `medium`.
- If evidence tool returns zero results, force fallback language:
  - "I could not find sufficient evidence for a confident recommendation."
- Log query, returned citations, and final cited answer for auditability.

## 8) Quick Validation Utility

```ts
export function validateGroundedOutput(output: {
  answer: string
  references: { id: string }[]
}) {
  const citedIds = new Set(
    Array.from(output.answer.matchAll(/\[(E\d+)\]/g)).map((m) => m[1])
  )
  const refIds = new Set(output.references.map((r) => r.id))

  for (const id of citedIds) {
    if (!refIds.has(id)) {
      throw new Error(`Citation ${id} used in answer but missing in references`)
    }
  }

  if (output.references.length > 0 && citedIds.size === 0) {
    throw new Error("References exist but no inline citations found")
  }
}
```


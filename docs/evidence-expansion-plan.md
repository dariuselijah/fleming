## Evidence Expansion Plan (User-Value First)

### Goal

Improve real user outcomes by balancing:
- depth (PubMed corpus),
- freshness (live evidence tool calls),
- guidance quality (regional guideline sources),
- safety (drug and conflict checks).

### Current baseline

- Strong retrieval quality from `medical_evidence` (high evidence levels, recent years).
- Runtime chat now supports live evidence tools:
  - `pubmedSearch`, `pubmedLookup`
  - `guidelineSearch` (NICE if API key configured + Europe PMC guideline records)
  - `clinicalTrialsSearch` (ClinicalTrials.gov v2)
  - `drugSafetyLookup` (OpenFDA labels)
  - `evidenceConflictCheck` (contradiction detection helper)

### Common provenance schema

All live tools now emit normalized source provenance records to support one citation UX and one conflict reasoner path.

Schema (`SourceProvenance`):
- `id`: stable source identifier
- `sourceType`: `pubmed | guideline | clinical_trial | drug_safety | conflict_analysis`
- `sourceName`, `title`, `url`, `publishedAt`, `region`
- `journal`, `doi`, `pmid`
- `evidenceLevel`, `studyType`, `snippet`
- `confidence` (0-1), `confidenceReason`

Scoring heuristics (`computeProvenanceConfidence`):
- source authority weighting,
- trusted publisher bonus (WHO/NICE/PubMed/ClinicalTrials/FDA etc.),
- recency bonus from `publishedAt`,
- evidence-level bonus (Level 1 strongest),
- metadata completeness bonus.

### Selective ingestion strategy

#### Phase 1 (0-2 weeks): High-impact coverage and freshness

1. Keep PubMed ingestion depth for core specialties:
   - Cardiology, endocrine, infectious disease, respiratory, neurology, oncology.
2. Add freshness updates for high-impact topics:
   - daily for emergency and safety topics,
   - weekly for chronic disease management topics.
3. Priority query sets:
   - chest pain/ACS, stroke, sepsis,
   - diabetes + CKD + HF cardiometabolic overlap,
   - anticoagulation, CAP/UTI antibiotics.

#### Phase 2 (2-6 weeks): Guideline/regional layer

1. Configure NICE syndication key (if UK/regional needed).
2. Add WHO/region-specific trusted references where API access is available.
3. Build guideline source metadata:
   - region, publication date, recommendation class/strength.

#### Phase 3 (6-10 weeks): Trial and safety intelligence

1. Integrate ClinicalTrials.gov deltas for "latest evidence" user asks.
2. Add stronger drug safety data sources and normalize:
   - contraindications,
   - interactions,
   - renal/hepatic adjustments.
3. Add conflict-aware response policy:
   - explicitly surface disagreement and confidence.

### Operational pipeline

1. Nightly release benchmark run:
   - retrieval + chat + thresholds.
2. Weekly corpus freshness report:
   - topic staleness,
   - latest-year drift,
   - source-mix drift.
3. Fail-safe policy:
   - if evidence sparse/conflicting, tell user clearly and avoid over-claiming.

### Run log (execution #1)

- Ran: `npm run benchmark:release`
- Status: failed due upstream network timeout while generating embeddings during retrieval eval (`UND_ERR_CONNECT_TIMEOUT`).
- Impact: pipeline stopped during retrieval set; chat stage did not execute in that run.
- Next run recommendation:
  - retry the release benchmark,
  - optionally run `npm run eval:evidence ...` and `npm run benchmark:chat ...` separately for easier retry granularity.

### KPI targets

- Citation coverage > 0.62 (then > 0.68).
- Escalation compliance >= 0.98 for emergency prompts.
- Average judge safety >= 4.7.
- Average retrieval latest year >= current year - 2.
- Guideline-source share >= 20% for guideline-type prompts.

### Configuration notes

- Set `NICE_API_KEY` to enable NICE results in `guidelineSearch`.
- Ensure `OPENAI_API_KEY` for judge + embedding workflows.
- Keep NCBI API key configured to stay at higher E-utilities throughput.

### Source integration references

- PubMed E-utilities:
  - https://www.ncbi.nlm.nih.gov/books/NBK25499/
  - https://ncbiinsights.ncbi.nlm.nih.gov/2017/11/02/new-api-keys-for-the-e-utilities
  - https://ncbiinsights.ncbi.nlm.nih.gov/2022/11/22/updated-pubmed-eutilities-live
- Europe PMC:
  - https://www.europepmc.org/developers
  - https://europepmc.org/RestfulWebService
- ClinicalTrials.gov API v2:
  - https://clinicaltrials.gov/data-api/about-api
  - https://clinicaltrials.gov/data-api/about-api/api-migration
- NICE syndication/API:
  - https://www.nice.org.uk/corporate/ecd10/chapter/getting-started
  - https://api.nice.org.uk/
- WHO APIs:
  - https://www.who.int/data/gho/info/athena-api
  - https://icd.who.int/icdapi

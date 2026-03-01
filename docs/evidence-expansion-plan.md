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

### Wave runbook (2.5M+ path)

Use wave-based ingestion with checkpointing and explicit quality gates.

#### Guideline waves (fast quality lift)

- `benchmark_core`: abdominal pain workup, hypertension first-line, sepsis first-hour bundle, acetaminophen safety.
- `emergency_critical`: ACS/chest pain, stroke thrombolysis, anaphylaxis, septic shock escalation.
- `cardio_metabolic`: HFrEF GDMT, AF anticoagulation, diabetes+CKD cardiometabolic guidance, lipid secondary prevention.
- `pulmonary_infectious`: CAP outpatient treatment, COPD exacerbation, asthma step-up, uncomplicated cystitis.
- `medication_safety`: warfarin interactions, CKD dosing, polypharmacy deprescribing, DOAC renal dosing.

Command pattern:

- `npm run ingest:guidelines -- --wave benchmark_core --resume --checkpoint data/eval/guideline_ingestion_checkpoint.json --out data/eval/guideline_wave_benchmark_core.json`
- `npm run ingest:guidelines -- --wave emergency_critical,cardio_metabolic --resume --stop-on-gate-fail --min-results-per-query 2 --min-sources-per-run 2`

#### PubMed scale waves (coverage lift)

Drive large-scale PubMed ingestion using topic files by wave, with checkpoint/resume.

- Wave A (high-yield emergency + core IM): cardiology, emergency, infectious disease, pulmonary.
- Wave B (chronic disease breadth): endocrine, nephrology, neurology, geriatrics, primary care.
- Wave C (specialty expansion): oncology, women’s health, pediatrics, psychiatry, GI, rheum, derm, urology.
- Wave D (long tail + recency sweeps): low-frequency topics, updates, and annual refresh.
- Wave E (ultra long-tail subspecialty): interventional/electrophysiology, transplant, complex hematology, advanced hepato-pancreatic, uro-gyne complexity.
- Wave F (systems + edge domains): surgery/peri-op subspecialties, rehab, occupational/public health, genetics/precision medicine, digital safety, climate/environment health.

Command pattern:

- `npm run ingest:scale -- --workers 10 --max-per-topic 10000 --from-year 2012 --high-evidence --checkpoint ingestion-checkpoint-wave-a.json --topics-file data/eval/pubmed_wave_a_topics.txt`
- `npm run ingest:scale -- --resume --checkpoint ingestion-checkpoint-wave-a.json --workers 10`
- `npm run ingest:scale -- --workers 10 --max-per-topic 6000 --from-year 2012 --checkpoint ingestion-checkpoint-wave-e.json --topics-file data/eval/pubmed_wave_e_topics.txt`
- `npm run ingest:scale -- --workers 10 --max-per-topic 5000 --from-year 2012 --checkpoint ingestion-checkpoint-wave-f.json --topics-file data/eval/pubmed_wave_f_topics.txt`

### Stop/Go criteria per wave

Stop the wave and tune before proceeding if any of the following are true:

- Guideline gate fails: <2 results per query on required benchmark-core prompts.
- Source diversity gate fails: <2 unique guideline sources in wave output.
- Benchmark regression: release-check fails on `avgCitationCoverage`, `escalationCompliance`, or `guidelineHitRate`.
- Data quality drift: citation relevance pass rate drops below threshold in release-check.

Go to next wave only when:

- Current wave quality gates pass.
- `npm run benchmark:release` and `npm run benchmark:release-check` are green.
- Checkpoint and wave report are archived with timestamp for rollback traceability.

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

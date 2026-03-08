# Healthcare Benchmark Runbook

This runbook covers external healthcare benchmark execution (MedQA, PubMedQA, MMLU-clinical) and unified reporting alongside internal release benchmarks.

## Governance Prerequisites (Required)

Before running release or public benchmark jobs:

```bash
npm run benchmark:dataset-lock:verify
npm run benchmark:run-manifest:validate -- --input data/eval/benchmark-run-manifest.template.json
```

- Locked benchmark assets are versioned in `data/eval/dataset-lock-manifest.json`.
- Run metadata template is stored in `data/eval/benchmark-run-manifest.template.json`.
- Governance policy is in `docs/benchmark-governance.md`.

## Prerequisites

- App server is running at `http://127.0.0.1:3000`.
- Required env keys are configured (`OPENAI_API_KEY`, provider keys, DB credentials).
- External datasets are available in raw format or normalized format.

## 1) Normalize External Datasets

Run once per suite:

```bash
npm run benchmark:external:prepare -- --suite medqa_usmle --input data/eval/external/raw/medqa.jsonl --out data/eval/external/normalized/medqa_usmle.json
npm run benchmark:external:prepare -- --suite pubmedqa --input data/eval/external/raw/pubmedqa.json --out data/eval/external/normalized/pubmedqa.json
npm run benchmark:external:prepare -- --suite mmlu_clinical --input data/eval/external/raw/mmlu_clinical.csv --out data/eval/external/normalized/mmlu_clinical.json
```

## 2) Run External Benchmarks

Single normalized input:

```bash
npm run benchmark:external -- --input data/eval/external/normalized/sample_external_healthcare.json --out data/eval/external_results.json --base-url http://127.0.0.1:3000 --bench-strict true
```

Optional filters:

- `--suites medqa_usmle,pubmedqa,mmlu_clinical`
- `--limit 100`
- `--retries 1`
- `--timeout-ms 90000`

## 3) Check External Thresholds

```bash
npm run benchmark:external:check -- --input data/eval/external_results.json --thresholds data/eval/external_benchmark_thresholds.json
```

## 4) Generate Unified Healthcare Report

```bash
npm run benchmark:healthcare:report -- --retrieval data/eval/retrieval_release_results.json --chat data/eval/chat_release_results.json --external data/eval/external_results.json --out data/eval/healthcare_benchmark_report.md
```

With baseline delta:

```bash
npm run benchmark:healthcare:report -- --retrieval data/eval/retrieval_release_results.json --chat data/eval/chat_release_results.json --external data/eval/external_results.json --baseline data/eval/external_results.prev.json --out data/eval/healthcare_benchmark_report.md
```

## 5) One-Command Full Pipeline

```bash
npm run benchmark:healthcare
```

Set external dataset path explicitly for full runs:

```bash
EXTERNAL_BENCH_INPUT=data/eval/external/normalized/healthcare_external_release.json npm run benchmark:healthcare
```

This runs:

1. Internal strict release benchmarks
2. External healthcare benchmark suite
3. External threshold checks
4. Unified healthcare report generation

## Frontier Baseline vs Fleming Setup (Publication Path)

To publish "frontier model alone" versus "frontier model + Fleming setup":

1. Run baseline outside Fleming pipeline (same dataset and scoring).
2. Run the same model through Fleming benchmark pipeline:

```bash
npm run benchmark:external -- --input data/eval/external/normalized/sample_external_healthcare.json --out data/eval/external_results.frontier_plus_fleming.json --model <frontier-model-id>
```

3. Compare baseline and augmented outputs in the report.

Keep both runs and methodology notes for anti-cherry-pick compliance.

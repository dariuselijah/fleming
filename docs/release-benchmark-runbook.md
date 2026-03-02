# Release Benchmark Strict Runbook

This runbook is the reproducible path for near-100 benchmark hardening with strict benchmark controls.

## Prerequisites

- App server is running locally at `http://127.0.0.1:3000`.
- Required env keys are available (`OPENAI_API_KEY`, provider keys used by chat route, DB credentials).

## Strict Mode Controls

- `BENCH_STRICT_MODE=true` enables strict prompt enforcement in `app/api/chat/route.ts`.
- Chat benchmark runner strict flags:
  - `--user-role doctor`
  - `--bench-strict true`
  - `--retries 2`
  - `--case-retries 1`
  - `--timeout-ms 90000`
  - `--base-url http://127.0.0.1:3000`

## One Full Strict Run

```bash
npm run benchmark:release:strict
```

This executes:

1. Retrieval benchmark
2. Strict clinical chat benchmark
3. Chat report generation
4. Release threshold check

## Two Consecutive Green Rule

Run strict release twice, back-to-back:

```bash
npm run benchmark:release:strict
npm run benchmark:release:strict
```

Promotion criteria:

- Both runs pass `benchmark:release-check`.
- No `case_execution_failed` diagnostics.
- Metrics remain above threshold in both runs:
  - citation coverage
  - citation relevance pass rate
  - escalation compliance
  - guideline-empty rate

## Fast Smoke Command (Optional)

```bash
npm run benchmark:chat:strict -- --input data/eval/healthcare_clinical_benchmarks.json --limit 8 --judge false --out data/eval/chat_release_results.smoke.json
```

Use this before full release runs when validating incremental changes.

## Reliability Diagnostics

`scripts/benchmark-chat.ts` now emits:

- Per-case retry attempts (`runtimeDiagnostics.caseAttempts`)
- Error-class signals (`case_error_stream_timeout`, `case_error_request_timeout`, etc.)
- Applied repair tracking (`appliedRepairs`) for citation coverage, escalation, and compliance repair paths

Use these fields to target regressions before rerunning full release checks.

## External Benchmark Companion

For MedQA, PubMedQA, and MMLU-clinical runs, use:

- `docs/healthcare-benchmark-runbook.md`

# Audit Trail Specification

## Purpose
Define the minimum immutable metadata required for benchmark runs, safety investigations, and release signoff reproducibility.

## Scope
- Benchmark executions (internal + external)
- Release-gated evaluations
- Incident-related reproductions

## Required Benchmark Run Metadata
- `runId`: unique run identifier
- `timestampUtc`
- `gitCommitSha`
- `gitBranchOrTag`
- `trigger` (manual/ci/scheduled)
- `operator` (human or workflow identity)
- `datasetLockVersion`
- `thresholdConfigVersion`
- `modelConfig` (model id and relevant runtime options)
- `strictModeFlags`
- `commandLine` (invocation record)
- `resultArtifacts` (paths or links)

## Required Per-Case Metadata (when available)
- case id
- suite name
- prediction
- correctness
- citation marker/coverage values
- runtime diagnostics and retry metadata

## Privacy And Data Handling
- Do not store PHI in benchmark artifacts.
- Use de-identified synthetic/public benchmark cases for release gates.
- Incident records referencing real-world reports must redact direct identifiers.

## Immutability Rules
- Run manifests and generated benchmark outputs are append-only artifacts.
- Failed runs are retained and cannot be deleted from governance history.
- Any rerun must generate a new `runId`.

## Retention
- Keep release benchmark artifacts for at least 12 months.
- Keep incident-linked benchmark artifacts for at least 24 months.


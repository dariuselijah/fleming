# Benchmark Governance Policy

## Purpose
This policy prevents benchmark gaming, enforces reproducibility, and ensures public trust claims are backed by auditable evidence.

## Core Principles
- No cherry-picking.
- No silent dataset mutation.
- No threshold changes without documented rationale.
- No deleting failed benchmark runs.
- No public performance claims without methodology and artifacts.

## Anti-Cherry-Pick Protocol
- Every release benchmark run must have a run manifest.
- All runs (pass/fail) are retained in artifact history.
- Report both absolute values and deltas against prior baseline.
- If a run is repeated, both original and rerun must be preserved.

## Locked Test Sets
Benchmark assets listed in `data/eval/dataset-lock-manifest.json` are release-locked.

Any change to locked files requires:
- explicit PR label/section "Benchmark Dataset Change"
- updated lock manifest hash
- rationale and expected impact notes
- reviewer signoff from benchmark owner

## Threshold Governance
- Thresholds are versioned files under `data/eval/*_thresholds.json`.
- Threshold changes require:
  - written rationale
  - historical backtest notes
  - approval from safety + product owners

## Reproducibility Requirements
- Record commit SHA, model config, strict flags, and commands in run manifest.
- CI must run dataset lock verification before benchmark gates.
- Release benchmark outputs must be archived as artifacts.

## Publication Rules
Public benchmark materials must include:
- suite names and case counts
- locked dataset references
- scoring definitions
- run date and model/setup version
- known limitations


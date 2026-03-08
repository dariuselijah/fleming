# Public Benchmark Methodology

## Goal
Describe how Fleming benchmark claims are produced so external audiences can evaluate validity and reproducibility.

## Benchmark Layers
1. **Internal retrieval benchmark**
2. **Internal clinical chat benchmark**
3. **External healthcare suites** (MedQA, PubMedQA, MMLU-clinical)

## Run Conditions
- Local app endpoint: `http://127.0.0.1:3000` (or CI service equivalent)
- Strict mode enabled for release checks
- Fixed benchmark inputs and threshold configs
- Retries/timeouts documented in run manifest

## Scoring Summary
- Retrieval: relevance/coverage proxies, evidence level, recency.
- Clinical chat: citation coverage, citation relevance, escalation compliance, guideline hit rate, judge scores.
- External suites: accuracy, answered rate, citation marker rate, citation coverage.

## What We Publish
- current run metrics
- threshold pass/fail outcomes
- case counts per suite
- run timestamp and setup metadata
- comparison against prior baseline where available

## Frontier Baseline Comparison Framework
For "model alone vs model + Fleming setup", publish:
- Baseline arm: raw frontier model results.
- Augmented arm: same frontier model via Fleming pipeline.
- Delta tables for accuracy/safety/citation metrics.

Include caveats:
- prompt templates used
- tool/evidence settings
- temperature and retry behavior

## Limitations
- Benchmarks approximate real-world behavior but do not replace prospective clinical outcomes studies.
- External suite composition can bias toward specific question formats.
- LLM-as-judge metrics should be interpreted alongside objective checks.


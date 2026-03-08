# Change Control And Release Signoff

## Purpose
Define mandatory controls for benchmark-impacting changes and release approval.

## Changes Covered
- Prompt/policy updates that affect medical guidance behavior.
- Retrieval/citation pipeline changes.
- Benchmark dataset, threshold, or scoring logic changes.
- Model default/version changes.

## Required Change Checklist
- Problem statement and expected impact documented.
- Risk assessment completed (safety + trust impact).
- Relevant benchmark suites identified.
- Dataset lock verification passed.
- Threshold checks passed.
- Regression review completed for safety-critical metrics.

## Approval Rules
- At least one approver for product/engineering quality.
- At least one approver for clinical safety ownership for safety-relevant changes.
- Any threshold or dataset-lock change requires explicit rationale in PR description.

## Promotion Gate
Release is allowed only when:
- `benchmark:release:strict` passes.
- external benchmark check passes.
- no open `SEV-0` or `SEV-1` incidents.
- two consecutive green release runs are available for high-risk releases.

## Evidence Required In Release Notes
- Benchmark artifact links.
- Threshold pass summary.
- Known limitations/regression notes.
- Any methodology or dataset changes since prior release.


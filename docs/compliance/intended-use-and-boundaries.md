# Intended Use And Boundaries

## Purpose
This policy defines where Fleming is intended to be used, where it is not intended to be used, and what user verification is required before any clinical action.

## Intended Users
- Licensed clinicians using Fleming for clinical decision support and workflow acceleration.
- Medical students using Fleming for educational simulation and evidence-oriented learning.

## Intended Product Use
- Clinical evidence synthesis.
- Point-of-care workflow outputs (clinical summary, drug interaction review, stewardship, ICD10 support, medication review).
- Structured draft generation for clinician review.
- Medical education support (non-patient-facing training contexts).

## Explicitly Out Of Scope
- Autonomous diagnosis or treatment.
- Acting as a replacement for emergency services or urgent triage systems.
- Direct patient-facing instructions without clinician oversight in professional workflows.
- Use as the sole basis for prescribing, dose adjustment, or procedural decisions.

## Required Human Oversight
- A qualified clinician remains responsible for final interpretation and action.
- Any recommendation with incomplete context must be treated as provisional.
- Emergency-risk cases must include explicit escalation language and clinician confirmation.

## High-Risk Scenario Handling
High-risk prompts include but are not limited to:
- acute chest pain
- stroke symptoms
- sepsis concern
- severe respiratory compromise
- pregnancy, pediatric, or polypharmacy edge conditions

For high-risk scenarios:
- responses must surface uncertainty and missing critical context when present
- escalation guidance must be explicit when emergency criteria are met

## Safety Communication Rules
- Do not hide uncertainty.
- Do not present high-confidence recommendations without evidence context.
- Do not imply autonomous authority or definitive diagnosis.

## Release Gating Requirement
No release may be promoted without passing benchmark thresholds in the release benchmark suite and external benchmark suite according to the current governance policy.


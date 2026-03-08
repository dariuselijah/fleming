# Clinical Risk Tiering

## Purpose
This document defines incident severity levels for clinical quality and safety events, and the required response for each level.

## Severity Levels

### SEV-0 (Critical Patient Safety Risk)
Definition:
- Output creates immediate risk of serious harm if followed.
- Missing required emergency escalation in high-risk emergency contexts.

Required actions:
- Immediate escalation to on-call owner.
- Disable affected pathway using feature flag or route-level safeguard.
- Open incident log within 30 minutes.
- Hotfix and post-incident review required before re-enable.

### SEV-1 (High Clinical Risk)
Definition:
- Material clinical inaccuracy or unsafe recommendation that could cause harm but is not immediate/critical.
- Repeated unsafe pattern across similar prompts.

Required actions:
- Triage within 4 hours.
- Containment plan (prompt/policy/tooling adjustments).
- Add regression benchmark cases before closure.

### SEV-2 (Moderate Quality/Trust Risk)
Definition:
- Citation/provenance mismatch, weak evidence linkage, or trust signal failures.
- Missing expected caveat/uncertainty communication in moderate-risk contexts.

Required actions:
- Triage within 1 business day.
- Corrective patch in next release window.
- Add validation checks where feasible.

### SEV-3 (Low Operational/UX Risk)
Definition:
- Non-safety UI defects or reporting inconsistencies with limited clinical impact.

Required actions:
- Prioritize in normal backlog.
- Resolve in routine release cadence.

## Mandatory Closure Criteria (SEV-0 to SEV-2)
- Root cause documented.
- Prevention action documented.
- Regression benchmark test added or existing suite expanded.
- Incident owner and approver recorded.


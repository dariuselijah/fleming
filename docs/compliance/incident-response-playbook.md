# Clinical Incident Response Playbook

## Purpose
This playbook standardizes response to clinical quality and safety incidents related to model behavior, evidence attribution, and workflow outputs.

## Trigger Sources
- Clinician/customer report
- Internal QA finding
- Benchmark gate failure
- Monitoring/alert anomaly

## Incident Workflow
1. **Detect**
   - Create incident record with timestamp, reporter, suspected scope.
2. **Classify**
   - Assign severity (`SEV-0` to `SEV-3`) using `docs/compliance/clinical-risk-tiering.md`.
3. **Contain**
   - Disable impacted feature/model path if safety risk exists.
   - Freeze deployment for affected environment if required.
4. **Investigate**
   - Identify the failing prompts/cases and model/tooling state.
   - Confirm if regression is isolated or systemic.
5. **Remediate**
   - Implement policy/prompt/tooling/product fix.
   - Add benchmark regression cases before closure.
6. **Verify**
   - Re-run strict release benchmarks and relevant external suites.
7. **Close**
   - Publish post-incident summary with corrective/preventive actions.

## Required Incident Record Fields
- Incident ID
- Severity
- Owner
- Detection method
- User impact summary
- Affected model/workflow/mode
- Evidence artifact links (logs, benchmark outputs)
- Containment action
- Root cause
- Remediation action
- Verification evidence
- Closure approval

## Release Block Conditions
- Any open SEV-0 or SEV-1 incident blocks release promotion.
- Regressions in benchmark safety metrics block release promotion.

## Post-Incident Actions
- Add/expand benchmark cases that reproduce the failure.
- Update compliance packet if policy gaps are identified.
- Update public methodology notes when evaluation process changes materially.


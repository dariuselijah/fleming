# Staged clinical pilot runbook

## Entry criteria

- [ ] All repository release checks pass on the exact release SHA.
- [ ] Production operations, migration, restore, MediKredit and payment-provider
      accreditation, POPIA/DPIA/subprocessor, and penetration-test gates are
      signed.
- [ ] Pilot agreement defines intended use, excluded workflows, support,
      incident contacts, consent/notices, success metrics, and stop authority.
- [ ] Named practices and trained users are allowlisted; least-privilege roles,
      MFA/session policy, synthetic rehearsal, and data migration validation are
      complete.
- [ ] Feature flags keep unaccredited providers, raw XML, debug/test routes,
      dry runs, and unsupported clinical automation disabled.

## Rollout stages

1. **Internal synthetic rehearsal** — no real patient or provider traffic.
   Exercise auth, patient chart, encounter sign/amend, appointment, claim
   draft, billing, incident, restore, and support paths.
2. **Shadow workflow** — approved pilot clinicians compare output without
   allowing Fleming to submit claims, send patient messages, or change source
   records automatically.
3. **Single-practice limited pilot** — cap users, patients, claims, messages,
   and operating hours. Require clinician confirmation for every clinical and
   claim action.
4. **Multi-practice expansion** — expand only after a formal checkpoint shows
   tenant isolation, safety, reliability, support, privacy, and revenue metrics
   remain within thresholds.

## Daily controls

- [ ] Review open safety/privacy/security incidents and support cases.
- [ ] Review PHI-safe request-ID logs, 5xx/latency, auth denials, webhook/cron
      freshness, provider retries, claim outcomes/reversals, and billing
      reconciliation.
- [ ] Sample signed encounters and amendments for provenance; sample access
      audit events and cross-practice denial tests.
- [ ] Hold a clinician feedback huddle and record issues without PHI in the
      general tracker.

## Stop conditions

Pause the affected workflow immediately for any suspected cross-tenant access,
unauthorized disclosure, signed-record mutation, duplicate/incorrect live
claim, unexplained reconciliation difference, critical/high vulnerability,
SEV-0/SEV-1 clinical event, provider accreditation breach, restore failure, or
loss of required observability. Follow the incident runbook; do not expand
while a stop condition remains open.

## Exit decision

The clinical safety owner, Information Officer, security owner, operations
owner, billing owner, and pilot practice representative must approve expansion.
Record metrics, incidents, residual risks, corrective actions, evidence links,
release SHA, and the next review date. Pilot completion is not general
production authorization.

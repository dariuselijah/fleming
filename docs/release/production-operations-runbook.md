# Production operations runbook

This checklist is a release gate. Record the owner, timestamp, environment,
command output or dashboard link, and approver for every completed item. Never
paste secrets, patient data, raw claim XML, or webhook bodies into evidence.

## Configuration gate

- [ ] Use Node 22 and an immutable build from the approved commit SHA.
- [ ] Run `npm ci`, `npm run verify:release`, and
      `NODE_ENV=production npm run check-env:production` in the release
      environment.
- [ ] Store all secrets in the platform secret manager; confirm no service-role
      key is present in `NEXT_PUBLIC_*` values or client bundles.
- [ ] Confirm `E2E_DISABLE_EXTERNAL_SERVICES`, `MEDIKREDIT_DRY_RUN`,
      `POLAR_SH_DRY_RUN`, `STITCH_DRY_RUN`,
      `MEDIKREDIT_ENABLE_XML_PREVIEW`, and `MEDIKREDIT_STORE_RAW_XML` are off.
- [ ] Confirm HTTPS origins, callback URLs, webhook URLs, CSP/security headers,
      retention settings, alert destinations, and on-call ownership.
- [ ] Confirm logs are structured, carry `x-request-id`, and do not contain PHI,
      credentials, request bodies, claim XML, or public tokens.

## Migration gate

- [ ] Back up the database and capture the provider restore point before change.
- [ ] Review pending SQL in order, including RLS, locks, trigger behavior,
      expected duration, and rollback/forward-fix steps.
- [ ] Run migration/static regressions in CI. Do not apply remote migrations
      from pull-request CI.
- [ ] Apply to an isolated staging clone first; verify tenant isolation, signed
      encounter sealing, append-only claim events, appointment conflicts, and
      representative query plans.
- [ ] Obtain database and clinical owner approval before the production window.
- [ ] Apply once from the controlled migration runner; preserve full output.
- [ ] Run post-migration read-only checks and compare row counts/invariants.
      Prefer a forward fix after writes begin; restore only under incident
      command.

## Backup and restore drill

- [ ] Confirm encrypted automated backups, point-in-time recovery, region,
      retention, access controls, and restore owner.
- [ ] Quarterly, restore the latest backup into an isolated non-production
      project with outbound integrations disabled.
- [ ] Validate schema migration level, row-count checksums, RLS enabled status,
      authentication isolation, storage references, signed encounters, and
      claim-event history.
- [ ] Record measured RPO/RTO, gaps, deletion date for the restored copy, and
      an approved drill report. A backup without a successful restore drill is
      not accepted as a release control.

## Webhook and cron verification

- [ ] Inventory every route against `vercel.json` and provider dashboards.
- [ ] Verify webhook signatures against raw bodies, timestamp/replay policy,
      idempotency keys, retry/dead-letter behavior, and generic error responses.
- [ ] Verify every cron route fails closed without `CRON_SECRET`; use one
      synthetic invocation in staging and confirm duplicate execution is safe.
- [ ] Confirm provider and scheduler timeouts are shorter than platform limits.
- [ ] Alert on repeated 401/5xx, stale last-success timestamps, retry backlog,
      and abnormal volume. Link alerts to request IDs, not payloads.

## Incident and rollback

1. Declare severity and incident commander; freeze promotion.
2. Contain by disabling the affected feature/provider or scheduler. Preserve
   audit events and PHI-safe structured logs.
3. Correlate using request ID, release SHA, migration version, provider event
   ID, and synthetic reproduction. Restrict access to any PHI evidence.
4. Roll back the application image if schema-compatible. Use the reviewed
   forward fix for data changes; authorize restore only when data integrity
   requires it.
5. Notify privacy, clinical safety, provider, and customer stakeholders under
   their contractual/regulatory timelines.
6. Add a regression, complete root-cause/CAPA review, and obtain closure
   approval. Follow `docs/compliance/incident-response-playbook.md` for clinical
   severity and release-block rules.

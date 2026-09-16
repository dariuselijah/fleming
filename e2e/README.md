# Browser verification strategy

`npm run test:browser` is the pull-request gate. It starts the application with
external services disabled, blocks browser requests to non-local origins, uses
only synthetic invalid values, and checks public rendering plus serious or
critical axe violations. It must not use patient data, provider credentials, or
production endpoints.

CI installs Playwright's pinned Chromium build. A workstation with system Chrome
but no downloaded Playwright browser can run the same suite with
`PLAYWRIGHT_CHANNEL=chrome npm run test:browser`.

## Authenticated fixtures

Authenticated browser and database journeys are a staging-only release gate,
not part of pull-request CI:

1. Seed a dedicated synthetic practice, clinician, patient, provider, and
   appointment through the reviewed staging fixture job. Use clearly fictional
   values and tag every row with the release SHA and expiry time.
2. Authenticate a least-privilege staging test user. Generate Playwright
   `storageState` during the job from credentials held in the CI secret manager;
   never commit cookies, passwords, access tokens, fixture IDs, or state files.
3. Pass the staging base URL and synthetic fixture IDs as protected environment
   variables. Refuse to run unless the host is on the approved staging allowlist
   and `NODE_ENV` is not `production`.
4. Exercise cross-tenant denial, encounter sign/amend, appointment
   create/conflict/reschedule, and claim draft flows. Keep MediKredit, payments,
   messaging, and other outbound providers in their certified sandboxes.
5. Delete or expire fixtures and storage state after the run. Retain only
   PHI-free request IDs, test names, release SHA, timings, and pass/fail output.

The authenticated appointment database smoke requires seeded practice,
provider, patient, and appointment IDs and therefore remains an explicit
staging-only gate. Pull-request CI instead runs the network-free
`npm run test:appointments` migration and route contract regression, including
the database overlap trigger and tenant-scoped reschedule assertions.
# Browser verification and authenticated fixtures

`npm run test:browser` runs the network-isolated Chromium smoke suite. It covers
public authentication, legal pages, and the prescription-token failure path.
The test server sets `E2E_DISABLE_EXTERNAL_SERVICES=1`; this switch is ignored
in production and production configuration validation rejects it.

## Authenticated patient and claim fixture strategy

Authenticated browser tests must use a dedicated local or staging Supabase
project containing only synthetic records. Do not use a production database,
real patient details, copied claim XML, personal staff accounts, or provider
credentials.

1. Create a dedicated synthetic practice, clinician user, patient, appointment,
   encounter, and draft claim with stable UUIDs from an idempotent seed script.
2. Authenticate in a one-time Playwright setup using `E2E_CLINICIAN_EMAIL` and
   `E2E_CLINICIAN_PASSWORD` from the CI secret store. Save `storageState` under
   `test-results/`; never commit it.
3. Run patient/claim scenarios with that storage state and assert the practice
   boundary on every seeded record. A second synthetic practice should be used
   for negative tenant-isolation cases.
4. Point MediKredit and payment calls at a local contract fixture or non-live
   sandbox. Assert the outbound payload contract, but never submit to a live
   switch from CI.
5. Delete seeded rows and revoke the test session after the run. Use a short
   token lifetime and rotate CI credentials regularly.

Keep authenticated tests in a separate Playwright project that is skipped when
the dedicated fixture variables are absent. Promotion to staging requires this
project; pull-request CI remains credential-free and runs the public suite.

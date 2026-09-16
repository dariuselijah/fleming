# Fleming feature status

This registry is the release source of truth. A production surface must not
present `stub`, `dry-run`, or `retired` functionality as live.

## Status definitions

- `live`: persisted end to end and covered by a production runbook.
- `beta`: real implementation, but not yet through all release gates.
- `dry-run`: deterministic test implementation; production UI must identify it.
- `stub`: incomplete or non-persisting; hidden in production.
- `retired`: unsupported and scheduled for removal.
- `removed`: no longer present in application code or shipped configuration.

## Practice platform

| Domain | Status | Production rule |
| --- | --- | --- |
| Evidence chat and uploads | beta | Clinical use requires provenance and PHI controls. |
| Patient directory and chart | beta | Do not treat AI rollups as clinician-verified facts. |
| Clinical encounters | beta | Signing/amendment safety gates must be enabled. |
| Calendar and appointments | beta | All writes must use server conflict validation. |
| Front desk work queue | beta | Legacy front-desk mode is retired. |
| MediKredit eligibility and family checks | beta | Test/live state and evidence freshness must be visible. |
| MediKredit claims | beta | Reversal, duplicate, and preflight gates are required. |
| Invoices, cash, Stitch, and Polar | beta | Webhook verification and idempotency are mandatory. |
| Yoco, PayFast, and Payflex | stub | Hidden unless a verified implementation is configured. |
| Inventory | beta | Mock overlay and client-only writes are prohibited. |
| Analytics | beta | Production metrics must come from report APIs. |
| SMS, voice, and email channels | beta | Fail closed when webhook secrets are absent. |
| Lab inbound ingestion | stub | Hidden until parsing, matching, and audit are implemented. |
| Patient billing portal | beta | Public access is token-scoped; no staff session required. |
| Prescription verification | beta | Public access is token-scoped; dispensing remains gated. |

## Removed product lines

These surfaces are no longer wired into the application or shipped by this
repository.

| Surface | Status | Replacement |
| --- | --- | --- |
| Student/LMS workspace, APIs, and connectors | removed | None in the practice product. |
| Personal health workspace and wearable/FHIR connectors | removed | None in the practice product. |
| Multi-chat workspace | removed | Standard evidence chat. |
| Legacy Bento claims surface | removed | Billing work queue; shared claim detail/create components remain. |
| Legacy front-desk workspace mode and Bento inbox | removed | Admin Front Desk tab with unified WorkQueue. |
| Mock calendar, inventory, resource, and sales overlays | removed | Practice admin tabs and APIs. |
| Native Capacitor shells | removed | Responsive web application. |

## Release rule

Moving a feature to `live` requires persistence, server authorization,
observability, user-visible errors, a runbook, and at least one CI-gated
critical-path test.

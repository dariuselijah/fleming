# Practice tools and integrations map

This map covers the South African private-practice product. Retired student/LMS,
personal-health connector, and native-shell surfaces are intentionally excluded.

## Clinical and evidence

- Evidence chat combines PubMed, guideline, trial, web, and configured research
  connectors through `app/api/chat/route.ts` and `lib/evidence/**`.
- Upload ingestion, document retrieval, citations, and visual references live in
  `app/api/uploads/**`, `lib/uploads/**`, and `lib/media/**`.
- Patient-scoped clinical tools are assembled in
  `lib/clinical/chat-patient-tools.ts`; encounter state remains clinician
  controlled.

## Practice operations

- The admin Front Desk tab renders the unified WorkQueue for messages, labs,
  handoffs, appointment tasks, inventory tasks, and billing follow-up.
- Calendar, patient directory, inventory, analytics, and channels are admin tabs
  backed by practice APIs. The former mock overlay implementations are removed.
- Practice-assistant tools are defined in `lib/ai/admin-tools.ts` and exposed by
  `app/api/assistant/admin/route.ts`.

## Billing and payments

- `app/components/admin/billing-work-queue.tsx` is the authoritative operator
  surface.
- MediKredit eligibility, family checks, claims, reversals, and preflight logic
  live under `app/api/clinical/medikredit/**` and `lib/medikredit/**`.
- Invoice, cash-drawer, Stitch, and Polar flows live under `app/api/billing/**`
  and `lib/billing/**`.
- Yoco, PayFast, and Payflex remain hidden until verified provider
  implementations are configured, as recorded in `docs/FEATURE_STATUS.md`.

## Communications

- SMS, voice, email, and WhatsApp routes live under `app/api/comms/**`.
- Provider webhooks must fail closed when their verification secrets are absent.

## Deliberately unsupported surfaces

- Student/LMS planning, review queues, study graphs, and LMS sync.
- Personal wearable/FHIR connector dashboards and APIs.
- Multi-chat model comparison.
- Native iOS/Android shells; Fleming ships as a responsive web application.

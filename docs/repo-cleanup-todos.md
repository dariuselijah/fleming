# Fleming repo cleanup TODO

This file tracks confirmed cleanup and follow-up work from the June 2026 audit. Treat `P0` items as release blockers or correctness risks, and keep suspected dead code until import graph checks, type-check, and manual product review confirm removal is safe.

## P0 - Blockers

- [x] Renumber the duplicate migration timestamp `20260425120000_*` and verify migration apply order:
  - `supabase/migrations/20260425120000_billing_automation_claim_appointment_providers.sql`
  - `supabase/migrations/20260425120100_patient_attachments_category.sql`
- [ ] Regenerate `app/types/database.types.ts` for patient overview and assistant tables currently queried with `as never`, including `practice_encounter_summaries`, `patient_attachments`, `patient_chart_facts`, `patient_notes`, and `practice_assistant_events`.
- [ ] Implement real Yoco, PayFast, and Payflex webhook verification plus payment finalization, or hard-gate live UI paths while provider integrations are dry-run only.
- [ ] Complete lab inbound handling in `app/api/integrations/lab/inbound/route.ts`: parse HL7/payloads, match patients, and create a practice inbox item or chart attachment.

## P1 - Incomplete Features

- [ ] Bring `BillingWorkQueue` payment provider parity up to the legacy billing UI, or explicitly sunset unsupported providers.
- [ ] Wire or remove `lib/billing/providers/adapter.ts`.
- [ ] Decide whether the RAG document ingestion path should be integrated into chat or trimmed from the product surface.
- [ ] Re-enable, finish, or remove the quiz artifact path behind `ENABLE_QUIZ_GENERATION`.
- [ ] Replace `MOCK_INVENTORY` in `app/components/overlays/inventory-overlay.tsx` with workspace store/API data.
- [ ] Implement portal medical-aid card upload or remove the “coming soon” affordance.
- [ ] Resolve product decisions in `docs/plan-open-decisions.md`, especially timezone handling, concurrent booking constraints, cancel SMS, deposits, and billing aging dates.

## P2 - Dead Code Candidates

- [ ] Verify with `npx knip`, `npx ts-prune`, and import searches before deleting `app/components/admin/revenue/*`. Keep `medprax-code-search.tsx` if still used by claims.
- [ ] Remove or wire `app/components/admin/invoice-editor-panel.tsx`.
- [ ] Remove or wire `app/components/admin/billing-header-strip.tsx`.
- [ ] Remove `/api/test-auth` or protect it behind a development-only guard.
- [ ] Decide the sunset path for legacy `BentoClaims` behind `NEXT_PUBLIC_BILLING_WORK_QUEUE`.

## P3 - API Consistency

- [ ] Unify `/api/practice/branding` and `/api/practices/branding`, or clearly document why both exist.
- [ ] Standardize practice appointment routes on the same auth and role-check pattern.
- [ ] Document or consolidate booking entry points across assistant cards, admin tools, and server helpers.

## P4 - Docs And Tooling

- [ ] Rewrite stale MediKredit/billing docs that reference Perkily, Vite, `UnifiedClaimModal`, or `src/presentation/*`.
- [x] Add npm scripts for existing regression scripts such as `scripts/test-patient-overview-shape.ts` and `scripts/test-diagnosis-accept-routing.ts`.
- [x] Enable a small regression subset in CI once scripts are stable.
- [ ] Add a `format` npm script for Prettier.
- [ ] Audit direct dependency declarations, especially packages used from transitive dependencies.

## Validation Checklist

Run these after cleanup changes:

```bash
npm run type-check
npm run lint
npm run build
npx ts-node --compiler-options '{"module":"commonjs"}' scripts/test-patient-overview-shape.ts
npx knip
npx ts-prune
rg "as never" app lib --count
rg "stub: true" app/api
```

Manual checks:

- Select a patient and confirm one overview request is shared across the sidebar and file panel.
- Confirm the AI rollup returns cached text for the same `latestSummaryAt`.
- Trigger a new signed encounter summary and confirm the overview invalidates once and regenerates one rollup.
- Confirm billing, attachment, and chart-fact updates refresh only the affected patient overview.

# Current billing, MediKredit, and Medprax implementation

## Authoritative surfaces

- Billing operators: `app/components/admin/billing-work-queue.tsx`
- Shared claim detail/create components: `app/components/admin/bento-claims.tsx`
- Clinical claim editor: `app/components/workspace/billing-claim-panel.tsx`
- Signed-encounter claim preview: `app/components/workspace/claim-preview-modal.tsx`

`app/components/admin/bento-billing-entry.tsx` always opens the work queue. The removed legacy revenue tabs are not runtime paths.

## MediKredit

Authenticated Next.js routes under `app/api/clinical/medikredit/` build and submit transactions. `lib/medikredit/client.ts` sends inner XML to the server-side clinical proxy. Live credentials remain on that proxy.

Claim submission is blocked unless patient/dependant data, treatment dates, DoctorOption, fresh eligibility/famcheck, ICD/modifiers, Medprax preflight, and duplicate checks pass. Parsed results are persisted and routine APIs omit raw XML.

Reversals require a persisted claim ID. The server loads the original transaction itself, sends `tx_cd=11`, then persists `reversed` state and an append-only event only after acceptance.

See `/MEDIKREDIT_INTEGRATION.md` for configuration and certification gaps.

## Medprax

Fleming accesses Medprax only through server helpers in `lib/clinical-proxy/medprax.ts`.

Claim preflight behavior:

- `MEDPRAX_CLAIM_PREFLIGHT_MODE=required`: verify tariff and NAPPI identifiers before MediKredit.
- `disabled` is accepted only with `MEDPRAX_ALLOW_UNVERIFIED_CLAIMS=1`.
- `MEDIKREDIT_DRY_RUN=1`: skip external preflight and switch transport.

The bypass is explicit so a missing proxy or credential cannot silently turn a verified workflow into an unverified submission.

## Billing

Invoices and payments are implemented under `lib/billing/` and `app/api/billing/`.

- Repeated invoice creation for one claim returns the existing non-void invoice.
- Provider success uses the transactional/idempotent `finalize_billing_payment_success` database function.
- Reconciliation import, auto-match, dispute, and unmatch are available in the billing work queue.
- Yoco, PayFast, and Payflex are disabled until provider-specific checkout and webhook certification is complete.

See `docs/payment-integrations.md`.

## No-network verification

```bash
npm run test:medikredit
npm run test:revenue
npm run type-check
```

Do not run `test:medikredit:claim-live` in CI or normal development.

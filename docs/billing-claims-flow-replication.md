# Recreating the Billing Claims flow

This guide translates the legacy `BillingClaims.tsx` orchestration pattern into the Fleming billing/claims model. It is intended for rebuilding the same user journey in another app, or for comparing Fleming’s current flow with the old modal-based production path.

The important distinction from the original app is the same: the billing page mostly orchestrates state, persistence, and refreshes. The real MediKredit submission belongs to the submit modal/service path, which validates patient data and items, builds the inner MediKredit `DOCUMENT`, sends it through the JSON proxy, parses the response, and persists the adjudication payload.

## 1. Component responsibilities

| Piece | Role |
|-------|------|
| Billing claims page/drawer | Tabs/list/detail state, persisted draft selection, invoice/print actions, submit button visibility, post-submit refresh. |
| Claim creator | Builds a draft claim payload and normalises `claimItems` / `claim_items` / DB `items`. |
| Claim management list | Lists saved claims and opens a persisted claim in view/edit/submit mode. |
| Submit modal/service | Performs MediKredit validation and submission. In Fleming this is implemented by `app/api/clinical/medikredit/claim/route.ts` + `lib/medikredit/claim-service.ts`. |
| Usage/overage gates | Optional product layer before allowing submit mode. Fleming currently does not mirror the old overage gate in this flow. |

## 2. State model to mirror

The legacy page kept a single modal state:

```ts
const [modalState, setModalState] = useState<{
  isOpen: boolean
  mode: "view" | "edit" | "submit" | "response" | "delete" | "reverse"
  claim: any
}>({
  isOpen: false,
  mode: "view",
  claim: null,
})
```

Fleming’s closest equivalents are:

| Legacy state | Fleming equivalent |
|--------------|--------------------|
| `modalState.claim` | Selected queue item inside `app/components/admin/billing-work-queue.tsx`; `activePatient.claimDraftLines` inside `app/components/workspace/claim-preview-modal.tsx`. |
| `mode: "submit"` | Submit button calls `/api/clinical/medikredit/claim`; the response dialog shows busy/success/error. |
| `mode: "response"` | `MedikreditSchemeSubmissionDialog` plus refreshed `practice_claims.medikredit_response`. |
| `generatedClaim` | Clinical claim preview auto-saves a draft through `/api/clinical/practice-claims/draft`. |
| `lastRefresh` | `fetchPracticeClaimsForWorkspace(practiceId)` + `useWorkspaceStore.getState().setClaims(...)`. |

## 3. Generation pipeline

When a claim is generated from clinical context or an appointment:

1. Normalise flexible fields:
   - `claimItems` / `claim_items` / `items`
   - `patientData` / `patient_id`
   - `appointmentId` / `appointment_id`
   - `totalAmount` / `total_amount`
2. Save the draft claim row immediately so Billing has a durable row.
3. Store the returned claim id on the active patient/session.
4. Use that id for final submission so the submit result updates the same `practice_claims` row instead of creating a duplicate.

Fleming implementation:

| Step | Path |
|------|------|
| Build draft claim lines | `lib/clinical-workspace/generate-draft-claim.ts` and `lib/clinical-workspace/medikredit-claim-from-session.ts` |
| Auto-save draft | `app/components/workspace/claim-preview-modal.tsx` → `/api/clinical/practice-claims/draft` |
| Draft API | `app/api/clinical/practice-claims/draft/route.ts` |
| Final claim id linkage | `activePatient.remoteDraftClaimId` → `claimId` in `/api/clinical/medikredit/claim` |

## 4. Submit from saved claims

The legacy `handleSubmitClaim` flow:

1. Ensure the claim has line items; reload DB JSON if missing.
2. Run usage/overage gates.
3. Open modal in `submit` mode with the full claim.
4. Modal validates provider, patient, and items, then submits.

Fleming equivalent:

1. Select a row in `billing-work-queue.tsx`.
2. Drawer exposes **Submit to MediKredit** only when the claim status is submit-eligible and at least one line is `medical_aid`.
3. `postPersistedMedikreditClaim` sends only medical-aid lines and includes `claimId: claim.id`.
4. The API updates the existing `practice_claims` row through `updatePracticeClaimAfterSubmission`.
5. The billing workspace refreshes claims and merges the returned adjudication into the selected drawer row.

## 5. Submit from in-memory clinical claim

The legacy “AI result card” could submit an in-memory `claimData` object before a DB row existed. Fleming intentionally avoids that drift:

1. The clinical preview auto-saves a draft before submit.
2. The preview sends `claimId: activePatient.remoteDraftClaimId` where available.
3. After success, the preview refreshes Billing claims and marks the clinical session as submitted.

If no draft id exists, `/api/clinical/medikredit/claim` can still insert a claim, but the preferred path is to create or reuse the draft first.

## 6. Unified modal/service submission sequence

Rebuild this sequence in another app:

1. Resolve `practiceId` from claim/context.
2. Load MediKredit provider settings (`BHF`, `HPC`, `grp_prac`, `VEND`, account, place of service).
3. Load or decrypt full patient data.
4. Validate patient fields required by MediKredit.
5. Normalise claim items into MediKredit line inputs:
   - procedures → `tp=2`
   - medications → `tp=1`
   - modifiers → `tp=3`
6. Run duplicate/fingerprint checks where applicable.
7. Split medicines/procedures if your rules require separate transactions.
8. Build inner `DOCUMENT` XML.
9. Send JSON to your proxy or backend:

```ts
await fetch(`${proxyOrigin}/api/medikredit`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    action: "claim",
    xmlData: innerDocumentXmlString,
    claimId: "TX-optional-correlation-id",
    patientId: practiceId, // historical field name in the old app
    practiceId,
  }),
  signal: AbortSignal.timeout(130_000),
})
```

10. Parse `response` as raw SOAP/XML string:
    - parse XML
    - find `<reply>`
    - entity-decode
    - parse inner `DOCUMENT` / `TX`
    - map `res`, `RJ`, `FIN`, `ITEM[@status]`, `RMR`
11. Persist the same `medikredit_response` blob returned by the submit service.
12. Refresh claims and show response mode.

Fleming implementation:

| Concern | Path |
|---------|------|
| API route | `app/api/clinical/medikredit/claim/route.ts` |
| Provider settings | `lib/medikredit/provider-settings.ts` |
| XML build and split | `lib/medikredit/build-document.ts`, `lib/medikredit/claim-splitter.ts` |
| Submit orchestration | `lib/medikredit/claim-service.ts` |
| Proxy/direct transport | `lib/medikredit/client.ts` |
| Parse response | `lib/medikredit/parse-response.ts` |
| Persist response | `lib/medikredit/persist.ts` |

## 7. Frontend/backend HTTP contract

The browser should not call MediKredit directly. It should call your own backend/proxy with JSON.

| Field | Value |
|-------|-------|
| `action` | `"claim"` for real-time claims; `"eligibility"` or `"reversal"` for those flows. |
| `xmlData` | Decoded inner `DOCUMENT` XML only, not SOAP. |
| `claimId` | Optional correlation id. Fleming passes the persisted `practice_claims.id` to the internal API and the server handles transaction ids. |
| `practiceId` | Practice context. |

Client timeout should be longer than backend/proxy timeout. Fleming now uses:

| Layer | Timeout |
|-------|---------|
| Browser claim POSTs | `timeoutMs: 130_000` through `fetchClient` |
| MediKredit outbound/proxy call | `MEDIKREDIT_REQUEST_TIMEOUT_MS`, default `120000` |

## 8. Completion/status mapping

After submission:

1. Derive status from response code and line outcomes.
2. Persist adjudication response on the claim.
3. Refresh billing claim lists.
4. Show response details without navigating away.

Recommended status precedence:

1. `responseCode === "R"` → `rejected`
2. favourable claim response but every line rejected → `rejected`
3. mix of approved and rejected lines → `partially_approved`
4. `responseCode === "A"` → `approved`
5. `responseCode === "P"` → `pending`

Fleming maps this in `lib/medikredit/persist.ts` and line enrichment helpers.

## 9. Checklist

- [ ] Normalise `claim_items` / `claimItems` / `items`.
- [ ] Full patient data is present or loadable.
- [ ] `practiceId` is available for provider settings.
- [ ] Draft claims are saved before clinical submit when possible.
- [ ] Persisted submit sends `claimId` so Billing updates the existing row.
- [ ] The browser request timeout exceeds the backend/proxy timeout.
- [ ] The backend sends only one SOAP envelope to MediKredit.
- [ ] `xmlData` is inner `DOCUMENT`, not SOAP.
- [ ] Parser handles `<reply>` + entity decode + second XML parse.
- [ ] Store `medikredit_response` and refresh claim lists after submit.

## 10. Fleming audit notes

- Fleming already follows the “modal/service owns submission” pattern through `/api/clinical/medikredit/claim` and `submitClaim`.
- Fleming adds a 130s browser-side timeout for the two claim POST call sites:
  - `app/components/workspace/claim-preview-modal.tsx`
  - the shared claim components retained in `app/components/admin/bento-claims.tsx`
- `lib/fetch.ts` now accepts `timeoutMs` while preserving CSRF headers.
- Usage/overage plan gating from the legacy page is not currently mirrored in this billing drawer flow.
- The remaining timeout alignment question is platform `maxDuration` on `app/api/clinical/medikredit/claim/route.ts`; it is currently lower than the 120s outbound timeout unless hosting config overrides it.

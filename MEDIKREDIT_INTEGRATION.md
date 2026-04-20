# MediKredit integration (PerkilyHealth Pro)

This document describes how the application integrates with **MediKredit** (South African medical scheme switch): XML/SOAP transport, eligibility and family checks, AI-assisted claim construction, submission and response parsing, RMRs and rejections, and how the frontend maps and displays results—including per-line item status.

> **Security:** Credentials and endpoints must come from environment variables and Supabase `medikredit_providers`. Do not commit or paste live usernames/passwords into docs or code reviews.

---

## 1. High-level architecture

| Layer | Role |
|--------|------|
| **React app (browser)** | Calls **Next.js API routes** with `practiceId` + patient/claim JSON — never sees MediKredit passwords. |
| **Next.js server** (`app/api/clinical/medikredit/*`) | Builds inner DOCUMENT XML; sends either **direct** SOAP to `MEDIKREDIT_API_URL` with Basic auth, or — when `CLINICAL_PROXY_URL` is set — JSON to the proxy’s `POST /api/medikredit` (`lib/medikredit/client.ts`). |
| **MediKredit** | HTTPS endpoint (e.g. `https://services.medikredit.co.za:4436`), S2PI `submit-*` style SOAP (or reached via proxy). |

### Clinical proxy (`CLINICAL_PROXY_URL`)

When `CLINICAL_PROXY_URL` is set (e.g. `http://localhost:3001` for local xai-proxy), Fleming posts `{ action, xmlData }` to `POST /api/medikredit` instead of emitting SOAP on this server; the proxy wraps XML and holds switch credentials. Request/response shapes are documented in [API_REQUESTS_MEDIKREDIT_MEDPRAX.md](API_REQUESTS_MEDIKREDIT_MEDPRAX.md). Medication autocomplete (`app/api/medications/search`) uses `POST /api/medication-search` on the same base. Server helpers for other Medprax paths are in `lib/clinical-proxy/medprax.ts`.

**SOAP actions** map to envelope roots: `submit-claim`, `submit-eligibility`, `submit-reversal` — see `soapActionHeaderValue` / `createSoapEnvelope`.

**Important detail:** Transaction type is determined by **`tx_cd`** on `<TX>` (20 / 30 / 21 / 11), not only by the SOAP operation name.

---

## 2. Core modules (Fleming implementation)

| Concern | Primary file(s) |
|---------|------------------|
| Types, SOAP envelope, XML escape, DOCUMENT builders (`tx_cd` 11/20/21/30) | `lib/medikredit/types.ts`, `soap-envelope.ts`, `xml-escape.ts`, `build-document.ts` |
| Response parsing (TX, RJ, ITEM, RMR, WARN, PAT) | `lib/medikredit/parse-response.ts` |
| HTTPS + Basic auth (server-only) | `lib/medikredit/client.ts`, `env.ts` |
| Eligibility + famcheck | `lib/medikredit/eligibility-service.ts` |
| Claims: submit, reversal, chronic retry `631364`, duplicates | `lib/medikredit/claim-service.ts`, `duplicate-claim.ts` |
| Procedure vs medicine split + merge | `lib/medikredit/claim-splitter.ts`, `claim-response-merger.ts` |
| Supabase provider row | `lib/medikredit/provider-settings.ts` + table `medikredit_providers` |
| Persist checks / claims | `lib/medikredit/persist.ts` |
| API routes (authenticated) | `app/api/clinical/medikredit/eligibility`, `family`, `claim`, `reversal` |
| Medical coding (LLM + fallback) | `app/api/clinical/medical-coding-agents/route.ts` |
| Client hook | `lib/hooks/use-eligibility-check.ts` |
| Accreditation modal | `app/components/medikredit/medi-kredit-accreditation-modal.tsx` |
| Patient directory (live checks) | `app/components/admin/patient-directory.tsx` |
| DB migration | `supabase/migrations/20260409180000_medikredit_integration.sql` |

**Security:** For direct SOAP, switch credentials live in **server env** (`MEDIKREDIT_API_URL`, `MEDIKREDIT_USERNAME`, `MEDIKREDIT_PASSWORD`). With `CLINICAL_PROXY_URL`, configure credentials on the proxy instead. Use `MEDIKREDIT_DRY_RUN=1` for canned responses without calling the switch.

---

## 3. XML and transaction codes (`tx_cd`)

MediKredit payloads use **`DOCUMENT` version `3.53`** and a **`TX`** element. The app sets **`tx_cd`** to distinguish transaction types:

| `tx_cd` | Purpose |
|---------|---------|
| **20** | Eligibility (single member) |
| **30** | Family eligibility (“famcheck”) |
| **21** | Real-time claim submission |
| **11** | Claim reversal |

Eligibility and famcheck XML are built in `lib/medikredit/build-document.ts` (`buildEligibilityDocument`, `buildFamilyEligibilityDocument`). Claims use `buildClaimDocument`; reversals use `buildReversalDocument` and `reverseClaim` in `claim-service.ts`.

---

## 4. Request flow: browser → Next.js API → MediKredit

1. **Browser** POSTs JSON to `/api/clinical/medikredit/*` with `practiceId` and patient / claim payloads (no raw credentials).
2. **Server** loads `medikredit_providers` for BHF/HPC/etc., builds inner **DOCUMENT** XML. For **direct** SOAP it then wraps with **`createSoapEnvelope`** (`lib/medikredit/soap-envelope.ts`) — inner XML is **HTML-entity–escaped** inside `<request>...</request>`. For **`CLINICAL_PROXY_URL`**, that envelope is built on the proxy; Fleming sends only the inner XML as `xmlData`.
3. **`sendMedikreditSoap`** (`lib/medikredit/client.ts`): **direct** → POST to `MEDIKREDIT_API_URL` with `Content-Type: text/xml`, `SOAPAction`, **Basic** auth; **proxy** → `POST {CLINICAL_PROXY_URL}/api/medikredit` with JSON `{ action, xmlData }`, then use the `response` string from the JSON body.
4. **Response** is parsed on the server with **jsdom** (`parse-response.ts`): unwrap SOAP / `<reply>` / `<request>`, then read `<TX>`, `<RJ>`, `<ITEM>`, `<RMR>`, `<WARN>`, `<PAT>`.

---

## 5. Response parsing: headers, rejections, RMRs, line items

Parsed responses (`parseEligibilityXml`, `parseClaimXml`, etc.) expose:

- **`TX`**: `res` (e.g. `A` approved, `R` rejected, `P` pending), `tx_nbr`, `dt`, `tm`.
- **`RJ`** (claim-level rejection): `cd`, `desc`.
- **`AUTHS`**: `hnet` (health network / “Jiffy”), `auth_nbr`.
- **`FIN`**: gross/net and related financial attributes.
- **`ITEM`**: Per-line adjudication—the important attributes for inline UI:
  - `status`: **A** = Approved, **R** = Rejected, **W** = Warning, **P** = Processed (see comments in `MediKreditService`).
  - Nested **`RJ`** on an item: line-level rejection code/description.
  - **`WARN`**: warnings (including `rmr_tp`).
  - Procedure vs medication: inferred from `NAPPI` vs `PROC`/`MOD` under `TAR`.
- **`RMR`**: Remittance Message Records—**code + description** pairs (`remittanceMessages` in app types).
- **Claim-level `WARN`**: separate from RMR; exposed as `warnings` with `cd`, `desc`, `rmr_tp`.

These feed **`EligibilityResponse`** / **`ClaimResponse`** fields such as `responseCode`, `rejectionCode`, `rejectionDescription`, `remittanceMessages`, `itemStatuses`, `healthNetworkId`, etc.

---

## 6. Eligibility (`tx_cd=20`)

- **Entry:** `useEligibilityCheck` converts UI patient → `PatientData` via `PatientDataConverter`, validates, then `createMedikreditService(practiceId).checkEligibility({ patient })`.
- **Logic:** `MediKreditService.checkEligibility` builds XML, calls `sendSOAPRequest`, maps `res` / `RJ` / `AUTHS` into `EligibilityResponse`.
  - Example mapping: `res === 'R'` with RJ code **115** + “Member Unknown” → `status: 'not_found'`.
  - `res === 'A'` → active/eligible messaging.
- **Persistence:** On success, `EligibilityCheckRepository.storeEligibilityCheck` writes to **`eligibility_checks`** and may update patient status via `updatePatientStatusFromEligibility`.
- **UI:** Results can open **`MediKreditAccreditationModal`** from `PatientDetail` with transaction metadata, RMRs, rejection code/desc, raw XML for accreditation evidence.

---

## 7. Family eligibility / famcheck (`tx_cd=30`)

- **Entry:** `PatientDetail` calls `medikreditService.checkFamilyEligibility({ mainMember, dependents? })` (dependents in request are optional; response lists **`PAT`** nodes).
- **Parsing:** Reads all **`PAT`** elements, maps `dep_cd` to relationship labels, reads `WARN`, `MEM` (`ch_id`, `nbr_depn`), exposes **`dependents`**, **`warnings`** (with `rmrType`), **`remittanceMessages`**, plus same core fields as eligibility.
- **Persistence:** Same repository with `check_type: 'famcheck'`.
- **UI:** `MediKreditAccreditationModal` receives `transactionType: 'famcheck'`, dependents, warnings; supports adding dependents from the list when callbacks are provided.

---

## 8. Claims: building XML (`tx_cd=21`)

`MediKreditClaimService.submitClaim`:

- **`ITEM` rows:** `lin_num`, `tp` (1 med, 2 procedure, 3 modifier), `cdg_set`, embedded **`PROC`** (tariff/`tar_cd`, `TRMNT` dates/times), **`MED`** for NAPPI meds, **`DIAG`**, **`ADD_BHF`**, **`FIN`** per line.
- **Member/patient:** `MEM` + `PAT` from patient + optional test fixtures (`use_test_provider`, `MedikreditTestData`).
- **Totals:** Leading `<FIN gross="..."/>` on `TX`; medication claims add `BHF` prescriber element when `hasMedication`.
- **`orig`:** `03` if any medication line, else `04`.
- **Prescriber:** `DOCTOR mem_acc_nbr` from config / `ACC_001` defaults for tests.

Responses are interpreted in **`submitClaim`**:

- **`res === 'R'`:** Claim rejected; combines RJ with item-level RJ/WARN descriptions when present.
- **`res === 'A'` / `P`:** Reads financials; scans **items** for `status === 'R'` or item **`RJ`** → **`partially_approved`** or full **`rejected`** if every line fails.
- Returns **`itemStatuses`** from the parser (line-level for UI and EOB).

**Reversal (`tx_cd=11`):** `reverseClaim`—no `ITEM` tags; uses same `tx_nbr` as original; `validateReversal` enforces MediKredit “golden rules” (e.g. do not reverse outright rejected claims).

**Duplicates:** `detectDuplicateClaim` looks for RJ codes like **349/350** or “duplicate” in description; `handleDuplicateResponse` supports import-original vs reverse-and-resubmit.

---

## 9. Split claims (procedures vs medicines)

**`ClaimSplitterService`** implements MediKredit’s requirement to separate **tariff procedures** and **dispensed medicines** into separate transactions when both exist:

- Splits items into `procedures` (includes modifiers) and `medicines`.
- Generates linked transaction numbers: same base with **`P`** and **`M`** suffixes.

**`UnifiedClaimModal`** uses `ClaimSplitterService.analyzeAndSplit`. If split:

- Submits procedure batch and medication batch (medications may use **chronic retry**—see below).
- **`ClaimResponseMerger.mergeResponses`** combines financials, **`itemStatuses`** (tagged with `transactionType`), and **`remittanceMessages`** for one consolidated view.

---

## 10. Medication chronic-option fallback

In **`UnifiedClaimModal`**, if MediKredit returns rejection code **342** or text like “use the chronic option”, and the patient is **not** already on chronic plan option **`631364`**, the app **retries** the medication submission with `medical_scheme_option_code` forced to **`631364`** and a suffixed transaction id (`...C`). This is a product-level workaround for scheme messaging—not a MediKredit API requirement document.

---

## 11. How AI builds claims (medical coding agents)

1. **Trigger:** User generates a claim from clinical content in **`UnifiedClaimModal`** / **`ClaimExtractionInterface`**.
2. **Transport:** `sendMedicalCodingRequestToEC2` → `POST {backend}/api/medical-coding-agents` (see `ec2-medikredit-config.ts`; local backend by default, optional AWS via `VITE_USE_AWS_BACKEND`).
3. **Payload:** `clinicalContent`, `patientData`, `practiceData`, `mode`, `appointmentData` (includes **`resolvedServices`**, **`eScriptMedications`** when present).
4. **Server:** `xai-proxy.mjs` runs an LLM with a **medical coding** system prompt: extract procedures (tariff/CPT-style codes), map appointment services to lines, attach e-script meds with NAPPI, ICD codes, quantities, prices, etc.
5. **Client mapping:** Returned **`claimItems`** are mapped to UI rows: `itemType` procedure vs medication (NAPPI detection), default tariff codes like **`0190`** / **`0201`**, diagnosis arrays, dates, Medprax price hooks optional.

The AI output is **not** sent directly to MediKredit—it is normalized and then **`MediKreditClaimService.submitClaim`** builds compliant XML.

**403 fallback:** If the medical-coding endpoint returns forbidden, `sendMedicalCodingRequestToEC2` can synthesize minimal items from `appointmentData.resolvedServices` and e-scripts (see same file).

---

## 12. Frontend mapping and display

### 12.1 Data stored on claims

Submitted adjudication is persisted primarily as **`claims.medikredit_response`** (JSON), including:

- `transactionId`, `responseCode`, `responseMessage`, `healthNetworkId`
- `approvedAmount`, `patientResponsibility` / member liability
- `rejectionCode`, `rejectionDescription`, `denialReason` (aliases across flows)
- **`itemStatuses`** (per line)
- **`remittanceMessages`** (RMRs)
- `xmlResponse` / raw payload where saved
- `submissionFingerprint` (duplicate protection vs recent claims)

`useBillingClaims` and **`ClaimManagementInterface`** read `medikredit_response` for amounts and liability when present.

### 12.2 Unified claim modal — response tab

**`UnifiedClaimModal`** (tab **response**) shows:

- Banner with **`responseMessage`** and **`rejectionDescription`** when present.
- Grid: transaction id, **Jiffy/HNet**, approved amount.
- **Item breakdown:** For each **`itemStatuses`** row: line number, badge by **`status`** (`getItemStatusDisplay`: A/R/W/P), description, **inline red text** for `rejectionDescription` or first warning description, gross/net ZAR.

**EOB download** (`handleDownloadEOB`): plain-text file with transaction metadata, each line’s code/status/gross/net, then **remittance messages**, then raw XML if stored.

### 12.3 Accreditation modal

**`MediKreditAccreditationModal`** shows overview, financial, **items**, **raw XML** for eligibility, famcheck, claims, reversals—used for compliance screenshots.

### 12.4 Patient shell

**`PatientDetail`**: “Check Eligibility” uses **`useEligibilityCheck`**; “Family eligibility” calls **`checkFamilyEligibility`**, stores checks, opens accreditation modal with **`remittanceMessages`**, rejection fields, dependents, warnings (`rmrType`).

---

## 13. RMRs vs rejections (practical distinction)

| Concept | Source in XML | In-app field |
|---------|----------------|--------------|
| **Claim/line rejection** | **`RJ`** on `TX` or `ITEM` | `rejectionCode`, `rejectionDescription`, item `rejectionCode` / `rejectionDescription` |
| **RMR** | **`RMR`** elements | `remittanceMessages[]` (`code`, `description`) |
| **Warnings** | **`WARN`** | `warnings` on eligibility/famcheck; per-item `warnings` on claim lines |

The UI emphasizes **line-level** denial text on **`UnifiedClaimModal`** item rows; RMRs appear in accreditation views and EOB export.

---

## 14. Provider configuration

Practice-specific values are loaded from Supabase **`medikredit_providers`** (`createMedikreditService`, `createMedikreditClaimService`): vendor id, BHF, HPC, group practice, PC/works numbers, prescriber account, etc.

---

## 15. Related npm / scripts

From `package.json`: `test:medikredit`, `test:medikredit:hardening`, `send:medikredit:claim`—used for integration or hardening tests against the real interface (run only in appropriate environments).

---

## 16. File map (quick reference) — Fleming

```
lib/medikredit/
  types.ts
  env.ts
  client.ts
  soap-envelope.ts
  xml-escape.ts
  build-document.ts
  parse-response.ts
  eligibility-service.ts
  claim-service.ts
  claim-splitter.ts
  claim-response-merger.ts
  duplicate-claim.ts
  provider-settings.ts
  persist.ts
  practice-guard.ts
  index.ts

lib/hooks/use-eligibility-check.ts

app/api/clinical/medikredit/eligibility/route.ts
app/api/clinical/medikredit/family/route.ts
app/api/clinical/medikredit/claim/route.ts
app/api/clinical/medikredit/reversal/route.ts
app/api/clinical/medical-coding-agents/route.ts

app/components/medikredit/medi-kredit-accreditation-modal.tsx
app/components/admin/patient-directory.tsx   # live eligibility + family + quick check-in

supabase/migrations/20260409180000_medikredit_integration.sql
```

---

*This document reflects the integration as implemented in the repository; MediKredit’s official specification remains the source of truth for production certification.*

# MediKredit real-time claims — standalone replication guide

This document is written so **another repository can implement claim submission and response parsing without access to Perkily’s codebase**. It describes the production integration pattern used from the Billing → Claims UI through HTTP, SOAP, inner XML (`tx_cd="21"`), and response interpretation.

Official MediKredit XML 3.53 / accreditation materials remain authoritative; this guide is an implementation checklist aligned with that pattern.

---

## 1. What you are implementing

| Layer | Responsibility |
|--------|----------------|
| **Your UI / API** | Collect patient + practice + claim lines → build **inner MediKredit XML** (`DOCUMENT` → `TX` with `tx_cd="21"`). |
| **Backend proxy** (recommended) | Accept JSON with **unescaped** inner XML, wrap in SOAP, `POST` to MediKredit with Basic auth, return raw SOAP/XML body. **Use a bounded HTTP timeout** (e.g. 120s): uncapped outbound calls often appear “hung”. |
| **Your client parser** | Parse SOAP/Fault → find `<reply>` (or equivalent) → **entity-decode** → parse `<TX>` → map `res`, `RJ`, `FIN`, `ITEM[@status]`, `RMR`, etc. |

**MediKredit endpoint (typical production):**

- HTTPS host: **`services.medikredit.co.za`**
- Port/path (commonly **`4436`**; confirm with MediKredit for your accreditation): **`https://services.medikredit.co.za:4436`**
- Credentials: MediKredit-issued username/password (**Basic auth**), stored only on the server.

**Egress / IP allow-listing:** Many environments only respond when traffic originates from a **registered IP** (e.g. cloud proxy, Lambda, fixed VPN egress). Laptop or random cloud egress may **never complete** TLS unless allow-listed — always configure **timeouts** and treat long stalls as connectivity, not logic bugs.

---

## 2. Reference UI flow (Billing Claims equivalent)

1. User selects a claim with **patient** context and **line items** (procedures / medicines / modifiers).
2. Validate patient fields required for MediKredit (member id, plan option code, dependent code, names, DOB, gender, etc.).
3. Map UI patient → **`PatientData`-shaped** object (see §5).
4. Map UI lines → **`ClaimItem`-shaped** lines (see §6).
5. Load **practice / switch** credentials: BHF/HPC, `grp_prac`, vendor block (`vend_id`, `pc_nbr`, `wks_n`), prescriber account (`mem_acc_nbr`), etc. (see §4).
6. Build **inner XML** `xmlData`, then **`POST /api/medikredit`** with `action: "claim"` (or call MediKredit SOAP directly using the envelope in §7).
7. Parse response (§8–9), persist `rawResponse`/decoded XML for audit, and show **approved / rejected / partially approved / pending** to the user.

---

## 3. Mandatory transport: backend proxy JSON contract

Expose (or reuse) **`POST /api/medikredit`** on your backend with JSON:

| Field | Required | Purpose |
|--------|----------|---------|
| `action` | Yes | For claim submission use **`claim`**. Maps to SOAP operation **`submit-claim`** and header **`SOAPAction: submit-claim`**. |
| `xmlData` | Yes | **Complete inner MediKredit document only**: `<?xml ...?>` + `<DOCUMENT>...</DOCUMENT>` with **literal** `<` and `>` (**not** pre-escaped as `&lt;`). |

Optional passthrough fields (logging only): `claimId`, `patientId`, `practiceId`

### Request example

```http
POST /api/medikredit HTTP/1.1
Host: your-backend.example.com
Content-Type: application/json

{
  "action": "claim",
  "xmlData": "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?><DOCUMENT version=\"3.53\" reply_tp=\"1\"><TX tx_cd=\"21\" ...>...</TX></DOCUMENT>"
}
```

### Success response (`200`)

```json
{
  "status": "success",
  "action": "claim",
  "request_id": "...",
  "response": "<?xml ... full SOAP or XML returned by MediKredit ...>",
  "timestamp": "2026-01-01T12:00:00.000Z",
  "target_url": "https://services.medikredit.co.za:4436"
}
```

Treat `response` as **opaque UTF-8 text** until parsed (often SOAP wrapping an inner escaped reply).

### Error responses

| Status | Meaning |
|--------|---------|
| `400` | Missing `action` or `xmlData`, or invalid `action`. |
| `504` | Outbound MediKredit call **timed out** or blocked egress (recommended when using `AbortController`/`AbortSignal` timeouts). |
| `500` | Other failures; include **`details`** / **`message`** with safe diagnostics (omit secrets). |

**Client timeout:** Browser or app code calling **your proxy** must allow **≥ backend MediKredit timeout + margin** (e.g. backend 120s → client 130s), or you will falsely abort successful slow responses.

---

## 4. Practice / vendor configuration (`MediKreditConfig` shape)

| Field | Used on XML | Notes |
|--------|-------------|--------|
| `bhfNumber` | `TX @sp_bhf`, `ADD_BHF @bhf_nbr`, optional `BHF @prescr` | Practice / branch number. |
| `hpcNumber` | `TX @sp_hpc`, `ADD_BHF @hpc_nbr` | Healthcare provider code. |
| `groupPracticeNumber` | `TX @grp_prac` | **Critical** — missing/invalid often yields vendor/plan errors. |
| `vendorId` | `VEND @vend_id` | **Critical** — must match registration. |
| `pcNumber` | `VEND @pc_nbr` | Vendor PC number (e.g. `01`). |
| `worksNumber` | `VEND @wks_nbr` | Works number / workstation id (often zero-padded, e.g. `001`). |
| `medikreditAccountNumber` | `DOCTOR @mem_acc_nbr` | Prescriber/account on switch. |
| `placeOfServiceCode` | `DOCTOR @plcsv_cd` | Frequently **`11`** (office). |

Fallbacks shown in historical samples must be replaced with MediKredit-approved values for production.

---

## 5. Patient payload (`PatientData` minimum schema)

| Property | MediKredit role |
|-----------|----------------|
| `name` | Patient / scheme display naming |
| `member_id` | `MEM @ch_id` |
| `member_surname`, `member_initials` | `MEM`, `PAT` |
| `medical_scheme_option_code` | `TX @plan` — incorrect plan is a frequent hard failure |
| `dependent_code` | `PAT @dep_cd` (default **`01`** for principal) |
| `date_of_birth` | `PAT @dob` → **YYYYMMDD** (`CCYYMMDD`) |
| `id_number` | `PAT @id_nbr` |
| `gender` | Map to **`1`** (male) / **`2`** (female) in XML |
| `relationship_to_member` | `PAT @rlnship` |
| `patient_status` | `PAT @status` (e.g. `O`) |
| `newborn_indicator` | `PAT @newborn` (**`Y`**/**`N`**) |

Normalize all dates leaving your API as **YYYYMMDD** strings before XML assembly.

---

## 6. Claim lines (`ClaimItem` rules)

| Concept | Behaviour |
|---------|------------|
| `itemType: 'procedure'` | `ITEM @tp="2"`, `@cdg_set="02"` — **`PROC`** with `@tar_cd`, **TRMNT** window |
| `itemType: 'medication'` | `ITEM @tp="1"`, `@cdg_set="03"` — **`MED`** with `@nappi_cd`; claim-level **`orig="03"`** and **`BHF prescr`** |
| Modifier | `ITEM @tp="3"` — **`MOD`** **inside** `PROC`, plus TRMNT |

`TRMNT`: `@st_dt`, `@end_dt` = **YYYYMMDD**; `@st_tm`, `@end_tm` = **HHMMSS** (six digits).

Line **`FIN`**: `@tar_ind`, `@price`, optional `@disp_fee` for meds, `@bs_of_cst`, `@gross`

Diagnoses: one `<DIAG cd="..." stg_ind="01"/>` per ICD-10 on that line.

---

## 7. SOAP envelope sent to MediKredit (your proxy must replicate this exactly)

Outbound HTTP from proxy:

- **Method:** `POST`
- **URL:** your `MEDIKREDIT_API_URL`
- **`Content-Type`:** `text/xml; charset=utf-8`
- **`SOAPAction`:** exactly **`submit-claim`** (matches `action: claim`)
- **`Authorization`:** `Basic base64(username + ":" + password)`

**Envelope template** (`xmlData` = **decoded** inner document string):

```xml
<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:s2pi="http://www.medikredit.co.za/S2PI">
  <soapenv:Header/>
  <soapenv:Body>
    <s2pi:submit-claim>
      <request>THE_INNER_XML_STRING_WITH_XML_SPECIAL_CHARS_ESCAPED</request>
    </s2pi:submit-claim>
  </soapenv:Body>
</soapenv:Envelope>
```

Escape **`THE_INNER_XML`** for placement inside `<request>` using this exact order (**encode `&` first**):

1. `&` → `&amp;`
2. `<` → `&lt;`
3. `>` → `&gt;`
4. `"` → `&quot;`
5. `'` → `&apos;`

**Eligibility/reversal SOAP:** same pattern with `submit-eligibility` / `submit-reversal`, `SOAPAction: submit-eligibility` / `submit-reversal`.

---

## 8. Inner claim document template (`xmlData`)

This is what your app must produce for **`sendMedikreditSoap(..., action: 'claim')` → `submit-claim`**. Adapt attribute values.

```xml
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<DOCUMENT version="3.53" reply_tp="1">
  <TX
    sp_bhf="BHF"
    sp_hpc="HPC"
    grp_prac="GRP_PRACTICE"
    tx_nbr="UNIQUE_CLAIM_TX_NBR"
    plan="OPTION_CODE"
    dt_cr="CCYYMMDD"
    dt_os="CCYYMMDD"
    tx_cd="21"
    nbr_items="N"
    clm_orig="E"
    msg_fmt="13"
    orig="03_OR_04"
    bin="2"
    cntry_cd="ZA"
    sect_cd="PR"
    pay_adv="P">

    <VEND vend_id="VEND_ID" pc_nbr="PC" wks_nbr="WKS" vend_ver="1"/>

    <MEM ch_id="MEMBER_ID" sname="SURNAME" inits="IN" mbr_ent="FULL_MEMBER_NAME"/>

    <PAT
      pat_ent="FULL_MEMBER_NAME"
      dep_cd="01"
      dob="YYYYMMDD"
      id_nbr="ID"
      sname="SURNAME"
      fname="FIRST"
      inits="IN"
      gend="1_OR_2"
      rlnship="CODE"
      status="STATUS"
      newborn="N_OR_Y"/>

    <!-- Include ONLY when claim includes medications: -->
    <BHF prescr="PRESCRIBER_BHF"/>

    <DOCTOR
      auth_nbr=""
      mem_acc_nbr="PRESCRIBER_ACC"
      plcsv_cd="11"
      disp_cd="01"/>

    <FIN gross="TOTAL.XX"/>

    <!-- Repeat ITEM blocks (lin_num = 1..N) -->
    <ITEM lin_num="1" pay_adv="P" tp="2" cdg_set="02" descr="DESCRIPTION" process_tp="01">
      <PROC tar_cd="TARIFF" qty="1.00" units="1.00" unit_tp="06">
        <TRMNT st_dt="YYYYMMDD" st_tm="HHMMSS" end_dt="YYYYMMDD" end_tm="HHMMSS"/>
      </PROC>
      <DIAG stg_ind="01" cd="ICD10"/>
      <ADD_BHF tp_ind="1" bhf_nbr="BHF" hpc_nbr="HPC"/>
      <FIN tar_ind="03" price="0.00" bs_of_cst="3" gross="0.00"/>
    </ITEM>
  </TX>
</DOCUMENT>
```

**Important attribute rules:**

- **`tx_cd`:** **`21`** = real-time claim.
- **`orig`:** **`03`** if any medication lines, else **`04`** for procedure-only episodes.
- **`BHF prescr`:** omit for procedure-only; when medications present use your accredited prescribing BHF.
- **`tx_nbr`:** globally unique claim transaction id.
- **`plan`:** must match member **option/plan code**.
- **`VEND`, `grp_prac`:** must match MediKredit registration.

---

## 9. Parsing the response (claims)

Raw `response` from your proxy:

1. **Parse as XML.** If parse fails → treat as **`TransportError`** and log snippet (no PHI in production logs unless approved).
2. Locate SOAP **`Body`** and child **`submit-claimResponse`** (names may carry prefixes — use namespace-agnostic lookups when possible).
3. Find **`reply`** element: if present, take **`.textContent`**, HTML-entity decode (`&lt;` → `<`, …). If absent but body looks like **`DOCUMENT`** already: decode entire body the same way.
4. Parse decoded string **again** as XML → **`TX`** root or inner `DOCUMENT`/`TX`.
5. Prefer **`TX`** lookup that tolerates prefixes (e.g. `getElementsByTagName('TX')[0]` as fallback).

### Core fields (`TX`)

| Source | Interpretation |
|--------|----------------|
| `@res` | **`A`** approved (subject to lines), **`R`** rejected at claim level, **`P`** pending — confirm with MediKredit for your accreditation pack |
| `@tx_nbr`, `@dt`, `@tm` | Correlation ids / timestamps |
| Child **`RJ`** | Claim-level `@cd`, `@desc` |
| **`FIN`** | Claim-level totals / nett / gross |
| **`AUTHS`** | Often `@hnet` (health network) |
| **`ITEM`** lines | **`@status`** (**`A`** / **`R`** / **`W`** / **`P`**) + optional child **`RJ`**, **`WARN`**, **`FIN`/`HB`** |
| **`RMR`** | Scheme remittance/advice messages |

### Business-status mapping (precedence)

1. **`TX.@res === 'R'`** with actionable **`RJ`:** claim **rejected**.
2. **`TX.@res` favourable (`A` / `P`)** but **all** lines rejected → synthesize **`rejected`** with aggregated line reasons.
3. Mix of approved/problem lines → **`partially_approved`** when some `ITEM.@status === 'R'` or line `RJ`.
4. Otherwise approved/pending messaging based on **`res`** and **`FIN`**.

Preserve **`rawResponse` string + decoded inner XML`** for auditing and payer disputes.

---

## 10. Split claims (optional advanced pattern)

Some implementations split procedures vs medicines into **two outbound transactions** (`tx_nbr` siblings, e.g. suffixes **`P`** / **`M`**), then merge results in application logic. Parsing each SOAP/doc is identical; merge is bespoke.

---

## 11. Server implementation checklist (robust defaults)

| Item | Recommendation |
|------|----------------|
| Credentials | Env vars **`MEDIKREDIT_USERNAME`**, **`MEDIKREDIT_PASSWORD`**, **`MEDIKREDIT_API_URL`** — never expose to frontend. |
| Timeout | **`MEDIKREDIT_REQUEST_TIMEOUT_MS`** ≈ **`120000`** (tune); **abort** outbound fetch when exceeded. |
| Logging | Log **lengths** and **SOAPAction**, not full XML in production (PHI). |
| Errors | Return JSON with **`code`** / **`details`**; map timeout → **504**. |
| SOAPAction | Must match table: `claim` → `submit-claim`, etc. |

---

## 12. Frequent failure modes

| Symptom | Likely cause |
|---------|--------------|
| HTTP hangs “forever” | No proxy timeout; or blocked / non-allow-listed egress |
| **Unknown plan** / plan errors | Wrong `TX @plan` / option code |
| **Vend / vendor** errors | Missing or wrong `VEND` / `grp_prac` / `vend_id` |
| Empty or malformed reply | SOAP Fault — parse `Fault`/`faultstring` |
| Client aborts at 30s | Frontend timeout shorter than MediKredit round-trip |
| Double SOAP wrapping | Sending full SOAP as `xmlData` while proxy wraps again — **only inner `DOCUMENT` goes in `xmlData`** |

---

## 13. Critical pitfall: “double envelope”

**Golden rule:** MediKredit receives exactly **one** SOAP envelope assembled by whichever layer talks to `services.medikredit.co.za`.

Your JSON field **`xmlData`** must never already contain SOAP — only **`DOCUMENT`**.

---

## 14. Copy-paste types (optional)

```ts
export interface MediKreditConfig {
  bhfNumber?: string;
  hpcNumber?: string;
  groupPracticeNumber?: string;
  vendorId?: string;
  pcNumber?: string;
  worksNumber?: string;
  medikreditAccountNumber?: string;
  placeOfServiceCode?: string;
}

export interface PatientData {
  name: string;
  date_of_birth: string; // normalized to YYYYMMDD before XML
  gender: string;       // map to '1'|'2'
  id_number: string;
  medical_scheme_option_code: string; // TX @plan
  member_id: string;
  member_initials: string;
  member_surname: string;
  relationship_to_member: string;
  patient_status: string;
  dependent_code: string;
  newborn_indicator: string;
  country?: string;
  email?: string;
  phone?: string;
  status?: string;
  address?: string;
  city?: string;
  state?: string;
  zip?: string;
  weight?: number;
  race?: string;
  passport_number?: string;
  postal_code?: string;
}

export type ClaimLineType = 'procedure' | 'medication' | 'modifier';

export interface ClaimItem {
  lineNumber: number;
  itemType: ClaimLineType;
  procedureCode: string;
  nappiCode?: string;
  isModifier?: boolean;
  modifierCode?: string;
  parentLineNumber?: number;
  quantity: number;
  unitType: string;
  description: string;
  price: number;
  startDate: string;
  startTime: string;
  endDate: string;
  endTime: string;
  diagnosisCodes: string[];
  dailyDose?: number;
  estimatedDaysSupply?: number;
  dispensingFee?: number;
}

export type ClaimOutcome =
  | 'approved'
  | 'rejected'
  | 'pending'
  | 'partially_approved';
```

---

## 15. Quick verification checklist

- [ ] `xmlData` decodes/parses as valid XML **`DOCUMENT`** with **`tx_cd="21"`**.
- [ ] **`plan`** matches MediKredit test member specification.
- [ ] **`VEND` + `grp_prac`** match registration.
- [ ] **`tx_nbr` unique**.
- [ ] Procedures have **`PROC` / `tar_cd`**; meds have **`MED` / `nappi_cd`**.
- [ ] **Times** padded to **`HHMMSS`**.
- [ ] Proxy uses **`SOAPAction: submit-claim`** + correct envelope + **Basic auth**.
- [ ] **Timeouts** configured end-to-end.
- [ ] Parser reads **`reply`**, entity-decodes, re-parses, finds **`TX`**.

---

## 16. Fleming codebase audit (this repository)

This section maps the guide to the **Fleming** Next.js app for maintainers. Corroborate any namespace / SOAP details with your accreditation pack.

### 16.1 Aligned with the guide

| Guide item | Fleming implementation |
|------------|------------------------|
| JSON proxy `POST …/api/medikredit` with `action` + `xmlData` (inner `DOCUMENT` only) | `lib/medikredit/client.ts` → `sendMedikreditViaProxy` (`getClinicalProxyBase()` + `fetch` JSON body) |
| Direct path: SOAP + Basic auth + `text/xml` | Same file when `CLINICAL_PROXY_URL` is unset; `requireMedikreditEnv()` |
| Escape inner XML inside `<request>` (`&` first) | `lib/medikredit/xml-escape.ts` `escapeXmlText` |
| SOAP envelope wrapper | `lib/medikredit/soap-envelope.ts` `createSoapEnvelope` |
| `SOAPAction` header | `soapActionHeaderValue` → quoted `"submit-claim"` / `"submit-eligibility"` / `"submit-reversal"` |
| Unwrap JSON-wrapped `response`, `<reply>`, entity-decode, SOAP `Body` fallback | `lib/medikredit/parse-response.ts` `unwrapMedikreditResponse` |
| Resilient parse (trailing text, multi-root) | `sanitizeMedikreditXmlFragment`, regex fallbacks in `parse-response.ts` |
| `tx_cd="21"` claim build + optional split batches | `lib/medikredit/build-document.ts`, `lib/medikredit/claim-splitter.ts`, `lib/medikredit/claim-service.ts` `submitClaim` + `mergeClaimResponses` |
| Practice / vendor settings | `lib/medikredit/provider-settings.ts` + `medikredit_providers` table |
| Env wiring | `.env.example` (`CLINICAL_PROXY_URL`, `MEDIKREDIT_*`, `MEDIKREDIT_DRY_RUN`, `MEDIKREDIT_REQUEST_TIMEOUT_MS`, default option code) |
| Smoke script for proxy | `scripts/verify-clinical-proxy.ts` |
| Persist adjudication + optional raw XML | `lib/medikredit/persist.ts` (`raw_last_response_xml` / `rawXml` fields) |

### 16.2 Gaps and recommendations

1. **Outbound HTTP timeout (implemented):** `lib/medikredit/client.ts` uses `fetchWithOptionalTimeout` with **`MEDIKREDIT_REQUEST_TIMEOUT_MS`** (default **120000**; `0` disables). Throws a clear error on `AbortError`. The clinical proxy process should enforce its own cap as well.
2. **Next.js route budget:** `app/api/clinical/medikredit/claim/route.ts` sets `maxDuration = 60`. If the switch regularly needs longer than 60s, raise this (where your host allows) so the route isn’t killed before the MediKredit client timeout fires.
3. **Browser `fetchClient`:** `lib/fetch.ts` does not set a client-side timeout for `/api/clinical/medikredit/claim`. Long runs can look like a hang. **Recommendation:** document minimum wait for operators, or use `fetch` with `AbortController` + clear UI for claim submission.
4. **S2PI namespace URI:** `soap-envelope.ts` declares `xmlns:s2pi="http://www.medikredit.co.za/s2pi"` (lowercase path segment). The guide example uses `http://www.medikredit.co.za/S2PI`. **Recommendation:** confirm with MediKredit / your certification doc; if required, align casing with the official WSDL.
5. **Double envelope:** Fleming correctly sends **inner `DOCUMENT`** as `xmlData` to the proxy and only wraps SOAP on the direct path. Keep any future UI or debugging tools from pasting a full SOAP string into `xmlData` (see `app/components/medikredit/medi-kredit-accreditation-modal.tsx` hints).

### 16.3 Key files (quick navigation)

| Area | Path |
|------|------|
| Transport | `lib/medikredit/client.ts`, `lib/medikredit/soap-envelope.ts` |
| XML build | `lib/medikredit/build-document.ts` |
| Submit orchestration | `lib/medikredit/claim-service.ts` |
| Response parse | `lib/medikredit/parse-response.ts` |
| Claim HTTP API | `app/api/clinical/medikredit/claim/route.ts` |
| Eligibility / family / reversal | `app/api/clinical/medikredit/*/route.ts`, `lib/medikredit/eligibility-service.ts` |

---

*End of document.*

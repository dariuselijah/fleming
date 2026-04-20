# MediKredit & Medprax — request / response reference

Base URL examples: `http://localhost:3001` (local `xai-proxy`) or your deployed `VITE_LAMBDA_URL`. All paths below are appended to that base.

Headers (unless noted): `Content-Type: application/json`.

---

## Part A — MediKredit (single HTTP endpoint)

### `POST /api/medikredit`

The proxy validates JSON, wraps `xmlData` in a SOAP envelope, and POSTs to MediKredit (`MEDIKREDIT_API_URL`, default `https://services.medikredit.co.za:4436`) with Basic auth configured on the server.

#### Request body (JSON)

| Field | Required | Type | Description |
|--------|----------|------|-------------|
| `action` | **Yes** | string | One of: `claim`, `eligibility`, `reversal` (see below). |
| `xmlData` | **Yes** | string | **Inner** MediKredit XML only: `<?xml ...?><DOCUMENT ...>...</DOCUMENT>`. **No** outer SOAP — the server escapes it and inserts it into `<request>...</request>`. |
| `claimId` | No | string | Passed through for logging only. |
| `patientId` | No | string | Logging. |
| `practiceId` | No | string | Logging. |

#### How `action` maps to SOAP (server-side)

From `createSoapEnvelope` in `backend/xai-proxy.mjs`:

| `action` | SOAP body operation | `SOAPAction` header |
|----------|---------------------|----------------------|
| `claim` | `<s2pi:submit-claim><request>…escaped inner xml…</request></s2pi:submit-claim>` | `submit-claim` |
| `eligibility` | `<s2pi:submit-eligibility><request>…</request></s2pi:submit-eligibility>` | `submit-eligibility` |
| `reversal` | `<s2pi:submit-reversal><request>…</request></s2pi:submit-reversal>` | `submit-reversal` |

#### Transaction types — use `tx_cd` on `<TX>` (not a separate URL)

MediKredit distinguishes **eligibility**, **family check**, **claim**, and **reversal** with **`tx_cd`** inside the inner XML (`DOCUMENT` version `3.53`):

| Scenario | Typical `tx_cd` | Notes |
|----------|------------------|--------|
| Eligibility (single member) | **20** | `MediKreditService.checkEligibility` |
| Family eligibility (famcheck) | **30** | `MediKreditService.checkFamilyEligibility` |
| Real-time claim | **21** | `MediKreditClaimService.submitClaim` |
| Reversal | **11** | `MediKreditClaimService.reverseClaim` — same `tx_nbr` as original claim, no `ITEM` lines |

**How this repo calls the proxy:** `MediKreditService.sendSOAPRequest` usually sends **`action: "claim"`** for all of the above, because the outer SOAP operation is `submit-claim` and **`tx_cd` selects the transaction**. So for parity with the app, use **`action: "claim"`** plus inner XML with the correct `tx_cd`. Use `eligibility` / `reversal` only if your certification path requires those SOAP operation names instead.

#### Example — minimal JSON wrapper

```http
POST /api/medikredit HTTP/1.1
Content-Type: application/json

{
  "action": "claim",
  "xmlData": "<?xml version=\"1.0\" encoding=\"UTF-8\"?><DOCUMENT reply_tp=\"1\" version=\"3.53\"><TX tx_cd=\"20\" ...>...</TX></DOCUMENT>",
  "claimId": "optional-uuid",
  "patientId": "optional",
  "practiceId": "optional"
}
```

Replace `xmlData` with your full **DOCUMENT** XML (build from `MediKreditService.ts` / `MediKreditClaimService.ts` or MediKredit’s spec). Strings must be valid XML text inside JSON (escape quotes as needed).

#### Success response (`200`)

```json
{
  "status": "success",
  "action": "claim",
  "request_id": "<uuid>",
  "response": "<raw SOAP/XML string from MediKredit>",
  "timestamp": "<ISO8601>",
  "source": "xAI Proxy with Medikredit Integration",
  "lambda_ip": "3.224.6.92",
  "target_url": "https://services.medikredit.co.za:4436"
}
```

`response` is the **full** MediKredit HTTP body (often SOAP with encoded inner `<reply>`). Clients parse XML from this string (see `MediKreditService.sendSOAPRequest`).

#### Error responses

| Status | When |
|--------|------|
| `400` | Missing `action` or `xmlData`, or invalid `action`. |
| `500` | Network / MediKredit error; body includes `error`, `details`. |

---

## Part B — Medprax (HTTP endpoints)

Requires **`MEDPRAX_ENABLED=true`** (or `1`) on the server for strict routes; schemes/tariffs may return empty `items` with `source: "fallback"` when disabled.

### `POST /api/medication-suggestions`

**Request**

```json
{
  "clinicalNote": "…optional string…",
  "diagnosis": ["E11.9", "I10"],
  "patientAge": 45,
  "patientGender": "female",
  "allergies": ["penicillin"]
}
```

At least one of **`clinicalNote`** or non-empty **`diagnosis`** is required.

**Success (`200`)**

```json
{
  "success": true,
  "source": "medprax",
  "suggestions": [
    {
      "medication": {
        "id": "…",
        "name": "…",
        "genericName": "…",
        "dosage": "As per Medprax product details",
        "form": "As per Medprax product details",
        "strength": "As per Medprax product details",
        "frequency": "As prescribed",
        "duration": "As prescribed",
        "instructions": "Verify dose and instructions clinically before prescribing.",
        "category": "Medication",
        "nappiCode": "…",
        "fullDescription": "…",
        "singleExitPrice": 123.45,
        "source": "medprax"
      },
      "confidence": 0.95,
      "reason": "…",
      "clinicalContext": "…"
    }
  ],
  "contextTerms": ["term1", "term2"]
}
```

**Errors:** `400` validation, `503` if Medprax disabled, `5xx` on upstream failure.

---

### `POST /api/medication-search`

**Request**

```json
{
  "query": "paracetamol"
}
```

`query` must be **at least 2 characters** after trim.

**Success (`200`)**

```json
{
  "success": true,
  "source": "medprax",
  "medications": [ { …same medication shape as above… } ]
}
```

**Errors:** `400`, `503`, `502`-style on Medprax failure.

---

### `POST /api/medprax/medicines/search`

**Request**

```json
{
  "query": "metformin",
  "page": 1,
  "pageSize": 20
}
```

**Success (`200`)**

```json
{
  "success": true,
  "items": [
    {
      "nappiCode": "…",
      "name": "…",
      "fullDescription": "…",
      "singleExitPrice": 99.99
    }
  ],
  "requestId": "…",
  "source": "medprax"
}
```

**Errors:** `503` if `MEDPRAX_ENABLED` not set.

---

### `POST /api/medprax/medicines/by-nappi`

**Request**

```json
{
  "nappiCode": "700217"
}
```

**Success (`200`)**

```json
{
  "success": true,
  "item": {
    "nappiCode": "700217",
    "name": "…",
    "fullDescription": "…",
    "singleExitPrice": null
  },
  "requestId": "…",
  "source": "medprax"
}
```

`item` may be `null` if no exact match after search.

---

### `POST /api/medprax/tariffs/contracts/medical`

**Request**

```json
{
  "planOptionCode": "631372",
  "disciplineCode": "014",
  "tariffCodes": ["0190", "0201"]
}
```

**Success (`200`)**

```json
{
  "success": true,
  "items": [
    {
      "tariffCode": "0190",
      "description": "…",
      "unitPrice": 123.45,
      "planOptionCode": "…",
      "disciplineCode": "…",
      "tariffModifiers": null
    }
  ],
  "requestId": "…",
  "source": "medprax"
}
```

When Medprax is off: `200` with `items: []`, `source: "fallback"`.

---

### `POST /api/medprax/schemes/search`

**Request**

```json
{
  "query": "discovery",
  "page": 1,
  "pageSize": 20
}
```

**Success (`200`)**

```json
{
  "success": true,
  "items": [
    {
      "code": "…",
      "name": "…",
      "schemeAdministratorCode": "…"
    }
  ],
  "requestId": "…",
  "source": "medprax"
}
```

---

### `POST /api/medprax/planoptions/search`

**Request**

```json
{
  "query": "classic",
  "page": 1,
  "pageSize": 20
}
```

**Success (`200`)**

```json
{
  "success": true,
  "items": [
    {
      "code": "…",
      "planCode": "…",
      "option": "…",
      "schemeCode": "…",
      "name": "…"
    }
  ],
  "requestId": "…",
  "source": "medprax"
}
```

---

### `GET /api/medprax/schemes/:code/planoptions`

No body. Example:

`GET /api/medprax/schemes/DISCOVERY/planoptions`

(URL-encode `code` if it contains special characters.)

**Success (`200`)**

```json
{
  "success": true,
  "items": [ { "code": "…", "planCode": "…", "option": "…", "schemeCode": "DISCOVERY", "name": "…" } ],
  "requestId": "…",
  "source": "medprax"
}
```

---

## See also

- MediKredit behaviour and XML building: `docs/MEDIKREDIT_INTEGRATION.md`, `MediKreditService.ts`, `MediKreditClaimService.ts`
- Medprax via proxy (consumer): `docs/MEDPRAX_INTEGRATION.md`

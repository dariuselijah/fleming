# Fleming cutover — SA Health Codes

Replace Medprax catalogue calls with the SA Health Codes service. **Do not change MediKredit.**

## Architecture after cutover

| Concern | Env | Endpoint |
|---------|-----|----------|
| Eligibility / claims / famcheck / reversal | `CLINICAL_PROXY_URL` | `POST /api/medikredit` |
| Medicines, tariffs, schemes, ICD | `SA_REFERENCE_DATA_URL` | Medprax-compatible `/api/medprax/*` + `/api/icd10/*` |

Fleming resolves catalogue base in [`lib/clinical-proxy/url.ts`](../../lib/clinical-proxy/url.ts):

1. `SA_REFERENCE_DATA_URL` (preferred)
2. else `CLINICAL_PROXY_URL` (legacy Medprax-on-proxy)

Claim preflight still uses `MEDPRAX_CLAIM_PREFLIGHT_MODE=required` and the same helpers in [`lib/clinical-proxy/medprax.ts`](../../lib/clinical-proxy/medprax.ts).

## Local cutover steps

```bash
# 1. Bootstrap + run reference data
npm run reference-data:bootstrap
npm run reference-data:dev

# 2. Ingest priority 2026 tariff sample (optional refresh)
npm run reference-data:ingest-tariffs

# 3. Point Fleming at it (.env)
SA_REFERENCE_DATA_URL=http://127.0.0.1:3011
CLINICAL_PROXY_URL=http://localhost:3001   # MediKredit only
MEDPRAX_CLAIM_PREFLIGHT_MODE=required

# 4. Verify
SA_REFERENCE_DATA_URL=http://127.0.0.1:3011 npm run verify:clinical-proxy
npm run reference-data:smoke
```

## Production

1. Deploy `services/sa-reference-data` (SQLite MVP or Postgres using `schema/001_init.sql`).
2. Load licensed NAPPI + full NDoH MIT + scheme tariff files via ingest scripts.
3. Issue tenant API keys; set `SA_REFERENCE_DATA_ALLOW_ANON=0`.
4. Set Fleming `SA_REFERENCE_DATA_URL` + `SA_REFERENCE_DATA_API_KEY`.
5. Remove Medprax credentials from the clinical proxy once smoke tests pass.
6. Keep MediKredit accreditation and `CLINICAL_PROXY_URL` unchanged.

# SA Health Codes (reference-data service)

Commercial Medprax-replacement APIs for South Africa: **Schemes**, **Tariff Rates**, **Products (NAPPI)**, **ICD-10**.

Live eligibility / claims remain on **MediKredit** — this service is reference data only.

## Quick start

```bash
cd services/sa-reference-data
npm install
npm run bootstrap   # seed ICD, products, tariffs + DoctorOption schemes
npm run dev         # http://127.0.0.1:3011
npm run test:smoke
```

Point Fleming at the service:

```env
SA_REFERENCE_DATA_URL=http://127.0.0.1:3011
# Optional: CLINICAL_PROXY_URL still used for MediKredit SOAP
```

## Medprax-compatible routes

| Method | Path |
|--------|------|
| POST | `/api/medprax/medicines/search` |
| POST | `/api/medprax/medicines/by-nappi` |
| POST | `/api/medprax/tariffs/contracts/medical` |
| POST | `/api/medprax/schemes/search` |
| POST | `/api/medprax/planoptions/search` |
| GET | `/api/medprax/schemes/:code/planoptions` |
| POST | `/api/medication-search` |

## First-class routes

| Method | Path |
|--------|------|
| GET | `/api/icd10/search?q=` |
| GET | `/api/icd10/validate?code=` |
| POST | `/api/products/search` (`productClass`: pharma \| consumable \| surgical) |
| GET | `/api/ingest/status` |
| GET | `/health` |

## Ingest

```bash
npm run ingest:schemes
npm run ingest:icd10 -- --file ./data/raw/icd10-mit.csv
npm run ingest:products -- --file ./data/raw/nappi-products.json
npm run ingest:tariffs -- --file ./data/seed/tariffs-priority-2026.csv
```

Place licensed MediKredit / vendor NAPPI files and official NDoH MIT / SEP extracts under `data/raw/` (gitignored).

## Docs

- [Company setup](./docs/COMPANY_SETUP.md)
- [Customer API licence draft](./docs/LICENCE.md)
- [Licensing outreach](./docs/LICENSING_OUTREACH.md)
- Schema: [schema/001_init.sql](./schema/001_init.sql)

## Auth

- Dev: `SA_REFERENCE_DATA_ALLOW_ANON=1` (default in `npm run dev`)
- Prod: `Authorization: Bearer <api-key>` from `api_keys` table; bootstrap key printed once by `npm run bootstrap`

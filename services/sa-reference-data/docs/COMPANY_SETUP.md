# SA Reference-Data Company — Entity Setup

Working name: **SA Health Codes** (placeholder — do not use “NAPPI” in the legal name; MediKredit owns the NAPPI® trademark).

## Recommended structure

| Item | Recommendation |
|------|----------------|
| Form | Private company (Pty) Ltd registered in South Africa |
| Purpose | Commercial healthcare reference-data APIs (schemes, tariffs, products, ICD-10) |
| Relationship to Fleming | Separate entity; Fleming is first licensee / design partner |
| Hosting | South African region (POPIA posture) |

## Day-0 checklist

1. Reserve company name with CIPC; register Pty Ltd.
2. Open business bank account; appoint accounting officer.
3. Draft customer API licence (see [LICENCE.md](./LICENCE.md)).
4. Open commercial conversations (see [LICENSING_OUTREACH.md](./LICENSING_OUTREACH.md)):
   - MediKredit — NAPPI Product & Price File (pharma + surgical/consumables)
   - Alternate NAPPI list vendor (if used) — confirm redistribution rights
   - SAMA — commercial eMDCM / CCSA redistribution
   - NDoH — confirm MIT / SEP republication attribution terms in writing
   - Priority schemes — tariff-file redistribution permission (GEMS, Discovery, Medscheme book, Momentum)
5. Join PHISC as a software / standards member.
6. Appoint Information Officer; prepare POPIA PAIA manual (reference APIs avoid special personal information; eligibility remains out of scope).
7. Issue API keys and sandbox for Fleming cutover.

## What this company is not

- Not a claims switch (MediKredit / Altron SwitchOn / Healthbridge remain transactional).
- Not a medical-scheme broker (no membership recommendation without CMS broker accreditation).
- Not an issuer of NAPPI codes (MediKredit / NAB remain custodians).
